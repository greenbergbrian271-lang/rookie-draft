import {ensureTursoSchema,rows} from "@/lib/turso";

export async function GET(req:Request){
  try{
    const id=new URL(req.url).searchParams.get("playerId");
    if(!id)return Response.json({error:"playerId required"},{status:400});
    const c=await ensureTursoSchema();
    return Response.json(rows(await c.execute({
      sql:"select id,player_id,game_date,opponent,raw_notes,overall_writeup,grade_snapshot,created_at from scouting_sessions where player_id=? order by coalesce(game_date,created_at) desc,id desc",
      args:[id]
    })));
  }catch(e:any){return Response.json({error:e?.message||"Could not load scouting sessions"},{status:500})}
}

export async function POST(req:Request){
  try{
    const x=await req.json();
    if(!x.playerId)return Response.json({error:"playerId required"},{status:400});
    const c=await ensureTursoSchema(),now=new Date().toISOString();
    const r=await c.execute({
      sql:"insert into scouting_sessions(player_id,game_date,opponent,raw_notes,overall_writeup,grade_snapshot,created_at) values(?,?,?,?,?,?,?) returning *",
      args:[x.playerId,x.gameDate||null,x.opponent||null,x.rawNotes||null,x.overallWriteup||null,x.gradeSnapshot?JSON.stringify(x.gradeSnapshot):null,now]
    });
    return Response.json(rows(r)[0]);
  }catch(e:any){return Response.json({error:e?.message||"Could not create scouting session"},{status:500})}
}

export async function PATCH(req:Request){
  try{
    const x=await req.json();
    if(!x.id)return Response.json({error:"id required"},{status:400});
    const c=await ensureTursoSchema();
    const cur=rows(await c.execute({sql:"select * from scouting_sessions where id=?",args:[x.id]}))[0];
    if(!cur)return Response.json({error:"Scouting session not found"},{status:404});
    await c.execute({
      sql:"update scouting_sessions set game_date=?,opponent=?,raw_notes=?,overall_writeup=?,grade_snapshot=? where id=?",
      args:[
        x.gameDate??cur.game_date,
        x.opponent??cur.opponent,
        x.rawNotes??cur.raw_notes,
        x.overallWriteup??cur.overall_writeup,
        x.gradeSnapshot===undefined?cur.grade_snapshot:JSON.stringify(x.gradeSnapshot),
        x.id
      ]
    });
    return Response.json(rows(await c.execute({sql:"select * from scouting_sessions where id=?",args:[x.id]}))[0]);
  }catch(e:any){return Response.json({error:e?.message||"Could not update scouting session"},{status:500})}
}

export async function DELETE(req:Request){
  try{
    const x=await req.json();
    if(!x.id)return Response.json({error:"id required"},{status:400});
    const c=await ensureTursoSchema();
    await c.execute({sql:"delete from scouting_sessions where id=?",args:[x.id]});
    return Response.json({ok:true});
  }catch(e:any){return Response.json({error:e?.message||"Could not delete scouting session"},{status:500})}
}
