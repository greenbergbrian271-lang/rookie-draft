import {rows} from "@/lib/turso";
import {markPlayerDeclaredFromSignal} from "@/lib/draft-status-signals";

export type CombineLookupPlayer={
  id:number|string;
  name:string;
  position?:string|null;
  college?:string|null;
  draft_class:number;
};

export function normalizeCombineName(value:unknown){
  return String(value??"")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’‘]/g,"'")
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/g,"")
    .replace(/[^a-z0-9]/g,"");
}

export function normalizeCombineSchool(value:unknown){
  return String(value??"")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]/g,"");
}

async function saveEvaluation(q:any,playerId:number|string,invited:boolean){
  const now=new Date().toISOString(),detail=invited?"Yes":"No";
  await q.execute({
    sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at",
    args:[playerId,"Combine Invite?",null,detail,now]
  });
  await q.execute({
    sql:"insert into workflow_tags(player_id,tag,detail,created_at,updated_at) values(?,?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",
    args:[playerId,"COMBINE",detail,now,now]
  });
  if(invited){
    const player:any=rows(await q.execute({sql:"select draft_class from players where id=?",args:[Number(playerId)]}))[0];
    if(player?.draft_class)await markPlayerDeclaredFromSignal(q,playerId,Number(player.draft_class),"COMBINE_INVITE");
  }
}

export async function combineInviteStatusForPlayer(q:any,player:CombineLookupPlayer):Promise<boolean|null>{
  const source=rows(await q.execute({
    sql:"select draft_class from combine_invite_sources where draft_class=?",
    args:[Number(player.draft_class)]
  }));
  if(!source.length)return null;

  const normalizedName=normalizeCombineName(player.name);
  const position=String(player.position||"").trim().toUpperCase();
  const matches=rows(await q.execute({
    sql:"select position,school from combine_invites where draft_class=? and normalized_name=?",
    args:[Number(player.draft_class),normalizedName]
  }));
  if(!matches.length)return false;

  const positional=matches.filter((x:any)=>!position||!x.position||String(x.position).toUpperCase()===position);
  if(positional.length)return true;
  return false;
}

export async function syncCombineStatusForPlayer(q:any,player:CombineLookupPlayer){
  const invited=await combineInviteStatusForPlayer(q,player);
  if(invited==null)return null;
  await saveEvaluation(q,player.id,invited);
  return invited;
}

export async function setCombineStatusForPlayer(q:any,playerId:number|string,invited:boolean){
  await saveEvaluation(q,playerId,invited);
}
