import { loadLeagueEntries, nflPlayersCached, playerName, playersCache, sleeper } from "@/lib/in-season-leagues";

export const maxDuration = 60;

type Pick = { season: string; round: number };
export type LeagueTransactions = {
  leagueId: string;
  seasons: string[];
  trades: {
    season: string;
    week: number;
    created: number;
    owners: string[];
    got: Record<string, string[]>;
    gave: Record<string, string[]>;
    picksIn: Record<string, Pick[]>;
    picksOut: Record<string, Pick[]>;
  }[];
  /** Current season only: FAAB budgets reset every year. */
  moves: Record<string, { claims: number; freeAgents: number; faabSpent: number }>;
  players: Record<string, { name: string; position: string; age: number | null }>;
};

async function seasonTransactions(leagueId: string, lastWeek: number) {
  const [league, rosters] = await Promise.all([sleeper<any>(`/league/${leagueId}`), sleeper<any[]>(`/league/${leagueId}/rosters`)]);
  const ownerOf = new Map<string, string>(rosters.map((roster: any) => [String(roster.roster_id), String(roster.owner_id || "")]));
  const weeks = Array.from({ length: Math.max(0, lastWeek) }, (_, index) => index + 1);
  const responses = await Promise.all(weeks.map(async (week) => ({ week, items: await sleeper<any[]>(`/league/${leagueId}/transactions/${week}`).catch(() => [] as any[]) })));
  return { league, ownerOf, responses };
}

export async function GET() {
  const entries = (await loadLeagueEntries()).filter((entry) => !entry.eliminated || true);
  const [state, players] = await Promise.all([
    sleeper<any>("/state/nfl").catch(() => null),
    nflPlayersCached().catch(() => playersCache?.data || ({} as Record<string, any>)),
  ]);
  const week = Number(state?.week || 0);

  const results = await Promise.all(entries.map(async (entry): Promise<LeagueTransactions | { leagueId: string; error: string }> => {
    try {
      const current = await seasonTransactions(entry.id, Math.min(Math.max(week, 1), 18));
      const out: LeagueTransactions = { leagueId: entry.id, seasons: [String(current.league.season)], trades: [], moves: {}, players: {} };
      const seen = new Set<string>();
      const remember = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        const player = players[id] || {};
        out.players[id] = { name: playerName(id, players), position: player.position || "—", age: typeof player.age === "number" ? player.age : null };
      };

      const collect = (season: string, ownerOf: Map<string, string>, responses: { week: number; items: any[] }[], countMoves: boolean) => {
        for (const { week: txWeek, items } of responses) {
          for (const tx of items) {
            if (tx.status !== "complete") continue;
            if (tx.type === "trade") {
              const got: Record<string, string[]> = {}, gave: Record<string, string[]> = {}, picksIn: Record<string, Pick[]> = {}, picksOut: Record<string, Pick[]> = {};
              const owners = new Set<string>();
              for (const [id, rosterId] of Object.entries(tx.adds || {})) { const owner = ownerOf.get(String(rosterId)); if (!owner) continue; owners.add(owner); (got[owner] ||= []).push(id); remember(id); }
              for (const [id, rosterId] of Object.entries(tx.drops || {})) { const owner = ownerOf.get(String(rosterId)); if (!owner) continue; owners.add(owner); (gave[owner] ||= []).push(id); remember(id); }
              for (const pick of tx.draft_picks || []) {
                const to = ownerOf.get(String(pick.owner_id)), from = ownerOf.get(String(pick.previous_owner_id));
                const item = { season: String(pick.season), round: Number(pick.round) };
                if (to) { owners.add(to); (picksIn[to] ||= []).push(item); }
                if (from) { owners.add(from); (picksOut[from] ||= []).push(item); }
              }
              out.trades.push({ season, week: txWeek, created: Number(tx.created || 0), owners: [...owners], got, gave, picksIn, picksOut });
            } else if (countMoves && (tx.type === "waiver" || tx.type === "free_agent")) {
              const rosterId = String((tx.roster_ids || [])[0] ?? "");
              const owner = ownerOf.get(rosterId);
              if (!owner || !Object.keys(tx.adds || {}).length) continue;
              const bucket = (out.moves[owner] ||= { claims: 0, freeAgents: 0, faabSpent: 0 });
              if (tx.type === "waiver") { bucket.claims += 1; bucket.faabSpent += Number(tx.settings?.waiver_bid || 0); } else bucket.freeAgents += 1;
            }
          }
        }
      };
      collect(String(current.league.season), current.ownerOf, current.responses, true);

      // Dynasty leagues carry history: pull last season's trades too so tendencies rest on more than 8 weeks.
      const previousId = current.league.previous_league_id;
      if (previousId && String(previousId) !== "0") {
        try {
          const previous = await seasonTransactions(String(previousId), 18);
          out.seasons.push(String(previous.league.season));
          collect(String(previous.league.season), previous.ownerOf, previous.responses, false);
        } catch { /* history is a bonus */ }
      }
      return out;
    } catch (error) {
      return { leagueId: entry.id, error: error instanceof Error ? error.message : "Transactions unavailable" };
    }
  }));
  return Response.json({ leagues: results, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=600" } });
}
