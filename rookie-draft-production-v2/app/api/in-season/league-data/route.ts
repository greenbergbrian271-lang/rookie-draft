import { getIntegrations } from "@/lib/integrations";
import { leagueIntelMode } from "@/lib/dynasty-intelligence-core";
import { sortLeagues } from "@/lib/in-season";

export const maxDuration = 60;

const CORE_LEAGUES = [
  { id: "1389753161815707648", type: "Redraft", eliminated: false },
  { id: "1387508275846586368", type: "Guillotine", eliminated: false },
  { id: "1399445627359797248", type: "Guillotine", eliminated: true },
] as const;

async function sleeper<T>(path: string, cacheable = true): Promise<T> {
  const response = await fetch("https://api.sleeper.app/v1" + path, {
    headers: { accept: "application/json" },
    ...(cacheable ? { next: { revalidate: 300 } } : { cache: "no-store" as const }),
  });
  if (!response.ok) throw new Error("Sleeper returned HTTP " + response.status);
  return response.json() as Promise<T>;
}

function classifyLeague(entry: { id: string; type?: string; name?: string }, league: any) {
  if (entry.id === "1387508275846586368" || entry.id === "1399445627359797248") return "Guillotine";
  const name = String(league.name || entry.name || "").toLowerCase();
  const leagueType = Number(league.settings?.type);
  if (name.includes("guillotine")) return "Guillotine";
  if (leagueType === 2 || name.includes("dynasty")) return "Dynasty";
  if (leagueType === 1 || name.includes("keeper")) return "Keeper";
  if (entry.type && entry.type !== "Configured") return entry.type;
  // Leagues added through Integrations are the dynasty leagues unless Sleeper says otherwise.
  return entry.type === "Configured" ? "Dynasty" : "Redraft";
}

// The NFL player file is several MB, which is over Next's 2 MB fetch-cache limit, so keep it in memory instead.
let playersCache: { at: number; data: Record<string, any> } | null = null;
async function nflPlayersCached(): Promise<Record<string, any>> {
  if (playersCache && Date.now() - playersCache.at < 30 * 60 * 1000) return playersCache.data;
  const data = await sleeper<Record<string, any>>("/players/nfl", false);
  playersCache = { at: Date.now(), data };
  return data;
}

function playerName(id: string, players: Record<string, any>) {
  const player = players[id] || {};
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Player " + id;
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
// Same rule the dynasty tools use: the configured team identity may be a roster id, owner id, username, display name or team name.
function isMineRoster(entry: any, roster: any, users: any[]) {
  const user = users.find((item: any) => String(item.user_id) === String(roster.owner_id));
  const candidates = [roster.roster_id, roster.owner_id, user?.display_name, user?.username, user?.metadata?.team_name].map(norm);
  const wanted = [entry.teamIdentity, "cds1204"].map(norm).filter(Boolean);
  return wanted.some((value) => candidates.includes(value));
}

export async function GET() {
  const configured = await getIntegrations().catch(() => ({ sleeper: { leagues: [] as any[] } }));
  const byId = new Map<string, any>();
  CORE_LEAGUES.forEach((entry) => byId.set(entry.id, entry));
  for (const entry of configured.sleeper.leagues || []) {
    if (entry.enabled === false) continue;
    if (!byId.has(String(entry.leagueId))) {
      byId.set(String(entry.leagueId), {
        id: String(entry.leagueId),
        type: "Configured",
        eliminated: false,
        name: entry.name,
        key: entry.key,
        teamIdentity: entry.teamIdentity || "",
        tePremium: Boolean(entry.tePremium),
      });
    }
  }
  const leagueEntries = [...byId.values()];
  const [nflState, nflPlayers] = await Promise.all([
    sleeper<any>("/state/nfl").catch(() => null),
    nflPlayersCached().catch(() => playersCache?.data || ({} as Record<string, any>)),
  ]);

  const results = await Promise.all(leagueEntries.map(async (entry) => {
    try {
      const league = await sleeper<any>(`/league/${entry.id}`);
      const season = String(league.season || new Date().getFullYear());
      const week = Number(nflState?.week || league.settings?.leg || league.settings?.week || 0);
      const playoffWeekStart = Number(league.settings?.playoff_week_start || 0);
      const scheduleWeeks = playoffWeekStart > week ? Array.from({ length: playoffWeekStart - week }, (_, i) => week + i) : [week];
      const [rosters, users, matchupResponses, transactions] = await Promise.all([
        sleeper<any[]>(`/league/${entry.id}/rosters`),
        sleeper<any[]>(`/league/${entry.id}/users`),
        Promise.all([...new Set(scheduleWeeks.filter((w) => w > 0))].map(async (scheduleWeek) => ({
          week: scheduleWeek,
          matchups: await sleeper<any[]>(`/league/${entry.id}/matchups/${scheduleWeek}`).catch(() => []),
        }))),
        week > 0 ? sleeper<any[]>(`/league/${entry.id}/transactions/${week}`).catch(() => []) : Promise.resolve([]),
      ]);
      const ownerById = new Map(users.map((user: any) => [String(user.user_id), user.display_name || user.username || "Team"]));
      const teams = rosters.map((roster: any) => ({
        rosterId: String(roster.roster_id),
        ownerId: String(roster.owner_id || ""),
        owner: ownerById.get(String(roster.owner_id)) || "Unassigned team",
        teamName: roster.metadata?.team_name || roster.metadata?.teamName || users.find((user: any) => String(user.user_id) === String(roster.owner_id))?.metadata?.team_name || "",
        players: Array.isArray(roster.players) ? roster.players.map(String) : [],
        playerDetails: (Array.isArray(roster.players) ? roster.players : []).map((playerId: string) => {
          const player = nflPlayers[String(playerId)] || {};
          return {
            id: String(playerId),
            name: playerName(String(playerId), nflPlayers),
            position: player.position || "—",
            team: player.team || "FA",
            status: player.status || "",
            injuryStatus: player.injury_status || "",
            depthChartPosition: player.depth_chart_position || null,
          };
        }),
        isMine: isMineRoster(entry, roster, users),
        starters: Array.isArray(roster.starters) ? roster.starters.map(String) : [],
        reserve: Array.isArray(roster.reserve) ? roster.reserve.map(String) : [],
        taxi: Array.isArray(roster.taxi) ? roster.taxi.map(String) : [],
        settings: roster.settings || {},
        points: Number(roster.settings?.fpts || 0) + Number(roster.settings?.fpts_decimal || 0) / 100,
        pointsAgainst: Number(roster.settings?.fpts_against || 0) + Number(roster.settings?.fpts_against_decimal || 0) / 100,
        maxPoints: Number(roster.settings?.ppts || 0) + Number(roster.settings?.ppts_decimal || 0) / 100,
        wins: Number(roster.settings?.wins || 0),
        losses: Number(roster.settings?.losses || 0),
        ties: Number(roster.settings?.ties || 0),
        waiverBudget: roster.settings?.waiver_budget ?? null,
        eliminated: Boolean(roster.settings?.eliminated),
      }));
      const matchups = matchupResponses.find((response) => response.week === week)?.matchups || [];
      const type = classifyLeague(entry, league);
      // Team window (Contender / Rebuilder / Stuck in the Middle) comes from the same engine as League Intelligence.
      let windows: Record<string, { classification: string; windowScore: number; powerRank: number }> | undefined;
      let windowError: string | undefined;
      if (type === "Dynasty" && entry.key) {
        try {
          const intel: any = await leagueIntelMode({ key: entry.key, name: entry.name || league.name, leagueId: entry.id, teamIdentity: entry.teamIdentity, tePremium: Boolean(entry.tePremium), enabled: true });
          windows = Object.fromEntries((intel.teams || []).map((team: any) => [String(team.rosterId), { classification: team.classification, windowScore: team.windowScore, powerRank: team.powerRank }]));
        } catch (error) {
          windowError = error instanceof Error ? error.message : "Team windows unavailable";
        }
      }
      const warnings: string[] = [];
      if (!teams.some((team: any) => team.isMine)) warnings.push("Your roster could not be matched in this league.");
      if (league.status === "in_season" && !matchups.length) warnings.push("Sleeper returned no matchups for this week.");
      if (type === "Dynasty" && !entry.key) warnings.push("This league is not in Integrations, so team windows are unavailable.");
      if (windowError) warnings.push("Team windows unavailable: " + windowError);
      return {
        id: entry.id,
        type,
        eliminated: Boolean(entry.eliminated),
        ok: true,
        name: league.name || entry.name || (entry.type + " League"),
        season,
        status: league.status || "unknown",
        week,
        totalRosters: Number(league.total_rosters || teams.length),
        scoringSettings: league.scoring_settings || {},
        rosterPositions: league.roster_positions || [],
        settings: league.settings || {},
        playoffTeams: Number(league.settings?.playoff_teams || 0),
        playoffWeekStart,
        teams,
        windows,
        windowError,
        warnings,
        matchups: matchups.map((match: any) => ({
          rosterId: String(match.roster_id),
          matchupId: match.matchup_id,
          points: Number(match.points || 0),
          starters: (match.starters || []).map(String),
          startersPoints: match.starters_points || {},
        })),
        schedule: matchupResponses.map(({ week: scheduleWeek, matchups: weekMatchups }) => ({
          week: scheduleWeek,
          matchups: weekMatchups.map((match: any) => ({
            rosterId: String(match.roster_id),
            matchupId: match.matchup_id,
          })),
        })),
        transactions: transactions.slice(0, 50).map((tx: any) => ({
          type: tx.type,
          status: tx.status,
          created: tx.created,
          adds: tx.adds || {},
          drops: tx.drops || {},
          rosterIds: [...new Set([...Object.values(tx.adds || {}), ...Object.values(tx.drops || {})].map(String))],
          addedNames: Object.keys(tx.adds || {}).map((id: string) => playerName(id, nflPlayers)),
          droppedNames: Object.keys(tx.drops || {}).map((id: string) => playerName(id, nflPlayers)),
          waiverBudget: tx.waiver_budget || [],
        })),
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        id: entry.id,
        type: entry.type || "Configured",
        eliminated: Boolean(entry.eliminated),
        ok: false,
        name: entry.name || (entry.type + " League"),
        error: error instanceof Error ? error.message : "Sleeper data unavailable",
        fetchedAt: new Date().toISOString(),
      };
    }
  }));
  return Response.json({ leagues: sortLeagues(results as any[]), fetchedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" },
  });
}
