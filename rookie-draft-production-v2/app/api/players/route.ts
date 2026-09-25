import { db, ensureSchema } from "@/lib/db";
import { seedV10Watchlist } from "@/lib/seed-v10";

export async function GET() {
  try {
    await ensureSchema(); await seedV10Watchlist();
    return Response.json(await db()`select * from players order by draft_class desc,position,watch_order,name`);
  } catch (e:any) { return Response.json({error:"Cloud database unavailable",detail:e?.message},{status:503}); }
}
export async function POST(req:Request) {
  try {
    await ensureSchema(); const x=await req.json();
    const [row]=await db()`insert into players(name,position,college,draft_class,scouting_status,watch_order)
      values(${x.name},${x.position},${x.college||null},${x.draftClass||2027},${x.status||"TO_SCOUT"},(select coalesce(max(watch_order),0)+1 from players))
      on conflict(name,draft_class) do update set position=excluded.position,college=excluded.college,updated_at=now() returning *`;
    return Response.json(row);
  } catch(e:any){return Response.json({error:"Could not save player",detail:e?.message},{status:503});}
}
export async function PATCH(req:Request) {
  try {
    await ensureSchema(); const x=await req.json();
    const [current]=await db()`select * from players where id=${x.id}`;
    if(!current)return Response.json({error:"Player not found"},{status:404});
    const status=x.status??current.scouting_status, draftClass=x.draftClass??current.draft_class, position=x.position??current.position, watchOrder=x.watchOrder??current.watch_order, jersey=x.jersey??current.jersey_number, jerseySource=x.jerseySource??current.jersey_source;
    const [row]=await db()`update players set scouting_status=${status},draft_class=${draftClass},position=${position},watch_order=${watchOrder},jersey_number=${jersey},jersey_source=${jerseySource},jersey_updated_at=case when ${jersey} is distinct from jersey_number then now() else jersey_updated_at end,updated_at=now() where id=${x.id} returning *`;
    return Response.json(row);
  } catch(e:any){return Response.json({error:"Could not update player",detail:e?.message},{status:503});}
}