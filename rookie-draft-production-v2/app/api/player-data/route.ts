import {ensureTursoSchema,rows} from "@/lib/turso";
import {qbReference} from "@/lib/qb-reference";
import {rbReference,rbReferenceGeneratedAt} from "@/lib/rb-reference";
import {wrReference} from "@/lib/wr-reference";
import {workbookSecondary} from "@/lib/workbook-secondary";
import {currentCollegeStatsReference} from "@/lib/current-college-stats-reference";

const CANONICAL_REFERENCE_SEASON=2025;
const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const number=(v:any)=>{
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const n=Number(String(v).replace(/[%,$]/g,"").replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
};
function heightInches(v:any){
  const s=String(v??"").trim();
  const m=s.match(/(\d+)\s*['′]\s*(\d+)?\s*([^"″]*)/);
  if(!m)return null;
  let inches=Number(m[1])*12+Number(m[2]||0);
  const frac=String(m[3]||"").trim();
  if(frac.includes("¼"))inches+=.25;
  else if(frac.includes("½"))inches+=.5;
  else if(frac.includes("¾"))inches+=.75;
  else {
    const fm=frac.match(/(\d+)\s*\/\s*(\d+)/);
    if(fm&&Number(fm[2]))inches+=Number(fm[1])/Number(fm[2]);
  }
  return Number.isFinite(inches)?inches:null;
}
function enrichQB(row:any){
  const q:any={...row};
  q.Class??=q["Draft Class"];
  q["Career Starts"]??=q["Games Started"];
  q["Career Attempts"]??=q["Total Attempts"];
  q["Career Max YPG"]??=q["Max YPG"];

  q.Attempts??=q["Passing Attempts"];
  q["Completion %"]??=q["Comp %"];
  q.Yards??=q["Passing Yards"];
  q.Touchdowns??=q["Passing TDs"];
  q.Rushes??=q["Rushing Attempts"];
  q["Rush Yards"]??=q["Rushing Yards"];
  q["Rush Yards/Attempt"]??=q["Rush Yds/Att"];
  q["Rush Touchdowns"]??=q["Rushing TDs"];

  q["Screen %"]??=q["Screen throw %"];
  q["ADJ Comp %"]??=q["Adjusted Comp %"];
  q["Time to Throw"]??=q["Time to throw"];
  q["40 Yard Dash"]??=q["40-YD"];

  const height=heightInches(q.Height),weight=number(q.Weight),forty=number(q["40 Yard Dash"]);
  if(q.BMI==null&&height&&weight)q.BMI=weight*703/(height*height);
  if(q["Speed Score"]==null&&weight&&forty)q["Speed Score"]=weight*200/Math.pow(forty,4);
  return q;
}
function mergeQB(current:any[]){
  const merged=new Map<string,any>();
  for(const row of qbReference as readonly any[])if(row?.Player)merged.set(norm(row.Player),{...row});
  for(const row of current||[]){
    const key=norm(row?.Player);
    if(!key)continue;
    merged.set(key,{...(merged.get(key)||{}),...row});
  }
  return [...merged.values()].map(enrichQB);
}

function enrichRB(row:any){
  const r:any={...row};
  r.Class??=r["Draft Class"];
  r.Carries??=r["Rush Attempts"];
  r["Yards/Carry"]??=r["Yards/Attempt"];
  r.Touchdowns??=r["Rush Touchdowns"];
  r["Rec Yards"]??=r["Rec Yards"];
  r["Rec Touchdowns"]??=r["Rec Touchdowns"];
  r["40 Yard Dash"]??=r["40-YD"];
  r["1st Downs/ATT"]??=r["1st/rush"];
  r["1st Downs/Tgt"]??=r["1st/target"];
  const h=heightInches(r.Height),w=number(r.Weight),forty=number(r["40 Yard Dash"]);
  if(r.BMI==null&&h&&w)r.BMI=w*703/(h*h);
  if(r["Speed Score"]==null&&w&&forty)r["Speed Score"]=w*200/Math.pow(forty,4);
  const vals=(...keys:string[])=>keys.map(k=>number(r[k])||0);
  r["FR + Soph Rush Yd"]??=(number(r["FR Rush Yds"])||0)+(number(r["Soph Rush Yds"])||0);
  const recs=vals("FR Rec","Soph Rec","JR Rec","SR Rec");
  if(r["Single Season Rec"]==null)r["Single Season Rec"]=Math.max(0,...recs);
  if(r["Career Rec"]==null)r["Career Rec"]=recs.reduce((a,b)=>a+b,0);
  return r;
}
function mergeRB(current:any[]){
  const merged=new Map<string,any>();
  for(const row of rbReference as readonly any[])if(row?.Player)merged.set(norm(row.Player),{...row});
  for(const row of current||[]){
    const key=norm(row?.Player);
    if(!key)continue;
    merged.set(key,{...(merged.get(key)||{}),...row});
  }
  return [...merged.values()].map(enrichRB);
}

function playerDataRows(table:readonly (readonly any[])[]){
  const [header,...body]=table||[];
  const headers=(header||[]).map(v=>String(v??"").trim());
  return body.filter(row=>Array.isArray(row)&&row.some(v=>v!==null&&v!==undefined&&String(v).trim()!=="")).map(row=>{
    const out:any={};
    for(let i=0;i<headers.length;i++)if(headers[i])out[headers[i]]=row[i]??null;
    return out;
  });
}
function enrichTE(row:any){
  const q:any={...row};
  q.Class??=q["Draft Class"];
  q["Yards/Tgt"]??=q["Yards/target"];
  q["1st Downs / Tgt"]??=q["1st/target"];
  q["Inline Snap %"]??=q["Inline Rate"];
  q["Slot Snap %"]??=q["Slot Rate"];
  q["Wide Snap %"]??=q["Wide Rate"];
  q["40 Yard Dash"]??=q["40-YD"];
  q["Bench Reps"]??=q["Bench Press"];
  q["Weighted Dom Rtg"]??=q["Weightd Dom Rtg"];
  const h=heightInches(q.Height),w=number(q.Weight),forty=number(q["40 Yard Dash"]);
  if(q.BMI==null&&h&&w)q.BMI=w*703/(h*h);
  if(q["Speed Score"]==null&&w&&forty)q["Speed Score"]=w*200/Math.pow(forty,4);
  return q;
}
function tePlayerDataRows(){
  return playerDataRows(workbookSecondary.teData as readonly (readonly any[])[]).map(enrichTE);
}
function enrichWR(row:any){
  const q:any={...row};
  q.Class??=q["Draft Class"];
  q["Yards/Tgt"]??=q["Yards/target"];
  q["1st Downs / Tgt"]??=q["1st/target"];
  q["Targets/Route"]??=q["Targets/Route Run"];
  q["1st Downs/Route"]??=q["1st Downs/Route Run"];
  q["Contested Target %"]??=q["contested_targets %"];
  q["Screen %"]??=q["Screen target %"];
  q["40 Yard Dash"]??=q["40-YD"];
  q["Vertical"]??=q["Vertical Jump"];
  q["Weighted Dom Rtg"]??=q["Weightd Dom Rtg"];
  const h=heightInches(q.Height),w=number(q.Weight),forty=number(q["40 Yard Dash"]);
  if(q.BMI==null&&h&&w)q.BMI=w*703/(h*h);
  if(q["Speed Score"]==null&&w&&forty)q["Speed Score"]=w*200/Math.pow(forty,4);
  return q;
}
function wrPlayerDataRows(){
  return (wrReference as readonly any[]).map(row=>enrichWR({...row}));
}
function applyCombine(base:any[],combine:any[],position:string){
  const map=new Map(combine.map(r=>[norm(r.player_name),r]));
  const enrich=position==="QB"?enrichQB:position==="RB"?enrichRB:position==="WR"?enrichWR:enrichTE;
  return base.map(row=>{
    const hit=map.get(norm(row?.Player));if(!hit)return row;
    const next:any={...row};
    if(hit.height!=null&&hit.height!=="")next.Height=hit.height;
    if(hit.weight!=null)next.Weight=Number(hit.weight);
    if(hit.forty!=null)next["40 Yard Dash"]=Number(hit.forty);
    if(hit.bench!=null){next["Bench Reps"]=Number(hit.bench);next["Bench Press"]=Number(hit.bench)}
    if(hit.vertical!=null){next.Vertical=Number(hit.vertical);next["Vertical Jump"]=Number(hit.vertical)}
    if(hit.broad_jump!=null)next["Broad Jump"]=Number(hit.broad_jump);
    if(hit.cone!=null)next["3 Cone"]=Number(hit.cone);
    if(hit.shuttle!=null)next.Shuttle=Number(hit.shuttle);
    next["Combine Data Source"]="NFLverse / PFR";
    next["Combine Refreshed At"]=hit.refreshed_at;
    return enrich(next);
  });
}
function projectRows(base:readonly any[],current:any[],enrich:(row:any)=>any){
  const reference=new Map<string,any>();for(const row of base)if(row?.Player)reference.set(norm(row.Player),row);
  return (current||[]).map(row=>{const key=norm(row?.Player);return enrich({...((key&&reference.get(key))||{}),...row})});
}
async function canonicalPlayerData(db:any,position:string,draftClass:number,requestedSeason:number|null){
  const combine=rows(await db.execute({sql:"select cr.*,p.name as roster_name from combine_results cr join players p on p.id=cr.player_id where p.draft_class=? and p.position=?",args:[draftClass,position]}));
  const storedCollegeRows=rows(await db.execute("select team,subdivision,games,completions,pass_attempts as passAttempts,pass_yards as passYards,pass_tds as passTDs,rushes,rush_yards as rushYards,rush_tds as rushTDs,total_plays as totalPlays,updated_at as updatedAt from college_stats"));
  const collegeRows=storedCollegeRows.length?storedCollegeRows:(currentCollegeStatsReference as unknown as any[]);
  const collegeMap=new Map(collegeRows.map((r:any)=>[norm(r.team),r]));
  const withContext=(rs:any[])=>applyCombine(rs,combine,position).map((row:any)=>({...row,"Team Context":collegeMap.get(norm(row.College))||null}));
  const combineRefreshedAt=combine.reduce((m:any,r:any)=>!m||String(r.refreshed_at||"")>String(m)?r.refreshed_at:m,null);
  let imported:any[]=[],registered=false,datasetMode:string|null=null,activeSeason:number|null=null;
  let availableSeasons:number[]=[];
  try{
    const seasonRows=rows(await db.execute({sql:"select distinct r.season from pff_dataset_registry r join pff_thresholds t on t.import_id=r.import_id where r.draft_class=? and t.position=? order by r.season desc",args:[draftClass,position]}));
    availableSeasons=seasonRows.map((x:any)=>Number(x.season)).filter((x:number)=>Number.isFinite(x));
    registered=Boolean(seasonRows.length);
    const active=rows(await db.execute({sql:"select a.import_id,r.season,r.dataset_mode from pff_active_datasets a join pff_dataset_registry r on r.import_id=a.import_id where a.draft_class=? and a.position=? limit 1",args:[draftClass,position]}));
    if(active.length)activeSeason=Number(active[0].season)||null;
    if(requestedSeason!=null){
      const chosen=rows(await db.execute({sql:"select r.import_id,r.season,r.dataset_mode from pff_dataset_registry r join pff_thresholds t on t.import_id=r.import_id and t.position=? where r.draft_class=? and r.season=? order by r.revision desc limit 1",args:[position,draftClass,requestedSeason]}));
      if(chosen.length){datasetMode=String(chosen[0].dataset_mode||"HISTORICAL");imported=rows(await db.execute({sql:"select result,imported_at from pff_imports where id=? limit 1",args:[Number(chosen[0].import_id)]}))}
    }else if(active.length){
      datasetMode="ACTIVE";imported=rows(await db.execute({sql:"select result,imported_at from pff_imports where id=? limit 1",args:[Number(active[0].import_id)]}));
    }
  }catch{}
  if(draftClass===2027&&!availableSeasons.includes(CANONICAL_REFERENCE_SEASON))availableSeasons.push(CANONICAL_REFERENCE_SEASON);
  availableSeasons=[...new Set(availableSeasons)].sort((a,b)=>b-a);
  if(!imported.length&&!registered&&requestedSeason==null)imported=rows(await db.execute("select result,imported_at from pff_imports order by imported_at desc limit 1"));
  let result:any={};if(imported.length){try{result=JSON.parse(String(imported[0].result||"{}"))}catch{}}
  const block=result[position]||{},above=block.above?.primary||[],below=block.below?.primary||[],projection=[...below,...above],importedAt=imported[0]?.imported_at??null;
  const warehouse=Number(result?.meta?.warehouseVersion||0)>=2&&Boolean(block.threshold);
  const resultSeason=Number(result?.meta?.season)||null;
  const analysisSeason=activeSeason??(warehouse&&requestedSeason==null?resultSeason:null)??(draftClass===2027?CANONICAL_REFERENCE_SEASON:null);
  const selectedSeason=resultSeason??requestedSeason??analysisSeason??(draftClass===2027?CANONICAL_REFERENCE_SEASON:null);
  const common={season:selectedSeason,analysisSeason,availableSeasons,datasetMode:warehouse?(datasetMode||(selectedSeason===analysisSeason?"ACTIVE":"HISTORICAL")):"CANONICAL",isAnalysisSeason:selectedSeason!=null&&selectedSeason===analysisSeason};
  if(warehouse){
    let projected:any[]=[];
    if(position==="QB")projected=projectRows(qbReference as readonly any[],projection,enrichQB);
    else if(position==="RB")projected=projectRows(rbReference as readonly any[],projection,enrichRB);
    else if(position==="WR")projected=projectRows(wrPlayerDataRows(),projection,enrichWR);
    else if(position==="TE")projected=projectRows(tePlayerDataRows(),projection,enrichTE);
    return {rows:withContext(projected),below,importedAt,threshold:block.threshold,warehouseVersion:Number(result?.meta?.warehouseVersion||2),draftClass:result?.meta?.draftClass??draftClass,referenceSource:"PFF Warehouse · "+String(selectedSeason||"Unknown")+" Season · "+(selectedSeason===analysisSeason?"Analysis dataset":"Historical"),combineRefreshedAt,...common};
  }
  const canonicalAllowed=requestedSeason==null||requestedSeason===CANONICAL_REFERENCE_SEASON;
  if(!canonicalAllowed)return {rows:[],below:[],importedAt:null,threshold:null,warehouseVersion:1,draftClass,referenceSource:String(requestedSeason)+" Season · no Player Data stored",combineRefreshedAt,...common};
  if(position==="TE")return {rows:withContext(tePlayerDataRows()),below:[],importedAt:null,threshold:null,warehouseVersion:1,draftClass,referenceSource:String(CANONICAL_REFERENCE_SEASON)+" Season · Player Data · TE Data",combineRefreshedAt,...common};
  if(position==="WR")return {rows:withContext(wrPlayerDataRows()),below:[],importedAt:null,threshold:null,warehouseVersion:1,draftClass,referenceSource:String(CANONICAL_REFERENCE_SEASON)+" Season · Player Data · WR Data",combineRefreshedAt,...common};
  if(position==="QB")return {rows:withContext(mergeQB(imported.length?projection:[])),below,importedAt,threshold:null,warehouseVersion:1,draftClass,referenceSource:imported.length?"Player Data · QB Data + latest PFF import":String(CANONICAL_REFERENCE_SEASON)+" Season · Player Data · QB Data",combineRefreshedAt,...common};
  if(position==="RB"){const useImport=Boolean(imported.length)&&String(importedAt||"")>rbReferenceGeneratedAt;return {rows:withContext(mergeRB(useImport?projection:[])),below,importedAt,threshold:null,warehouseVersion:1,draftClass,referenceSource:useImport?"Player Data · RB Data + newer PFF import":String(CANONICAL_REFERENCE_SEASON)+" Season · Player Data · RB Data",combineRefreshedAt,...common}}
  return {rows:[],below:[],importedAt,threshold:null,warehouseVersion:1,draftClass,referenceSource:"Player Data",combineRefreshedAt,...common};
}
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams,pos=params.get("position"),draftClass=Number(params.get("draftClass")||2027),seasonParam=params.get("season"),requestedSeason=seasonParam?Number(seasonParam):null;
    const db=await ensureTursoSchema();
    if(pos&&["QB","RB","WR","TE"].includes(pos)){
      const payload=await canonicalPlayerData(db,pos,draftClass,requestedSeason);
      return Response.json({position:pos,...payload});
    }
    const r=rows(await db.execute("select result,imported_at from pff_imports order by imported_at desc limit 1"));
    if(!r.length)return Response.json({result:{},importedAt:null});
    let result:any={};try{result=JSON.parse(String(r[0].result||"{}"))}catch{}
    return Response.json({result,importedAt:r[0].imported_at});
  }catch(e:any){return Response.json({error:e?.message||"Could not load player data"},{status:500})}
}
