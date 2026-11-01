// Schedule-aware helpers: kickoff formatting, locks, bye weeks, weather alerts.
import type { NflGame, NflSchedule } from "./espn-nfl-schedule";
import { buildLineup, findMine, sortLeagues, type InSeasonAlert, type LeagueData } from "./in-season";

export const BAD_WEATHER = /rain|shower|storm|thunder|snow|sleet|ice|freez|blizzard|wind|hail|squall/i;

export const gameFor = (schedule: NflSchedule | undefined, team: string, week: number): NflGame | null | undefined => schedule?.[team]?.[week];

export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET";
}

/** A game has locked its players once it kicks off. */
export function hasKickedOff(game: NflGame | null | undefined, now: Date = new Date()): boolean {
  return Boolean(game && (game.state !== "pre" || new Date(game.kickoff).getTime() <= now.getTime()));
}

export type WeatherFlag = { severity: "watch" | "high"; label: string };
export function weatherFlag(game: NflGame | null | undefined): WeatherFlag | null {
  if (!game || game.indoor || !game.weather) return null;
  const { text, temp } = game.weather;
  if (BAD_WEATHER.test(text)) return { severity: /snow|storm|thunder|blizzard|sleet|hail|squall/i.test(text) ? "high" : "watch", label: text.toLowerCase() };
  if (temp != null && temp <= 25) return { severity: "watch", label: `${temp}°F cold` };
  return null;
}

/** Weeks (from `weeks`) in which the team has no game. */
export const byeWeeks = (schedule: NflSchedule | undefined, team: string, weeks: number[]) => weeks.filter((week) => schedule?.[team]?.[week] === null);

/** One alert per game with poor weather and not-yet-started games your starters are in. ESPN gives conditions and temperature, not wind speed. */
export function buildWeatherAlerts(leagues: LeagueData[], schedule: NflSchedule | undefined, week: number, now: Date = new Date()): InSeasonAlert[] {
  if (!schedule) return [];
  const games = new Map<string, { game: NflGame; team: string; players: Map<string, { label: string; leagues: string[] }>; leagues: Map<string, { id: string; name: string; type: string }>; quality: number }>();
  for (const league of sortLeagues(leagues)) {
    if (!league.ok || league.eliminated || league.status !== "in_season") continue;
    const mine = findMine(league);
    if (!mine || mine.eliminated) continue;
    const lineup = buildLineup(league, mine, league.matchups?.find((m) => m.rosterId === mine.rosterId), now);
    for (const row of lineup.starters) {
      if (!row.player) continue;
      const game = gameFor(schedule, row.player.team, week);
      if (!game || hasKickedOff(game, now) || !weatherFlag(game)) continue;
      const key = [row.player.team, game.opponent].sort().join("-");
      const entry = games.get(key) || { game, team: row.player.team, players: new Map<string, { label: string; leagues: string[] }>(), leagues: new Map<string, { id: string; name: string; type: string }>(), quality: 0 };
      const player = entry.players.get(row.player.id) || { label: `${row.player.name} (${row.player.position})`, leagues: [] as string[] };
      player.leagues.push(league.name);
      entry.players.set(row.player.id, player);
      entry.leagues.set(league.id, { id: league.id, name: league.name, type: league.type });
      entry.quality = Math.max(entry.quality, row.proj ?? 0);
      games.set(key, entry);
    }
  }
  return [...games.entries()].map(([key, entry]) => {
    const flag = weatherFlag(entry.game)!;
    const home = entry.game.home ? entry.team : entry.game.opponent;
    const away = entry.game.home ? entry.game.opponent : entry.team;
    return {
      id: `weather:${week}:${key}`, kind: "weather" as const, severity: flag.severity, quality: entry.quality, leagues: [...entry.leagues.values()],
      title: `Weather: ${flag.label} for ${away} at ${home}${entry.game.city ? ` (${entry.game.city})` : ""}`,
      detail: `Kickoff ${formatKickoff(entry.game.kickoff)}${entry.game.weather?.temp != null ? `, ${entry.game.weather.temp}°F` : ""}. ${entry.players.size} of your starters ${entry.players.size === 1 ? "is" : "are"} in this game.`,
      details: [...entry.players.values()].map((player) => `${player.label}: ${player.leagues.join(", ")}`),
    };
  }).sort((a, b) => b.quality - a.quality);
}
