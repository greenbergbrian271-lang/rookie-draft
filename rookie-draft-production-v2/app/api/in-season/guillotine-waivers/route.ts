import { isMineRoster, nflPlayersCached, playerName, sleeper } from "@/lib/in-season-leagues";
import { getNflSchedule } from "@/lib/espn-nfl-schedule";
import { getWeekProjections, projectPoints } from "@/lib/sleeper-projections";
import { SLOT_ELIGIBILITY } from "@/lib/in-season";
import { normalizeDraftName, topThreeRoundKeys } from "@/lib/nfl-draft-results";
import { simulateChop, teamSd } from "@/lib/in-season-waivers";
import {
  HORIZON_WEIGHTS, buildClaimSheet, buildMatrix, claimPairs, dropPlan, priceQuantile, aggression, buildPriceBook, calibrateShare, demand, faabTrades, TRADE_CEILING, gainsFor, lineupTotals, priceSamples, projectBid, rankOf, round1, starTier, tradeOffers, typicalBid, weighted,
  type GRoster, type PlayerInfo, type Rival, type Tx,
} from "@/lib/in-season-guillotine";

export const maxDuration = 60;
/** The guillotine leagues, active one first. Add new ones here. */
const LEAGUES = ["1387508275846586368", "1399445627359797248"];
/** Last year's guillotine league: its transactions teach the price model. */
const LAST_YEAR = "1264809322165059584";
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

const norm = (name: string) => name.toLowerCase().replace(/[.'’]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
/** Find a player by a typed name ("Nabers", "omar cooper", "breece"): every typed word must appear in his name; best projection wins. */
function findByName<T extends { name: string; proj: number[] }>(query: string, list: T[]): T | null {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return null;
  const hits = list.filter((p) => { const n = norm(p.name); return words.every((w) => n.includes(w)); });
  return hits.sort((a, b) => sum(b.proj) - sum(a.proj))[0] || null;
}

async function loadRosters(leagueId: string) {
  const [league, rosterRows, users] = await Promise.all([sleeper<any>(`/league/${leagueId}`, false), sleeper<any[]>(`/league/${leagueId}/rosters`, false), sleeper<any[]>(`/league/${leagueId}/users`, false)]);
  const budget = Number(league.settings?.waiver_budget || 0);
  const nameOf = (r: any) => users.find((x: any) => String(x.user_id) === String(r.owner_id))?.display_name || String(r.owner_id || r.roster_id);
  const rosters: GRoster[] = rosterRows.map((r: any) => {
    const ids = [...(r.players || []), ...(r.reserve || []), ...(r.taxi || [])].map(String).filter((id) => id !== "0");
    return { rosterId: String(r.roster_id), ownerId: String(r.owner_id || ""), owner: nameOf(r), isMine: isMineRoster({ teamIdentity: "cds1204" }, r, users), eliminated: !ids.length || r.settings?.eliminated > 0, players: ids, faab: Math.max(0, budget - Number(r.settings?.waiver_budget_used || 0)), waiverPosition: Number(r.settings?.waiver_position || 0) };
  });
  return { league, rosters, budget };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await sleeper<any>("/state/nfl", false).catch(() => null);
  const week = Number(state?.week || 0);
  const season = String(state?.league_season || state?.season || "2026");
  if (!week) return Response.json({ error: "Sleeper did not report the current week." }, { status: 502 });

  if (url.searchParams.get("list") === "1") {
    const leagues = await Promise.all(LEAGUES.map(async (id) => {
      try { const { league, rosters } = await loadRosters(id); const me = rosters.find((r) => r.isMine); return { id, name: league.name as string, eliminated: !me || me.eliminated }; }
      catch { return { id, name: "Guillotine league", eliminated: false }; }
    }));
    return Response.json({ leagues, week });
  }

  const LEAGUE = url.searchParams.get("league") || LEAGUES[0];
  if (!LEAGUES.includes(LEAGUE)) return Response.json({ error: "Unknown guillotine league." }, { status: 400 });
  const { league, rosters, budget } = await loadRosters(LEAGUE);
  const me = rosters.find((r) => r.isMine);
  if (!me) return Response.json({ error: "Your roster was not found in this league." }, { status: 404 });
  if (me.eliminated) return Response.json({ eliminated: true, league: { id: LEAGUE, name: league.name }, week });

  const scoring = league.scoring_settings as Record<string, number>;
  const settings = league.settings || {};
  const slots: string[] = (league.roster_positions || []).filter((s: string) => s !== "BN");
  const capacity = (league.roster_positions || []).length;
  const bidMin = Number(settings.waiver_bid_min || 1);
  const teams = Number(settings.num_teams || rosters.length);
  const positions = new Set<string>(); slots.forEach((s) => (SLOT_ELIGIBILITY[s] || [s]).forEach((p) => positions.add(p)));

  // Waiver-pool search for the "Add new target" box: anyone not on a roster (a simulated chop's players count as available).
  const q = (url.searchParams.get("search") || "").trim();
  if (q) {
    const chopOwner = (url.searchParams.get("chop") || "").trim().toLowerCase();
    const held = new Set(rosters.filter((r) => !(chopOwner && !r.isMine && r.owner.toLowerCase() === chopOwner)).flatMap((r) => r.players));
    const all = await nflPlayersCached();
    const words = norm(q).split(" ").filter(Boolean);
    const hits: { id: string; name: string; position: string; team: string; rank: number }[] = [];
    for (const [id, p] of Object.entries<any>(all)) {
      if (held.has(id) || !positions.has(String(p.position)) || !p.team || p.team === "FA") continue;
      const name = playerName(id, all);
      const n = norm(name);
      if (words.length && words.every((w) => n.includes(w))) hits.push({ id, name, position: String(p.position), team: String(p.team), rank: Number(p.search_rank ?? 99999) });
    }
    return Response.json({ results: hits.sort((a, b) => a.rank - b.rank).slice(0, 8).map(({ rank, ...h }) => h) });
  }

  const fetchTx = async (id: string, cache: boolean): Promise<Tx[]> => (await Promise.all(Array.from({ length: 19 }, (_, i) => i + 1).map(async (w) => (await sleeper<any[]>(`/league/${id}/transactions/${w}`, !cache ? false : true).catch(() => [] as any[])).map((t) => ({ ...t, leg: t.leg ?? w }))))).flat();
  const [txs, lastYearTx] = await Promise.all([fetchTx(LEAGUE, false), fetchTx(LAST_YEAR, true)]);

  // Which chop feeds this Wednesday's claims. Sleeper rolls its week over right after Monday night, so the chop week is read from the
  // league's own history: once a chop's claims have processed, the next chop is the one that matters.
  const chops = txs.filter((t) => t.type === "chopped").sort((a, b) => b.leg - a.leg);
  const lastChop = chops[0];
  const batchDone = !!lastChop && txs.some((t) => t.type === "waiver" && t.status === "complete" && t.leg === lastChop.leg && Number(t.status_updated || 0) > lastChop.created);
  const chopWeek = lastChop ? (batchDone ? lastChop.leg + 1 : lastChop.leg) : 1;
  const horizon = [chopWeek + 1, chopWeek + 2, chopWeek + 3].filter((w) => w <= 18);
  // Early-season projections show who a player really is when healthy, so an injured star is not mistaken for a spare part by the next-three-weeks view.
  const baselineWeeks = [1, 2, 3].filter((w) => w < chopWeek);
  const [players, schedule, projections, weekProj, baseline] = await Promise.all([
    nflPlayersCached(), getNflSchedule(season, Array.from({ length: 19 - chopWeek }, (_, i) => chopWeek + i)).catch(() => null),
    Promise.all(horizon.map((w) => getWeekProjections(season, w).catch(() => null))),
    getWeekProjections(season, chopWeek).catch(() => null),
    Promise.all(baselineWeeks.map((w) => getWeekProjections(season, w).catch(() => null))),
  ]);
  const book = [...buildPriceBook(lastYearTx, "last year", budget, teams, bidMin), ...buildPriceBook(txs, "this year", budget, teams, bidMin)];

  // Test mode: ?chop=<owner> treats that team as this week's chop.
  const wanted = (url.searchParams.get("chop") || "").trim().toLowerCase();
  const simulated = wanted ? rosters.find((r) => !r.isMine && !r.eliminated && r.owner.toLowerCase() === wanted) || null : null;
  const simReleased = new Set(simulated?.players || []);
  if (simulated) { simulated.eliminated = true; simulated.players = []; }
  const alive = rosters.filter((r) => !r.eliminated);
  const rivalsAll = alive.filter((r) => !r.isMine);

  const info: Record<string, PlayerInfo> = {};
  const build = (id: string): PlayerInfo | null => {
    if (info[id]) return info[id];
    const p = players[id];
    if (!p || !positions.has(String(p.position))) return null;
    const proj = horizon.map((_, i) => { const row = projections[i]?.get(id); return row ? projectPoints(row.stats, scoring) : 0; });
    const team = String(p.team || "");
    const hasGames = (w: number) => !!schedule && Object.values(schedule).some((t) => t?.[w]);
    const byeAt = (w: number) => hasGames(w) && schedule?.[team]?.[w] === null;
    const nextBye = Array.from({ length: 18 - chopWeek }, (_, i) => chopWeek + 1 + i).find(byeAt) ?? null;
    return (info[id] = { id, name: playerName(id, players), position: String(p.position), team, injury: String(p.injury_status || ""), age: typeof p.age === "number" ? p.age : null, proj, byeWeeks: horizon.filter(byeAt), nextBye });
  };
  rosters.forEach((r) => r.players.forEach(build));
  const rostered = new Set(rosters.flatMap((r) => r.players));

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
  pool.sort((a, b) => sum(b.proj) - sum(a.proj));
  const parseList = (key: string) => (url.searchParams.get(key) || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const wantQueries = parseList("want"), dropQueries = parseList("drops");
  const lookupAll = (q: string): PlayerInfo | null => {
    const words = norm(q).split(" ").filter(Boolean);
    let best: PlayerInfo | null = null;
    for (const [id, p] of Object.entries<any>(players)) {
      if (rostered.has(id) || !positions.has(String(p.position)) || !p.team || p.team === "FA") continue;
      const nm = norm(playerName(id, players));
      if (!words.every((w) => nm.includes(w))) continue;
      const cand = build(id);
      if (cand && (!best || sum(cand.proj) > sum(best.proj))) best = cand;
    }
    return best;
  };
  const wantedRows = [
    ...wantQueries.map((q) => ({ query: q, player: findByName(q, pool) || lookupAll(q) })),
    ...parseList("wantIds").map((id) => ({ query: id, player: rostered.has(id) ? null : build(id) })),
  ];
  const candidates = [...pool.slice(0, 160)];
  wantedRows.forEach((w) => { if (w.player && !candidates.includes(w.player)) candidates.push(w.player); });

  const chopPending = !simulated && (lastChop ? batchDone : true);
  const newlyReleased = simulated ? simReleased : chopPending ? new Set<string>() : new Set(Object.keys(lastChop?.drops || {}));

  // Gain-to-share calibration from every claim (won or lost); used only to rank who rivals want most.
  const best = new Map<string, Tx>();
  for (const t of txs.filter((x) => x.type === "waiver")) { const key = `${t.leg}:${t.roster_ids?.[0]}:${Object.keys(t.adds || {})[0]}`; const prev = best.get(key); if (!prev || Number(t.settings?.waiver_bid || 0) > Number(prev.settings?.waiver_bid || 0)) best.set(key, t); }
  const sample: { roster: number; gain: number; fraction: number }[] = [];
  for (const t of best.values()) {
    const rid = t.roster_ids?.[0]; const pid = Object.keys(t.adds || {})[0];
    const r = rosters.find((x) => Number(x.rosterId) === rid);
    if (!r || r.eliminated || !build(pid) || t.leg < 2) continue;
    sample.push({ roster: rid!, gain: weighted(gainsFor(slots, r.players.filter((id) => id !== pid), info, pid)), fraction: Number(t.settings?.waiver_bid || 0) / Math.max(1, budgetLeft(txs, budget, rid!, t.leg)) });
  }
  const bins = calibrateShare(sample);
  const style = aggression(sample, bins);

  const myBase = lineupTotals(slots, me.players, info);
  const baseByRoster = new Map(alive.map((r) => [r.rosterId, lineupTotals(slots, r.players, info)]));
  const rivalsFor = (id: string): Rival[] => rivalsAll.map((r) => ({ rosterId: r.rosterId, owner: r.owner, gain: weighted(gainsFor(slots, r.players, info, id, null, baseByRoster.get(r.rosterId))), budget: r.faab, mult: style.get(Number(r.rosterId)) ?? 1 }));

  // Market: rank every candidate by rival demand, separately for chopped-team players and everyone else.
  const market = candidates.map((c) => { const rivals = rivalsFor(c.id); return { c, rivals, d: demand(rivals, bins), released: newlyReleased.has(c.id) }; });
  const dList = (released: boolean) => market.filter((m) => m.released === released && m.d > 0).map((m) => m.d);
  const bidders = Math.max(2, alive.length - (chopPending ? 1 : 0));
  const medianBudget = median(alive.map((r) => r.faab));
  const priceFor = (m: { rivals: Rival[]; d: number; released: boolean }) => {
    const interested = m.rivals.filter((r) => r.gain >= 1.5);
    if (!interested.length) return projectBid(null, m.rivals, bins, me.faab, bidMin, 10);
    const rank = rankOf(m.d, dList(m.released));
    const ceiling = Math.max(...interested.map((r) => r.budget));
    return projectBid(priceSamples(book, { bidders, released: m.released, rank, medianBudget, ceiling }), m.rivals, bins, me.faab, bidMin, ceiling);
  };

  const wantedIds = new Set(wantedRows.map((w) => w.player?.id).filter(Boolean) as string[]);
  const screened = market.map((m) => ({ m, free: gainsFor(slots, me.players, info, m.c.id, null, myBase) })).filter((x) => wantedIds.has(x.m.c.id) || weighted(x.free) >= 0.75).sort((a, b) => weighted(b.free) - weighted(a.free)).filter((x, i) => i < 40 || wantedIds.has(x.m.c.id));
  const targets = screened.map(({ m, free }) => {
    const bid = priceFor(m);
    const w = weighted(free);
    return { id: m.c.id, name: m.c.name, position: m.c.position, team: m.c.team, age: m.c.age, injury: m.c.injury, proj: m.c.proj.map(round1), byeWeeks: m.c.byeWeeks, nextBye: m.c.nextBye ?? null, newlyReleased: m.released, gains: free.map(round1), weightedGain: round1(w), bid, rivalsInterested: m.rivals.filter((r) => r.gain >= 1.5).length };
  }).sort((a, b) => b.weightedGain - a.weightedGain);
  // Your typed priority order comes first, then everything else by gain.
  const wantOrder = wantedRows.map((w) => w.player?.id).filter(Boolean) as string[];
  targets.sort((a, b) => { const ia = wantOrder.indexOf(a.id), ib = wantOrder.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || b.weightedGain - a.weightedGain; });

  // Whole roster as trade chips. Price a player as if he were on the wire at his demand rank.
  // Late in the season prices collapse: compare the top price now with the top price in a 10-bidder week.
  const topNow = priceSamples(book, { bidders, released: true, rank: 1, medianBudget, ceiling: 953 });
  const topRef = priceSamples(book, { bidders: 10, released: true, rank: 1, medianBudget, ceiling: 953 });
  const timeFactor = topNow.length && topRef.length ? Math.min(1.2, Math.max(0.1, priceQuantile(topNow, 0.5) / Math.max(1, priceQuantile(topRef, 0.5)))) : 1;
  const myInfo = me.players.map((id) => info[id]).filter(Boolean);
  // Star level by position rank on average projected points per game played, across every player in the league pool.
  const avgPlayedP = (p: PlayerInfo) => { const x = p.proj.filter((v) => v > 0); return x.length ? sum(x) / x.length : 0; };
  const byPos: Record<string, PlayerInfo[]> = {};
  Object.values(info).forEach((p) => (byPos[p.position] ||= []).push(p));
  Object.values(byPos).forEach((l) => l.sort((a, b) => avgPlayedP(b) - avgPlayedP(a)));
  const tierOfPlayer = (p: PlayerInfo) => starTier(p.position, (byPos[p.position] || []).findIndex((x) => x.id === p.id));
  // Elite = top of his position on early-season projections (same cut-offs as the trade "Elite" tag). Falls back to Sleeper's own player ranking if no baseline loaded.
  const baseAvg = new Map<string, number>();
  for (const [id, p] of Object.entries<any>(players)) {
    const vals = baseline.map((m) => { const row = m?.get(id); return row ? projectPoints(row.stats, scoring) : 0; }).filter((v) => v > 0);
    if (vals.length && positions.has(String(p.position))) baseAvg.set(id, sum(vals) / vals.length);
  }
  const topPicks = await topThreeRoundKeys().catch(() => new Set<string>());
  const eliteIds = new Set<string>();
  if (baseAvg.size) {
    const ranked: Record<string, string[]> = {};
    baseAvg.forEach((_v, id) => (ranked[String(players[id].position)] ||= []).push(id));
    Object.entries(ranked).forEach(([pos, ids]) => { ids.sort((a, b) => baseAvg.get(b)! - baseAvg.get(a)!); ids.forEach((id, i) => { if (starTier(pos, i) === 2) eliteIds.add(id); }); });
  } else {
    const ranked: Record<string, string[]> = {};
    Object.entries<any>(players).forEach(([id, p]) => { if (positions.has(String(p.position)) && p.team && Number(p.search_rank ?? 99999) < 99999) (ranked[String(p.position)] ||= []).push(id); });
    Object.entries(ranked).forEach(([pos, ids]) => { ids.sort((a, b) => Number(players[a].search_rank) - Number(players[b].search_rank)); ids.forEach((id, i) => { if (starTier(pos, i) === 2) eliteIds.add(id); }); });
  }
  // Trades that already happened teach the price: the ordinary-player ceiling rises if the league has paid more than the built-in one (picks in the deal excluded).
  const ownerOf = (rid: number) => rosters.find((r) => Number(r.rosterId) === rid)?.owner || `Team ${rid}`;
  const seenTrades = [...faabTrades(txs, ownerOf, (id) => playerName(id, players)).map((t) => ({ ...t, year: "this year" })), ...faabTrades(lastYearTx, () => "—", (id) => playerName(id, players)).map((t) => ({ ...t, year: "last year" }))];
  const tradeCeiling = Math.max(TRADE_CEILING, ...seenTrades.filter((t) => !t.picks && t.players.length <= 1).map((t) => t.faab));
  const tradeIdeas = myInfo.map((p) => {
    const without = me.players.filter((id) => id !== p.id);
    const lost = lineupTotals(slots, without, info);
    const loss = weighted(myBase.map((t, i) => t - lost[i]));
    const rivals = rivalsFor(p.id);
    const tier = tierOfPlayer(p);
    const offers = tradeOffers(rivals, bins, timeFactor, tier, tradeCeiling);
    return { id: p.id, name: p.name, position: p.position, team: p.team, injury: p.injury, age: p.age, proj: p.proj.map(round1), byeWeeks: p.byeWeeks, lineupLoss: round1(loss), tier, offers: offers.slice(0, 6), topOffer: offers[0]?.faab || 0 };
  }).sort((a, b) => b.topOffer - a.topOffer);

  // Chop watch for the week being scored right now.
  const weeks = Array.from({ length: chopWeek }, (_, i) => i + 1);
  const matchups = await Promise.all(weeks.map(async (w) => ({ w, rows: await sleeper<any[]>(`/league/${LEAGUE}/matchups/${w}`, false).catch(() => [] as any[]) })));
  const scoresBy: Record<string, number[]> = {};
  matchups.filter((m) => m.w < chopWeek).forEach((m) => m.rows.forEach((row: any) => { (scoresBy[String(row.roster_id)] ||= []).push(Number(row.points || 0)); }));
  const live = matchups.find((m) => m.w === chopWeek)?.rows || [];
  const sched = schedule || {};
  const chopRows = alive.map((r) => {
    const row = live.find((x: any) => String(x.roster_id) === r.rosterId) || {};
    const points = Number(row.points || 0);
    let remaining = 0, total = 0;
    for (const id of (row.starters || []) as string[]) {
      const proj = weekProj?.get(id) ? projectPoints(weekProj.get(id)!.stats, scoring) : 0;
      total += proj;
      const game = sched[String(players[id]?.team || "")]?.[chopWeek];
      if (game && game.state !== "post") remaining += proj;
    }
    const sd = remaining <= 0 ? 0.5 : Math.max(4, teamSd(scoresBy[r.rosterId], 22) * Math.sqrt(Math.max(0.02, total ? remaining / total : 0)));
    return { id: r.rosterId, owner: r.owner, points: round1(points), remaining: round1(remaining), mean: points + remaining, sd };
  });
  const odds = simulateChop(chopRows.map((x) => ({ id: x.id, mean: x.mean, sd: x.sd })), 4000);
  const chopTeams = chopRows.map((x) => ({ ...x, lowest: odds.find((o) => o.rosterId === x.id)?.lowest || 0 })).sort((a, b) => b.lowest - a.lowest).slice(0, 5).map((x) => {
    const roster = alive.find((r) => r.rosterId === x.id)!;
    const top = roster.players.map((id) => info[id]).filter(Boolean).map((p) => ({ p, w: weighted(gainsFor(slots, me.players, info, p.id, null, myBase)) })).sort((a, b) => b.w - a.w).slice(0, 3);
    return { owner: x.owner, ownerId: roster.ownerId, pointsSoFar: x.points, projectedRemaining: x.remaining, chance: round1(x.lowest * 100), best: top.map(({ p, w }) => ({ id: p.id, name: p.name, position: p.position, team: p.team, gainForMe: round1(w) })) };
  });

  // QB rank among every QB in the pool and on rosters, by average weekly projection when he plays.
  const qbAvg = (p: PlayerInfo) => { const played = p.proj.filter((x) => x > 0); return played.length ? sum(played) / played.length : 0; };
  const qbs = Object.values(info).filter((p) => p.position === "QB").sort((a, b) => qbAvg(b) - qbAvg(a));
  qbs.forEach((p, i) => { p.qbRank = i + 1; });
  if (url.searchParams.get("brief") === "1") {
    return Response.json({ week: chopWeek, horizon, bidders, medianBudget, chopPending, simulated: simulated?.owner || null, chop: { teams: chopTeams.map((t) => `${t.owner} ${t.chance}% pts ${t.pointsSoFar} left ${t.projectedRemaining}`), result: chopPending ? null : lastChop?.roster_ids },
      targets: targets.slice(0, 12).map((t) => `${t.name} ${t.position} gain ${t.weightedGain} bid ${t.bid.p50}/${t.bid.p75}/${t.bid.p90} win@79 ${Math.round(t.bid.winAtMax * 100)}% new=${t.newlyReleased}`),
      drops: (() => { const pick = targets.filter((t) => t.bid.winAtMax >= 0.5).slice(0, 5); const inf: Record<string, PlayerInfo> = { ...info }; return dropPlan(slots, me.players, inf, pick.map((t) => t.id)).map((d) => `${info[d.add]?.name} -> drop ${d.drop ? info[d.drop]?.name + " (" + info[d.drop]?.position + (info[d.drop]?.injury ? " " + info[d.drop]?.injury : "") + ")" : "none"} change ${Math.round(d.change * 10) / 10}`); })(),
      matrix: (() => { const ids = targets.slice(0, 14).map((t) => t.id); const mx = buildMatrix(slots, me.players, info, ids); const pairs = claimPairs(mx); const tg = mx.rows.map((r) => targets.find((t) => t.id === r.id)!).map((t) => ({ id: t.id, curve: t.bid.curve, p50: t.bid.p50, p75: t.bid.p75, p90: t.bid.p90 })); const sh = buildClaimSheet({ slots, roster: me.players, info, targets: tg, pairs, budget: me.faab }); return { drops: mx.drops.slice(0, 9).map((d) => `${info[d.id].name} cost ${Math.round(d.cost * 10) / 10}${info[d.id].qbRank ? " qb#" + info[d.id].qbRank : ""} bye ${info[d.id].nextBye}`), rows: mx.rows.map((r) => `${info[r.id].name}: best ${info[r.best!.drop].name} ${Math.round(r.best!.net * 10) / 10} | ` + mx.drops.slice(0, 8).map((d) => `${info[d.id].name.split(" ").pop()} ${Math.round(r.nets[d.id] * 10) / 10}`).join(", ")), sheet: { expected: Math.round(sh.expected * 10) / 10, landAny: Math.round(sh.landAny * 100), rows: sh.rows.map((x, i) => `${i + 1} ${info[x.add].name} / ${info[x.drop].name} / $${x.bid} hit ${Math.round(x.hit * 100)}% net ${Math.round(x.net * 10) / 10}`) } }; })(),
      trades: tradeIdeas.slice(0, 8).map((t) => `${t.name} loss ${t.lineupLoss} ${t.offers.slice(0, 3).map((o) => `${o.owner}$${o.faab}`).join(",")}`) });
  }
  return Response.json({
    week: chopWeek, season, horizon, weights: HORIZON_WEIGHTS, fetchedAt: new Date().toISOString(),
    league: { id: LEAGUE, name: league.name, slots, capacity, bidders, bidMin },
    me: { faab: me.faab, waiverPosition: me.waiverPosition, roster: myInfo.map((p) => ({ ...p, proj: p.proj.map(round1), elite: eliteIds.has(p.id), topPick: topPicks.has(normalizeDraftName(p.name) + "|" + p.position) })) },
    simulatedChop: simulated ? { owner: simulated.owner, released: simReleased.size } : null,
    owners: rosters.filter((r) => !r.isMine && (!r.eliminated || r === simulated)).map((r) => r.owner),
    price: { samples: book.length, medianBudget },
    learning: {
      winsThisYear: txs.filter((t) => t.type === "waiver" && t.status === "complete").length, winsLastYear: lastYearTx.filter((t) => t.type === "waiver" && t.status === "complete").length,
      chopsThisYear: chops.length, priceSamples: book.length, tradeCeiling, trades: seenTrades.slice(0, 12), baseline: baselineWeeks, topPickCount: topPicks.size, builtAt: new Date().toISOString(),
    },
    faab: (() => {
      const sorted = [...alive].sort((a, b) => b.faab - a.faab);
      const top = sorted[0], second = sorted[1], low = sorted[sorted.length - 1];
      const others = sorted.slice(1);
      const avgOthers = others.length ? sum(others.map((r) => r.faab)) / others.length : 0;
      return { teams: sorted.length, top: { owner: top.owner, faab: top.faab }, second: second ? { owner: second.owner, faab: second.faab } : null, leadOverSecond: second ? top.faab - second.faab : 0, leadOverAverage: Math.round(top.faab - avgOthers), average: Math.round(sum(sorted.map((r) => r.faab)) / sorted.length), lowest: { owner: low.owner, faab: low.faab }, mine: me.faab, mineRank: sorted.findIndex((r) => r.isMine) + 1 };
    })(),
    targets, tradeIdeas,
    wanted: wantedRows.map((w) => ({ query: w.query, id: w.player?.id || null })),
    dropOrder: (() => {
      const mine = me.players.map((id) => info[id]).filter(Boolean);
      const typed = dropQueries.map((q) => findByName(q, mine)?.id || null).filter(Boolean) as string[];
      if (dropQueries.length) return typed;
      return dropPlan(slots, me.players, info, targets.slice(0, 6).map((t) => t.id)).map((d) => d.drop).filter(Boolean) as string[];
    })(),
    chop: { week: chopWeek, result: chopPending || simulated ? null : { owner: rosters.find((r) => r.rosterId === String(lastChop?.roster_ids?.[0]))?.owner || "" }, teams: chopPending || simulated ? chopTeams : [], scoringPosted: chopRows.some((x) => x.points > 25) },
  }, { headers: { "Cache-Control": "no-store" } });
}

function budgetLeft(txs: Tx[], budget: number, rosterId: number, leg: number) {
  let left = budget;
  for (const tx of txs) {
    if (tx.leg >= leg) continue;
    if (tx.type === "waiver" && tx.status === "complete" && tx.roster_ids?.[0] === rosterId) left -= Number(tx.settings?.waiver_bid || 0);
    for (const b of tx.waiver_budget || []) { if (b.sender === rosterId) left -= b.amount; if (b.receiver === rosterId) left += b.amount; }
  }
  return left;
}
