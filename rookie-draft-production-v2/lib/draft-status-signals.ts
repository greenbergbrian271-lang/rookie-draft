import {rows} from "@/lib/turso";

export async function markPlayerDeclaredFromSignal(
  q:any,
  playerId:number|string,
  draftClass:number,
  signal:"COMBINE_INVITE"|"ALL_STAR_GAME",
  source?:{url?:string|null;title?:string|null}
){
  const player:any=rows(await q.execute({sql:"select id,name,draft_class from players where id=?",args:[Number(playerId)]}))[0];
  if(!player||Number(player.draft_class)!==Number(draftClass))return false;

  const now=new Date().toISOString();
  const note=signal==="COMBINE_INVITE"
    ?"Automatically marked declared because the player has an NFL Combine invite."
    :"Automatically marked declared because the player is going to a college all-star game.";
  const sourceTitle=source?.title||(signal==="COMBINE_INVITE"?"NFL Combine invite":"College All-Star Game");

  await q.execute({
    sql:`insert into draft_statuses(player_id,draft_class,status,source_url,source_title,source_type,note,set_method,verified_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?)
      on conflict(player_id,draft_class) do nothing`,
    args:[Number(playerId),Number(draftClass),"ENTERING_DRAFT",source?.url||null,sourceTitle,"SYSTEM",note,"SYSTEM",now,now]
  });

  const current:any=rows(await q.execute({
    sql:"select status from draft_statuses where player_id=? and draft_class=?",
    args:[Number(playerId),Number(draftClass)]
  }))[0];
  if(current?.status!=="ENTERING_DRAFT")return false;

  await q.batch([
    {
      sql:"insert into workflow_tags(player_id,tag,detail,updated_at) values(?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",
      args:[Number(playerId),"DECLARES","Yes",now]
    },
    {
      sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at",
      args:[Number(playerId),"Early Declare",null,"Yes",now]
    }
  ],"write");
  return true;
}

export async function reconcileAutomaticDraftDeclarations(q:any,draftClass:number){
  const candidates=rows(await q.execute({
    sql:`select p.id,
      case
        when exists(select 1 from workflow_tags w where w.player_id=p.id and w.tag='COMBINE' and lower(coalesce(w.detail,''))='yes') then 'COMBINE_INVITE'
        when exists(select 1 from all_star_invites a where a.player_id=p.id and coalesce(a.participation_status,'ACTIVE')='ACTIVE') then 'ALL_STAR_GAME'
        else null
      end as signal,
      (select a.source_url from all_star_invites a where a.player_id=p.id and coalesce(a.participation_status,'ACTIVE')='ACTIVE' and a.source_url is not null order by a.updated_at desc limit 1) as all_star_source
      from players p
      where p.draft_class=?
        and (
          exists(select 1 from workflow_tags w where w.player_id=p.id and w.tag='COMBINE' and lower(coalesce(w.detail,''))='yes')
          or exists(select 1 from all_star_invites a where a.player_id=p.id and coalesce(a.participation_status,'ACTIVE')='ACTIVE')
        )`,
    args:[Number(draftClass)]
  }));

  let updated=0;
  for(const row of candidates as any[]){
    const signal=row.signal==="COMBINE_INVITE"?"COMBINE_INVITE":"ALL_STAR_GAME";
    const ok=await markPlayerDeclaredFromSignal(q,row.id,draftClass,signal,{
      url:signal==="ALL_STAR_GAME"?row.all_star_source:null
    });
    if(ok)updated++;
  }
  return updated;
}
