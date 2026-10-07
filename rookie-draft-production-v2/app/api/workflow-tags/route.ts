import {ensureTursoSchema,rows} from "@/lib/turso";
import {recordAudit} from "@/lib/audit";

export async function GET(req:Request){
  try{
    const c=await ensureTursoSchema(),tag=new URL(req.url).searchParams.get("tag");
    const sql=tag?"select w.player_id as playerId,w.tag,w.detail,w.updated_at as updatedAt,p.name,p.position,p.college,p.draft_class as draftClass from workflow_tags w join players p on p.id=w.player_id where w.tag=? order by p.position,p.watch_order,p.name":"select w.player_id as playerId,w.tag,w.detail,w.updated_at as updatedAt,p.name,p.position,p.college,p.draft_class as draftClass from workflow_tags w join players p on p.id=w.player_id order by w.tag,p.position,p.watch_order,p.name";
    return Response.json(rows(await c.execute({sql,args:tag?[tag]:[]})));
  }catch(e:any){return Response.json({error:e?.message||"Could not load workflow tags"},{status:500})}
}

export async function POST(req:Request){
  try{
    const {playerId,tag,detail}=await req.json();
    if(!playerId||!tag)return Response.json({error:"playerId and tag are required"},{status:400});
    const c=await ensureTursoSchema(),previous=rows(await c.execute({sql:"select detail from workflow_tags where player_id=? and tag=?",args:[Number(playerId),String(tag)]}))[0]||null,now=new Date().toISOString();
    await c.execute({sql:"insert into workflow_tags(player_id,tag,detail,updated_at) values(?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",args:[Number(playerId),String(tag),detail==null?null:String(detail),now]});
    const player=rows(await c.execute({sql:"select name from players where id=?",args:[Number(playerId)]}))[0] as any;
    await recordAudit(c,{action:"WORKFLOW_TAG_UPDATE",entityType:"workflow_tag",entityId:String(playerId)+":"+String(tag),summary:(player?.name||"Player")+" · "+String(tag)+" = "+String(detail??""),before:previous,after:{detail:detail==null?null:String(detail)},undoKind:"workflow_tag",undoPayload:{playerId:Number(playerId),tag:String(tag),previous}});
    return Response.json({ok:true});
  }catch(e:any){return Response.json({error:e?.message||"Could not save workflow tag"},{status:500})}
}

export async function DELETE(req:Request){
  try{
    const {playerId,tag}=await req.json(),c=await ensureTursoSchema(),previous=rows(await c.execute({sql:"select detail from workflow_tags where player_id=? and tag=?",args:[Number(playerId),String(tag)]}))[0]||null;
    await c.execute({sql:"delete from workflow_tags where player_id=? and tag=?",args:[Number(playerId),String(tag)]});
    if(previous){
      const player=rows(await c.execute({sql:"select name from players where id=?",args:[Number(playerId)]}))[0] as any;
      await recordAudit(c,{action:"WORKFLOW_TAG_DELETE",entityType:"workflow_tag",entityId:String(playerId)+":"+String(tag),summary:(player?.name||"Player")+" · removed "+String(tag),before:previous,after:null,undoKind:"workflow_tag",undoPayload:{playerId:Number(playerId),tag:String(tag),previous}});
    }
    return Response.json({ok:true});
  }catch(e:any){return Response.json({error:e?.message||"Could not remove workflow tag"},{status:500})}
}
