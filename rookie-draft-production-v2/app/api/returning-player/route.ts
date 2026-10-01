import {ensureTursoSchema,rows} from "@/lib/turso";

type Pos="QB"|"RB"|"WR"|"TE";
const FILM:Record<Pos,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};
const parse=(raw:any)=>{try{return JSON.parse(String(raw||"{}"))}catch{return {}}};

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||0);
    if(!draftClass)return Response.json({error:"draftClass required"},{status:400});
    const c=await ensureTursoSchema();
    const reportRows=rows(await c.execute({
      sql:"select r.player_id as playerId,r.from_draft_class as fromDraftClass,r.to_draft_class as toDraftClass,r.position,r.college,r.snapshot,r.moved_at as movedAt from returning_player_reports r join players p on p.id=r.player_id where r.to_draft_class=? and p.draft_class=? order by p.position,p.watch_order,p.name",
      args:[draftClass,draftClass]
    }));
    const reports=reportRows.map((r:any)=>{
      const snapshot=parse(r.snapshot);
      const evaluations=Array.isArray(snapshot?.evaluations)?snapshot.evaluations:[];
      const filmSet=new Set(FILM[String(r.position) as Pos]||[]);
      return {
        playerId:r.playerId,
        fromDraftClass:Number(r.fromDraftClass),
        toDraftClass:Number(r.toDraftClass),
        position:r.position,
        college:r.college,
        movedAt:r.movedAt,
        filmGrades:evaluations.filter((e:any)=>filmSet.has(String(e.category))).map((e:any)=>({category:e.category,value:e.value??e.commentary??null})),
        priorCommentary:evaluations.find((e:any)=>e.category==="__COMMENTARY__")?.commentary||null
      };
    });
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
    const placeholders=filmCategories.map(()=>"?").join(",");
    const statements:any[]=[
      {
        sql:"insert into returning_player_reports(player_id,from_draft_class,to_draft_class,position,college,snapshot,moved_at) values(?,?,?,?,?,?,?) on conflict(player_id,from_draft_class,to_draft_class) do update set position=excluded.position,college=excluded.college,snapshot=excluded.snapshot,moved_at=excluded.moved_at",
        args:[playerId,fromDraftClass,toDraftClass,player.position,player.college||null,snapshot,now]
      }
    ];
    if(filmCategories.length){
      statements.push({sql:`delete from evaluations where player_id=? and category in (${placeholders})`,args:[playerId,...filmCategories]});
    }
    statements.push(
      {sql:"delete from workflow_tags where player_id=? and tag in ('COMBINE','ALL_STAR')",args:[playerId]},
      {sql:"update players set draft_class=?,scouting_status=?,watch_order=?,updated_at=? where id=?",args:[toDraftClass,nextStatus,nextOrder,now,playerId]}
    );
    await c.batch(statements,"write");
    const updated:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
    return Response.json({ok:true,player:updated,fromDraftClass,toDraftClass,hiddenFilmGrades,preservedScoutingNotes:sessionRows.length,priorReportSaved:true});
  }catch(e:any){
    return Response.json({error:"Could not move returning player",detail:e?.message},{status:500});
  }
}
