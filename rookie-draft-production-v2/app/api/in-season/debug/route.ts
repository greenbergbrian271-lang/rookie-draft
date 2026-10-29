// TEMPORARY diagnostic: shows which raw Sleeper fields exist (auto-sub, IR, projections). Removed after use.
export const dynamic = "force-dynamic";
const get = async (url: string) => {
  try { const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } }); const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { status: r.status, json: j, text: j ? "" : t.slice(0, 300) }; } catch (e: any) { return { status: 0, error: String(e) }; }
};
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("league") || "1387925097968316416";
  const roster = u.searchParams.get("roster") || "4";
  const base = "https://api.sleeper.app/v1/league/" + id;
  const [league, rosters, m, state] = await Promise.all([get(base), get(base + "/rosters"), get(base + "/matchups/8"), get("https://api.sleeper.app/v1/state/nfl")]);
  const myRoster = (rosters.json || []).find((r: any) => String(r.roster_id) === roster);
  const myMatch = (m.json || []).find((r: any) => String(r.roster_id) === roster);
  const proj = await get("https://api.sleeper.com/projections/nfl/2026/8?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&order_by=pts_ppr");
  const proj2 = await get("https://api.sleeper.app/projections/nfl/2026/8?season_type=regular&position[]=WR&order_by=pts_ppr");
  const stats = await get("https://api.sleeper.com/stats/nfl/2026/8?season_type=regular&position[]=WR&order_by=pts_ppr");
  const sample = (x: any) => Array.isArray(x.json) ? { status: x.status, count: x.json.length, first: x.json.slice(0, 2) } : { status: x.status, text: x.text, error: (x as any).error };
  return Response.json({
    state: state.json,
    leagueSettings: league.json?.settings, leagueKeys: Object.keys(league.json || {}), leagueMetadata: league.json?.metadata,
    rosterFull: myRoster, matchupFull: myMatch,
    projCom: sample(proj), projApp: sample(proj2), statsCom: sample(stats),
  });
}
