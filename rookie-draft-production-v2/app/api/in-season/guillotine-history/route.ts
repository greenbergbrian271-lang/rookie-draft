import { nflPlayersCached, playerName, sleeper } from "@/lib/in-season-leagues";

export const maxDuration = 60;

// Read-only: compact transaction history for any league id (used to calibrate the guillotine bid model).
export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get("league") || "";
  if (!/^\d{10,25}$/.test(league)) return Response.json({ error: "league id required" }, { status: 400 });
  const [info, rosters, users, players] = await Promise.all([sleeper<any>(`/league/${league}`, false), sleeper<any[]>(`/league/${league}/rosters`, false), sleeper<any[]>(`/league/${league}/users`, false), nflPlayersCached()]);
  const weeks = Array.from({ length: 20 }, (_, i) => i + 1);
  const raw = (await Promise.all(weeks.map(async (w) => (await sleeper<any[]>(`/league/${league}/transactions/${w}`, false).catch(() => [] as any[])).map((t) => ({ ...t, leg: t.leg ?? w })))) ).flat();
  const ids = new Set<string>();
  const tx = raw.filter((t) => ["waiver", "trade", "chopped", "free_agent"].includes(t.type)).map((t) => {
    Object.keys(t.adds || {}).concat(Object.keys(t.drops || {})).forEach((id) => ids.add(id));
    return { type: t.type, status: t.status, leg: t.leg, created: t.created, updated: t.status_updated, r: t.roster_ids, adds: t.adds, drops: t.drops, bid: t.settings?.waiver_bid, seq: t.settings?.seq, budget: t.waiver_budget, picks: (t.draft_picks || []).length };
  });
  const names: Record<string, string> = {};
  ids.forEach((id) => { const p = players[id]; names[id] = `${playerName(id, players)}|${p?.position || ""}|${p?.team || ""}`; });
  return Response.json({
    league: { id: league, name: info.name, season: info.season, status: info.status, settings: info.settings, positions: info.roster_positions, teams: rosters.length },
    rosters: rosters.map((r) => ({ id: r.roster_id, owner: users.find((u: any) => u.user_id === r.owner_id)?.display_name, used: r.settings?.waiver_budget_used, elim: r.settings?.eliminated, n: (r.players || []).length })),
    tx, names,
  });
}
