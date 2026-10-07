import {rows} from "@/lib/turso";

type AuditInput={
  action:string;
  entityType:string;
  entityId?:string|number|null;
  summary:string;
  before?:unknown;
  after?:unknown;
  undoKind?:string|null;
  undoPayload?:unknown;
};

const json=(value:unknown)=>value===undefined?null:JSON.stringify(value);
const parse=(value:unknown)=>{try{return value?JSON.parse(String(value)):null}catch{return null}};
const qid=(value:string)=>'"'+value.replace(/"/g,'""')+'"';

export async function recordAudit(c:any,input:AuditInput){
  const createdAt=new Date().toISOString();
  const result=await c.execute({
    sql:"insert into audit_log(action,entity_type,entity_id,summary,before_json,after_json,undo_kind,undo_payload,created_at) values(?,?,?,?,?,?,?,?,?)",
    args:[input.action,input.entityType,input.entityId==null?null:String(input.entityId),input.summary,json(input.before),json(input.after),input.undoKind||null,json(input.undoPayload),createdAt]
  });
  return {id:Number(result.lastInsertRowid||0),createdAt};
}

export async function recentAudit(c:any,limit=80){
  const n=Math.max(1,Math.min(250,Number(limit)||80));
  return rows(await c.execute({
    sql:"select id,action,entity_type as entityType,entity_id as entityId,summary,before_json as beforeJson,after_json as afterJson,undo_kind as undoKind,created_at as createdAt,undone_at as undoneAt,undo_of as undoOf from audit_log order by id desc limit ?",
    args:[n]
  })).map((x:any)=>({...x,id:Number(x.id),undoable:Boolean(x.undoKind&&!x.undoneAt)}));
}

async function tableColumns(c:any,table:string){
  return rows(await c.execute("pragma table_info("+qid(table)+")")).map((x:any)=>String(x.name));
}

function insertStatement(table:string,row:Record<string,any>,columns:string[]){
  const keys=Object.keys(row).filter(key=>columns.includes(key));
  if(!keys.length)return null;
  return {sql:"insert into "+qid(table)+"("+keys.map(qid).join(",")+") values("+keys.map(()=>"?").join(",")+")",args:keys.map(key=>row[key]??null)};
}

async function restoreArchivedPlayer(c:any,playerId:number){
  const archived=rows(await c.execute({sql:"select * from archived_players where original_player_id=?",args:[playerId]}))[0] as any;
  if(!archived)throw new Error("Archived player snapshot is no longer available.");
  const snapshot=parse(archived.snapshot),player=snapshot?.player;
  if(!player?.name)throw new Error("Archived player snapshot is invalid.");
  const conflict=rows(await c.execute({sql:"select id from players where id=? or (lower(name)=lower(?) and draft_class=?) limit 1",args:[playerId,player.name,player.draft_class]}))[0];
  if(conflict)throw new Error("The archived player cannot be restored because the player identity is already in use.");
  const statements:any[]=[];
  const playerInsert=insertStatement("players",player,await tableColumns(c,"players"));
  if(!playerInsert)throw new Error("Could not reconstruct the player record.");
  statements.push(playerInsert);
  const related=snapshot?.related&&typeof snapshot.related==="object"?snapshot.related:{};
  for(const [table,value] of Object.entries(related)){
    if(!Array.isArray(value)||!value.length)continue;
    let columns:string[]=[];try{columns=await tableColumns(c,table)}catch{continue}
    for(const row of value as Record<string,any>[]){const stmt=insertStatement(table,row,columns);if(stmt)statements.push(stmt)}
  }
  statements.push({sql:"delete from archived_players where original_player_id=?",args:[playerId]});
  await c.batch(statements,"write");
}

async function undoEvaluation(c:any,payload:any){
  const playerId=Number(payload?.playerId),category=String(payload?.category||"");
  if(!playerId||!category)throw new Error("Evaluation undo payload is invalid.");
  const prev=payload?.previous;
  if(prev){
    await c.execute({sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at",args:[playerId,category,prev.value??null,prev.commentary??null,new Date().toISOString()]});
  }else await c.execute({sql:"delete from evaluations where player_id=? and category=?",args:[playerId,category]});
}

async function undoPlayerPatch(c:any,payload:any){
  const id=Number(payload?.playerId),before=payload?.before||{};
  if(!id)throw new Error("Player undo payload is invalid.");
  const allowed=["name","position","college","draft_class","scouting_status","watch_order","jersey_number","jersey_source","jersey_updated_at","espn_athlete_id","espn_source","headshot_url","headshot_source","player_uid"];
  const keys=Object.keys(before).filter(k=>allowed.includes(k));
  if(!keys.length)return;
  await c.execute({sql:"update players set "+keys.map(k=>qid(k)+"=?").join(",")+",updated_at=? where id=?",args:[...keys.map(k=>before[k]??null),new Date().toISOString(),id]});
}

async function undoWorkflowTag(c:any,payload:any){
  const playerId=Number(payload?.playerId),tag=String(payload?.tag||""),prev=payload?.previous;
  if(!playerId||!tag)throw new Error("Workflow-tag undo payload is invalid.");
  if(prev)await c.execute({sql:"insert into workflow_tags(player_id,tag,detail,updated_at) values(?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",args:[playerId,tag,prev.detail??null,new Date().toISOString()]});
  else await c.execute({sql:"delete from workflow_tags where player_id=? and tag=?",args:[playerId,tag]});
}

async function undoDraftClassTransition(c:any,payload:any){
  const from=Number(payload?.fromDraftClass),to=Number(payload?.toDraftClass);
  if(!from||!to)throw new Error("Draft-class undo payload is invalid.");
  const active=rows(await c.execute({sql:"select value from settings where key='active_draft_class'"}))[0] as any;
  if(Number(active?.value)!==to)throw new Error("A newer draft-class change exists, so this transition cannot be safely undone.");
  const later=rows(await c.execute({sql:"select 1 as x from draft_class_transitions where from_draft_class=? limit 1",args:[to]}));
  if(later.length)throw new Error("A later transition depends on this one.");
  const now=new Date().toISOString();
  await c.batch([
    {sql:"insert into settings(key,value,updated_at) values('active_draft_class',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[String(from),now]},
    {sql:"insert into draft_class_state(draft_class,is_locked,locked_at) values(?,0,null) on conflict(draft_class) do update set is_locked=0,locked_at=null",args:[from]},
    {sql:"delete from draft_class_transitions where from_draft_class=? and to_draft_class=?",args:[from,to]}
  ],"write");
}

async function undoPffActivation(c:any,payload:any){
  const draftClass=Number(payload?.draftClass),previous=payload?.previousActive||{},positions=Array.isArray(payload?.positions)?payload.positions:Object.keys(previous);
  if(!draftClass)throw new Error("PFF undo payload is invalid.");
  const statements:any[]=[];
  for(const pos of positions){
    const oldId=Number(previous[pos]||0);
    if(oldId)statements.push({sql:"insert into pff_active_datasets(draft_class,position,import_id,activated_at) values(?,?,?,?) on conflict(draft_class,position) do update set import_id=excluded.import_id,activated_at=excluded.activated_at",args:[draftClass,pos,oldId,new Date().toISOString()]});
    else statements.push({sql:"delete from pff_active_datasets where draft_class=? and position=?",args:[draftClass,pos]});
  }
  if(Object.prototype.hasOwnProperty.call(payload||{},"previousAnalysisSeason"))statements.push({sql:"insert into draft_class_context(draft_class,analysis_season,source,updated_at) values(?,?,?,?) on conflict(draft_class) do update set analysis_season=excluded.analysis_season,source=excluded.source,updated_at=excluded.updated_at",args:[draftClass,payload.previousAnalysisSeason==null?null:Number(payload.previousAnalysisSeason),"undo",new Date().toISOString()]});
  if(statements.length)await c.batch(statements,"write");
}

export async function undoAudit(c:any,id:number){
  const entry=rows(await c.execute({sql:"select * from audit_log where id=?",args:[id]}))[0] as any;
  if(!entry)throw new Error("Audit entry not found.");
  if(entry.undone_at)throw new Error("This change has already been undone.");
  if(!entry.undo_kind)throw new Error("This change is not automatically undoable.");
  const payload=parse(entry.undo_payload);
  switch(String(entry.undo_kind)){
    case "evaluation":await undoEvaluation(c,payload);break;
    case "player_patch":await undoPlayerPatch(c,payload);break;
    case "workflow_tag":await undoWorkflowTag(c,payload);break;
    case "archive_player":await restoreArchivedPlayer(c,Number(payload?.playerId));break;
    case "draft_class_transition":await undoDraftClassTransition(c,payload);break;
    case "pff_activation":await undoPffActivation(c,payload);break;
    default:throw new Error("Unsupported undo type.");
  }
  const undoneAt=new Date().toISOString();
  await c.execute({sql:"update audit_log set undone_at=? where id=?",args:[undoneAt,id]});
  await c.execute({sql:"insert into audit_log(action,entity_type,entity_id,summary,before_json,after_json,created_at,undo_of) values('UNDO',?,?,?,?,?,?,?)",args:[entry.entity_type,entry.entity_id,"Undo: "+entry.summary,entry.after_json,entry.before_json,undoneAt,id]});
  return {ok:true,id,undoneAt};
}
