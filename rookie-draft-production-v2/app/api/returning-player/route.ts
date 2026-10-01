import {ensureTursoSchema,rows} from "@/lib/turso";

type Pos="QB"|"RB"|"WR"|"TE";
const FILM:Record<Pos,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};
const parse=(raw:any)=>{try{return JSON.parse(String(raw||"{}"))}catch{return {}}};

async function reconcilePriorCycle(c:any,playerId:number,snapshot:any){
  const sessions=Array.isArray(snapshot?.scoutingSessions)?snapshot.scoutingSessions:[];
  const sessionIds=sessions.map((s:any)=>Number(s?.id)).filter((id:number)=>Number.isInteger(id)&&id>0);
  if(sessionIds.length){
    const marks=sessionIds.map(()=>"?").join(",");
    await c.execute({sql:`delete from scouting_sessions where player_id=? and id in (${marks})`,args:[playerId,...sessionIds]});
  }

  const evaluations=Array.isArray(snapshot?.evaluations)?snapshot.evaluations:[];
  for(const category of ["__COMMENTARY__","__GAME_LABEL__"]){
    const old=evaluations.find((e:any)=>String(e?.category)===category);
    if(!old)continue;
    if(old?.value!==null&&old?.value!==undefined){
      await c.execute({sql:"delete from evaluations where player_id=? and category=? and value=?",args:[playerId,category,old.value]});
    }else{
      await c.execute({sql:"delete from evaluations where player_id=? and category=? and coalesce(commentary,'')=coalesce(?,'')",args:[playerId,category,old?.commentary??null]});
    }
  }
}

function reportFrom(row:any,snapshot:any){
  const evaluations=Array.isArray(snapshot?.evaluations)?snapshot.evaluations:[];
  const sessions=Array.isArray(snapshot?.scoutingSessions)?snapshot.scoutingSessions:[];
  const filmSet=new Set(FILM[String(row.position) as Pos]||[]);
  const commentary=evaluations.find((e:any)=>String(e?.category)==="__COMMENTARY__");
  const gameLabel=evaluations.find((e:any)=>String(e?.category)==="__GAME_LABEL__");
  return {
    playerId:row.playerId,
    fromDraftClass:Number(row.fromDraftClass),
    toDraftClass:Number(row.toDraftClass),
    position:row.position,
    college:row.college,
    movedAt:row.movedAt,
    filmGrades:evaluations
      .filter((e:any)=>filmSet.has(String(e.category)))
      .map((e:any)=>({category:e.category,value:e.value??e.commentary??null})),
    priorCommentary:commentary?.commentary??commentary?.value??null,
    priorGameLabel:gameLabel?.commentary??gameLabel?.value??null,
    priorNotes:sessions
      .filter((s:any)=>s?.raw_notes||s?.overall_writeup)
      .map((s:any)=>({
        id:s.id,
        opponent:s.opponent||null,
        gameDate:s.game_date||null,
        rawNotes:s.raw_notes||null,
        overallWriteup:s.overall_writeup||null
      }))
  };
}

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||0);
    if(!draftClass)return Response.json({error:"draftClass required"},{status:400});
    const c=await ensureTursoSchema();
    const reportRows=rows(await c.execute({
      sql:"select r.player_id as playerId,r.from_draft_class as fromDraftClass,r.to_draft_class as toDraftClass,r.position,r.college,r.snapshot,r.moved_at as movedAt from returning_player_reports r join players p on p.id=r.player_id where r.to_draft_class=? and p.draft_class=? order by p.position,p.watch_order,p.name",
      args:[draftClass,draftClass]
    }));
    const reports=[];
    for(const row of reportRows as any[]){
      const snapshot=parse(row.snapshot);
      // Backward-compatible repair for players moved in the first preview:
      // only rows whose IDs/content are in the prior-year snapshot are removed.
      await reconcilePriorCycle(c,Number(row.playerId),snapshot);
      reports.push(reportFrom(row,snapshot));
    }
    return Response.json({reports});
  }catch(e:any){
    return Response.json({error:"Could not load returning-player history",detail:e?.message},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json(),playerId=Number(body?.playerId);
    if(!playerId)return Response.json({error:"playerId required"},{status:400});
    const c=await ensureTursoSchema(),now=new Date().toISOString();
    const player:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
    if(!player)return Response.json({error:"Player not found"},{status:404});

    const fromDraftClass=Number(player.draft_class),toDraftClass=fromDraftClass+1;
    if(body?.fromDraftClass&&Number(body.fromDraftClass)!==fromDraftClass){
      return Response.json({error:`${player.name} is no longer in the ${body.fromDraftClass} class. Refresh and try again.`},{status:409});
    }

    const declared=rows(await c.execute({sql:"select tag from workflow_tags where player_id=? and tag='DECLARES'",args:[playerId]}));
    if(declared.length){
      return Response.json({error:`${player.name} is already on Declares and is intentionally hidden from Returning Player.`},{status:409});
    }

    const duplicate=rows(await c.execute({sql:"select id from players where lower(name)=lower(?) and draft_class=? and id<>?",args:[player.name,toDraftClass,playerId]}));
    if(duplicate.length){
      return Response.json({error:`${player.name} already has a ${toDraftClass} player record. Resolve that duplicate before moving the player.`},{status:409});
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
    const archivedCategories=[...filmCategories,"__COMMENTARY__","__GAME_LABEL__"];
    const placeholders=archivedCategories.map(()=>"?").join(",");
    const statements:any[]=[
      {
        sql:"insert into returning_player_reports(player_id,from_draft_class,to_draft_class,position,college,snapshot,moved_at) values(?,?,?,?,?,?,?) on conflict(player_id,from_draft_class,to_draft_class) do update set position=excluded.position,college=excluded.college,snapshot=excluded.snapshot,moved_at=excluded.moved_at",
        args:[playerId,fromDraftClass,toDraftClass,player.position,player.college||null,snapshot,now]
      },
      {sql:`delete from evaluations where player_id=? and category in (${placeholders})`,args:[playerId,...archivedCategories]},
      {sql:"delete from scouting_sessions where player_id=?",args:[playerId]},
      {sql:"delete from workflow_tags where player_id=? and tag in ('COMBINE','ALL_STAR')",args:[playerId]},
      {sql:"update players set draft_class=?,scouting_status=?,watch_order=?,updated_at=? where id=?",args:[toDraftClass,nextStatus,nextOrder,now,playerId]}
    ];
    await c.batch(statements,"write");
    const updated:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
    return Response.json({ok:true,player:updated,fromDraftClass,toDraftClass,hiddenFilmGrades,preservedScoutingNotes,priorReportSaved:true});
  }catch(e:any){
    return Response.json({error:"Could not move returning player",detail:e?.message},{status:500});
  }
}
