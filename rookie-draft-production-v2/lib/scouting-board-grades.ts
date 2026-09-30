import {rows} from "./turso";
import {qbReference} from "./qb-reference";
import {rbReference,rbReferenceGeneratedAt} from "./rb-reference";
import {wrReference} from "./wr-reference";
import {workbookSecondary} from "./workbook-secondary";
import {currentCollegeStatsGeneratedAt,currentCollegeStatsReference} from "./current-college-stats-reference";
import {workbookScoutingGrade,preDraftGrade,draftAdjustedFinalGrade,type GlossaryRows} from "./scouting-formulas";
import {qbAnalyticalGrade,rbAnalyticalGrade,wrAnalyticalGrade,teAnalyticalGrade} from "./analytical-grades";
import {rbProductionGrade} from "./rb-grades";
import {wrProductionGrade} from "./wr-grades";
import {teProductionGrade} from "./te-grades";
import {combineGrade,percentRankInc} from "./combine-formulas";
import {getNflDraftPicks,normalizeDraftName} from "./nfl-draft-results";

export type BoardPosition="QB"|"RB"|"WR"|"TE";
export type BoardPlayer={
  id:string|number;
  name:string;
  position:BoardPosition;
  college?:string|null;
  draft_class:number;
  scouting_status:string;
  watch_order?:number|null;
  headshot_url?:string|null;
};
type DbClient={execute:(statement:any)=>Promise<any>};

const POSITIONS:BoardPosition[]=["QB","RB","WR","TE"];
const FILM:Record<BoardPosition,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};
const QB_ANALYTICS=[
  ["ADOT","AS",false,false],["QBR","AT",false,false],["Adjusted Y/A","AU",false,false],["Screen %","AV",true,true],
  ["ADJ Comp %","AW",false,true],["Clean Comp %","AX",false,true],["Big Time Throws","AY",false,false],["BTT %","AZ",false,true],
  ["TO Worthy Plays","BA",true,false],["TWP %","BB",true,true],["Time to Throw","BC",true,false],["Allowed Press. %","BD",true,true],
  ["20+ Comp %","BE",false,true],["PA BTT %","BF",false,true],["Pressure-to-Sack %","BG",true,true],["Pressured ADJ%","BH",false,true],
  ["Pressured BTT%","BI",false,true],["Pressured TWP%","BJ",true,true],["Scrambles","BK",false,false],["Scramble Yards","BL",false,false],
  ["Yards/Scramble","BM",false,false],["Rush Yard %","BN",false,true],["Press. Scrambles","BO",false,false],["Clean Scramble %","BP",true,true]
] as const;
const RB_ANALYTICS=[
  ["Fumble Grade","BA",false],["Elusive Rating","BB",false],["MTFs","BC",false],["Breakaway Runs","BD",false],
  ["Breakaway Yards","BE",false],["Breakaway %","BF",true],["Rush 1st Downs","BG",false],["1st Downs/ATT","BH",true],
  ["YAC/ATT","BI",false],["MTF/Att","BJ",true],["Y/RR","BK",false],["YAC/Rec","BL",false],["ADOT","BM",false],
  ["Rec First Downs","BN",false],["1st Downs/Tgt","BO",true],["Pass Block Grade","BP",false]
] as const;
const WR_ANALYTICS=[
  ["dropPct","Drop %","Drop %",true,true],["catchTrafficPct","Catch in Traffic %","Catch in Traffic %",false,true],
  ["firstDowns","1st Downs","1st Downs",false,false],["firstDownsPerTarget","1st Downs / Tgt","1st Downs / Tgt",false,false],
  ["targetsPerRoute","Targets / Route","Targets/Route",false,false],["firstDownsPerRoute","1st Downs / Route","1st Downs/Route",false,false],
  ["yrr","Y/RR","Y/RR",false,false],["yrrMan","Y/RR vs Man","Y/RR vs Man",false,false],["yrrZone","Y/RR vs Zone","Y/RR vs Zone",false,false],
  ["contestedPct","Contested Target %","Contested Target %",true,true],["airYardsPct","Air Yards %","Air Yards %",false,true],
  ["yacPerRec","YAC/Rec","YAC/Rec",false,false],["mtfs","MTFs","MTFs",false,false],["yardsPerRec","Yards/Rec","Yards/Rec",false,false],
  ["adot","ADOT","ADOT",false,false],["screenPct","Screen %","Screen %",true,true],["catchesInTraffic","Catches in Traffic","Catches in Traffic",false,false],
  ["runBlockGrade","Run Block Grade","Run Block Grade",false,false]
] as const;
const TE_ANALYTICS=[
  ["Drop %","AU",true,true],["Catch in Traffic %","AV",false,true],["1st Downs","AW",false,false],["1st Downs / Tgt","AX",false,true],
  ["Y/RR","AY",false,false],["Y/RR vs Man","AZ",false,false],["Y/RR vs Zone","BA",false,false],["Air Yard %","BB",false,true],
  ["YAC/Rec","BC",false,false],["MTFs","BD",false,false],["Yards/Rec","BE",false,false],["ADOT","BF",false,false],
  ["Catches in Traffic","BG",false,false],["Inline Snap %","BH",true,true],["Slot Snap %","BI",false,true],["Wide Snap %","BJ",false,true],
  ["Run Block Grade","BK",false,false],["Pass Block Grade","BL",false,false]
] as const;

const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
function num(v:any,pct=false){
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const raw=String(v).trim(),n=Number(raw.replace(/[%,$]/g,"").replace(/,/g,""));
  if(!Number.isFinite(n))return null;
  return pct||raw.includes("%")?n/100:n;
}
function heightInches(v:any){
  const s=String(v??"").trim(),m=s.match(/(\d+)\s*['′]\s*(\d+)?\s*([^"″]*)/);
  if(!m)return null;
  let inches=Number(m[1])*12+Number(m[2]||0);
  const frac=String(m[3]||"").trim();
  if(frac.includes("¼"))inches+=.25;else if(frac.includes("½"))inches+=.5;else if(frac.includes("¾"))inches+=.75;
  else{const fm=frac.match(/(\d+)\s*\/\s*(\d+)/);if(fm&&Number(fm[2]))inches+=Number(fm[1])/Number(fm[2])}
  return Number.isFinite(inches)?inches:null;
}
function sourceValue(row:any,key:string){
  if(!row)return null;
  const aliases:Record<string,string[]>={
    "Yards/Tgt":["Yards/Tgt","Yards/target"],"1st Downs / Tgt":["1st Downs / Tgt","1st/target"],
    "Targets/Route":["Targets/Route","Targets/Route Run"],"1st Downs/Route":["1st Downs/Route","1st Downs/Route Run"],
    "Contested Target %":["Contested Target %","contested_targets %"],"Screen %":["Screen %","Screen target %"],
    "40 Yard Dash":["40 Yard Dash","40-YD"],"Vertical":["Vertical","Vertical Jump"]
  };
  for(const k of aliases[key]||[key])if(row[k]!==undefined&&row[k]!==null&&row[k]!=="")return row[k];
  return null;
}
function enrichQB(row:any){
  const q:any={...row};q.Class??=q["Draft Class"];q["Career Starts"]??=q["Games Started"];q["Career Attempts"]??=q["Total Attempts"];q["Career Max YPG"]??=q["Max YPG"];
  q.Attempts??=q["Passing Attempts"];q["Completion %"]??=q["Comp %"];q.Yards??=q["Passing Yards"];q.Touchdowns??=q["Passing TDs"];
  q.Rushes??=q["Rushing Attempts"];q["Rush Yards"]??=q["Rushing Yards"];q["Rush Yards/Attempt"]??=q["Rush Yds/Att"];q["Rush Touchdowns"]??=q["Rushing TDs"];
  q["Screen %"]??=q["Screen throw %"];q["ADJ Comp %"]??=q["Adjusted Comp %"];q["Time to Throw"]??=q["Time to throw"];q["40 Yard Dash"]??=q["40-YD"];
  const h=heightInches(q.Height),w=num(q.Weight),forty=num(q["40 Yard Dash"]);if(q.BMI==null&&h&&w)q.BMI=w*703/(h*h);if(q["Speed Score"]==null&&w&&forty)q["Speed Score"]=w*200/Math.pow(forty,4);return q;
}
function enrichRB(row:any){
  const r:any={...row};r.Class??=r["Draft Class"];r.Carries??=r["Rush Attempts"];r["Yards/Carry"]??=r["Yards/Attempt"];r.Touchdowns??=r["Rush Touchdowns"];
  r["40 Yard Dash"]??=r["40-YD"];r["1st Downs/ATT"]??=r["1st/rush"];r["1st Downs/Tgt"]??=r["1st/target"];
  const h=heightInches(r.Height),w=num(r.Weight),forty=num(r["40 Yard Dash"]);if(r.BMI==null&&h&&w)r.BMI=w*703/(h*h);if(r["Speed Score"]==null&&w&&forty)r["Speed Score"]=w*200/Math.pow(forty,4);
  r["FR + Soph Rush Yd"]??=(num(r["FR Rush Yds"])||0)+(num(r["Soph Rush Yds"])||0);
  const recs=["FR Rec","Soph Rec","JR Rec","SR Rec"].map(k=>num(r[k])||0);if(r["Single Season Rec"]==null)r["Single Season Rec"]=Math.max(0,...recs);if(r["Career Rec"]==null)r["Career Rec"]=recs.reduce((a,b)=>a+b,0);return r;
}
function enrichWR(row:any){
  const q:any={...row};q.Class??=q["Draft Class"];q["Yards/Tgt"]??=q["Yards/target"];q["1st Downs / Tgt"]??=q["1st/target"];q["Targets/Route"]??=q["Targets/Route Run"];
  q["1st Downs/Route"]??=q["1st Downs/Route Run"];q["Contested Target %"]??=q["contested_targets %"];q["Screen %"]??=q["Screen target %"];q["40 Yard Dash"]??=q["40-YD"];
  q.Vertical??=q["Vertical Jump"];q["Weighted Dom Rtg"]??=q["Weightd Dom Rtg"];const h=heightInches(q.Height),w=num(q.Weight),forty=num(q["40 Yard Dash"]);
  if(q.BMI==null&&h&&w)q.BMI=w*703/(h*h);if(q["Speed Score"]==null&&w&&forty)q["Speed Score"]=w*200/Math.pow(forty,4);return q;
}
function enrichTE(row:any){
  const q:any={...row};q.Class??=q["Draft Class"];q["Yards/Tgt"]??=q["Yards/target"];q["1st Downs / Tgt"]??=q["1st/target"];q["Inline Snap %"]??=q["Inline Rate"];
  q["Slot Snap %"]??=q["Slot Rate"];q["Wide Snap %"]??=q["Wide Rate"];q["40 Yard Dash"]??=q["40-YD"];q["Bench Reps"]??=q["Bench Press"];q["Weighted Dom Rtg"]??=q["Weightd Dom Rtg"];
  const h=heightInches(q.Height),w=num(q.Weight),forty=num(q["40 Yard Dash"]);if(q.BMI==null&&h&&w)q.BMI=w*703/(h*h);if(q["Speed Score"]==null&&w&&forty)q["Speed Score"]=w*200/Math.pow(forty,4);return q;
}
function mergeReference(reference:readonly any[],current:any[],enrich:(row:any)=>any){
  const merged=new Map<string,any>();for(const row of reference||[])if(row?.Player)merged.set(norm(row.Player),{...row});
  for(const row of current||[]){const key=norm(row?.Player);if(key)merged.set(key,{...(merged.get(key)||{}),...row})}
  return [...merged.values()].map(enrich);
}
function playerDataRows(table:readonly (readonly any[])[]){
  const [header,...body]=table||[],headers=(header||[]).map(v=>String(v??"").trim());
  return body.filter(r=>Array.isArray(r)&&r.some(v=>v!==null&&v!==undefined&&String(v).trim()!=="")).map(row=>{
    const out:any={};for(let i=0;i<headers.length;i++)if(headers[i])out[headers[i]]=row[i]??null;return out;
  });
}
function applyCombine(base:any[],combine:any[],position:BoardPosition){
  const map=new Map(combine.map(r=>[norm(r.player_name),r])),enrich=position==="QB"?enrichQB:position==="RB"?enrichRB:position==="WR"?enrichWR:enrichTE;
  return base.map(row=>{
    const hit:any=map.get(norm(row?.Player));if(!hit)return row;const next:any={...row};
    if(hit.height!=null&&hit.height!=="")next.Height=hit.height;if(hit.weight!=null)next.Weight=Number(hit.weight);if(hit.forty!=null)next["40 Yard Dash"]=Number(hit.forty);
    if(hit.bench!=null){next["Bench Reps"]=Number(hit.bench);next["Bench Press"]=Number(hit.bench)}
    if(hit.vertical!=null){next.Vertical=Number(hit.vertical);next["Vertical Jump"]=Number(hit.vertical)}
    if(hit.broad_jump!=null)next["Broad Jump"]=Number(hit.broad_jump);if(hit.cone!=null)next["3 Cone"]=Number(hit.cone);if(hit.shuttle!=null)next.Shuttle=Number(hit.shuttle);
    return enrich(next);
  });
}
async function loadImports(db:DbClient,draftClass:number){
  const [latestImport,combineRows]=await Promise.all([
    db.execute("select result,imported_at from pff_imports order by imported_at desc limit 1"),
    db.execute({sql:"select cr.*,p.name as roster_name,p.position from combine_results cr join players p on p.id=cr.player_id where p.draft_class=?",args:[draftClass]})
  ]);
  const latest=rows(latestImport)[0] as any;let parsed:any={};try{parsed=latest?.result?JSON.parse(String(latest.result)):{}}catch{}
  const importedAt=String(latest?.imported_at||""),combine=rows(combineRows);
  const byPos=(position:BoardPosition)=>combine.filter((r:any)=>r.position===position);
  const qbBlock=parsed?.QB||{},rbBlock=parsed?.RB||{};
  const qbCurrent=[...(qbBlock.below?.primary||[]),...(qbBlock.above?.primary||[])];
  const rbCurrent=importedAt>rbReferenceGeneratedAt?[...(rbBlock.below?.primary||[]),...(rbBlock.above?.primary||[])]:[];
  const qb=applyCombine(mergeReference(qbReference as readonly any[],qbCurrent,enrichQB),byPos("QB"),"QB");
  const rb=applyCombine(mergeReference(rbReference as readonly any[],rbCurrent,enrichRB),byPos("RB"),"RB");
  const wr=applyCombine((wrReference as readonly any[]).map(r=>enrichWR({...r})),byPos("WR"),"WR");
  const te=applyCombine(playerDataRows(workbookSecondary.teData as readonly (readonly any[])[]).map(enrichTE),byPos("TE"),"TE");
  return {QB:qb,RB:rb,WR:wr,TE:te};
}
async function loadCollegeRows(db:DbClient){
  const reference=(currentCollegeStatsReference as readonly any[]).map(r=>({...r}));
  const live=rows(await db.execute("select team,subdivision,completions,pass_attempts as passAttempts,pass_yards as passYards,pass_tds as passTDs,rush_yards as rushYards,rush_tds as rushTDs,total_plays as totalPlays,updated_at as updatedAt from college_stats"));
  const map=new Map(reference.map(r=>[norm(r.team),r] as [string,any]));
  for(const row of live){if(String(row.updatedAt||"")>=currentCollegeStatsGeneratedAt)map.set(norm(row.team),{...(map.get(norm(row.team))||{}),...row})}
  return [...map.values()];
}
function earlyDeclare(position:BoardPosition,vals:Record<string,any>,imported:any){
  if(position==="QB")return false;if(position==="RB"){const override=String(vals["Early Declare"]??"").trim();if(/^yes$/i.test(override))return true;if(/^no$/i.test(override))return false;const token=String(imported?.Class??imported?.["Draft Class"]??"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return /(JR|SO|FR)$/.test(token)}
  if(position==="WR"){const v=vals["Early Declare?"]??imported?.["Early Declare?"]??false;return v===true||["yes","true","1"].includes(String(v).trim().toLowerCase())}
  const v=vals["Early Declare"];return v===true||["yes","true","1"].includes(String(v??"").trim().toLowerCase());
}
function percentile(values:number[],value:number|null,inverse=false,significance=3){
  if(value==null)return null;const base=percentRankInc(values,value,significance);return base==null?null:(inverse?1-base:base);
}
function makeImportMap(imports:any[]){return new Map(imports.map(r=>[norm(r?.Player??String(r?.["Player, College"]||"").split(",")[0]),r] as [string,any]))}
function combinePopulation(position:BoardPosition,imports:any[],positionPlayers:BoardPlayer[],importMap:Map<string,any>){
  const source=position==="RB"?positionPlayers.map(p=>importMap.get(norm(p.name))||{}):imports;
  return {
    forty:source.map(r=>num(sourceValue(r,"40 Yard Dash"))).filter((v):v is number=>v!=null),
    speedScore:source.map(r=>num(r?.["Speed Score"])).filter((v):v is number=>v!=null),
    broadJump:position==="QB"||position==="RB"?source.map(r=>num(r?.["Broad Jump"])).filter((v):v is number=>v!=null):[],
    handSize:position==="WR"||position==="TE"?source.map(r=>num(r?.["Hand Size"])).filter((v):v is number=>v!=null):[],
    vertical:position==="WR"?source.map(r=>num(sourceValue(r,"Vertical"))).filter((v):v is number=>v!=null):[],
    benchReps:position==="TE"?source.map(r=>num(r?.["Bench Reps"])).filter((v):v is number=>v!=null):[]
  };
}
function combineFor(position:BoardPosition,r:any,pop:any,glossary:GlossaryRows){
  const h=heightInches(r?.Height),weight=num(r?.Weight),forty=num(sourceValue(r,"40 Yard Dash"));
  const bmi=num(r?.BMI)??(h&&weight?weight*703/(h*h):null),speed=num(r?.["Speed Score"])??(weight&&forty?weight*200/Math.pow(forty,4):null);
  const input:any={bmi:bmi??undefined,forty:forty??undefined,speedScore:speed??undefined};
  if(position==="QB"||position==="RB")input.broadJump=num(r?.["Broad Jump"])??undefined;
  if(position==="WR"){input.handSize=num(r?.["Hand Size"])??undefined;input.vertical=num(sourceValue(r,"Vertical"))??undefined;input.weight=weight??undefined;input.heightInches=h??undefined}
  if(position==="TE"){input.handSize=num(r?.["Hand Size"])??undefined;input.benchReps=num(r?.["Bench Reps"])??undefined;input.weight=weight??undefined;input.heightInches=h??undefined}
  return Object.values(input).some(v=>v!=null)?combineGrade(position,input,pop,glossary):null;
}
function rbProductionPopulation(imports:any[],positionPlayers:BoardPlayer[],importMap:Map<string,any>){
  return {
    yardsPerCarry:imports.map(r=>num(r["Yards/Carry"]??r["Yards/Attempt"])).filter((v):v is number=>v!=null),
    yardsPerReception:imports.map(r=>num(r["Yards/Reception"])).filter((v):v is number=>v!=null),
    yardsPerTouch:imports.map(r=>num(r["Yards/Touch"])).filter((v):v is number=>v!=null),
    yptp:imports.map(r=>num(r.YPTP)).filter((v):v is number=>v!=null),
    recShare:imports.map(r=>num(r["Rec Share %"],true)).filter((v):v is number=>v!=null),
    domRtg:imports.map(r=>num(r["Dom Rtg"],true)).filter((v):v is number=>v!=null),
    speedScore:positionPlayers.map(p=>num(importMap.get(norm(p.name))?.["Speed Score"])).filter((v):v is number=>v!=null)
  };
}
function wrProductionPopulation(imports:any[]){
  return {
    yardsPerReception:imports.map(r=>num(sourceValue(r,"Yards/Rec"))).filter((v):v is number=>v!=null),
    yardsPerTarget:imports.map(r=>num(sourceValue(r,"Yards/Tgt"))).filter((v):v is number=>v!=null),
    targetShare:imports.map(r=>num(sourceValue(r,"Target %"),true)).filter((v):v is number=>v!=null),
    catchPct:imports.map(r=>num(sourceValue(r,"Catch %"),true)).filter((v):v is number=>v!=null),
    yptpa:imports.map(r=>num(sourceValue(r,"YPTPA"))).filter((v):v is number=>v!=null),
    weightedDomRtg:imports.map(r=>num(sourceValue(r,"Weighted Dom Rtg"),true)).filter((v):v is number=>v!=null),
    domRtg:imports.map(r=>num(sourceValue(r,"Dom Rtg"),true)).filter((v):v is number=>v!=null),
    speedScore:imports.map(r=>num(r["Speed Score"])).filter((v):v is number=>v!=null)
  };
}
function teProductionPopulation(imports:any[]){return wrProductionPopulation(imports)}
function rbProdMetrics(r:any,c:any){
  const carries=num(r.Carries??r["Rush Attempts"]),rushYards=num(r["Rush Yards"]),recs=num(r.Receptions),recYards=num(r["Rec Yards"]);
  const rushTd=num(r["Rush Touchdowns"])||0,recTd=num(r["Rec Touchdowns"])||0,rushY=rushYards||0,recY=recYards||0;
  const teamY=(num(c.rushYards)||0)+(num(c.passYards)||0),teamTd=(num(c.rushTDs)||0)+(num(c.passTDs)||0),totalTouches=(carries||0)+(recs||0);
  return {
    carries,receptions:recs,
    yardsPerCarry:carries&&rushYards!=null?rushYards/carries:null,
    yardsPerReception:recs&&recYards!=null?recYards/recs:null,
    yardsPerTouch:totalTouches&&rushYards!=null&&recYards!=null?(rushYards+recYards)/totalTouches:null,
    yptp:num(c.totalPlays)?(rushY+recY)/(num(c.totalPlays)||1):num(r.YPTP),
    recShare:num(c.completions)?(recs||0)/(num(c.completions)||1):num(r["Rec Share %"],true),
    domRtg:teamY&&teamTd?(((rushY+recY)/teamY)+((rushTd+recTd)/teamTd))/2:num(r["Dom Rtg"],true)
  };
}
function wrProdMetrics(r:any,c:any){
  const receptions=num(r.Receptions),targets=num(r.Targets),yards=num(r.Yards),tds=num(r.Touchdowns),attempts=num(c.passAttempts),teamYards=num(c.passYards),teamTds=num(c.passTDs);
  const ydShare=yards!=null&&teamYards?yards/teamYards:null,tdShare=tds!=null&&teamTds?tds/teamTds:null;
  return {
    yardsPerReception:num(sourceValue(r,"Yards/Rec"))??(receptions&&yards!=null?yards/receptions:null),
    yardsPerTarget:num(sourceValue(r,"Yards/Tgt"))??(targets&&yards!=null?yards/targets:null),
    catchPct:num(sourceValue(r,"Catch %"),true)??(receptions!=null&&targets?receptions/targets:null),
    targetShare:num(sourceValue(r,"Target %"),true)??(targets!=null&&attempts?targets/attempts:null),
    yptpa:num(sourceValue(r,"YPTPA"))??(yards!=null&&attempts?yards/attempts:null),
    weightedDomRtg:num(sourceValue(r,"Weighted Dom Rtg"),true)??(ydShare!=null&&tdShare!=null?ydShare*.8+tdShare*.2:null),
    domRtg:num(sourceValue(r,"Dom Rtg"),true)??(ydShare!=null&&tdShare!=null?(ydShare+tdShare)/2:null)
  };
}
function teProdMetrics(r:any,c:any){
  const receptions=num(r.Receptions)||0,targets=num(r.Targets)||0,yards=num(r.Yards)||0,tds=num(r.Touchdowns)||0;
  const ydShare=num(c.passYards)?yards/(num(c.passYards)||1):null,tdShare=num(c.passTDs)?tds/(num(c.passTDs)||1):null;
  const career=[r["FR Yds/Rec"],r["Soph Yds/Rec"],r["JR Yds/Rec"],r["SR Yds/Rec"]].map(v=>num(v)).filter((v):v is number=>v!=null);
  return {
    yardsPerReception:num(r["Yards/Rec"])??(receptions?yards/receptions:null),yardsPerTarget:num(r["Yards/Tgt"])??(targets?yards/targets:null),
    targetShare:num(r["Target %"],true)??(num(c.passAttempts)?targets/(num(c.passAttempts)||1):null),catchPct:num(r["Catch %"],true)??(targets?receptions/targets:null),
    yptpa:num(r.YPTPA)??(num(c.passAttempts)?yards/(num(c.passAttempts)||1):null),weightedDomRtg:num(r["Weighted Dom Rtg"],true)??(ydShare!=null&&tdShare!=null?ydShare*.8+tdShare*.2:null),
    domRtg:num(r["Dom Rtg"],true)??(ydShare!=null&&tdShare!=null?(ydShare+tdShare)/2:null),maxYardsPerRec:num(r["Max Yds/Rec"])??(career.length?Math.max(...career):null)
  };
}

export async function buildBoardGradeRows(input:{
  db:DbClient;
  draftClass:number;
  players:BoardPlayer[];
  evaluations:any[];
  sessions:any[];
  glossary:GlossaryRows;
}){
  const {db,draftClass,players,evaluations,sessions,glossary}=input;
  const [imports,colleges,draftPicks]=await Promise.all([loadImports(db,draftClass),loadCollegeRows(db),getNflDraftPicks(draftClass)]);
  const draftPickMap=new Map(draftPicks.map(p=>[p.pos+"|"+normalizeDraftName(p.name),p] as const));
  const collegeMap=new Map(colleges.map((r:any)=>[norm(r.team),r] as [string,any]));
  const evalMap=new Map<string,Record<string,any>>();
  for(const e of evaluations){const id=String(e.player_id),target=evalMap.get(id)||{};target[String(e.category)]=e.value??e.commentary;evalMap.set(id,target)}
  const sessionMap=new Map<string,number>(sessions.map((s:any)=>[String(s.player_id),Number(s.game_count)||0] as [string,number]));
  const importMaps=new Map<BoardPosition,Map<string,any>>();
  for(const position of POSITIONS)importMaps.set(position,makeImportMap(imports[position]||[]));

  const byPosition=new Map<BoardPosition,BoardPlayer[]>();
  for(const position of POSITIONS)byPosition.set(position,players.filter(p=>p.position===position));
  const combinePops=new Map<BoardPosition,any>();
  for(const position of POSITIONS)combinePops.set(position,combinePopulation(position,imports[position]||[],byPosition.get(position)||[],importMaps.get(position)!));

  const rbPop=rbProductionPopulation(imports.RB||[],byPosition.get("RB")||[],importMaps.get("RB")!);
  const wrPop=wrProductionPopulation(imports.WR||[]);
  const tePop=teProductionPopulation(imports.TE||[]);

  function valuesFor(p:BoardPlayer){
    const vals=evalMap.get(String(p.id))||{},live=sessionMap.get(String(p.id))||0,legacy=String(vals["__COMMENTARY__"]??"").trim();
    return {vals,games:live>0?live:(legacy?1:0)};
  }
  function importedFor(p:BoardPlayer){return importMaps.get(p.position)?.get(norm(p.name))||{}}
  function fieldsFor(p:BoardPlayer){
    const {vals,games}=valuesFor(p);return {...importedFor(p),...vals,"Games watched":games,"Games Watched":games};
  }
  function manualScouting(p:BoardPlayer){
    const {vals}=valuesFor(p);return workbookScoutingGrade(p.position,FILM[p.position].map(k=>num(vals[k])??NaN),fieldsFor(p),glossary);
  }
  function analytical(p:BoardPlayer,scout:number|null){
    const r=importedFor(p),position=p.position,all=imports[position]||[];
    if(position==="QB"){
      if(scout==null)return null;const record:Record<string,number|null>={};
      for(const [label,sheet,inverse,pct] of QB_ANALYTICS){const pop=all.map(x=>num(x[label],pct)).filter((v):v is number=>v!=null),raw=num(r[label],pct);record[sheet]=percentile(pop,raw,inverse)}
      record.pressureToSack=num(r["Pressure-to-Sack %"],true);return qbAnalyticalGrade(scout,record,glossary);
    }
    if(position==="RB"){
      if(scout==null)return null;const record:Record<string,number|null>={};
      for(const [label,sheet,pct] of RB_ANALYTICS){const pop=all.map(x=>num(x[label],pct)).filter((v):v is number=>v!=null),raw=num(r[label],pct);record[sheet]=percentile(pop,raw)}
      return rbAnalyticalGrade(scout,record,glossary);
    }
    if(position==="WR"){
      const record:Record<string,number|null>={};
      for(const [key,_label,source,inverse,pct] of WR_ANALYTICS){const pop=all.map(x=>num(sourceValue(x,source),pct)).filter((v):v is number=>v!=null),raw=num(sourceValue(r,source),pct);record[key]=percentile(pop,raw,inverse)}
      const adot=num(sourceValue(r,"ADOT")),contested=num(sourceValue(r,"Contested Target %"),true);
      return wrAnalyticalGrade(scout,record,adot!=null&&contested!=null&&adot<=13&&contested>=.23,glossary);
    }
    if(scout==null)return null;const record:Record<string,number|null>={};
    for(const [label,sheet,inverse,pct] of TE_ANALYTICS){const pop=all.map(x=>num(x[label],pct)).filter((v):v is number=>v!=null),raw=num(r[label],pct);record[sheet]=percentile(pop,raw,inverse)}
    return teAnalyticalGrade(scout,record,glossary);
  }
  function production(p:BoardPlayer,manual:number|null){
    const r=importedFor(p),c=collegeMap.get(norm(p.college))||{},position=p.position;
    if(position==="QB")return null;
    if(position==="RB"){
      if(manual==null)return null;const m=rbProdMetrics(r,c);
      return rbProductionGrade({scouting:manual,yardsPerCarry:m.yardsPerCarry,yardsPerReception:m.yardsPerReception,yardsPerTouch:m.yardsPerTouch,yptp:m.yptp,recShare:m.recShare,domRtg:m.domRtg,
        speedScore:num(r["Speed Score"]),receptions:m.receptions,carries:m.carries,combineScore:combineFor("RB",r,combinePops.get("RB"),glossary),
        frSophRushYd:num(r["FR + Soph Rush Yd"]),singleSeasonRec:num(r["Single Season Rec"]),careerRec:num(r["Career Rec"]),isNonFbs:c?.subdivision==="FCS"},rbPop,glossary);
    }
    if(position==="WR"){
      const m=wrProdMetrics(r,c),frY=num(r["FR Yards"]),soY=num(r["Soph Yards"]),frTd=num(r["FR TDs"]),soTd=num(r["Soph TDs"]);
      return wrProductionGrade({scouting:manual,yardsPerReception:m.yardsPerReception,yardsPerTarget:m.yardsPerTarget,targetShare:m.targetShare,catchPct:m.catchPct,yptpa:m.yptpa,
        weightedDomRtg:m.weightedDomRtg,domRtg:m.domRtg,speedScore:num(r["Speed Score"]),combineScore:combineFor("WR",r,combinePops.get("WR"),glossary),
        maxFrSophYards:frY==null&&soY==null?null:Math.max(frY??0,soY??0),maxFrSophTds:frTd==null&&soTd==null?null:Math.max(frTd??0,soTd??0),isNonFbs:c?.subdivision==="FCS"},wrPop,glossary);
    }
    if(manual==null)return null;const m=teProdMetrics(r,c);
    return teProductionGrade({scouting:manual,yardsPerReception:m.yardsPerReception,yardsPerTarget:m.yardsPerTarget,targetShare:m.targetShare,catchPct:m.catchPct,yptpa:m.yptpa,
      weightedDomRtg:m.weightedDomRtg,domRtg:m.domRtg,speedScore:num(r["Speed Score"]),combineScore:combineFor("TE",r,combinePops.get("TE"),glossary),
      maxYardsPerRec:m.maxYardsPerRec,isNonFbs:c?.subdivision==="FCS"},tePop,glossary);
  }

  const out=[];
  for(const p of players){
    const manual=manualScouting(p);
    let productionGrade=production(p,manual),analyticalGrade=analytical(p,manual),scoutingGrade=manual;
    if(p.position==="WR"&&valuesFor(p).games<1){
      const fallback=[productionGrade,analyticalGrade].filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));
      scoutingGrade=fallback.length?fallback.reduce((s,v)=>s+v,0)/fallback.length:null;
    }
    if(scoutingGrade==null){
      out.push({...p,gamesWatched:valuesFor(p).games,scoutingGrade:null,productionGrade,analyticalGrade,preDraftGrade:null,finalGrade:null,authoritativeGrade:null,gradeSource:"Pre-Draft",draftResult:null});
      continue;
    }
    if(p.position==="WR"){productionGrade=production(p,manual);analyticalGrade=analytical(p,manual)}
    const {vals}=valuesFor(p),early=earlyDeclare(p.position,vals,importedFor(p));
    const pre=preDraftGrade(p.position,scoutingGrade,productionGrade,analyticalGrade,early,glossary);
    const livePick=draftPickMap.get(p.position+"|"+normalizeDraftName(p.name));
    const storedResult=String(vals["Draft Result"]??"").trim();
    const storedTeam=num(vals["Team Score (10)"]),storedCapital=num(vals["Draft Capital Score (10)"]);
    const team=livePick?.teamScore??storedTeam,capital=livePick?.draftCapitalScore??storedCapital;
    const draftResult=livePick?("Pick "+livePick.overall+", "+livePick.team):storedResult;
    const hasFinal=Boolean(livePick)||(team!=null&&capital!=null&&draftResult!==""&&!/^pending$/i.test(draftResult));
    const finalGrade=hasFinal&&team!=null&&capital!=null?draftAdjustedFinalGrade(p.position,pre,team,capital,glossary):null;
    out.push({...p,gamesWatched:valuesFor(p).games,scoutingGrade,productionGrade,analyticalGrade,preDraftGrade:pre,finalGrade,authoritativeGrade:finalGrade??pre,gradeSource:finalGrade==null?"Pre-Draft":"Final",draftResult:draftResult||null,draftTeam:livePick?.team||null});
  }
  return out;
}
