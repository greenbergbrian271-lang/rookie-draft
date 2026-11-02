import { sleeper } from "@/lib/in-season-leagues";

export const maxDuration = 60;
const LEAGUE = "1387508275846586368";

// Read-only diagnostic: raw Sleeper transactions and rosters for the Guillotine Mania league.
export async function GET() {
  const state = await sleeper<any>("/state/nfl", false).catch(() => null);
  const week = Number(state?.week || 8);
  const [league, rosters, users] = await Promise.all([
    sleeper<any>(`/league/${LEAGUE}`, false),
    sleeper<any[]>(`/league/${LEAGUE}/rosters`, false),
    sleeper<any[]>(`/league/${LEAGUE}/users`, false),
  ]);
  const weeks = Array.from({ length: week + 1 }, (_, i) => i + 1);
  const tx = (await Promise.all(weeks.map(async (w) => (await sleeper<any[]>(`/league/${LEAGUE}/transactions/${w}`, false).catch(() => [] as any[])).map((t) => ({ ...t, leg: t.leg ?? w })))) ).flat();
  const types: Record<string, number> = {};
  tx.forEach((t) => { const k = `${t.type}/${t.status}`; types[k] = (types[k] || 0) + 1; });
  return Response.json({ week, season: league.season, types, total: tx.length, transactions: tx, rosters, users: users.map((u) => ({ user_id: u.user_id, display_name: u.display_name })), leagueSettings: league.settings, scoring: league.scoring_settings });
}
