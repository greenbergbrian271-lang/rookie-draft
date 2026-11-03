import { isMineRoster, loadLeagueEntries, nflPlayersCached, playerName, sleeper } from "@/lib/in-season-leagues";
import { getNflSchedule } from "@/lib/espn-nfl-schedule";
import { getWeekProjections, projectPoints } from "@/lib/sleeper-projections";
import { SLOT_ELIGIBILITY } from "@/lib/in-season";
import { simulateChop, teamSd } from "@/lib/in-season-waivers";
import {
  HORIZON_WEIGHTS, aggression, bestDrop, budgetBefore, calibrateShare, gainsFor, lineupTotals, projectBid, round1, tradeOffers, typicalBid, weighted,
  type GRoster, type PlayerInfo, type Rival, type Tx,
} from "@/lib/in-season-guillotine";

export const maxDuration = 60;
const LEAGUE = "1387508275846586368";
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await sleeper<any>("/state/nfl", false).catch(() => null);
  const week = Number(state?.week || 0);
  const season = String(state?.league_season || state?.season || "2026");
  if (!week) return Response.json({ error: "Sleeper did not report the current week." }, { status: 502 });
  const horizon = [week + 1, week + 2, week + 3].filter((w) => w <= 18);

  const [league, rosterRows, users, players, schedule, projections, week8Proj] = await Promise.all([
    sleeper<any>(`/league/${LEAGUE}`, false), sleeper<any[]>(`/league/${LEAGUE}/rosters`, false), sleeper<any[]>(`/league/${LEAGUE}/users`, false),
    nflPlayersCached(), getNflSchedule(season, [week, ...horizon]).catch(() => null),
    Promise.all(horizon.map((w) => getWeekProjections(season, w).catch(() => null))),
    getWeekProjections(season, week).catch(() => null),
  ]);
  const scoring = league.scoring_settings as Record<string, number>;
  const settings = league.settings || {};
  const slots: string[] = (league.roster_positions || []).filter((s: string) => s !== "BN");
  const capacity = (league.roster_positions || []).length;
  const budget = Number(settings.waiver_budget || 0);
  const bidMin = Number(settings.waiver_bid_min || 1);
  const positions = new Set<string>(); slots.forEach((s) => (SLOT_ELIGIBILITY[s] || [s]).forEach((p) => positions.add(p)));

  const weeks = Array.from({ length: week + 1 }, (_, i) => i + 1);
  const txs: Tx[] = (await Promise.all(weeks.map(async (w) => (await sleeper<any[]>(`/league/${LEAGUE}/transactions/${w}`, false).catch(() => [] as any[])).map((t) => ({ ...t, leg: t.leg ?? w }))))).flat();

  const nameOf = (r: any) => { const u = users.find((x: any) => String(x.user_id) === String(r.owner_id)); return u?.display_name || String(r.owner_id || r.roster_id); };
  const rosters: GRoster[] = rosterRows.map((r: any) => {
    const mine = isMineRoster({ teamIdentity: "cds1204" }, r, users);
    const ids = [...(r.players || []), ...(r.reserve || []), ...(r.taxi || [])].map(String).filter((id) => id !== "0");
    return { rosterId: String(r.roster_id), owner: nameOf(r), isMine: mine, eliminated: !ids.length || r.settings?.eliminated > 0, players: ids, faab: Math.max(0, budget - Number(r.settings?.waiver_budget_used || 0)), waiverPosition: Number(r.settings?.waiver_position || 0) };
  });
  const me = rosters.find((r) => r.isMine);
  if (!me) return Response.json({ error: "Your roster was not matched in this league." }, { status: 404 });
  // Test mode: ?chop=<owner> treats that team as this week's chop, so its players hit the wire and it stops bidding.
  const wanted = (url.searchParams.get("chop") || "").trim().toLowerCase();
  const simulated = wanted ? rosters.find((r) => !r.isMine && !r.eliminated && r.owner.toLowerCase() === wanted) || null : null;
  const simReleased = new Set(simulated?.players || []);
  if (simulated) { simulated.eliminated = true; simulated.players = []; }
  const alive = rosters.filter((r) => !r.eliminated);
  const rivalsAll = alive.filter((r) => !r.isMine);

  // Player info with projections for the next three weeks and bye weeks.
  const info: Record<string, PlayerInfo> = {};
  const build = (id: string): PlayerInfo | null => {
    if (info[id]) return info[id];
    const p = players[id];
    if (!p || !positions.has(String(p.position))) return null;
    const proj = horizon.map((_, i) => { const row = projections[i]?.get(id); return row ? projectPoints(row.stats, scoring) : 0; });
    const team = String(p.team || "");
    const byeWeeks = horizon.filter((w) => schedule?.[team]?.[w] === null);
    return (info[id] = { id, name: playerName(id, players), position: String(p.position), team, injury: String(p.injury_status || ""), age: typeof p.age === "number" ? p.age : null, proj, byeWeeks });
  };
  rosters.forEach((r) => r.players.forEach(build));
  const rostered = new Set(rosters.flatMap((r) => r.players));

  // Free agents with a real projection.
  const pool: PlayerInfo[] = [];
  for (const rows of projections) {
    if (!rows) continue;
    for (const [id] of rows) {
      if (rostered.has(id) || info[id]) continue;
      const p = players[id];
      if (!p || !p.team || p.team === "FA") continue;
      if (/^(out|ir|pup|nfi|sus|cov|na)/i.test(String(p.injury_status || "")) || /inactive|reserve|suspend/i.test(String(p.status || ""))) continue;
      build(id);
    }
  }
  for (const id of Object.keys(info)) if (!rostered.has(id) && info[id] && sum(info[id].proj) > 0) pool.push(info[id]);

  // Chop history: who was released by which chopped team, and the most recent chop.
  const chops = txs.filter((t) => t.type === "chopped").sort((a, b) => b.leg - a.leg);
  const lastChop = chops[0];
  const chopOwner = (t: Tx) => rosters.find((r) => r.rosterId === String(t.roster_ids?.[0]))?.owner || "";
  const newlyReleased = simulated ? simReleased : new Set(Object.keys(lastChop?.drops || {}));
  const everChopped = new Set(chops.flatMap((t) => Object.keys(t.drops || {})));

  // ---- calibration from every claim (won or lost) in this league ----
  const complete = txs.filter((t) => t.type === "waiver");
  const best = new Map<string, Tx>();
  for (const t of complete) { const key = `${t.leg}:${t.roster_ids?.[0]}:${Object.keys(t.adds || {})[0]}`; const prev = best.get(key); if (!prev || Number(t.settings?.waiver_bid || 0) > Number(prev.settings?.waiver_bid || 0)) best.set(key, t); }
  const sample: { roster: number; gain: number; fraction: number }[] = [];
  for (const t of best.values()) {
    const rid = t.roster_ids?.[0]; const pid = Object.keys(t.adds || {})[0];
    const r = rosters.find((x) => Number(x.rosterId) === rid);
    if (!r || r.eliminated || !build(pid) || t.leg < 2) continue;
    const without = r.players.filter((id) => id !== pid);
    const gain = weighted(gainsFor(slots, without, info, pid));
    const before = budgetBefore(txs, budget, rid!, t.leg);
    sample.push({ roster: rid!, gain, fraction: Number(t.settings?.waiver_bid || 0) / before });
  }
  const bins = calibrateShare(sample);
  const style = aggression(sample, bins);

  // ---- my lineup context ----
  const myBase = lineupTotals(slots, me.players, info);
  const baseByRoster = new Map(alive.map((r) => [r.rosterId, lineupTotals(slots, r.players, info)]));
  const injuredIds = (ids: string[]) => new Set(ids.filter((id) => /^(out|ir|pup|sus)/i.test(info[id]?.injury || "")));
  const rivalFor = (candId: string): Rival[] => rivalsAll.map((r) => ({ rosterId: r.rosterId, owner: r.owner, gain: weighted(gainsFor(slots, r.players, info, candId, bestDrop(slots, r.players, info, candId)?.id, baseByRoster.get(r.rosterId))), budget: r.faab, mult: style.get(Number(r.rosterId)) ?? 1 }));

  // Screen candidates by free-add lineup gain for me, then price the best.
  const scored = pool.map((c) => ({ c, free: gainsFor(slots, me.players, info, c.id, null, myBase) })).filter((x) => weighted(x.free) >= 0.75).sort((a, b) => weighted(b.free) - weighted(a.free)).slice(0, 40);
  const targets = scored.map(({ c }) => {
    const drop = me.players.length >= capacity ? bestDrop(slots, me.players, info, c.id) : null;
    const gains = drop ? drop.gains : gainsFor(slots, me.players, info, c.id, null, myBase);
    const dropInfo = drop ? info[drop.id] : null;
    const rivals = rivalFor(c.id);
    const bid = projectBid(rivals, bins, me.faab, bidMin);
    const w = weighted(gains);
    return {
      id: c.id, name: c.name, position: c.position, team: c.team, age: c.age, injury: c.injury, proj: c.proj.map(round1), byeWeeks: c.byeWeeks,
      newlyReleased: newlyReleased.has(c.id), previouslyChopped: everChopped.has(c.id),
      gains: gains.map(round1), weightedGain: round1(w), drop: dropInfo ? { id: dropInfo.id, name: dropInfo.name, position: dropInfo.position, team: dropInfo.team, injury: dropInfo.injury } : null,
      bid, valueAtMax: round1(w * bid.winAtMax),
      rivalsInterested: rivals.filter((r) => r.gain >= 1.5).length,
    };
  }).sort((a, b) => b.weightedGain - a.weightedGain);

  // ---- trade-away ideas ----
  const myInfo = me.players.map((id) => info[id]).filter(Boolean);
  const tradeIdeas = myInfo.map((p) => {
    const loss = weighted(myBase.map((t, i) => t - lineupTotals(slots, me.players.filter((id) => id !== p.id), info)[i]));
    const rivals: Rival[] = rivalsAll.map((r) => ({ rosterId: r.rosterId, owner: r.owner, gain: weighted(gainsFor(slots, r.players, info, p.id, bestDrop(slots, r.players, info, p.id)?.id, baseByRoster.get(r.rosterId))), budget: r.faab, mult: style.get(Number(r.rosterId)) ?? 1 }));
    const offers = tradeOffers(rivals, bins);
    return { id: p.id, name: p.name, position: p.position, team: p.team, injury: p.injury, proj: p.proj.map(round1), byeWeeks: p.byeWeeks, lineupLoss: round1(loss), offers: offers.slice(0, 6), topOffer: offers[0]?.faab || 0 };
  }).sort((a, b) => a.lineupLoss - b.lineupLoss || b.topOffer - a.topOffer);

  // ---- who gets chopped this week (estimate) ----
  const matchups = await Promise.all(weeks.filter((w) => w <= week).map(async (w) => ({ w, rows: await sleeper<any[]>(`/league/${LEAGUE}/matchups/${w}`, false).catch(() => [] as any[]) })));
  const scoresBy: Record<string, number[]> = {};
  matchups.filter((m) => m.w < week).forEach((m) => m.rows.forEach((row: any) => { (scoresBy[String(row.roster_id)] ||= []).push(Number(row.points || 0)); }));
  const live = matchups.find((m) => m.w === week)?.rows || [];
  const sched = schedule || {};
  const chopRows = alive.map((r) => {
    const row = live.find((x: any) => String(x.roster_id) === r.rosterId) || {};
    const points = Number(row.points || 0);
    let remaining = 0, total = 0;
    for (const id of (row.starters || []) as string[]) {
      const proj = week8Proj?.get(id) ? projectPoints(week8Proj.get(id)!.stats, scoring) : 0;
      total += proj;
      const game = sched[String(players[id]?.team || "")]?.[week];
      if (game && game.state !== "post") remaining += proj;
    }
    const sd = Math.max(4, teamSd(scoresBy[r.rosterId], 22) * Math.sqrt(Math.max(0.02, total ? remaining / total : 0)));
    return { id: r.rosterId, owner: r.owner, points: round1(points), remaining: round1(remaining), mean: points + remaining, sd };
  });
  const odds = simulateChop(chopRows.map((x) => ({ id: x.id, mean: x.mean, sd: x.sd })), 4000);
  const scoringPosted = chopRows.some((x) => x.points > 25);
  const chopPreview = chopRows.map((x) => ({ ...x, lowest: odds.find((o) => o.rosterId === x.id)?.lowest || 0 })).sort((a, b) => b.lowest - a.lowest).map((x) => {
    const roster = alive.find((r) => r.rosterId === x.id)!;
    const best = roster.players.map((id) => info[id]).filter(Boolean).map((p) => ({ p, w: weighted(gainsFor(slots, me.players, info, p.id, bestDrop(slots, me.players, info, p.id)?.id, myBase)) })).sort((a, b) => b.w - a.w).slice(0, 5);
    return { rosterId: x.id, owner: x.owner, pointsSoFar: x.points, projectedRemaining: x.remaining, chance: round1(x.lowest * 100), best: best.map(({ p, w }) => ({ id: p.id, name: p.name, position: p.position, team: p.team, gainForMe: round1(w) })) };
  });

  const out = {
    week, season, horizon, weights: HORIZON_WEIGHTS, fetchedAt: new Date().toISOString(),
    league: { id: LEAGUE, name: league.name, budget, bidMin, capacity, slots, waiverDay: settings.waiver_day_of_week, clearDays: settings.waiver_clear_days },
    me: { rosterId: me.rosterId, owner: me.owner, faab: me.faab, waiverPosition: me.waiverPosition, rosterSize: me.players.length, lineupBase: myBase.map(round1), roster: myInfo.map((p) => ({ ...p, proj: p.proj.map(round1) })) },
    rivals: rivalsAll.map((r) => ({ rosterId: r.rosterId, owner: r.owner, faab: r.faab, waiverPosition: r.waiverPosition, aggression: round1(style.get(Number(r.rosterId)) ?? 1) })),
    calibration: { medianShareByGainBin: bins.median.map((m) => Math.round(m * 1000) / 1000), n: bins.n, samples: bins.samples, sd: round1(bins.sd), edges: bins.edges },
    lastChop: lastChop ? { leg: lastChop.leg, owner: chopOwner(lastChop), released: [...newlyReleased].map((id) => ({ id, name: info[id]?.name || playerName(id, players), onRoster: rostered.has(id) })) } : null,
    chopPreview: { scoringPosted, teams: chopPreview },
    simulatedChop: simulated ? { owner: simulated.owner, released: simReleased.size } : null,
    owners: rosters.filter((r) => !r.isMine && (!r.eliminated || r === simulated)).map((r) => r.owner),
    targets, tradeIdeas,
    pool: { size: pool.length },
  };
  if (url.searchParams.get("raw") === "1") return Response.json({ ...out, transactionsSample: txs.filter((t) => t.type === "trade") });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
