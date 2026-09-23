import { db, ensureSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId");
    if (!playerId) return Response.json({ error: "playerId is required" }, { status: 400 });
    const rows = await db()`select * from scouting_sessions where player_id=${playerId} order by created_at asc, id asc`;
    return Response.json(rows);
  } catch (e: any) {
    return Response.json({ error: "Could not load cloud notes", detail: e?.message }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const x = await req.json();
    const [row] = await db()`insert into scouting_sessions(player_id,game_date,opponent,raw_notes,overall_writeup,grade_snapshot) values(${x.playerId},${x.gameDate || null},${x.opponent || null},${x.rawNotes || null},${x.overallWriteup || null},${JSON.stringify(x.gradeSnapshot || {})}::jsonb) returning *`;
    return Response.json(row);
  } catch (e: any) {
    return Response.json({ error: "Could not save cloud note", detail: e?.message }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureSchema();
    const x = await req.json();
    const [row] = await db()`delete from scouting_sessions where id=${x.id} returning id`;
    if (!row) return Response.json({ error: "Note not found" }, { status: 404 });
    return Response.json(row);
  } catch (e: any) {
    return Response.json({ error: "Could not delete cloud note", detail: e?.message }, { status: 503 });
  }
}
