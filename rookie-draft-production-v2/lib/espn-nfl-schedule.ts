// NFL schedule, kickoff times, venue and forecast from ESPN's public scoreboard. Unofficial, so every caller must tolerate failure.
export type NflGame = {
  week: number;
  /** ISO kickoff time (UTC). */
  kickoff: string;
  opponent: string;
  home: boolean;
  indoor: boolean;
  state: "pre" | "in" | "post";
  weather: { text: string; temp: number | null } | null;
  city: string | null;
};
/** team -> week -> game, or null on a bye. Team codes follow Sleeper (WAS, not WSH). */
export type NflSchedule = Record<string, Record<number, NflGame | null>>;

const TEAM_FIX: Record<string, string> = { WSH: "WAS" };
const code = (value: string) => TEAM_FIX[value] || value;

let cache: { key: string; at: number; data: NflSchedule } | null = null;

export async function getNflSchedule(season: string, weeks: number[]): Promise<NflSchedule> {
  const key = `${season}:${weeks.join(",")}`;
  if (cache && cache.key === key && Date.now() - cache.at < 20 * 60 * 1000) return cache.data;
  const results = await Promise.all(weeks.map(async (week) => {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`, { cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`ESPN scoreboard returned HTTP ${response.status}`);
    return { week, events: ((await response.json()).events || []) as any[] };
  }));
  const schedule: NflSchedule = {};
  const allTeams = new Set<string>();
  for (const { events } of results) for (const event of events) for (const c of event.competitions?.[0]?.competitors || []) if (c.team?.abbreviation) allTeams.add(code(c.team.abbreviation));
  for (const { week, events } of results) {
    for (const team of allTeams) (schedule[team] ||= {})[week] = null;
    for (const event of events) {
      const comp = event.competitions?.[0];
      const competitors = comp?.competitors || [];
      const weatherRaw = event.weather || comp?.weather;
      for (const side of competitors) {
        const team = code(side.team?.abbreviation || "");
        const other = competitors.find((c: any) => c !== side);
        if (!team || !other) continue;
        schedule[team][week] = {
          week,
          kickoff: String(event.date),
          opponent: code(other.team?.abbreviation || ""),
          home: side.homeAway === "home",
          indoor: Boolean(comp?.venue?.indoor),
          state: (event.status?.type?.state as NflGame["state"]) || "pre",
          weather: weatherRaw?.displayValue ? { text: String(weatherRaw.displayValue), temp: typeof weatherRaw.temperature === "number" ? weatherRaw.temperature : null } : null,
          city: comp?.venue?.address?.city || null,
        };
      }
    }
  }
  cache = { key, at: Date.now(), data: schedule };
  return schedule;
}
