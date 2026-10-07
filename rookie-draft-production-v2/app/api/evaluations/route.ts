import {ensureTursoSchema,rows} from "@/lib/turso";
import {recordAudit} from "@/lib/audit";

export async function GET(req:Request){
  try{
    const u=new URL(req.url),id=u.searchParams.get("playerId"),draftClass=Number(u.searchParams.get("draftClass")||0),c=await ensureTursoSchema();
    if(id)return Response.json(rows(await c.execute({sql:"select category,value,commentary from evaluations where player_id=? order by category",args:[id]})));
    if(draftClass)return Response.json(rows(await c.execute({sql:"select e.player_id,e.category,e.value,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? order by e.player_id,e.category",args:[draftClass]})));
    return Response.json({error:"playerId or draftClass required"},{status:400});
  }catch(e:any){return Response.json({error:"Could not load evaluations",detail:e?.message},{status:500})}
}

export async function POST(req:Request){
  try{
    const {playerId,category,value,commentary}=await req.json();
    if(!playerId||!category)return Response.json({error:"playerId and category required"},{status:400});
    const c=await ensureTursoSchema(),previous=rows(await c.execute({sql:"select value,commentary from evaluations where player_id=? and category=?",args:[playerId,category]}))[0]||null;
    const n=value===""||value==null||!Number.isFinite(Number(value))?null:Number(value),com=commentary??(value!==""&&value!=null&&!Number.isFinite(Number(value))?String(value):null),now=new Date().toISOString();
    await c.execute({sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at",args:[playerId,category,n,com,now]});
    const saved=rows(await c.execute({sql:"select * from evaluations where player_id=? and category=?",args:[playerId,category]}))[0];
    const player=rows(await c.execute({sql:"select name from players where id=?",args:[playerId]}))[0] as any;
    await recordAudit(c,{action:"EVALUATION_UPDATE",entityType:"evaluation",entityId:String(playerId)+":"+String(category),summary:(player?.name||"Player")+" · "+String(category),before:previous,after:saved,undoKind:"evaluation",undoPayload:{playerId:Number(playerId),category:String(category),previous}});
    return Response.json(saved);
  }catch(e:any){return Response.json({error:"Could not save evaluation",detail:e?.message},{status:500})}
}
