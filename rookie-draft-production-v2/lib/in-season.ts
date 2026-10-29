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
};

export type TeamData = {
  rosterId: string;
  owner: string;
  teamName?: string;
  ownerId?: string;
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
};

export type WindowInfo = { classification: string; windowScore: number; powerRank: number };

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
  window?: WindowInfo;
  isMine: boolean;
  eliminated: boolean;
};

export function buildStandings(league: LeagueData, mineId?: string): StandingRow[] {
  const guillotine = isGuillotine(league);
  const rows = (league.teams || []).map((team) => {
    const max = team.maxPoints || 0;
    const eliminated = Boolean(team.eliminated) || (guillotine && team.players.length === 0);
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
      window: league.windows?.[team.rosterId],
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
};

export type LineupView = {
  starters: LineupSlot[];
  bench: PlayerDetail[];
  reserve: PlayerDetail[];
  taxi: PlayerDetail[];
};

const POSITION_ORDER: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };
const byPosition = (a: PlayerDetail, b: PlayerDetail) =>
  (POSITION_ORDER[a.position] || 9) - (POSITION_ORDER[b.position] || 9) || a.name.localeCompare(b.name);

/** Sleeper lists starters in the same order as the non-bench entries of roster_positions. */
export function buildLineup(league: LeagueData, team: TeamData, matchup?: MatchupData): LineupView {
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
  };
}

/* ---------- alerts / action queue ---------- */

export type Severity = "critical" | "high" | "watch";
export type InSeasonAlert = {
  id: string;
  leagueId: string;
  leagueName: string;
  leagueType: string;
  severity: Severity;
  title: string;
  detail: string;
  playerId?: string;
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, watch: 2 };

export function playerFlag(player: PlayerDetail): { severity: Severity; label: string } | null {
  const injury = (player.injuryStatus || "").trim();
  if (/^(out|ir|pup|nfi|sus|cov|na)/i.test(injury)) return { severity: "critical", label: injury };
  if (/^doubtful/i.test(injury)) return { severity: "high", label: "Doubtful" };
  if (/^questionable/i.test(injury)) return { severity: "watch", label: "Questionable" };
  if (/inactive|reserve|suspend/i.test(player.status || "")) return { severity: "high", label: player.status };
  if (player.team === "FA" && player.position !== "DEF") return { severity: "critical", label: "No NFL team" };
  return null;
}

/** Healthy bench players who are allowed to fill the given slot. */
export function healthyBenchFor(slot: string, bench: PlayerDetail[]): PlayerDetail[] {
  const allowed = SLOT_ELIGIBILITY[slot] || [slot];
  return bench.filter((player) => allowed.includes(player.position) && !playerFlag(player) && player.team !== "FA");
}

export function buildAlerts(leagues: LeagueData[]): InSeasonAlert[] {
  const alerts: InSeasonAlert[] = [];
  for (const league of sortLeagues(leagues)) {
    if (!league.ok || league.eliminated || league.status !== "in_season") continue;
    const mine = findMine(league);
    if (!mine || mine.eliminated) continue;
    const matchup = league.matchups?.find((m) => m.rosterId === mine.rosterId);
    const lineup = buildLineup(league, mine, matchup);
    const base = { leagueId: league.id, leagueName: league.name, leagueType: league.type };
    for (const row of lineup.starters) {
      if (!row.id) {
        alerts.push({ ...base, id: `${league.id}:empty:${row.slot}:${row.label}`, severity: "critical", title: `Empty ${row.label} slot`, detail: "No player is set in this starting slot." });
        continue;
      }
      if (!row.player) continue;
      const flag = playerFlag(row.player);
      if (!flag) continue;
      const options = healthyBenchFor(row.slot, lineup.bench).slice(0, 3);
      alerts.push({
        ...base,
        id: `${league.id}:starter:${row.id}`,
        playerId: row.id,
        severity: flag.severity,
        title: `${row.player.name} (${row.player.position}) is ${flag.label} in your ${row.label} slot`,
        detail: options.length
          ? `Healthy bench options for this slot: ${options.map((p) => `${p.name} (${p.position})`).join(", ")}.`
          : "No healthy bench player is eligible for this slot.",
      });
    }
    const reserveSlots = Number(league.settings?.reserve_slots || 0);
    if (reserveSlots > 0) {
      for (const player of lineup.bench) {
        if (/^ir$/i.test(player.injuryStatus || "")) {
          alerts.push({ ...base, id: `${league.id}:ir:${player.id}`, playerId: player.id, severity: "watch", title: `${player.name} is on injured reserve but still on your active roster`, detail: "Moving him to an IR slot opens a roster spot." });
        }
      }
    }
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.leagueName.localeCompare(b.leagueName));
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

export function buildRootingGuide(league: LeagueData): RootingGuide {
  const guillotine = isGuillotine(league);
  if (guillotine) {
    return { mode: "survival", headline: "Survival guide", detail: "Keep your weekly score above the lowest active team.", items: [] };
  }
  const standings = buildStandings(league);
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
    headline = "Contender window: root for the weaker teams";
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
    headline = "Rebuilder window: root for the stronger teams";
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
