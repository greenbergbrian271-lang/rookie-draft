// Sleeper's weekly projections (rotowire-sourced). Not an official documented API, so every caller must tolerate failure.
export type ProjectionRow = { stats: Record<string, number>; opponent: string | null; date: string | null; team: string | null };

let cache: { key: string; at: number; data: Map<string, ProjectionRow> } | null = null;

export async function getWeekProjections(season: string, week: number): Promise<Map<string, ProjectionRow>> {
  const key = `${season}:${week}`;
  if (cache && cache.key === key && Date.now() - cache.at < 15 * 60 * 1000) return cache.data;
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
  const url = `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${positions}&order_by=pts_ppr`;
  // The response is several MB (over Next's 2 MB fetch-cache limit), so it is cached in memory instead.
  const response = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Sleeper projections returned HTTP " + response.status);
  const rows = (await response.json()) as any[];
  const data = new Map<string, ProjectionRow>();
  for (const row of rows) {
    if (!row?.player_id || !row.stats) continue;
    data.set(String(row.player_id), { stats: row.stats, opponent: row.opponent || null, date: row.date || null, team: row.team || null });
  }
  cache = { key, at: Date.now(), data };
  return data;
}

/** Projected fantasy points under a league's own scoring settings (same rule Sleeper uses: stat x scoring value). */
export function projectPoints(stats: Record<string, number>, scoring: Record<string, number> | undefined): number {
  if (!scoring || !Object.keys(scoring).length) return Number(stats.pts_ppr || 0);
  let total = 0;
  for (const [stat, value] of Object.entries(scoring)) {
    const amount = stats[stat];
    if (typeof amount === "number" && typeof value === "number") total += amount * value;
  }
  return Math.round(total * 100) / 100;
}
