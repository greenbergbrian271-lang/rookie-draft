import {rows} from "@/lib/turso";

export function normalizePlayerIdentity(value:unknown){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}

export async function syncPlayerIdentity(c:any,player:any){
  if(!player?.id)return null;
  const id=Number(player.id),uid=String(player.player_uid||("rdp-"+id));
  if(!player.player_uid)await c.execute({sql:"update players set player_uid=? where id=?",args:[uid,id]});
  const aliases:{type:string,value:string,source:string}[]=[];
  if(player.name)aliases.push({type:"NAME",value:String(player.name),source:"players"});
  if(player.espn_athlete_id)aliases.push({type:"ESPN_ID",value:String(player.espn_athlete_id),source:String(player.espn_source||"players")});
  if(player.college)aliases.push({type:"COLLEGE_NAME",value:String(player.name)+"|"+String(player.college),source:"players"});
  for(const alias of aliases){
    const normalized=alias.type==="ESPN_ID"?alias.value:normalizePlayerIdentity(alias.value);
    if(!normalized)continue;
    await c.execute({sql:"insert into player_identity_aliases(player_id,alias_type,alias_value,normalized_value,source,updated_at) values(?,?,?,?,?,?) on conflict(player_id,alias_type,normalized_value) do update set alias_value=excluded.alias_value,source=excluded.source,updated_at=excluded.updated_at",args:[id,alias.type,alias.value,normalized,alias.source,new Date().toISOString()]});
  }
  return uid;
}

export async function identityMapForDraftClass(c:any,draftClass:number){
  const players=rows(await c.execute({sql:"select id,name,college,espn_athlete_id,player_uid from players where draft_class=?",args:[draftClass]})) as any[];
  const ids=new Set(players.map(p=>Number(p.id)));
  const aliases=rows(await c.execute({sql:"select a.player_id,a.alias_type,a.normalized_value from player_identity_aliases a join players p on p.id=a.player_id where p.draft_class=?",args:[draftClass]})) as any[];
  const map=new Map<string,number>();
  for(const p of players){const key=normalizePlayerIdentity(p.name);if(key&&!map.has(key))map.set(key,Number(p.id))}
  for(const a of aliases){if(String(a.alias_type)==="NAME"&&ids.has(Number(a.player_id))&&!map.has(String(a.normalized_value)))map.set(String(a.normalized_value),Number(a.player_id))}
  return map;
}

export async function resolvePlayerIdentity(c:any,input:{draftClass:number;name?:unknown;espnId?:unknown}){
  const draftClass=Number(input.draftClass),espn=String(input.espnId??"").trim();
  if(espn){
    const hit=rows(await c.execute({sql:"select p.* from players p left join player_identity_aliases a on a.player_id=p.id where p.draft_class=? and (p.espn_athlete_id=? or (a.alias_type='ESPN_ID' and a.normalized_value=?)) limit 1",args:[draftClass,espn,espn]}))[0];
    if(hit)return hit;
  }
  const norm=normalizePlayerIdentity(input.name);
  if(!norm)return null;
  const direct=rows(await c.execute({sql:"select * from players where draft_class=?",args:[draftClass]})).find((p:any)=>normalizePlayerIdentity(p.name)===norm);
  if(direct)return direct;
  return rows(await c.execute({sql:"select p.* from player_identity_aliases a join players p on p.id=a.player_id where p.draft_class=? and a.alias_type='NAME' and a.normalized_value=? limit 1",args:[draftClass,norm]}))[0]||null;
}
