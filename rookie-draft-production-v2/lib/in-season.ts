// Pure helpers for the In-Season Management workspace.
// Nothing here fetches data or touches React so it can be unit tested directly.

export type PlayerDetail = {
  id: string;
  name: string;
  position: string;
  team: string;
  status: string;
  injuryStatus: string;
  depthChartPosition?: string | null;
  age?: number | null;
};

export type TeamData = {
  rosterId: string;
  owner: string;
  teamName?: string;
  ownerId?: string;
  avatar?: string | null;
  settings?: Record<string, any>;
  isMine?: boolean;
  eliminated?: boolean;
  players: string[];
  playerDetails?: PlayerDetail[];
  starters: string[];
  reserve?: string[];
  taxi?: string[];
  points: number;
  pointsAgainst?: number;
  maxPoints?: number;
  wins: number;
  losses: number;
  ties?: number;
  waiverBudget: any;
};

export type MatchupData = {
  rosterId: string;
  matchupId: number;
  points: number;
  starters?: string[];
  startersPoints?: Record<string, number>;
  projected?: number;
};

export type Intent = "Contend" | "Rebuild";
export type Intents = Record<string, Intent>;
export type WindowInfo = { classification: string; windowScore: number; powerRank: number; declared?: boolean };
export type ProjectionInfo = { pts: number; opp: string | null; date: string | null };

export type LeagueData = {
  id: string;
  type: string;
  eliminated: boolean;
  ok: boolean;
  name: string;
  season?: string;
  status?: string;
  week?: number;
  totalRosters?: number;
  rosterPositions?: string[];
  settings?: Record<string, any>;
  scoringSettings?: Record<string, number>;
  playoffTeams?: number;
  playoffWeekStart?: number;
  schedule?: { week: number; matchups: { rosterId: string; matchupId: number }[] }[];
  teams?: TeamData[];
  matchups?: MatchupData[];
  transactions?: {
    type: string;
    status: string;
    created: number;
    adds: Record<string, number>;
    drops: Record<string, number>;
    rosterIds?: string[];
    addedNames?: string[];
    droppedNames?: string[];
    waiverBudget?: any[];
  }[];
  projections?: Record<string, ProjectionInfo>;
  playerSeason?: Record<string, { pts: number; gp: number }>;
  weeklyScores?: Record<string, number[]>;
  lastScoredLeg?: number;
  windows?: Record<string, WindowInfo>;
  windowError?: string;
  warnings?: string[];
  error?: string;
  fetchedAt: string;
};

/* ---------- league ordering and identity ---------- */

export const LEAGUE_TYPE_ORDER = ["Dynasty", "Redraft", "Guillotine"];
const typeRank = (type: string) => {
  const index = LEAGUE_TYPE_ORDER.indexOf(type);
  return index < 0 ? LEAGUE_TYPE_ORDER.length : index;
};

/** Dynasty first, then Redraft, then Guillotine; eliminated leagues last within a type. */
export function sortLeagues<T extends { type: string; eliminated: boolean; name: string }>(leagues: T[]): T[] {
  return [...leagues].sort(
    (a, b) => typeRank(a.type) - typeRank(b.type) || Number(a.eliminated) - Number(b.eliminated) || a.name.localeCompare(b.name),
  );
}

export const isGuillotine = (league: { type: string }) => league.type.toLowerCase().includes("guillotine");
export const isDynasty = (league: { type: string }) => league.type.toLowerCase().includes("dynasty");

export function teamLabel(team: TeamData | undefined | null): string {
  if (!team) return "Team";
  const custom = team.teamName && team.teamName.toLowerCase() !== team.owner.toLowerCase() ? team.teamName : "";
  return custom || team.owner || `Roster ${team.rosterId}`;
}

/** The server marks the user's roster with isMine; knownOwnerIds covers older payloads. */
export function findMine(league: LeagueData, knownOwnerIds: string[] = []): TeamData | undefined {
  const teams = league.teams || [];
  return (
    teams.find((team) => team.isMine) ||
    teams.find((team) => knownOwnerIds.includes(team.ownerId || "")) ||
    teams.find((team) => team.owner.toLowerCase() === "cds1204")
  );
}

/* ---------- weekly reset (Tuesday, Eastern) ---------- */

/** Fantasy weeks turn over on Tuesday. Returns the date (YYYY-MM-DD, Eastern) of the most recent Tuesday. */
export function weekKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const date = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  date.setUTCDate(date.getUTCDate() - ((dayIndex - 2 + 7) % 7));
  return date.toISOString().slice(0, 10);
}

/** Your declared Contend/Rebuild intent overrides the computed window for your own team. */
export function effectiveWindow(league: LeagueData, team: TeamData | undefined, intents: Intents = {}): WindowInfo | undefined {
  if (!team) return undefined;
  const computed = league.windows?.[team.rosterId];
  const declared = isDynasty(league) && team.isMine ? intents[league.id] : undefined;
  if (declared) return { classification: declared === "Contend" ? "Contender" : "Rebuilder", windowScore: computed?.windowScore ?? 0, powerRank: computed?.powerRank ?? 0, declared: true };
  return computed;
}

export const projectionFor = (league: LeagueData, playerId: string) => league.projections?.[playerId];
export function seasonAverage(league: LeagueData, playerId: string): number | null {
  const season = league.playerSeason?.[playerId];
  return season && season.gp > 0 ? season.pts / season.gp : null;
}

/* ---------- standings ---------- */

export type StandingRow = {
  team: TeamData;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  max: number;
  /** Share of the maximum possible points the team actually scored (PF / Max PF). */
  efficiency: number | null;
  /** Points per scored week (PF divided by the weeks the team actually scored). */
  avg: number | null;
  weeks: number;
  window?: WindowInfo;
  isMine: boolean;
  eliminated: boolean;
};

export function buildStandings(league: LeagueData, mineId?: string, intents: Intents = {}): StandingRow[] {
  const guillotine = isGuillotine(league);
  const rows = (league.teams || []).map((team) => {
    const max = team.maxPoints || 0;
    const eliminated = Boolean(team.eliminated) || (guillotine && team.players.length === 0);
    const scored = (league.weeklyScores?.[team.rosterId] || []).filter((value) => value > 0).length;
    const weeks = scored || team.wins + team.losses + (team.ties || 0) || 0;
    return {
      team,
      rank: 0,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties || 0,
      pf: team.points,
      pa: team.pointsAgainst || 0,
      max,
      efficiency: max > 0 ? team.points / max : null,
      avg: weeks > 0 ? team.points / weeks : null,
      weeks,
      window: effectiveWindow(league, team, intents),
      isMine: mineId ? team.rosterId === mineId : Boolean(team.isMine),
      eliminated,
    } as StandingRow;
  });
  const games = (row: StandingRow) => row.wins + row.losses + row.ties;
  const pct = (row: StandingRow) => (games(row) ? (row.wins + row.ties / 2) / games(row) : 0);
  rows.sort((a, b) =>
    guillotine
      ? Number(a.eliminated) - Number(b.eliminated) || b.pf - a.pf
      : pct(b) - pct(a) || b.pf - a.pf || a.team.rosterId.localeCompare(b.team.rosterId),
  );
  rows.forEach((row, index) => (row.rank = index + 1));
  return rows;
}

/** Number of first-round byes for a standard single-elimination bracket. */
export function byeSlots(playoffTeams: number): number {
  if (playoffTeams < 3) return 0;
  const bracket = 2 ** Math.ceil(Math.log2(playoffTeams));
  return bracket - playoffTeams;
}

/* ---------- live projections ---------- */

const todayET = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/**
 * Projection that updates as games finish, the way Sleeper's "proj." does: a player whose game date has passed counts
 * his actual points, a player playing today counts the higher of actual and projection, and everyone else counts the projection.
 */
export function livePlayerProjection(league: LeagueData, playerId: string, points: number | null | undefined, now: Date = new Date()): number {
  const actual = points ?? 0;
  const projection = league.projections?.[playerId];
  if (!projection) return actual;
  if (projection.date && projection.date < todayET(now)) return actual;
  if (projection.date && projection.date === todayET(now)) return Math.max(actual, projection.pts);
  return projection.pts;
}

export function matchupProjected(league: LeagueData, matchup: MatchupData | undefined, now: Date = new Date()): number | null {
  if (!matchup) return null;
  const ids = (matchup.starters || []).filter((id) => id && id !== "0");
  if (!ids.length) return matchup.projected ?? null;
  return Math.round(ids.reduce((sum, id) => sum + livePlayerProjection(league, id, matchup.startersPoints?.[id], now), 0) * 100) / 100;
}

export type Verdict = "win" | "lose" | "toss-up" | "none";
/** Toss-up when the projected margin is under this many points. */
export const TOSS_UP_MARGIN = 2;

export function projectedOutcome(league: LeagueData, rosterId: string, now: Date = new Date()) {
  const mine = league.matchups?.find((m) => m.rosterId === rosterId);
  const theirs = mine && league.matchups?.find((m) => m.matchupId === mine.matchupId && m.rosterId !== rosterId);
  const myProj = matchupProjected(league, mine, now), theirProj = matchupProjected(league, theirs, now);
  const spread = myProj != null && theirProj != null ? Math.round((myProj - theirProj) * 100) / 100 : null;
  const verdict: Verdict = spread == null ? "none" : Math.abs(spread) < TOSS_UP_MARGIN ? "toss-up" : spread > 0 ? "win" : "lose";
  return { myProj, theirProj, spread, verdict };
}

/* ---------- lineup ---------- */

export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["WR", "RB"], REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"], DL: ["DL"], LB: ["LB"], DB: ["DB"], IDP_FLEX: ["DL", "LB", "DB"],
};

export function slotLabel(slot: string): string {
  switch (slot) {
    case "SUPER_FLEX": return "SFLX";
    case "WRRB_FLEX": return "W/R";
    case "REC_FLEX": return "W/T";
    case "IDP_FLEX": return "IDP";
    default: return slot;
  }
}

export type LineupSlot = {
  slot: string;
  label: string;
  id: string | null;
  player: PlayerDetail | null;
  points: number | null;
  proj: number | null;
  game: { opp: string | null; date: string | null } | null;
};

export type LineupView = {
  starters: LineupSlot[];
  bench: PlayerDetail[];
  reserve: PlayerDetail[];
  taxi: PlayerDetail[];
  projectedTotal: number;
};

const POSITION_ORDER: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };
const byPosition = (a: PlayerDetail, b: PlayerDetail) =>
  (POSITION_ORDER[a.position] || 9) - (POSITION_ORDER[b.position] || 9) || a.name.localeCompare(b.name);

/** Sleeper lists starters in the same order as the non-bench entries of roster_positions. */
export function buildLineup(league: LeagueData, team: TeamData, matchup?: MatchupData, now: Date = new Date()): LineupView {
  const slots = (league.rosterPositions || []).filter((slot) => slot !== "BN");
  const ids = matchup?.starters?.length ? matchup.starters : team.starters;
  const details = new Map((team.playerDetails || []).map((player) => [player.id, player]));
  const starters = slots.map((slot, index) => {
    const raw = ids[index];
    const id = raw && raw !== "0" ? raw : null;
    return {
      slot,
      label: slotLabel(slot),
      id,
      player: id ? details.get(id) || null : null,
      points: id && matchup?.startersPoints && matchup.startersPoints[id] != null ? matchup.startersPoints[id] : null,
      proj: id && projectionFor(league, id) ? Math.round(livePlayerProjection(league, id, matchup?.startersPoints?.[id], now) * 100) / 100 : null,
      game: id && projectionFor(league, id) ? { opp: projectionFor(league, id)!.opp, date: projectionFor(league, id)!.date } : null,
    };
  });
  const used = new Set(ids.filter((id) => id && id !== "0"));
  const reserveIds = new Set(team.reserve || []);
  const taxiIds = new Set(team.taxi || []);
  const players = team.playerDetails || [];
  return {
    starters,
    bench: players.filter((p) => !used.has(p.id) && !reserveIds.has(p.id) && !taxiIds.has(p.id)).sort(byPosition),
    reserve: players.filter((p) => reserveIds.has(p.id)).sort(byPosition),
    taxi: players.filter((p) => taxiIds.has(p.id)).sort(byPosition),
    projectedTotal: starters.reduce((sum, row) => sum + (row.proj ?? 0), 0),
  };
}

/* ---------- alerts / action queue ---------- */

export type Severity = "critical" | "high" | "watch";

export type AlertOption = { id: string; name: string; position: string; proj: number | null; avg: number | null };
export type AlertAlternative = {
  leagueId: string;
  leagueName: string;
  leagueType: string;
  slot: string;
  action: "auto-sub" | "swap" | "none";
  /** Auto-Subs the league allows per week (Sleeper's max_subs). */
  maxSubs: number;
  note: string;
  options: AlertOption[];
};

export type InSeasonAlert = {
  id: string;
  kind: "player" | "ir" | "empty" | "intent";
  severity: Severity;
  title: string;
  detail: string;
  /** Higher = better player (best of weekly projection and season average). Drives sort order. */
  quality: number;
  leagues: { id: string; name: string; type: string }[];
  playerId?: string;
  alternatives?: AlertAlternative[];
  intentLeagueId?: string;
};

export function playerFlag(player: PlayerDetail): { severity: Severity; label: string } | null {
  const injury = (player.injuryStatus || "").trim();
  if (/^(out|ir|pup|nfi|sus|cov|na)/i.test(injury)) return { severity: "critical", label: injury };
  if (/^doubtful/i.test(injury)) return { severity: "high", label: "Doubtful" };
  if (/^questionable/i.test(injury)) return { severity: "watch", label: "Questionable" };
  if (/inactive|reserve|suspend/i.test(player.status || "")) return { severity: "high", label: player.status };
  if (player.team === "FA" && player.position !== "DEF") return { severity: "critical", label: "No NFL team" };
  return null;
}

const playerQuality = (league: LeagueData, playerId: string) =>
  Math.max(projectionFor(league, playerId)?.pts ?? 0, seasonAverage(league, playerId) ?? 0);

/** Healthy bench players allowed in the slot, best first (by projection, then season average). */
export function healthyBenchFor(slot: string, bench: PlayerDetail[], league?: LeagueData): PlayerDetail[] {
  const allowed = SLOT_ELIGIBILITY[slot] || [slot];
  const score = (player: PlayerDetail) => (league ? playerQuality(league, player.id) : 0);
  return bench
    .filter((player) => allowed.includes(player.position) && !playerFlag(player) && player.team !== "FA")
    .sort((a, b) => score(b) - score(a));
}

/** Can this status go in an IR slot under the league's own reserve rules? */
export function irEligible(league: LeagueData, player: PlayerDetail): boolean {
  const settings = league.settings || {};
  const status = (player.injuryStatus || "").toLowerCase();
  if (status === "ir") return true;
  if (status === "out") return Number(settings.reserve_allow_out ?? 1) === 1;
  if (status === "doubtful") return Number(settings.reserve_allow_doubtful || 0) === 1;
  if (status === "sus") return Number(settings.reserve_allow_sus || 0) === 1;
  if (status === "cov") return Number(settings.reserve_allow_cov || 0) === 1;
  if (status === "na") return Number(settings.reserve_allow_na || 0) === 1;
  return false;
}

export function openIrSlots(league: LeagueData, team: TeamData): number {
  return Math.max(0, Number(league.settings?.reserve_slots || 0) - (team.reserve || []).length);
}

export const maxSubsFor = (league: LeagueData) => Number(league.settings?.max_subs || 0);

/** First week the "stuck in the middle" nudge fires, through the last regular-season week. */
export const MIDDLE_ALERT_START_WEEK = 8;

export function buildAlerts(leagues: LeagueData[], intents: Intents = {}): InSeasonAlert[] {
  const byPlayer = new Map<string, InSeasonAlert>();
  const irByPlayer = new Map<string, InSeasonAlert>();
  const out: InSeasonAlert[] = [];
  const optionOf = (league: LeagueData, player: PlayerDetail): AlertOption => ({
    id: player.id, name: player.name, position: player.position,
    proj: projectionFor(league, player.id)?.pts ?? null, avg: seasonAverage(league, player.id),
  });

  for (const league of sortLeagues(leagues)) {
    if (!league.ok || league.eliminated || league.status !== "in_season") continue;
    const mine = findMine(league);
    if (!mine || mine.eliminated) continue;
    const matchup = league.matchups?.find((m) => m.rosterId === mine.rosterId);
    const lineup = buildLineup(league, mine, matchup);
    const tag = { id: league.id, name: league.name, type: league.type };
    const maxSubs = maxSubsFor(league);

    for (const row of lineup.starters) {
      if (!row.id) {
        out.push({ id: `empty:${league.id}:${row.label}`, kind: "empty", severity: "critical", title: `Empty ${row.label} slot in ${league.name}`, detail: "No player is set in this starting slot.", quality: 999, leagues: [tag] });
        continue;
      }
      if (!row.player) continue;
      const flag = playerFlag(row.player);
      if (!flag) continue;
      const options = healthyBenchFor(row.slot, lineup.bench, league).slice(0, 3).map((p) => optionOf(league, p));
      const uncertain = flag.severity !== "critical";
      const action: AlertAlternative["action"] = !options.length ? "none" : uncertain && maxSubs > 0 ? "auto-sub" : "swap";
      const note = !options.length
        ? "No healthy bench player is eligible for this slot."
        : action === "auto-sub"
          ? `Set an Auto-Sub on ${row.player.name} so ${options[0].name} steps in only if he is out. This league allows up to ${maxSubs} Auto-Subs.`
          : uncertain
            ? "Auto-Subs aren't enabled in this league, so swap manually if he doesn't play."
            : `${row.player.name} is ${flag.label}. Move a healthy bench player into this slot.`;
      const alternative: AlertAlternative = { leagueId: league.id, leagueName: league.name, leagueType: league.type, slot: row.label, action, maxSubs, note, options };
      const quality = playerQuality(league, row.id);
      const existing = byPlayer.get(row.id);
      if (existing) {
        existing.leagues.push(tag);
        existing.alternatives!.push(alternative);
        existing.quality = Math.max(existing.quality, quality);
      } else {
        byPlayer.set(row.id, {
          id: `player:${row.id}`, kind: "player", severity: flag.severity, playerId: row.id, quality, leagues: [tag], alternatives: [alternative],
          title: `${row.player.name} (${row.player.position}, ${row.player.team}) is ${flag.label}`,
          detail: "",
        });
      }
    }

    // IR: only suggest a move when the league's IR rules allow this status AND a slot is open.
    const openIr = openIrSlots(league, mine);
    if (openIr > 0) {
      for (const player of lineup.bench) {
        if (!irEligible(league, player)) continue;
        const existing = irByPlayer.get(player.id);
        if (existing) { existing.leagues.push(tag); continue; }
        irByPlayer.set(player.id, {
          id: `ir:${player.id}`, kind: "ir", severity: "watch", playerId: player.id, quality: playerQuality(league, player.id), leagues: [tag],
          title: `Move ${player.name} to IR`, detail: "He's injured and still on your active roster. This league has an open IR slot.",
        });
      }
    }

    // Dynasty: being in the middle is not a strategy. Nag weekly from Week 8 through the last regular-season week.
    const last = (league.playoffWeekStart || 15) - 1;
    const window = isDynasty(league) ? effectiveWindow(league, mine, intents) : undefined;
    if (window?.classification === "Stuck in the Middle" && (league.week || 0) >= MIDDLE_ALERT_START_WEEK && (league.week || 0) <= last) {
      out.push({
        id: `intent:${league.id}`, kind: "intent", severity: "high", quality: 998, leagues: [tag], intentLeagueId: league.id,
        title: `${league.name}: you're in the middle`,
        detail: "Being in the middle isn't an effective strategy. Decide to go for it or step out, and you can re-evaluate in the offseason.",
      });
    }
  }

  for (const alert of byPlayer.values()) {
    const count = alert.alternatives!.length;
    alert.detail = count > 1 ? `Starting in ${count} of your leagues.` : `Starting in ${alert.leagues[0].name}.`;
  }
  return [...out, ...byPlayer.values(), ...irByPlayer.values()].sort((a, b) => b.quality - a.quality || a.title.localeCompare(b.title));
}

/* ---------- rooting guide ---------- */

export type RootItem = {
  key: string;
  rootFor: string;
  rootAgainst: string;
  forRecord: string;
  againstRecord: string;
  reason: string;
  impact: "high" | "low";
  mine?: boolean;
};

export type RootingGuide = {
  mode: "contender" | "rebuilder" | "playoff-race" | "survival";
  headline: string;
  detail: string;
  note?: string;
  items: RootItem[];
};

const recordOf = (row: StandingRow) => `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;

export function matchupPairs(league: LeagueData): [string, string][] {
  const groups = new Map<number, string[]>();
  for (const match of league.matchups || []) {
    if (match.matchupId == null) continue;
    groups.set(match.matchupId, [...(groups.get(match.matchupId) || []), match.rosterId]);
  }
  return [...groups.values()].filter((ids) => ids.length === 2).map((ids) => [ids[0], ids[1]] as [string, string]);
}

export function buildRootingGuide(league: LeagueData, intents: Intents = {}): RootingGuide {
  const guillotine = isGuillotine(league);
  if (guillotine) {
    return { mode: "survival", headline: "Survival guide", detail: "Keep your weekly score above the lowest active team.", items: [] };
  }
  const standings = buildStandings(league, undefined, intents);
  const mine = standings.find((row) => row.isMine);
  if (!mine) {
    return { mode: "playoff-race", headline: "Rooting guide unavailable", detail: "Your roster was not matched in this league.", items: [] };
  }
  const count = standings.length;
  const playoffTeams = league.playoffTeams || Number(league.settings?.playoff_teams || 0) || Math.min(6, count);
  const byes = byeSlots(playoffTeams);
  const byRoster = new Map(standings.map((row) => [row.team.rosterId, row]));
  const pairs = matchupPairs(league);
  const window = isDynasty(league) ? mine.window : undefined;
  const items: RootItem[] = [];

  const myPair = pairs.find((pair) => pair.includes(mine.team.rosterId));
  const myOpponent = myPair ? byRoster.get(myPair[0] === mine.team.rosterId ? myPair[1] : myPair[0]) : undefined;
  const others = pairs.filter((pair) => pair !== myPair);

  const make = (winner: StandingRow, loser: StandingRow, reason: string, impact: "high" | "low"): RootItem => ({
    key: `${winner.team.rosterId}-${loser.team.rosterId}`,
    rootFor: teamLabel(winner.team),
    rootAgainst: teamLabel(loser.team),
    forRecord: recordOf(winner),
    againstRecord: recordOf(loser),
    reason,
    impact,
  });

  let mode: RootingGuide["mode"] = "playoff-race";
  let headline = "";
  let detail = "";
  let note: string | undefined;

  if (window?.classification === "Contender") {
    mode = "contender";
    headline = window.declared ? "You declared Contend: root for the weaker teams" : "Contender window: root for the weaker teams";
    detail = `You are ranked ${mine.rank} of ${count}. As a contender, you want the weaker team to win each game so the teams ahead of or near you pick up losses.`;
    for (const [a, b] of others) {
      const rowA = byRoster.get(a)!, rowB = byRoster.get(b)!;
      const better = rowA.rank < rowB.rank ? rowA : rowB;
      const worse = better === rowA ? rowB : rowA;
      const rival = better.rank <= playoffTeams || Math.abs(better.rank - mine.rank) <= 3;
      items.push(make(worse, better, rival ? `${teamLabel(better.team)} (#${better.rank}) is part of your playoff and seeding race, so a loss helps you.` : `${teamLabel(better.team)} (#${better.rank}) is not a direct rival, so this has little effect on your seed.`, rival ? "high" : "low"));
    }
  } else if (window?.classification === "Rebuilder") {
    mode = "rebuilder";
    headline = window.declared ? "You declared Rebuild: root for the stronger teams" : "Rebuilder window: root for the stronger teams";
    detail = `You are ranked ${mine.rank} of ${count}. As a rebuilder, you want the stronger team to win each game so the weaker teams keep losing and their picks hold value.`;
    for (const [a, b] of others) {
      const rowA = byRoster.get(a)!, rowB = byRoster.get(b)!;
      const better = rowA.rank < rowB.rank ? rowA : rowB;
      const worse = better === rowA ? rowB : rowA;
      const bottom = worse.rank > Math.ceil((count * 2) / 3);
      items.push(make(better, worse, bottom ? `${teamLabel(worse.team)} (#${worse.rank}) is near the bottom, and a loss helps their pick position.` : `${teamLabel(worse.team)} (#${worse.rank}) is mid-table, so this has little effect on pick order.`, bottom ? "high" : "low"));
    }
  } else {
    mode = "playoff-race";
    const cut = playoffTeams;
    const rivalRanks = new Set<number>();
    if (mine.rank <= byes) { for (let r = byes + 1; r <= byes + 3; r++) rivalRanks.add(r); }
    else if (mine.rank <= cut) { for (let r = cut + 1; r <= cut + 2; r++) rivalRanks.add(r); if (byes > 0) for (let r = Math.max(1, byes - 1); r <= byes; r++) rivalRanks.add(r); }
    else { for (let r = Math.max(1, cut - 1); r <= cut; r++) rivalRanks.add(r); }
    rivalRanks.delete(mine.rank);
    headline = "Playoff race: root against the teams chasing your seed";
    detail = `You are ranked ${mine.rank} of ${count}. ${playoffTeams} teams make the playoffs${byes ? ` and the top ${byes} get a first-round bye` : ""}.`;
    if (isDynasty(league)) {
      note = league.windowError ? "Team window data was unavailable, so this uses the playoff race." : window ? `Your window is ${window.classification}, so this follows the playoff race.` : "No team window was found for this league, so this uses the playoff race.";
    }
    for (const [a, b] of others) {
      const rowA = byRoster.get(a)!, rowB = byRoster.get(b)!;
      const rivalA = rivalRanks.has(rowA.rank), rivalB = rivalRanks.has(rowB.rank);
      if (!rivalA && !rivalB) continue;
      if (rivalA && rivalB) {
        const winner = rowA.rank > rowB.rank ? rowA : rowB;
        const loser = winner === rowA ? rowB : rowA;
        items.push(make(winner, loser, "Both teams are in your race, so one of them will take a loss either way.", "low"));
      } else {
        const loser = rivalA ? rowA : rowB;
        const winner = rivalA ? rowB : rowA;
        items.push(make(winner, loser, `${teamLabel(loser.team)} (#${loser.rank}) is in your race, so a loss helps your seed.`, "high"));
      }
    }
  }

  items.sort((a, b) => Number(b.impact === "high") - Number(a.impact === "high"));
  if (myOpponent) {
    const rebuilder = mode === "rebuilder";
    items.unshift({
      key: "mine",
      rootFor: rebuilder ? "Your call" : teamLabel(mine.team),
      rootAgainst: teamLabel(myOpponent.team),
      forRecord: recordOf(mine),
      againstRecord: recordOf(myOpponent),
      reason: rebuilder ? "As a rebuilder, a loss can improve your draft position. Set your lineup accordingly." : "Your own matchup.",
      impact: "high",
      mine: true,
    });
  }
  return { mode, headline, detail, note, items };
}

/* ---------- guillotine ---------- */

export type GuillotineZone = "chop" | "danger" | "safe";
export type GuillotineRow = { team: TeamData; rosterId: string; rank: number; projected: number; points: number; zone: GuillotineZone; isMine: boolean };

/** Teams still alive, ranked by live projection (1 = best). Lowest is the chop zone, the next 3 lowest are in danger, everyone above is safe. */
export function guillotineBoard(league: LeagueData, now: Date = new Date()): GuillotineRow[] {
  const alive = new Map((league.teams || []).filter((t) => !t.eliminated && t.players.length > 0).map((t) => [t.rosterId, t]));
  const rows = (league.matchups || [])
    .filter((m) => alive.has(m.rosterId))
    .map((m) => ({ team: alive.get(m.rosterId)!, rosterId: m.rosterId, projected: matchupProjected(league, m, now) ?? 0, points: m.points }))
    .sort((a, b) => b.projected - a.projected || b.points - a.points);
  const count = rows.length;
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    zone: ((count > 1 && count - 1 - index === 0) ? "chop" : (count > 1 && count - 1 - index <= 3) ? "danger" : "safe") as GuillotineZone,
    isMine: Boolean(row.team.isMine),
  }));
}

export type GuillotineStatus = {
  rank: number;
  of: number;
  zone: GuillotineZone;
  points: number;
  projected: number;
  low: { label: string; value: number } | null;
  /** Your projection minus the lowest projection. 0 means you are the lowest. */
  marginToLow: number;
};

export function guillotineStatus(league: LeagueData, rosterId: string, now: Date = new Date()): GuillotineStatus | null {
  const board = guillotineBoard(league, now);
  const mine = board.find((row) => row.rosterId === rosterId);
  if (!mine) return null;
  const lowest = board[board.length - 1];
  return {
    rank: mine.rank, of: board.length, zone: mine.zone, points: mine.points, projected: mine.projected,
    low: { label: teamLabel(lowest.team), value: lowest.projected },
    marginToLow: lowest.rosterId === rosterId ? 0 : Math.round((mine.projected - lowest.projected) * 100) / 100,
  };
}
