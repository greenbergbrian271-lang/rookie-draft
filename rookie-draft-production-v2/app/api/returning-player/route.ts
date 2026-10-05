import {ensureTursoSchema,rows} from "@/lib/turso";
import {movePlayerToNextDraftClass,ReturningPlayerError} from "@/lib/returning-player";

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
    const c=await ensureTursoSchema();
    const result=await movePlayerToNextDraftClass(c,playerId,body?.fromDraftClass?Number(body.fromDraftClass):undefined);
    const now=new Date().toISOString();
    await c.execute({
      sql:"insert into draft_statuses(player_id,draft_class,status,note,set_method,verified_at,updated_at) values(?,?,?,?,?,?,?) on conflict(player_id,draft_class) do update set status=excluded.status,note=excluded.note,set_method=excluded.set_method,verified_at=excluded.verified_at,updated_at=excluded.updated_at",
      args:[playerId,result.fromDraftClass,"RETURNING_TO_SCHOOL","Recorded by Returning Player tool","MANUAL",now,now]
    });
    return Response.json(result);
  }catch(e:any){
    const status=e instanceof ReturningPlayerError?e.status:500;
    return Response.json({error:e?.message||"Could not move returning player"},{status});
  }
}
