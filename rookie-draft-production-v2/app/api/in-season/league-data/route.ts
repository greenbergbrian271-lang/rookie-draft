const LEAGUES = [
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

export async function GET() {
  const [nflState, nflPlayers] = await Promise.all([
    sleeper<any>("/state/nfl").catch(() => null),
    sleeper<Record<string, any>>("/players/nfl").catch(() => ({} as Record<string, any>)),
  ]);
  const results = await Promise.all(LEAGUES.map(async (entry) => {
    try {
      const league = await sleeper<any>(`/league/${entry.id}`);
      const season = String(league.season || new Date().getFullYear());
      const week = Number(nflState?.week || league.settings?.leg || league.settings?.week || 0);
      const [rosters, users, matchups, transactions] = await Promise.all([
        sleeper<any[]>(`/league/${entry.id}/rosters`),
        sleeper<any[]>(`/league/${entry.id}/users`),
        week > 0 ? sleeper<any[]>(`/league/${entry.id}/matchups/${week}`).catch(() => []) : Promise.resolve([]),
        week > 0 ? sleeper<any[]>(`/league/${entry.id}/transactions/${week}`).catch(() => []) : Promise.resolve([]),
      ]);
      const ownerById = new Map(users.map((user: any) => [String(user.user_id), user.display_name || user.username || "Team"]));
      const teams = rosters.map((roster: any) => ({
        rosterId: String(roster.roster_id),
        ownerId: String(roster.owner_id || ""),
        owner: ownerById.get(String(roster.owner_id)) || "Unassigned team",
        ownerId: String(roster.owner_id || ""),
        teamName: roster.metadata?.team_name || roster.metadata?.teamName || users.find((user: any) => String(user.user_id) === String(roster.owner_id))?.metadata?.team_name || ownerById.get(String(roster.owner_id)) || "Unassigned team",
        players: Array.isArray(roster.players) ? roster.players : [],
        playerDetails: (Array.isArray(roster.players) ? roster.players : []).map((playerId: string) => {
          const player = nflPlayers[String(playerId)] || {};
          return {
            id: String(playerId),
            name: player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Unknown player",
            position: player.position || "—",
            team: player.team || "FA",
            status: player.status || "",
            injuryStatus: player.injury_status || "",
            depthChartPosition: player.depth_chart_position || null,
          };
        }),
        starters: Array.isArray(roster.starters) ? roster.starters : [],
        reserve: Array.isArray(roster.reserve) ? roster.reserve : [],
        settings: roster.settings || {},
        points: Number(roster.settings?.fpts || 0) + Number(roster.settings?.fpts_decimal || 0) / 100,
        wins: Number(roster.settings?.wins || 0),
        losses: Number(roster.settings?.losses || 0),
        ties: Number(roster.settings?.ties || 0),
        waiverBudget: roster.settings?.waiver_budget ?? null,
        eliminated: Boolean(roster.settings?.eliminated),
      }));
      return {
        id: entry.id, type: entry.type, eliminated: entry.eliminated, ok: true,
        name: league.name || (entry.type + " League"), season, status: league.status || "unknown",
        week, totalRosters: Number(league.total_rosters || teams.length),
        scoringSettings: league.scoring_settings || {}, rosterPositions: league.roster_positions || [],
        settings: league.settings || {}, teams,
        matchups: matchups.map((match: any) => ({
          rosterId: String(match.roster_id), matchupId: match.matchup_id,
          points: Number(match.points || 0), starters: match.starters || [],
          startersPoints: match.starters_points || {},
        })),
        transactions: transactions.slice(0, 30).map((tx: any) => ({
          type: tx.type, status: tx.status, created: tx.created, adds: tx.adds || {},
          drops: tx.drops || {}, waiverBudget: tx.waiver_budget || [],
        })),
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return { id: entry.id, type: entry.type, eliminated: entry.eliminated, ok: false,
        name: entry.type + " League", error: error instanceof Error ? error.message : "Sleeper data unavailable",
        fetchedAt: new Date().toISOString() };
    }
  }));
  return Response.json({ leagues: results, fetchedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" },
  });
}
