import { classifyLeague, isMineRoster, loadLeagueEntries, nflPlayersCached, playerName, playersCache, sleeper } from "@/lib/in-season-leagues";
import { getNflSchedule } from "@/lib/espn-nfl-schedule";
import { getWeekProjections, projectPoints } from "@/lib/sleeper-projections";
import { createKtcMatcher, loadKtcDataset } from "@/lib/ktc";
import { SLOT_ELIGIBILITY } from "@/lib/in-season";
import type { BidStats, OutlookCandidate, OutlookLeague, WaiverProcessing } from "@/lib/in-season-waivers";

export const maxDuration = 60;

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))] : 0);

function bidStats(waivers: any[], players: Record<string, any>): BidStats | null {
  const rows = waivers.map((tx) => {
    const id = Object.keys(tx.adds || {})[0];
    return { amount: Number(tx.settings?.waiver_bid || 0), position: String(players[id]?.position || ""), player: id ? playerName(id, players) : "", week: Number(tx.leg || 0) };
  }).filter((row) => row.amount > 0);
  if (!rows.length) return null;
  const all = rows.map((r) => r.amount).sort((a, b) => a - b);
  const byPosition: BidStats["byPosition"] = {};
  for (const position of ["QB", "RB", "WR", "TE"]) {
    const list = rows.filter((r) => r.position === position).map((r) => r.amount).sort((a, b) => a - b);
    if (list.length >= 6) byPosition[position] = { n: list.length, median: pct(list, 0.5), p75: pct(list, 0.75) };
  }
  return { n: all.length, median: pct(all, 0.5), p25: pct(all, 0.25), p75: pct(all, 0.75), p90: pct(all, 0.9), max: all[all.length - 1], byPosition, recent: [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5).map(({ player, amount, week }) => ({ player, amount, week })) };
}

/** The weekday and time most waiver runs actually complete (Eastern), read from the league's own history. */
function processing(waivers: any[]): WaiverProcessing {
  if (!waivers.length) return null;
  const buckets = new Map<string, { weekday: string; time: string; n: number }>();
  for (const tx of waivers) {
    const when = new Date(Number(tx.status_updated || tx.created));
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(when);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    const minute = Math.floor(Number(get("minute")) / 15) * 15;
    const key = `${get("weekday")} ${get("hour")}:${String(minute).padStart(2, "0")} ${get("dayPeriod")}`;
    const bucket = buckets.get(key) || { weekday: get("weekday"), time: `${get("hour")}:${String(minute).padStart(2, "0")} ${get("dayPeriod")}`, n: 0 };
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  return { weekday: best.weekday, time: best.time, n: best.n, share: best.n / waivers.length };
}

export async function GET() {
  const state = await sleeper<any>("/state/nfl", false).catch(() => null);
  const week = Number(state?.week || 0);
  const season = String(state?.league_season || state?.season || new Date().getFullYear());
  if (!week) return Response.json({ error: "Sleeper did not report the current week." }, { status: 502 });
  const horizon = [week + 1, week + 2, week + 3].filter((w) => w <= 18);

  const [players, schedule, trendRaw, projections] = await Promise.all([
    nflPlayersCached().catch(() => playersCache?.data || ({} as Record<string, any>)),
    getNflSchedule(season, [week, ...horizon]).catch(() => null),
    sleeper<any[]>("/players/nfl/trending/add?lookback_hours=24&limit=100", false).catch(() => [] as any[]),
    Promise.all(horizon.map((w) => getWeekProjections(season, w).catch(() => null))),
  ]);
  const trend = new Map<string, number>((trendRaw || []).map((item: any) => [String(item.player_id), Number(item.count || 0)]));
  const ktcDataset = await loadKtcDataset(false).catch(() => null);
  const matcher = ktcDataset ? createKtcMatcher(ktcDataset) : null;

  const entries = (await loadLeagueEntries()).filter((entry) => !entry.eliminated);
  const leagues: Record<string, OutlookLeague> = {};
  await Promise.all(entries.map(async (entry) => {
    try {
      const [league, rosters, users] = await Promise.all([sleeper<any>(`/league/${entry.id}`), sleeper<any[]>(`/league/${entry.id}/rosters`), sleeper<any[]>(`/league/${entry.id}/users`).catch(() => [] as any[])]);
      const mine = rosters.find((roster) => isMineRoster(entry, roster, users));
      if (!mine) throw new Error("Your roster was not matched in this league.");
      const scoring = league.scoring_settings as Record<string, number> | undefined;
      const settings = league.settings || {};
      const positions = new Set<string>();
      (league.roster_positions || []).filter((slot: string) => slot !== "BN").forEach((slot: string) => (SLOT_ELIGIBILITY[slot] || [slot]).forEach((p) => positions.add(p)));
      const rostered = new Set<string>(rosters.flatMap((roster) => [...(roster.players || []), ...(roster.reserve || []), ...(roster.taxi || [])].map(String)));

      const weeklyPoints = (id: string) => horizon.map((_, index) => {
        const row = projections[index]?.get(id);
        return row ? projectPoints(row.stats, scoring) : 0;
      });
      const myProjections: Record<string, number[]> = {};
      for (const id of [...(mine.players || []), ...(mine.reserve || []), ...(mine.taxi || [])].map(String)) myProjections[id] = weeklyPoints(id);

      // Free agents: not on any roster in this league, healthy, with a projection in at least one of the next three weeks.
      const pool: (OutlookCandidate & { sum: number })[] = [];
      const seen = new Set<string>();
      for (const rows of projections) {
        if (!rows) continue;
        for (const [id] of rows) {
          if (seen.has(id) || rostered.has(id)) continue;
          seen.add(id);
          const p = players[id];
          if (!p || !positions.has(String(p.position)) || !p.team || p.team === "FA") continue;
          if (/^(out|ir|pup|nfi|sus|cov|na)/i.test(String(p.injury_status || "")) || /inactive|reserve|suspend/i.test(String(p.status || ""))) continue;
          const proj = weeklyPoints(id);
          const total = proj.reduce((a, b) => a + b, 0);
          if (total <= 0) continue;
          pool.push({ id, name: playerName(id, players), position: String(p.position), team: String(p.team), age: typeof p.age === "number" ? p.age : null, injury: String(p.injury_status || ""), proj, trend: trend.get(id) || 0, sum: total });
        }
      }
      const candidates: OutlookCandidate[] = [];
      for (const position of positions) {
        pool.filter((c) => c.position === position).sort((a, b) => b.sum - a.sum).slice(0, ["QB", "RB", "WR", "TE"].includes(position) ? 14 : 5).forEach(({ sum, ...c }) => candidates.push(c));
      }

      const weeks = Array.from({ length: Math.max(0, Math.min(week, 18)) }, (_, i) => i + 1);
      const transactions = (await Promise.all(weeks.map(async (w) => (await sleeper<any[]>(`/league/${entry.id}/transactions/${w}`).catch(() => [] as any[])).map((tx) => ({ ...tx, leg: tx.leg ?? w })))) ).flat();
      const waivers = transactions.filter((tx) => tx.type === "waiver" && tx.status === "complete" && Object.keys(tx.adds || {}).length);

      const budget = Number(settings.waiver_budget || 0);
      const used = Number(mine.settings?.waiver_budget_used || 0);
      const out: OutlookLeague = {
        leagueId: entry.id, weeks: horizon,
        rules: { budget, used, remaining: Math.max(0, budget - used), clearDays: settings.waiver_clear_days ?? null, daily: Number(settings.daily_waivers || 0) === 1, bidMin: Number(settings.waiver_bid_min || 0), tradeDeadlineWeek: settings.trade_deadline && Number(settings.trade_deadline) < 99 ? Number(settings.trade_deadline) : null, rosterCapacity: (league.roster_positions || []).length },
        processing: processing(waivers), myProjections, candidates, bids: bidStats(waivers, players),
      };
      if (classifyLeague(entry, league) === "Dynasty" && matcher) {
        const ktc: Record<string, number> = {};
        for (const id of [...Object.keys(myProjections), ...candidates.map((c) => c.id)]) {
          const p = players[id];
          const match = p ? matcher(playerName(id, players), String(p.position)) : null;
          if (match) ktc[id] = entry.tePremium ? match.player.tepValue : match.player.value;
        }
        out.ktc = ktc;
      }
      leagues[entry.id] = out;
    } catch (error) {
      leagues[entry.id] = { leagueId: entry.id, weeks: horizon, rules: { budget: 0, used: 0, remaining: 0, clearDays: null, daily: false, bidMin: 0, tradeDeadlineWeek: null, rosterCapacity: 0 }, processing: null, myProjections: {}, candidates: [], bids: null, error: error instanceof Error ? error.message : "Outlook unavailable" };
    }
  }));

  return Response.json({ week, season, horizon, schedule, scheduleError: schedule ? undefined : "ESPN schedule unavailable", leagues, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } });
}
