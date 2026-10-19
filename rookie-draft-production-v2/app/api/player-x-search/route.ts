import {ensureTursoSchema,rows} from "@/lib/turso";
import {playerNameKey} from "@/lib/player-name";

// Optional per-player override for the X (Twitter) search button.
// Keyed by normalized player name so the college and NFL cards share one value.
async function table(){
  const c=await ensureTursoSchema();
  await c.execute("create table if not exists player_x_search(name_key text primary key,query text not null,updated_at text not null)");
  return c;
}

export async function GET(req:Request){
  try{
    const key=playerNameKey(new URL(req.url).searchParams.get("name"));
    if(!key)return Response.json({query:""});
    const c=await table();
    const r=rows(await c.execute({sql:"select query from player_x_search where name_key=?",args:[key]}))[0] as any;
    return Response.json({query:r?.query||""});
  }catch(e:any){return Response.json({query:"",error:"X search settings unavailable",detail:e?.message},{status:503})}
}

export async function PUT(req:Request){
  try{
    const x=await req.json(),key=playerNameKey(x?.name),query=String(x?.query??"").trim().slice(0,200);
    if(!key)return Response.json({error:"Player name required"},{status:400});
    const c=await table();
    if(!query)await c.execute({sql:"delete from player_x_search where name_key=?",args:[key]});
    else await c.execute({sql:"insert into player_x_search(name_key,query,updated_at) values(?,?,?) on conflict(name_key) do update set query=excluded.query,updated_at=excluded.updated_at",args:[key,query,new Date().toISOString()]});
    return Response.json({query});
  }catch(e:any){return Response.json({error:"Could not save X search settings",detail:e?.message},{status:503})}
}
