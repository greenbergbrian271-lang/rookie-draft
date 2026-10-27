import { getIntegrations } from "@/lib/integrations";

const CORE_LEAGUES = [
  { id: "1389753161815707648", type: "Redraft", eliminated: false },
  { id: "1387508275846586368", type: "Guillotine", eliminated: false },
  { id: "1399445627359797248", type: "Guillotine", eliminated: true },
] as const;

async function sleeper<T>(path: string): Promise<T> {
  const response = await fetch("https://api.sleeper.app/v1" + path, {
    headers: { accept: "application/json" },
    next: { revalidate: 300 },
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
  return "Redraft";
}

function playerName(id: string, players: Record<string, any>) {
  const player = players[id] || {};
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Player " + id;
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
        teamIdentity: entry.teamIdentity || "",
      });
    }
  }
  const leagueEntries = [...byId.values()];
  const [nflState, nflPlayers] = await Promise.all([
    sleeper<any>("/state/nfl").catch(() => null),
    sleeper<Record<string, any>>("/players/nfl").catch(() => ({} as Record<string, any>)),
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
        starters: Array.isArray(roster.starters) ? roster.starters.map(String) : [],
        reserve: Array.isArray(roster.reserve) ? roster.reserve.map(String) : [],
        settings: roster.settings || {},
        points: Number(roster.settings?.fpts || 0) + Number(roster.settings?.fpts_decimal || 0) / 100,
        wins: Number(roster.settings?.wins || 0),
        losses: Number(roster.settings?.losses || 0),
        ties: Number(roster.settings?.ties || 0),
        waiverBudget: roster.settings?.waiver_budget ?? null,
        eliminated: Boolean(roster.settings?.eliminated),
      }));
      const matchups = matchupResponses.find((response) => response.week === week)?.matchups || [];
      return {
        id: entry.id,
        type: classifyLeague(entry, league),
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
  return Response.json({ leagues: results, fetchedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" },
  });
}
