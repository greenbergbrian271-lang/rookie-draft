import {ensureTursoSchema,rows} from "@/lib/turso";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";
import {buildBoardGradeRows,type BoardPlayer} from "@/lib/scouting-board-grades";
import {glossaryNumber,productionAnalyticalDisabled,scoutingWeightRows} from "@/lib/scouting-formulas";

const FILM:Record<string,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};
const round=(v:any)=>typeof v==="number"&&Number.isFinite(v)?Math.round(v*100)/100:null;
const pct=(v:number)=>Math.round(v*1000)/10+"%";

function preDraftFormula(position:string,g:any){
  if(productionAnalyticalDisabled(g))return position==="QB"?"Scouting Grade only":"Scouting Grade + Early Declare bonus (when applicable)";
  if(position==="QB")return `Scouting × ${pct(glossaryNumber(80,g))} + Analytical × ${pct(glossaryNumber(81,g))} + positive Analytical-over-Scouting bonus × ${glossaryNumber(76,g)}`;
  const rr=position==="TE"?[88,89,90]:[83,84,85];
  return `Scouting × ${pct(glossaryNumber(rr[0],g))} + Production × ${pct(glossaryNumber(rr[1],g))} + Analytical × ${pct(glossaryNumber(rr[2],g))} + upside bonus (cap ${round(glossaryNumber(77,g))}) + Early Declare bonus`;
}
function finalFormula(position:string,g:any){
  const r=position==="QB"?[23,24]:position==="RB"?[26,27]:position==="WR"?[29,30]:[32,33];
  return `Pre-Draft + (Team Score − 5) × 2 × ${round(glossaryNumber(r[0],g))} + (Draft Capital Score − 5) × 2 × ${round(glossaryNumber(r[1],g))}`;
}
function filmInputs(position:string,evals:any[],g:any){
  const map=new Map(evals.map(x=>[String(x.category),x]));
  const weights=(scoutingWeightRows as any)[position]||[];
  return (FILM[position]||[]).map((label,i)=>{
    const row=map.get(label),value=row?.value==null?null:Number(row.value),weight=glossaryNumber(Number(weights[i]||0),g);
    return {label,value:value!=null&&Number.isFinite(value)?value:null,weight,weightedContribution:value!=null&&Number.isFinite(value)?round(value*weight):null};
  });
}

export async function GET(req:Request){
  try{
    const playerId=Number(new URL(req.url).searchParams.get("playerId"));
    if(!playerId)return Response.json({error:"playerId required"},{status:400});
    const c=await ensureTursoSchema(),player=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0] as any;
    if(!player)return Response.json({error:"Player not found"},{status:404});
    if(Number(player.draft_class)<2027){
      return Response.json({player:{id:player.id,name:player.name,position:player.position,draftClass:Number(player.draft_class)},frozen:true,summary:"Historical grades are frozen from the archived scouting workbook. Recalculation is intentionally disabled for locked historical classes.",steps:[]});
    }
    const draftClass=Number(player.draft_class),[glossary,players,evaluations,sessions]=await Promise.all([
      loadScoutingGlossary(c),
      c.execute({sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url from players where draft_class=? and position in ('QB','RB','WR','TE') and (scouting_status='WATCHED' or id=?) order by position,watch_order,name",args:[draftClass,playerId]}).then(rows),
      c.execute({sql:"select e.player_id,e.category,e.value,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? and p.position in ('QB','RB','WR','TE')",args:[draftClass]}).then(rows),
      c.execute({sql:"select s.player_id,count(*) as game_count from scouting_sessions s join players p on p.id=s.player_id where p.draft_class=? group by s.player_id",args:[draftClass]}).then(rows)
    ]);
    const board=await buildBoardGradeRows({db:c,draftClass,players:players as BoardPlayer[],evaluations,sessions,glossary});
    const target=(board as any[]).find(x=>Number(x.id)===playerId);
    if(!target)return Response.json({error:"Grade engine could not resolve this player."},{status:422});
    const mine=(evaluations as any[]).filter(x=>Number(x.player_id)===playerId);
    const values=Object.fromEntries(mine.map(x=>[String(x.category),x.value??x.commentary]));
    const film=filmInputs(String(player.position),mine,glossary);
    const filmMissing=film.filter(x=>x.value==null).map(x=>x.label);
    const provisionalScoutingGrade=target.scoutingGradeOrigin==="WR_NO_GAMES_FALLBACK";
    const provisionalNote=provisionalScoutingGrade?"No WR game log exists yet, so the workbook fallback is being used: Scouting Grade = average of Production and Analytical. This is model-derived, not a film grade.":null;
    const productionDescription=player.position==="QB"
      ?"Quarterback production is intentionally not a separate grade in the current model."
      :player.position==="RB"
        ?"Percentile-weighted rushing/receiving efficiency, usage, dominance, athletic testing and workbook bonuses."
        :player.position==="WR"
          ?"Percentile-weighted efficiency, target share, dominance, athletic testing, breakout bonuses and competition adjustment."
          :"Percentile-weighted receiving efficiency, target share, dominance, athletic testing, blocking/testing inputs and workbook bonuses.";
    const analyticalDescription=player.position==="QB"
      ?"Percentile clusters for passing efficiency, accuracy, pressure response, mobility and big-time/turnover-worthy play profile."
      :player.position==="RB"
        ?"Percentile clusters for ball security, elusiveness, explosive runs, first downs, efficiency, receiving and pass protection."
        :player.position==="WR"
          ?"Percentile clusters for hands, down-to-down efficiency, YAC, depth/air-yards profile, contested work and blocking."
          :"Percentile clusters for hands, receiving efficiency, blocking, YAC/depth, contested work and alignment/size indicators.";
    const steps=[
      {key:"scouting",label:provisionalScoutingGrade?"Scouting Grade · Provisional":"Scouting Grade",value:round(target.scoutingGrade),formula:provisionalScoutingGrade?"WR workbook fallback: average of Production Grade and Analytical Grade because Games Watched < 1.":"Weighted Film traits + workbook scouting adjustments"+(player.position==="QB"?" + QB career-experience adjustment":""),dependsOn:provisionalScoutingGrade?["Production Grade","Analytical Grade","Games watched = 0"]:["Film evaluations","Games watched","Injury / off-field / all-star / combine adjustments"],status:target.scoutingGrade==null?"missing":provisionalScoutingGrade?"provisional":"ok"},
      ...(player.position==="QB"?[]:[{key:"production",label:"Production Grade",value:round(target.productionGrade),formula:productionDescription,dependsOn:["Active Player Data","Eligible percentile population","College team context","Combine/pro-day inputs"],status:target.productionGrade==null?"missing":"ok"}]),
      {key:"analytical",label:"Analytical Grade",value:round(target.analyticalGrade),formula:analyticalDescription,dependsOn:["Active Player Data","Position-specific percentile distributions"],status:target.analyticalGrade==null?"missing":"ok"},
      {key:"predraft",label:"Pre-Draft Grade",value:round(target.preDraftGrade),formula:preDraftFormula(String(player.position),glossary),dependsOn:player.position==="QB"?["Scouting Grade","Analytical Grade"]:["Scouting Grade","Production Grade","Analytical Grade","Early Declare signal"],status:target.preDraftGrade==null?"missing":"ok"},
      {key:"final",label:"Final Grade",value:round(target.finalGrade),formula:finalFormula(String(player.position),glossary),dependsOn:["Pre-Draft Grade","NFL team situation score","Draft capital score"],status:target.finalGrade==null?"missing":"ok"}
    ];
    return Response.json({
      player:{id:player.id,uid:player.player_uid,name:player.name,position:player.position,college:player.college,draftClass},
      frozen:false,
      gradeSource:target.gradeSource,
      scoutingGradeOrigin:target.scoutingGradeOrigin,
      provisionalScoutingGrade,
      provisionalNote,
      authoritativeGrade:round(target.authoritativeGrade),
      draftResult:target.draftResult,
      steps,
      film:{inputs:film,missing:filmMissing,weightedBase:round(film.reduce((s,x)=>s+(x.weightedContribution||0),0))},
      adjustments:{
        injury:values["Injury Concerns"]??null,offField:values["Off-Field?"]??null,allStar:values["All Star Game?"]??null,
        combineInvite:values["Combine Invite?"]??null,earlyDeclare:values["Early Declare"]??null,
        teamScore:values["Team Score (10)"]??null,draftCapitalScore:values["Draft Capital Score (10)"]??null
      },
      engine:"scouting-board-grades → scouting-formulas / position production + analytical engines",
      recalculatedAt:new Date().toISOString()
    });
  }catch(e:any){return Response.json({error:e?.message||"Could not explain grade"},{status:500})}
}
