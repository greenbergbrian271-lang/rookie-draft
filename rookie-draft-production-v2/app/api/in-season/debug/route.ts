// TEMPORARY diagnostic (removed before release): verifies ESPN schedule/weather, future projections and waiver rules.
import { loadLeagueEntries, sleeper } from "@/lib/in-season-leagues";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const get = async (url: string) => { try { const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } }); const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { status: r.status, json: j, text: j ? "" : t.slice(0, 200) }; } catch (e: any) { return { status: 0, json: null, text: String(e) }; } };
const et = (ms: number) => new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
export async function GET() {
  const state: any = await sleeper("/state/nfl");
  const week = Number(state.week);
  const out: any = { week, season: state.league_season };
  // ESPN scoreboard for this week and next
  for (const w of [week, week + 1]) {
    const r = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${w}&seasontype=2&dates=${state.league_season}`);
    const events = r.json?.events || [];
    out[`espn_w${w}`] = { status: r.status, events: events.length, withWeather: events.filter((e: any) => e.weather || e.competitions?.[0]?.weather).length,
      sample: events.slice(0, 2).map((e: any) => ({ date: e.date, name: e.shortName, state: e.status?.type?.state, venue: { indoor: e.competitions?.[0]?.venue?.indoor, city: e.competitions?.[0]?.venue?.address?.city }, weather: e.weather || e.competitions?.[0]?.weather || null, teams: (e.competitions?.[0]?.competitors || []).map((c: any) => c.team?.abbreviation + ":" + c.homeAway) })) };
    if (w === week) out.espn_teamsThisWeek = [...new Set(events.flatMap((e: any) => (e.competitions?.[0]?.competitors || []).map((c: any) => c.team?.abbreviation)))].sort();
  }
  // Sleeper projections for the next three weeks: teams present per week (absent = bye)
  for (const w of [week, week + 1, week + 2]) {
    const r = await get(`https://api.sleeper.com/projections/nfl/${state.league_season}/${w}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr`);
    const rows = Array.isArray(r.json) ? r.json : [];
    out[`proj_w${w}`] = { status: r.status, rows: rows.length, teams: [...new Set(rows.map((x: any) => x.team))].length, sample: rows[0] ? { id: rows[0].player_id, team: rows[0].team, opp: rows[0].opponent, date: rows[0].date, pts: rows[0].stats?.pts_ppr } : null };
  }
  const trend = await get("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=5");
  out.trending = { status: trend.status, sample: trend.json?.slice?.(0, 3) };
  // Waiver rules per league + processed-time pattern + bid history
  const entries = await loadLeagueEntries();
  out.leagues = await Promise.all(entries.map(async (e: any) => {
    const league: any = await sleeper(`/league/${e.id}`);
    const s = league.settings || {};
    const rosters: any[] = await sleeper(`/league/${e.id}/rosters`);
    const mine = rosters.find((r) => String(r.roster_id) === String((e.mineRosterId ?? "")) ) || null;
    const weeks = Array.from({ length: Math.max(0, Math.min(week, 18)) }, (_, i) => i + 1);
    const tx = (await Promise.all(weeks.map((w) => sleeper<any[]>(`/league/${e.id}/transactions/${w}`).catch(() => [])))).flat();
    const waivers = tx.filter((t) => t.type === "waiver" && t.status === "complete");
    const fa = tx.filter((t) => t.type === "free_agent" && t.status === "complete");
    const bids = waivers.map((t) => Number(t.settings?.waiver_bid || 0));
    const when: Record<string, number> = {};
    waivers.forEach((t) => { const k = et(Number(t.status_updated || t.created)); when[k] = (when[k] || 0) + 1; });
    return { name: league.name, type: e.type, waiver: { waiver_type: s.waiver_type, waiver_budget: s.waiver_budget, waiver_clear_days: s.waiver_clear_days, waiver_day_of_week: s.waiver_day_of_week, waiver_bid_min: s.waiver_bid_min, taxi_slots: s.taxi_slots, reserve_slots: s.reserve_slots, max_keepers: s.max_keepers, daily_waivers: s.daily_waivers, disable_adds: s.disable_adds, trade_deadline: s.trade_deadline },
      rosterSettingsSample: rosters[0]?.settings ? { waiver_budget_used: rosters[0].settings.waiver_budget_used, waiver_position: rosters[0].settings.waiver_position, total_moves: rosters[0].settings.total_moves } : null,
      waiversComplete: waivers.length, freeAgentAdds: fa.length, bids: { n: bids.length, max: Math.max(0, ...bids), nonZero: bids.filter((b) => b > 0).length, sample: bids.slice(0, 8) }, processedWhenET: Object.entries(when).sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }));
  return Response.json(out);
}
