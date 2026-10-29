import { getIntegrations } from "@/lib/integrations";

export const CORE_LEAGUES = [
  { id: "1389753161815707648", type: "Redraft", eliminated: false },
  { id: "1387508275846586368", type: "Guillotine", eliminated: false },
  { id: "1399445627359797248", type: "Guillotine", eliminated: true },
] as const;

export async function sleeper<T>(path: string, cacheable = true): Promise<T> {
  const response = await fetch("https://api.sleeper.app/v1" + path, {
    headers: { accept: "application/json" },
    ...(cacheable ? { next: { revalidate: 300 } } : { cache: "no-store" as const }),
  });
  if (!response.ok) throw new Error("Sleeper returned HTTP " + response.status);
  return response.json() as Promise<T>;
}

export function classifyLeague(entry: { id: string; type?: string; name?: string }, league: any) {
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
export let playersCache: { at: number; data: Record<string, any> } | null = null;
export async function nflPlayersCached(): Promise<Record<string, any>> {
  if (playersCache && Date.now() - playersCache.at < 30 * 60 * 1000) return playersCache.data;
  const data = await sleeper<Record<string, any>>("/players/nfl", false);
  playersCache = { at: Date.now(), data };
  return data;
}

export function playerName(id: string, players: Record<string, any>) {
  const player = players[id] || {};
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Player " + id;
}

export const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
// Same rule the dynasty tools use: the configured team identity may be a roster id, owner id, username, display name or team name.
export function isMineRoster(entry: any, roster: any, users: any[]) {
  const user = users.find((item: any) => String(item.user_id) === String(roster.owner_id));
  const candidates = [roster.roster_id, roster.owner_id, user?.display_name, user?.username, user?.metadata?.team_name].map(norm);
  const wanted = [entry.teamIdentity, "cds1204"].map(norm).filter(Boolean);
  return wanted.some((value) => candidates.includes(value));
}


/** Every league this workspace covers: the core Sleeper leagues plus the dynasty leagues from Integrations. */
export async function loadLeagueEntries(): Promise<any[]> {
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
  return [...byId.values()];
}
