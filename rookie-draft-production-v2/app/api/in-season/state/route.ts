import { loadInSeasonState as load, saveInSeasonState as save } from "@/lib/in-season-state";
import { weekKey } from "@/lib/in-season";

export const dynamic = "force-dynamic";

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
