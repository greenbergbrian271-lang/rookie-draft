import { classifyLeague, isMineRoster, loadLeagueEntries, nflPlayersCached, playerName, playersCache, sleeper } from "@/lib/in-season-leagues";
import { leagueIntelMode } from "@/lib/dynasty-intelligence-core";
import { sortLeagues } from "@/lib/in-season";
import { getWeekProjections, projectPoints } from "@/lib/sleeper-projections";

export const maxDuration = 60;

export async function GET() {
  const leagueEntries = await loadLeagueEntries();
  const [nflState, nflPlayers] = await Promise.all([
    sleeper<any>("/state/nfl").catch(() => null),
    nflPlayersCached().catch(() => playersCache?.data || ({} as Record<string, any>)),
  ]);
  const stateWeek = Number(nflState?.week || 0);
  const stateSeason = String(nflState?.league_season || nflState?.season || new Date().getFullYear());
  let projectionError: string | undefined;
  const projectionRows = stateWeek > 0
    ? await getWeekProjections(stateSeason, stateWeek).catch((error) => { projectionError = error instanceof Error ? error.message : "Projections unavailable"; return null; })
    : null;

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
      // Completed weeks: gives season-to-date points per player and each team's weekly scores (used for averages and guillotine history).
      const lastScored = Number(league.settings?.last_scored_leg || 0) || Math.max(0, week - 1);
      const pastWeeks = week > 0 && league.status === "in_season" ? Array.from({ length: Math.min(lastScored, 18) }, (_, i) => i + 1) : [];
      const pastResponses = await Promise.all(pastWeeks.map(async (pastWeek) => ({
        week: pastWeek,
        matchups: await sleeper<any[]>(`/league/${entry.id}/matchups/${pastWeek}`).catch(() => [] as any[]),
      })));
      const ownerById = new Map(users.map((user: any) => [String(user.user_id), user.display_name || user.username || "Team"]));
      const teams = rosters.map((roster: any) => ({
        rosterId: String(roster.roster_id),
        ownerId: String(roster.owner_id || ""),
        avatar: users.find((user: any) => String(user.user_id) === String(roster.owner_id))?.avatar || null,
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
            age: typeof player.age === "number" ? player.age : null,
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
      const weeklyScores: Record<string, number[]> = {};
      const playerSeason: Record<string, { pts: number; gp: number }> = {};
      const mineRoster = teams.find((team: any) => team.isMine);
      for (const { matchups: weekMatchups } of pastResponses) {
        for (const match of weekMatchups) {
          const key = String(match.roster_id);
          (weeklyScores[key] ||= []).push(Number(match.points || 0));
          if (mineRoster && key === mineRoster.rosterId) {
            for (const [playerId, points] of Object.entries(match.players_points || {})) {
              if (!(match.starters || []).map(String).includes(playerId)) continue;
              const entryTotals = (playerSeason[playerId] ||= { pts: 0, gp: 0 });
              entryTotals.pts += Number(points || 0);
              entryTotals.gp += 1;
            }
          }
        }
      }
      // Projections under this league's own scoring, for my whole roster and every team's starters this week.
      const projections: Record<string, { pts: number; opp: string | null; date: string | null }> = {};
      if (projectionRows) {
        const wanted = new Set<string>(mineRoster ? mineRoster.players : []);
        for (const match of matchups) for (const id of match.starters || []) wanted.add(String(id));
        for (const id of wanted) {
          const row = projectionRows.get(id);
          if (row) projections[id] = { pts: projectPoints(row.stats, league.scoring_settings), opp: row.opponent, date: row.date };
        }
      }
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
      if (league.status === "in_season" && (projectionError || !projectionRows)) warnings.push("Projections unavailable right now.");
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
        projections,
        playerSeason,
        weeklyScores,
        lastScoredLeg: lastScored,
        windows,
        windowError,
        warnings,
        matchups: matchups.map((match: any) => ({
          rosterId: String(match.roster_id),
          matchupId: match.matchup_id,
          points: Number(match.points || 0),
          starters: (match.starters || []).map(String),
          // Sleeper returns starters_points as an array aligned with starters, so key it by player id.
          startersPoints: Object.fromEntries((match.starters || []).map((id: string, index: number) => [String(id), Number((match.starters_points || [])[index] || 0)])),
          projected: Math.round((match.starters || []).reduce((sum: number, id: string) => sum + (projections[String(id)]?.pts || 0), 0) * 100) / 100,
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
