import { db, ensureSchema } from "@/lib/db";
import { seedV10Watchlist } from "@/lib/seed-v10";

export async function GET() {
  try {
    await ensureSchema();
    await seedV10Watchlist();
    return Response.json(await db()`select * from players order by draft_class desc,position,name`);
  } catch (e: any) {
    return Response.json({ error: "Cloud database unavailable", detail: e?.message }, { status: 503 });
  }
}
export async function POST(req: Request) {
  try {
    await ensureSchema(); const x=await req.json();
    const [row]=await db()`insert into players(name,position,college,draft_class) values(${x.name},${x.position},${x.college||null},${x.draftClass||2027}) on conflict(name,draft_class) do update set position=excluded.position,college=excluded.college,updated_at=now() returning *`;
    return Response.json(row);
  } catch(e:any){return Response.json({error:"Could not save player",detail:e?.message},{status:503})}
}
export async function PATCH(req: Request) {
  try {
    await ensureSchema(); const x=await req.json();
    const [row]=await db()`update players set scouting_status=${x.status||"TO_SCOUT"},draft_class=${x.draftClass||2027},updated_at=now() where id=${x.id} returning *`;
    if(!row)return Response.json({error:"Player not found"},{status:404}); return Response.json(row);
  } catch(e:any){return Response.json({error:"Could not update player",detail:e?.message},{status:503})}
}