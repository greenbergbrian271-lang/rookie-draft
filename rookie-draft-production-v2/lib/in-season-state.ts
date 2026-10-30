import { ensureTursoSchema } from "@/lib/turso";

// Owner-only state shared by the In-Season workspace and League Intelligence:
// declared Contend/Rebuild intent per league, and alerts dismissed until the next Tuesday.
export type InSeasonState = { intents: Record<string, "Contend" | "Rebuild">; dismissed: Record<string, string> };
const KEY = "in-season-state";

export async function loadInSeasonState(): Promise<InSeasonState> {
  const c = await ensureTursoSchema();
  const result = await c.execute({ sql: "select value from settings where key=?", args: [KEY] });
  try {
    const parsed = JSON.parse(String(result.rows[0]?.value || "{}"));
    return { intents: parsed.intents || {}, dismissed: parsed.dismissed || {} };
  } catch {
    return { intents: {}, dismissed: {} };
  }
}

export async function saveInSeasonState(state: InSeasonState) {
  const c = await ensureTursoSchema();
  await c.execute({
    sql: "insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args: [KEY, JSON.stringify(state), new Date().toISOString()],
  });
}
