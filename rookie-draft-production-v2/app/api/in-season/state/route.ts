import { ensureTursoSchema } from "@/lib/turso";
import { weekKey } from "@/lib/in-season";

export const dynamic = "force-dynamic";

// Small owner-only state for the In-Season workspace: declared dynasty intent per league, and dismissed alerts.
type State = { intents: Record<string, "Contend" | "Rebuild">; dismissed: Record<string, string> };
const KEY = "in-season-state";

async function load(): Promise<State> {
  const c = await ensureTursoSchema();
  const result = await c.execute({ sql: "select value from settings where key=?", args: [KEY] });
  try {
    const parsed = JSON.parse(String(result.rows[0]?.value || "{}"));
    return { intents: parsed.intents || {}, dismissed: parsed.dismissed || {} };
  } catch {
    return { intents: {}, dismissed: {} };
  }
}

async function save(state: State) {
  const c = await ensureTursoSchema();
  await c.execute({
    sql: "insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args: [KEY, JSON.stringify(state), new Date().toISOString()],
  });
}

export async function GET() {
  try {
    const state = await load();
    const current = weekKey(new Date());
    // A dismissal only lasts until the next Tuesday reset.
    const dismissed = Object.fromEntries(Object.entries(state.dismissed).filter(([, week]) => week === current));
    return Response.json({ intents: state.intents, dismissed, weekKey: current });
  } catch (error) {
    return Response.json({ intents: {}, dismissed: {}, weekKey: weekKey(new Date()), error: error instanceof Error ? error.message : "State unavailable" });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const state = await load();
  const current = weekKey(new Date());
  if (body.action === "intent" && typeof body.leagueId === "string") {
    if (body.intent === "Contend" || body.intent === "Rebuild") state.intents[body.leagueId] = body.intent;
    else delete state.intents[body.leagueId];
  } else if (body.action === "dismiss" && typeof body.alertId === "string") {
    state.dismissed[body.alertId] = current;
  } else if (body.action === "restore" && typeof body.alertId === "string") {
    delete state.dismissed[body.alertId];
  } else {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
  state.dismissed = Object.fromEntries(Object.entries(state.dismissed).filter(([, week]) => week === current));
  await save(state);
  return Response.json({ ok: true, intents: state.intents, dismissed: state.dismissed, weekKey: current });
}
