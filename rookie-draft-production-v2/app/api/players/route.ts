import {ensureTursoSchema,rows} from "@/lib/turso";
import {syncCombineStatusForPlayer} from "@/lib/combine-invites";
import {recordAudit} from "@/lib/audit";
import {syncPlayerIdentity} from "@/lib/player-identity";

const hasOwn=(x:any,key:string)=>Object.prototype.hasOwnProperty.call(x||{},key);
function espnIdFrom(raw:unknown){const value=String(raw??"").trim();if(!value)return null;if(/^\d+$/.test(value))return value;try{const u=new URL(value);if(!/(^|\.)espn\.com$/i.test(u.hostname))return null;return u.pathname.match(/\/id\/(\d+)(?:\/|$)/)?.[1]||null}catch{return null}}
function httpUrl(raw:unknown){const value=String(raw??"").trim();if(!value)return null;try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:"?u.toString():null}catch{return null}}

export async function GET(){
  try{
    const c=await ensureTursoSchema();
    return Response.json(rows(await c.execute("select * from players order by draft_class desc,position,watch_order,name")));
  }catch(e:any){return Response.json({error:"Player database unavailable",detail:e?.message},{status:503})}
}

export async function POST(req:Request){
  try{
    const c=await ensureTursoSchema(),x=await req.json(),draftClass=Number(x.draftClass||2027),now=new Date().toISOString();
    const previous=rows(await c.execute({sql:"select * from players where name=? and draft_class=?",args:[x.name,draftClass]}))[0]||null;
    await c.execute({sql:"insert into players(name,position,college,draft_class,scouting_status,watch_order,updated_at) values(?,?,?,?,?,(select coalesce(max(watch_order),0)+1 from players),?) on conflict(name,draft_class) do update set position=excluded.position,college=excluded.college,updated_at=excluded.updated_at",args:[x.name,x.position,x.college||null,draftClass,x.status||"TO_SCOUT",now]});
    const saved=rows(await c.execute({sql:"select * from players where name=? and draft_class=?",args:[x.name,draftClass]}))[0] as any;
    if(saved){await syncPlayerIdentity(c,saved);await syncCombineStatusForPlayer(c,saved)}
    await recordAudit(c,{action:previous?"PLAYER_UPSERT":"PLAYER_CREATE",entityType:"player",entityId:saved?.id,summary:(previous?"Updated ":"Added ")+String(saved?.name||x.name),before:previous,after:saved,undoKind:previous?"player_patch":null,undoPayload:previous?{playerId:Number(saved.id),before:previous}:null});
    return Response.json(saved);
  }catch(e:any){return Response.json({error:"Could not save player",detail:e?.message},{status:503})}
}

export async function PATCH(req:Request){
  try{
    const c=await ensureTursoSchema(),x=await req.json();
    const cur=rows(await c.execute({sql:"select * from players where id=?",args:[x.id]}))[0] as any;
    if(!cur)return Response.json({error:"Player not found"},{status:404});
    const jersey=x.jersey??cur.jersey_number,changed=jersey!==cur.jersey_number,now=new Date().toISOString();
    let espnId=cur.espn_athlete_id,espnSource=cur.espn_source,headshot=cur.headshot_url,headshotSource=cur.headshot_source;
    if(hasOwn(x,"espnProfileUrl")||hasOwn(x,"espnAthleteId")){
      const raw=String(x.espnProfileUrl??x.espnAthleteId??"").trim();
      if(raw){const parsed=espnIdFrom(raw);if(!parsed)return Response.json({error:"Enter a valid ESPN college-football player profile URL or athlete ID."},{status:400});espnId=parsed;espnSource="manual"}
      else{espnId=null;espnSource=null}
    }
    if(hasOwn(x,"headshotUrl")){
      const raw=String(x.headshotUrl??"").trim();
      if(raw){const parsed=httpUrl(raw);if(!parsed)return Response.json({error:"Enter a valid http(s) headshot image URL."},{status:400});headshot=parsed;headshotSource="manual"}
      else{headshot=null;headshotSource=null}
    }
    await c.execute({sql:"update players set scouting_status=?,draft_class=?,position=?,watch_order=?,jersey_number=?,jersey_source=?,jersey_updated_at=?,espn_athlete_id=?,espn_source=?,headshot_url=?,headshot_source=?,updated_at=? where id=?",args:[x.status??cur.scouting_status,x.draftClass??cur.draft_class,x.position??cur.position,x.watchOrder??cur.watch_order,jersey,x.jerseySource??cur.jersey_source,changed?now:cur.jersey_updated_at,espnId,espnSource,headshot,headshotSource,now,x.id]});
    const saved=rows(await c.execute({sql:"select * from players where id=?",args:[x.id]}))[0] as any;
    if(saved)await syncPlayerIdentity(c,saved);
    await recordAudit(c,{action:"PLAYER_UPDATE",entityType:"player",entityId:x.id,summary:String(saved?.name||cur.name)+" updated",before:cur,after:saved,undoKind:"player_patch",undoPayload:{playerId:Number(x.id),before:cur}});
    return Response.json(saved);
  }catch(e:any){return Response.json({error:"Could not update player",detail:e?.message},{status:503})}
}
