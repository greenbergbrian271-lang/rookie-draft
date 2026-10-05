import {rows} from "@/lib/turso";

type Pos="QB"|"RB"|"WR"|"TE";
const FILM:Record<Pos,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};

export class ReturningPlayerError extends Error{
  status:number;
  constructor(message:string,status=400){super(message);this.name="ReturningPlayerError";this.status=status}
}

export async function movePlayerToNextDraftClass(c:any,playerId:number,expectedFromDraftClass?:number,options?:{allowDeclared?:boolean}){
  const now=new Date().toISOString();
  const player:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
  if(!player)throw new ReturningPlayerError("Player not found",404);

  const fromDraftClass=Number(player.draft_class),toDraftClass=fromDraftClass+1;
  if(expectedFromDraftClass&&expectedFromDraftClass!==fromDraftClass){
    throw new ReturningPlayerError(`${player.name} is no longer in the ${expectedFromDraftClass} class. Refresh and try again.`,409);
  }

  const declared=rows(await c.execute({sql:"select tag from workflow_tags where player_id=? and tag='DECLARES'",args:[playerId]}));
  if(declared.length&&!options?.allowDeclared){
    throw new ReturningPlayerError(`${player.name} is already on Declares and is intentionally hidden from Returning Player.`,409);
  }

  const duplicate=rows(await c.execute({sql:"select id from players where lower(name)=lower(?) and draft_class=? and id<>?",args:[player.name,toDraftClass,playerId]}));
  if(duplicate.length){
    throw new ReturningPlayerError(`${player.name} already has a ${toDraftClass} player record. Resolve that duplicate before moving the player.`,409);
  }

  const [evaluations,sessions,tags,maxOrderResult]=await Promise.all([
    c.execute({sql:"select category,value,commentary,updated_at from evaluations where player_id=? order by category",args:[playerId]}),
    c.execute({sql:"select id,game_date,opponent,raw_notes,overall_writeup,grade_snapshot,created_at from scouting_sessions where player_id=? order by created_at,id",args:[playerId]}),
    c.execute({sql:"select tag,detail,created_at,updated_at from workflow_tags where player_id=? order by tag",args:[playerId]}),
    c.execute({sql:"select coalesce(max(watch_order),0) as max_order from players where draft_class=? and position=?",args:[toDraftClass,player.position]})
  ]);
  const evalRows=rows(evaluations),sessionRows=rows(sessions),tagRows=rows(tags);
  const filmCategories=FILM[String(player.position) as Pos]||[];
  const filmSet=new Set(filmCategories);
  const hiddenFilmGrades=evalRows.filter((e:any)=>filmSet.has(String(e.category))&&(e.value!==null||e.commentary)).length;
  const legacyCommentary=evalRows.find((e:any)=>String(e.category)==="__COMMENTARY__");
  const preservedScoutingNotes=sessionRows.length+(legacyCommentary?.commentary||legacyCommentary?.value?1:0);
  const snapshot=JSON.stringify({
    player:{id:player.id,name:player.name,position:player.position,college:player.college,draftClass:fromDraftClass,scoutingStatus:player.scouting_status,watchOrder:player.watch_order},
    evaluations:evalRows,
    scoutingSessions:sessionRows,
    workflowTags:tagRows
  });

  const nextStatus=player.scouting_status==="MAYBE"
    ?"MAYBE"
    :(["WATCHED","FINISHED"].includes(String(player.scouting_status))||evalRows.length||sessionRows.length)?"WATCHED":"TO_SCOUT";
  const nextOrder=Number(maxOrderResult.rows[0]?.max_order||0)+1;
  const archivedCategories=[...filmCategories,"__COMMENTARY__","__GAME_LABEL__","Early Declare","Early Declare?"];
  const placeholders=archivedCategories.map(()=>"?").join(",");
  const statements:any[]=[
    {
      sql:"insert into returning_player_reports(player_id,from_draft_class,to_draft_class,position,college,snapshot,moved_at) values(?,?,?,?,?,?,?) on conflict(player_id,from_draft_class,to_draft_class) do update set position=excluded.position,college=excluded.college,snapshot=excluded.snapshot,moved_at=excluded.moved_at",
      args:[playerId,fromDraftClass,toDraftClass,player.position,player.college||null,snapshot,now]
    },
    {sql:`delete from evaluations where player_id=? and category in (${placeholders})`,args:[playerId,...archivedCategories]},
    {sql:"delete from scouting_sessions where player_id=?",args:[playerId]},
    {sql:options?.allowDeclared?"delete from workflow_tags where player_id=? and tag in ('COMBINE','ALL_STAR','DECLARES')":"delete from workflow_tags where player_id=? and tag in ('COMBINE','ALL_STAR')",args:[playerId]},
    {sql:"update players set draft_class=?,scouting_status=?,watch_order=?,updated_at=? where id=?",args:[toDraftClass,nextStatus,nextOrder,now,playerId]}
  ];
  await c.batch(statements,"write");
  const updated:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
  return {ok:true,player:updated,fromDraftClass,toDraftClass,hiddenFilmGrades,preservedScoutingNotes,priorReportSaved:true};
}
