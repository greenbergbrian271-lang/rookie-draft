"use client";

import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {draftAdjustedFinalGrade,glossaryNumber,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {wrAnalyticalGrade} from "@/lib/analytical-grades";
import {wrProductionGrade} from "@/lib/wr-grades";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {usePlayerProfile} from "@/components/PlayerProfile";
import PriorFilmReport from "@/components/PriorFilmReport";
import {DRAFT_PROJECTION_OPTIONS,DraftAdjustmentPanel,EarlyDeclareField,CombineTestingSection,ScoutingPlayerHero,MultiSelectField,earlyDeclareStatus,resolveDraftContext,useDraftFeed} from "./ScoutingShared";

type Player={
  id:string|number;name:string;position:"QB"|"RB"|"WR"|"TE";college?:string;draft_class:number;
  scouting_status:string;watch_order?:number;headshot_url?:string;jersey_number?:string;
};
type Session={id:string|number;player_id?:string|number;game_date?:string|null;opponent?:string|null;raw_notes?:string|null;overall_writeup?:string|null;created_at?:string|null;legacy?:boolean};
type DraftPick={overall:number;pos:"QB"|"RB"|"WR"|"TE";name:string;team:string;college?:string;teamScore:number;draftCapitalScore:number};
type Props={
  players:Player[];vals:Record<string,any>;setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;
  imports:any[];glossary:any[][];onSave:(player:Player,category:string,value:any)=>Promise<any>;onAdd:()=>void;demoMode?:boolean;draftClass?:number;priorReports?:Record<string,any>;archiveMode?:boolean;gradeOverrides?:Record<string,any>;
};
type Tab="Film"|"Production"|"Analytics"|"Combine"|"Draft";
type Mode="Evaluate"|"Compare";

const FILM=["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"] as const;
const ROLE_OPTIONS=["WR 1","WR 1/2","WR 2","WR 2/3","WR 3","WR 4/5","Specialist"] as const;
const ARCHETYPE_OPTIONS=["X WR","Z WR","Slot WR"] as const;
const PROJECTION_OPTIONS=DRAFT_PROJECTION_OPTIONS;
const ADJUSTMENTS=[
  ["Special Teams",["No","Yes"]],
  ["Injury Concerns",["No","Short Term","Long Term"]],
  ["Off-Field?",["No","Character","Arrest"]],
  ["All Star Game?",["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]],
  ["Combine Invite?",["None","Yes","No"]]
] as const;
const ANALYTICS=[
  {key:"dropPct",label:"Drop %",source:"Drop %",inverse:true,pct:true,weighted:true},
  {key:"catchTrafficPct",label:"Catch in Traffic %",source:"Catch in Traffic %",inverse:false,pct:true,weighted:true},
  {key:"firstDowns",label:"1st Downs",source:"1st Downs",inverse:false,pct:false,weighted:true},
  {key:"firstDownsPerTarget",label:"1st Downs / Tgt",source:"1st Downs / Tgt",inverse:false,pct:false,weighted:true},
  {key:"targetsPerRoute",label:"Targets / Route",source:"Targets/Route",inverse:false,pct:false,weighted:true},
  {key:"firstDownsPerRoute",label:"1st Downs / Route",source:"1st Downs/Route",inverse:false,pct:false,weighted:true},
  {key:"yrr",label:"Y/RR",source:"Y/RR",inverse:false,pct:false,weighted:true},
  {key:"yrrMan",label:"Y/RR vs Man",source:"Y/RR vs Man",inverse:false,pct:false,weighted:true},
  {key:"yrrZone",label:"Y/RR vs Zone",source:"Y/RR vs Zone",inverse:false,pct:false,weighted:true},
  {key:"contestedPct",label:"Contested Target %",source:"Contested Target %",inverse:true,pct:true,weighted:true},
  {key:"airYardsPct",label:"Air Yards %",source:"Air Yards %",inverse:false,pct:true,weighted:true},
  {key:"yacPerRec",label:"YAC/Rec",source:"YAC/Rec",inverse:false,pct:false,weighted:true},
  {key:"mtfs",label:"MTFs",source:"MTFs",inverse:false,pct:false,weighted:true},
  {key:"yardsPerRec",label:"Yards/Rec",source:"Yards/Rec",inverse:false,pct:false,weighted:true},
  {key:"adot",label:"ADOT",source:"ADOT",inverse:false,pct:false,weighted:true},
  {key:"screenPct",label:"Screen %",source:"Screen %",inverse:true,pct:true,weighted:true},
  {key:"catchesInTraffic",label:"Catches in Traffic",source:"Catches in Traffic",inverse:false,pct:false,weighted:true},
  {key:"runBlockGrade",label:"Run Block Grade",source:"Run Block Grade",inverse:false,pct:false,weighted:true}
] as const;
const STATS=[
  ["Games","Games",false],["Receptions","Receptions",false],["Targets","Targets",false],["Yards","Yards",false],
  ["Yards / Rec","Yards/Rec",false],["Yards / Tgt","Yards/Tgt",false],["Touchdowns","Touchdowns",false],["Catch %","Catch %",true],
  ["Target %","Target %",true],["YPTPA","YPTPA",false],["Weighted Dom Rtg","Weighted Dom Rtg",true],["Dom Rtg","Dom Rtg",true]
] as const;

function mockDraftableSlug(name:string){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}

const norm=(s:any)=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
function num(v:any,pct=false){
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const raw=String(v).trim(),n=Number(raw.replace(/[%,$]/g,"").replace(/,/g,""));
  if(!Number.isFinite(n))return null;
  return pct||raw.includes("%")?n/100:n;
}
function display(v:any,pct=false,digits=2){
  const n=num(v,pct);if(n==null)return "—";
  return pct?(n*100).toFixed(digits)+"%":n.toLocaleString(undefined,{maximumFractionDigits:digits});
}
function inputValue(v:any){return v==null?"":String(v)}
function scoreLabel(n:number|null){if(n==null)return "Not graded";if(n>=90)return "Elite";if(n>=80)return "Plus";if(n>=70)return "Solid";if(n>=60)return "Fringe";return "Concern"}
function sourceValue(row:any,key:string){
  if(!row)return null;
  const aliases:Record<string,string[]>={
    "Yards/Tgt":["Yards/Tgt","Yards/target"],
    "1st Downs / Tgt":["1st Downs / Tgt","1st/target"],
    "Targets/Route":["Targets/Route","Targets/Route Run"],
    "1st Downs/Route":["1st Downs/Route","1st Downs/Route Run"],
    "Contested Target %":["Contested Target %","contested_targets %"],
    "Screen %":["Screen %","Screen target %"],
    "40 Yard Dash":["40 Yard Dash","40-YD"],
    "Vertical":["Vertical","Vertical Jump"]
  };
  for(const k of aliases[key]||[key])if(row[k]!==undefined&&row[k]!==null&&row[k]!=="")return row[k];
  return null;
}
function heightInches(v:any){
  const s=String(v??"").trim(),m=s.match(/(\d+)\s*['′]\s*(\d+)?/);return m?Number(m[1])*12+Number(m[2]||0):null;
}
function heatColor(ratio:number){const r=Math.max(0,Math.min(1,ratio));return "hsl("+Math.round(r*120)+" 72% 48%)"}
function conditionalStyle(value:any,values:number[]){const n=typeof value==="number"?value:null;if(n==null||!Number.isFinite(n)||!values.length)return undefined;const min=Math.min(...values),max=Math.max(...values),ratio=max===min?.5:(n-min)/(max-min),h=Math.round(ratio*120);return {background:"hsl("+h+" 72% 42% / .18)",boxShadow:"inset 0 -2px 0 hsl("+h+" 72% 48% / .75)"}}
function fmt(v:number|null){return v==null?"—":v.toFixed(2)}

export default function WRScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd,demoMode=false,draftClass=2027,priorReports={},archiveMode=false,gradeOverrides={}}:Props){
  const {openPlayer}=usePlayerProfile();
  const [selectedId,setSelectedId]=useState("");
  const [search,setSearch]=useState("");
  const [tab,setTab]=useState<Tab>("Film");
  const [mode,setMode]=useState<Mode>("Evaluate");
  const [compareIds,setCompareIds]=useState<string[]>([]);
  const [saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");
  const [sessions,setSessions]=useState<Record<string,Session[]>>({});
  const [newGameOpen,setNewGameOpen]=useState<Record<string,boolean>>({});
  const [newGame,setNewGame]=useState<Record<string,{opponent:string;notes:string}>>({});
  const [colleges,setColleges]=useState<any[]>([]);
  const {picks:draftPicks,updatedAt:draftUpdatedAt}=useDraftFeed(draftClass);

  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"})},[]);
  useEffect(()=>{fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json()).then(j=>Array.isArray(j)&&setColleges(j)).catch(()=>{})},[]);

  useEffect(()=>{
    if(!players.length){setSelectedId("");return}
    if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));
    setCompareIds(cur=>{const valid=cur.filter(id=>players.some(p=>String(p.id)===id));return valid.length?valid:players.map(p=>String(p.id))});
  },[players,selectedId]);

  const percentileImports=useMemo(()=>imports.filter((r:any)=>String(r?.Eligibility||"")!=="Scouting Override"),[imports]);
  const importMap=useMemo(()=>{
    const m=new Map<string,any>();
    for(const row of imports||[]){const name=row?.Player??String(row?.["Player, College"]||"").split(",")[0];if(name)m.set(norm(name),row)}
    return m;
  },[imports]);
  const collegeMap=useMemo(()=>new Map<string,any>(colleges.map(x=>[norm(x.team),x] as [string,any])),[colleges]);
  const importedFor=(p:Player)=>importMap.get(norm(p.name))||{};
  const collegeFor=(p:Player)=>archiveMode?(importedFor(p)?.["Team Context"]||{}):(importedFor(p)?.["Team Context"]||collegeMap.get(norm(p.college))||{});
  const evalFor=(p:Player,cat:string)=>vals[p.id+"|"+cat];
  const archivedGrade=(p:Player,key:string)=>archiveMode?(Object.prototype.hasOwnProperty.call(gradeOverrides[String(p.id)]||{},key)?(gradeOverrides[String(p.id)]?.[key]??null):null):undefined;
  const selected=players.find(p=>String(p.id)===selectedId)||players[0];

  useEffect(()=>{
    for(const p of players){
      const id=String(p.id);if(sessions[id]?.length||(!demoMode&&sessions[id]))continue;
      const legacy=String(evalFor(p,"__COMMENTARY__")||"").trim(),legacyLabel=String(evalFor(p,"__GAME_LABEL__")||"").trim(),historical=evalFor(p,"__HISTORICAL_SESSIONS__");
      if(archiveMode){const archived=Array.isArray(historical)?historical:[];setSessions(x=>x[id]?.length?x:{...x,[id]:archived.length?archived:(legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[])});continue}
      if(demoMode){setSessions(x=>x[id]?.length?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]});continue}
      fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{
        const live=Array.isArray(rows)?rows:[],fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];
        setSessions(x=>x[id]?x:{...x,[id]:live.length?live:fallback});
      }).catch(()=>setSessions(x=>x[id]?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]}));
    }
  },[players,vals,demoMode,archiveMode]);

  const combinePopulation=useMemo(()=>({
    forty:(imports||[]).map(r=>num(sourceValue(r,"40 Yard Dash"))).filter((x):x is number=>x!=null),
    speedScore:(imports||[]).map(r=>num(r["Speed Score"])).filter((x):x is number=>x!=null),
    vertical:(imports||[]).map(r=>num(sourceValue(r,"Vertical"))).filter((x):x is number=>x!=null),
    handSize:(imports||[]).map(r=>num(r["Hand Size"])).filter((x):x is number=>x!=null),
    broadJump:[],benchReps:[]
  }),[imports]);

  function gameCountFor(p:Player){if(archiveMode){const n=Number(evalFor(p,"Games watched")??evalFor(p,"Games Watched"));if(Number.isFinite(n))return n}return (sessions[String(p.id)]||[]).length}
  function fieldsFor(p:Player){
    const out:Record<string,any>={...importedFor(p)};
    for(const cat of [...FILM,"Games watched","Games Watched","Expected Role","Archetype","Draft Projection","Early Declare?","Special Teams","Special Teams?","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){
      const v=evalFor(p,cat);if(v!==undefined&&v!==null&&v!=="")out[cat]=v;
    }
    out["Games watched"]=gameCountFor(p);
    if(out["Special Teams"]==null&&out["Special Teams?"]!=null)out["Special Teams"]=out["Special Teams?"];
    return out;
  }
  function manualScoutingFor(p:Player){
    const grades=FILM.map(x=>num(evalFor(p,x))??NaN);
    return workbookScoutingGrade("WR",grades,fieldsFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function combineFor(p:Player){if(archiveMode)return archivedGrade(p,"combine") as number|null;
    const imp=importedFor(p),height=heightInches(imp?.Height),weight=num(imp?.Weight),forty=num(sourceValue(imp,"40 Yard Dash"));
    const bmi=num(imp?.BMI)??(height&&weight?weight*703/(height*height):null);
    const speedScore=num(imp?.["Speed Score"])??(weight&&forty?weight*200/Math.pow(forty,4):null);
    const input={bmi:bmi??undefined,forty:forty??undefined,speedScore:speedScore??undefined,vertical:num(sourceValue(imp,"Vertical"))??undefined,handSize:num(imp?.["Hand Size"])??undefined,weight:weight??undefined,heightInches:height??undefined};
    return Object.values(input).some(v=>v!=null)?combineGrade("WR",input,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null;
  }
  function percentileFor(source:string,p:Player,inverse=false,pct=false){
    const imp=importedFor(p),raw=num(sourceValue(imp,source),pct);
    if(raw==null)return null;
    const pop=percentileImports.map(r=>num(sourceValue(r,source),pct)).filter((x):x is number=>x!=null);
    const base=percentRankInc(pop,raw,3);return base==null?null:(inverse?1-base:base);
  }
  const productionPopulation=useMemo(()=>({
    yardsPerReception:percentileImports.map(r=>num(sourceValue(r,"Yards/Rec"))).filter((x):x is number=>x!=null),
    yardsPerTarget:percentileImports.map(r=>num(sourceValue(r,"Yards/Tgt"))).filter((x):x is number=>x!=null),
    targetShare:percentileImports.map(r=>num(sourceValue(r,"Target %"),true)).filter((x):x is number=>x!=null),
    catchPct:percentileImports.map(r=>num(sourceValue(r,"Catch %"),true)).filter((x):x is number=>x!=null),
    yptpa:percentileImports.map(r=>num(sourceValue(r,"YPTPA"))).filter((x):x is number=>x!=null),
    weightedDomRtg:percentileImports.map(r=>num(sourceValue(r,"Weighted Dom Rtg"),true)).filter((x):x is number=>x!=null),
    domRtg:percentileImports.map(r=>num(sourceValue(r,"Dom Rtg"),true)).filter((x):x is number=>x!=null),
    speedScore:percentileImports.map(r=>num(sourceValue(r,"Speed Score"))).filter((x):x is number=>x!=null)
  }),[imports]);
  function productionContextFor(p:Player){
    const r=importedFor(p),college=collegeFor(p),receptions=num(r.Receptions),targets=num(r.Targets),yards=num(r.Yards),tds=num(r.Touchdowns),attempts=num(college?.passAttempts),teamYards=num(college?.passYards),teamTds=num(college?.passTDs);
    const yardsPerReception=num(sourceValue(r,"Yards/Rec"))??(receptions&&yards!=null?yards/receptions:null);
    const yardsPerTarget=num(sourceValue(r,"Yards/Tgt"))??(targets&&yards!=null?yards/targets:null);
    const catchPct=num(sourceValue(r,"Catch %"),true)??(receptions!=null&&targets?receptions/targets:null);
    const targetShare=num(sourceValue(r,"Target %"),true)??(targets!=null&&attempts?targets/attempts:null);
    const yptpa=num(sourceValue(r,"YPTPA"))??(yards!=null&&attempts?yards/attempts:null);
    const weightedDom=num(sourceValue(r,"Weighted Dom Rtg"),true)??(yards!=null&&teamYards&&tds!=null&&teamTds?((yards/teamYards)*.8)+((tds/teamTds)*.2):null);
    const dom=num(sourceValue(r,"Dom Rtg"),true)??(yards!=null&&teamYards&&tds!=null&&teamTds?((yards/teamYards)+(tds/teamTds))/2:null);
    return {yardsPerReception,yardsPerTarget,targetShare,catchPct,yptpa,weightedDom,dom};
  }
  function productionFor(p:Player){
    if(archiveMode)return archivedGrade(p,"production") as number|null;
    const r=importedFor(p),college=collegeFor(p),ctx=productionContextFor(p),frY=num(r["FR Yards"]),soY=num(r["Soph Yards"]),frTd=num(r["FR TDs"]),soTd=num(r["Soph TDs"]);
    return wrProductionGrade({
      scouting:manualScoutingFor(p),
      yardsPerReception:ctx.yardsPerReception,
      yardsPerTarget:ctx.yardsPerTarget,
      targetShare:ctx.targetShare,
      catchPct:ctx.catchPct,
      yptpa:ctx.yptpa,
      weightedDomRtg:ctx.weightedDom,
      domRtg:ctx.dom,
      speedScore:num(sourceValue(r,"Speed Score")),
      combineScore:combineFor(p),
      maxFrSophYards:frY==null&&soY==null?null:Math.max(frY??0,soY??0),
      maxFrSophTds:frTd==null&&soTd==null?null:Math.max(frTd??0,soTd??0),
      isNonFbs:college?.subdivision==="FCS"
    },productionPopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function rawProductionMetricDataFor(p:Player){
    const r=importedFor(p),m=productionContextFor(p);
    const specs=[
      {label:"Games",raw:num(r.Games),pct:false,values:percentileImports.map(x=>num(x.Games)).filter((v):v is number=>v!=null),digits:0},
      {label:"Receptions",raw:num(r.Receptions),pct:false,values:percentileImports.map(x=>num(x.Receptions)).filter((v):v is number=>v!=null),digits:0},
      {label:"Targets",raw:num(r.Targets),pct:false,values:percentileImports.map(x=>num(x.Targets)).filter((v):v is number=>v!=null),digits:0},
      {label:"Yards",raw:num(r.Yards),pct:false,values:percentileImports.map(x=>num(x.Yards)).filter((v):v is number=>v!=null),digits:0},
      {label:"Yards/Rec",raw:m.yardsPerReception,pct:false,values:productionPopulation.yardsPerReception,digits:2},
      {label:"Yards/Tgt",raw:m.yardsPerTarget,pct:false,values:productionPopulation.yardsPerTarget,digits:2},
      {label:"Touchdowns",raw:num(r.Touchdowns),pct:false,values:percentileImports.map(x=>num(x.Touchdowns)).filter((v):v is number=>v!=null),digits:0},
      {label:"Target %",raw:m.targetShare,pct:true,values:productionPopulation.targetShare,digits:1},
      {label:"Catch %",raw:m.catchPct,pct:true,values:productionPopulation.catchPct,digits:1}
    ];
    return specs.map(s=>({...s,percentile:s.raw==null?null:percentRankInc(s.values,s.raw,3)}));
  }
  function productionMetricDataFor(p:Player){
    const r=importedFor(p),m=productionContextFor(p);
    const peakYFor=(row:any)=>{const vals=[num(row?.["FR Yards"]),num(row?.["Soph Yards"])].filter((v):v is number=>v!=null);return vals.length?Math.max(...vals):null};
    const peakTdFor=(row:any)=>{const vals=[num(row?.["FR TDs"]),num(row?.["Soph TDs"])].filter((v):v is number=>v!=null);return vals.length?Math.max(...vals):null};
    const peakY=peakYFor(r),peakTd=peakTdFor(r);
    const peakYPop=percentileImports.map(peakYFor).filter((v):v is number=>v!=null),peakTdPop=percentileImports.map(peakTdFor).filter((v):v is number=>v!=null);
    const peakParts=[peakY==null?null:percentRankInc(peakYPop,peakY,3),peakTd==null?null:percentRankInc(peakTdPop,peakTd,3)].filter((v):v is number=>v!=null);
    const peakPercentile=peakParts.length?peakParts.reduce((s,v)=>s+v,0)/peakParts.length:null;
    return [
      {label:"Weighted Dom Rtg",raw:m.weightedDom,pct:true,percentile:m.weightedDom==null?null:percentRankInc(productionPopulation.weightedDomRtg,m.weightedDom,3),detail:"Higher is better",displayValue:null as string|null},
      {label:"Dom Rtg",raw:m.dom,pct:true,percentile:m.dom==null?null:percentRankInc(productionPopulation.domRtg,m.dom,3),detail:"Higher is better",displayValue:null as string|null},
      {label:"YPTPA",raw:m.yptpa,pct:false,percentile:m.yptpa==null?null:percentRankInc(productionPopulation.yptpa,m.yptpa,3),detail:"Higher is better",displayValue:null as string|null},
      {label:"FR / SO Peak",raw:null,pct:false,percentile:peakPercentile,detail:"Freshman / sophomore peak",displayValue:peakY==null&&peakTd==null?"—":(peakY==null?"—":Math.round(peakY)+" yds")+" · "+(peakTd==null?"—":Math.round(peakTd)+" TD")}
    ];
  }
  function metricDataFor(p:Player){
    const imp=importedFor(p);
    return ANALYTICS.map(metric=>{
      const raw=num(sourceValue(imp,metric.source),metric.pct);
      const population=percentileImports.map(r=>num(sourceValue(r,metric.source),metric.pct)).filter((x):x is number=>x!=null);
      const base=raw==null?null:percentRankInc(population,raw,3);
      const percentile=base==null?null:(metric.inverse?1-base:base);
      return {...metric,raw,rawPercentile:base,percentile};
    });
  }
  function penaltyFor(p:Player){
    const imp=importedFor(p),adot=num(sourceValue(imp,"ADOT")),contested=num(sourceValue(imp,"Contested Target %"),true);
    return adot!=null&&contested!=null&&adot<=13&&contested>=.23;
  }
  function analyticalFor(p:Player){
    if(archiveMode)return archivedGrade(p,"analytical") as number|null;
    const metrics=metricDataFor(p),record=Object.fromEntries(metrics.map(x=>[x.key,x.percentile])) as Record<string,number|null>;
    return wrAnalyticalGrade(manualScoutingFor(p),record,penaltyFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function earlyDeclareFor(p:Player){const r=importedFor(p);return earlyDeclareStatus(r.Class||r["Draft Class"],evalFor(p,"Early Declare?"))}
  function scoutingFor(p:Player){
    if(archiveMode)return archivedGrade(p,"scouting") as number|null;
    const watched=gameCountFor(p);
    if(watched>=1)return manualScoutingFor(p);
    const fallback=[productionFor(p),analyticalFor(p)].filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));
    return fallback.length?fallback.reduce((s,v)=>s+v,0)/fallback.length:null;
  }
  function preDraftFor(p:Player){
    if(archiveMode)return archivedGrade(p,"pre") as number|null;
    const scout=scoutingFor(p);if(scout==null)return null;
    const early=earlyDeclareFor(p).yes;
    return preDraftGrade("WR",scout,productionFor(p),analyticalFor(p),early,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function rankingGradeFor(p:Player){return finalGradeFor(p)}
  const rankedPlayers=useMemo(()=>[...players].sort((a,b)=>{
    const ga=rankingGradeFor(a),gb=rankingGradeFor(b);
    if(ga==null&&gb==null)return (a.watch_order||9999)-(b.watch_order||9999);
    if(ga==null)return 1;if(gb==null)return -1;return gb-ga||((a.watch_order||9999)-(b.watch_order||9999));
  }),[players,vals,imports,colleges,glossary,sessions,draftPicks,gradeOverrides,archiveMode]);
  const filtered=useMemo(()=>{const q=norm(search);return rankedPlayers.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q))},[rankedPlayers,search]);

  async function persist(p:Player,cat:string,value:any){if(archiveMode)return null;
    setSaveState("saving");setVals(v=>({...v,[p.id+"|"+cat]:value}));
    if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}
    try{await onSave(p,cat,value);setSaveState("saved")}catch{setSaveState("error")}
  }
  function local(p:Player,cat:string,value:any){if(archiveMode)return;setVals(v=>({...v,[p.id+"|"+cat]:value}))}
  async function saveSession(p:Player,session:Session,patch:Partial<Session>){if(archiveMode)return;
    const id=String(p.id),next={...session,...patch};setSessions(x=>({...x,[id]:(x[id]||[]).map(s=>String(s.id)===String(session.id)?next:s)}));
    if(session.legacy||demoMode){if(patch.raw_notes!==undefined)await persist(p,"__COMMENTARY__",patch.raw_notes||"");if(patch.opponent!==undefined)await persist(p,"__GAME_LABEL__",patch.opponent||"");return}
    await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:session.id,opponent:next.opponent,gameDate:next.game_date,rawNotes:next.raw_notes,overallWriteup:next.overall_writeup})});
  }
  async function addSession(p:Player){if(archiveMode)return;
    const id=String(p.id),draft=newGame[id]||{opponent:"",notes:""};if(!draft.opponent.trim()&&!draft.notes.trim())return;
    if(demoMode){const s:Session={id:"demo-"+Date.now(),opponent:draft.opponent||"New game",raw_notes:draft.notes,legacy:true};setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}
    else{const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,opponent:draft.opponent,rawNotes:draft.notes})});if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}}
    setNewGame(x=>({...x,[id]:{opponent:"",notes:""}}));setNewGameOpen(x=>({...x,[id]:false}));
  }

  useEffect(()=>{
    if(mode!=="Evaluate")return;
    const nodes=rankedPlayers.map(p=>document.getElementById("wr-eval-"+p.id)).filter(Boolean) as HTMLElement[];if(!nodes.length)return;
    const obs=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setSelectedId(String((visible[0].target as HTMLElement).dataset.playerId||""))},{rootMargin:"-150px 0px -65% 0px",threshold:[0,.01]});
    nodes.forEach(n=>obs.observe(n));return()=>obs.disconnect();
  },[mode,rankedPlayers]);
  function jumpToPlayer(p:Player){setMode("Evaluate");setSelectedId(String(p.id));requestAnimationFrame(()=>document.getElementById("wr-eval-"+p.id)?.scrollIntoView({behavior:"smooth",block:"start"}))}

  function draftContextFor(p:Player){const fields=fieldsFor(p);return resolveDraftContext("WR",p.name,draftPicks,{result:fields["Draft Result"],teamScore:fields["Team Score (10)"],draftCapitalScore:fields["Draft Capital Score (10)"]})}
  function finalGradeFor(p:Player){if(archiveMode)return archivedGrade(p,"final") as number|null;const pre=preDraftFor(p);if(pre==null)return null;const d=draftContextFor(p);return d.finalized?draftAdjustedFinalGrade("WR",pre,d.teamScore,d.draftCapitalScore,(glossary.length?glossary:undefined) as GlossaryRows|undefined):pre}


  function renderPlayerSection(p:Player){
    const id=String(p.id),imp=importedFor(p),college=collegeFor(p),metrics=metricDataFor(p),rawProductionMetrics=rawProductionMetricDataFor(p),productionMetrics=productionMetricDataFor(p),scouting=scoutingFor(p),production=productionFor(p),analytical=analyticalFor(p),preDraft=preDraftFor(p),fields=fieldsFor(p),combine=combineFor(p),draftCtx=draftContextFor(p),early=earlyDeclareFor(p);
    const teamScore=draftCtx.teamScore,draftCapital=draftCtx.draftCapitalScore,g=(glossary.length?glossary:undefined) as GlossaryRows|undefined;
    const teamAdj=archiveMode?null:(preDraft==null?null:(teamScore-5)*2*glossaryNumber(29,g)),capitalAdj=archiveMode?null:(preDraft==null?null:(draftCapital-5)*2*glossaryNumber(30,g));
    const finalGrade=archiveMode?(archivedGrade(p,"final") as number|null):(preDraft==null?null:(draftCtx.finalized?draftAdjustedFinalGrade("WR",preDraft,teamScore,draftCapital,g):preDraft));
    const filmComplete=FILM.filter(x=>num(evalFor(p,x))!=null).length,gamesWatched=gameCountFor(p),rank=rankedPlayers.indexOf(p)+1,style=schoolStyle(p.college),draft=newGame[id]||{opponent:"",notes:""};
    const penalty=penaltyFor(p),showPenaltyBadge=penalty;
    const mockMeasurements=[imp.Wingspan,imp["Arm Length"],imp["Hand Size"]].filter(v=>v!==null&&v!==undefined&&v!=="");
    const hasMockDraftable=Boolean(imp["MockDraftable URL"]||imp.MockDraftable||mockMeasurements.length);
    return <article className="qb-evaluate-player" id={"wr-eval-"+p.id} data-player-id={p.id} key={p.id}>
      <ScoutingPlayerHero player={p} position="WR" rank={rank} style={style} age={imp?.Age} classLabel={imp?.Class||imp?.["Draft Class"]} gamesWatched={gamesWatched} draftTeam={draftCtx.team||"TBD"} draftResult={draftCtx.result} draftAutomated={draftCtx.automated} saveState={saveState} demoMode={demoMode} archiveMode={archiveMode} onOpen={!demoMode?()=>openPlayer(p.id):undefined} extraMeta={null}/>
      <div className="qb-grade-strip wr-grade-strip" style={{gridTemplateColumns:"repeat(5,minmax(0,1fr))"}}>
        <GradeCard label={gamesWatched<1&&scouting!=null?"Scouting · Provisional":"Scouting"} value={scouting} accent="film" hint={gamesWatched<1&&scouting!=null?"0 games · avg Production + Analytical":filmComplete+"/7 traits graded"}/>
        <GradeCard label="Production" value={production} accent="pre" hint="Workbook production model"/>
        <GradeCard label="Analytical" value={analytical} accent="analytics" hint={penalty?"ADOT / contested penalty applied":"Workbook percentile model"}/>
        <GradeCard label="Pre-Draft" value={preDraft} accent="pre" hint="Scout + production + analytics"/>
        <GradeCard label="Final" value={finalGrade} accent="final" hint={preDraft==null?"Waiting for pre-draft grade":draftCtx.finalized?"Draft-adjusted":"Matches Pre-Draft until NFL Draft"}/>
      </div>

      {tab==="Film"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2><p>Seven WR traits retain the workbook weights while using the same focused interaction model as QB scouting.</p></div><div className="qb-completion">{filmComplete}/7 complete</div></div>
        <div className="qb-context-grid">
          <ConstrainedField label="Expected role" value={inputValue(evalFor(p,"Expected Role"))} options={[...ROLE_OPTIONS]} onLocal={v=>local(p,"Expected Role",v)} onCommit={v=>persist(p,"Expected Role",v)}/>
          <MultiSelectField label="Archetype" value={evalFor(p,"Archetype")} options={ARCHETYPE_OPTIONS} onCommit={v=>persist(p,"Archetype",v)}/>
          <ConstrainedField label="Draft projection" value={inputValue(evalFor(p,"Draft Projection"))} options={[...PROJECTION_OPTIONS]} onLocal={v=>local(p,"Draft Projection",v)} onCommit={v=>persist(p,"Draft Projection",v)}/>
        </div>
        <div className="qb-film-grid">{FILM.map(trait=>{const n=num(evalFor(p,trait));return <div className="qb-trait-card" key={trait} style={{"--heat":heatColor((n??50)/100)} as any}>
          <div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div>
          <input className="qb-grade-slider heat" type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(p,trait,Number(e.target.value))} onPointerUp={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))}/>
          <div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div>
          <input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={inputValue(evalFor(p,trait))} onChange={e=>local(p,trait,e.target.value)} onBlur={e=>persist(p,trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)} placeholder="—"/>
        </div>})}</div>
        <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Role, Risk & Extras</h2></div></div>
        <div className="qb-context-grid scouting-adjustments-grid">
          <EarlyDeclareField classLabel={imp.Class||imp["Draft Class"]} value={evalFor(p,"Early Declare?")} onCommit={v=>persist(p,"Early Declare?",v)}/>
          {ADJUSTMENTS.map(([label,options])=><Field key={label} label={label} source="Scout"><select value={inputValue(evalFor(p,label)||evalFor(p,label+"?")||options[0])} onChange={e=>persist(p,label,e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></Field>)}
        </div>
        <div className="qb-game-log">
          <div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2><p>One entry per game, newest first.</p></div><div className="qb-game-log-actions"><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:!x[id]}))}>+ Add game</button><button type="button" className="ghost qb-game-log-toggle" onClick={e=>{const log=e.currentTarget.closest(".qb-game-log");log?.classList.toggle("collapsed");const root=e.currentTarget.closest(".qb-scouting-pane");const logs=Array.from(root?.querySelectorAll(".qb-game-log")||[]);const allCollapsed=logs.length>0&&logs.every(item=>item.classList.contains("collapsed"));root?.querySelector(".qb-game-log-global-toggle")?.setAttribute("aria-pressed",String(allCollapsed))}}><span className="qb-game-log-toggle-expanded">Minimize game cards</span><span className="qb-game-log-toggle-collapsed">Show game cards</span></button></div></div>
          {newGameOpen[id]&&<div className="qb-game-note new"><input value={draft.opponent} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,opponent:e.target.value}}))} placeholder="Game label — e.g. 2026 · Michigan"/><textarea value={draft.notes} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,notes:e.target.value}}))} placeholder="Notes from this game…"/><div className="row-actions"><button onClick={()=>addSession(p)}>Add to top</button><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:false}))}>Cancel</button></div></div>}
          {(sessions[id]||[]).length?(sessions[id]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}><div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{opponent:e.target.value})} placeholder="Season · Opponent"/></div><textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{raw_notes:e.target.value})}/></div>):<div className="qb-game-empty">No game notes yet. Add the first game above.</div>}
        </div>
      </div>}

      {tab==="Production"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Stats</span><h2>Raw Stats</h2><p>Season receiving output with full WR Player Data percentiles for quick context.</p></div><GradePill value={production}/></div>
        <div className="qb-analytics-grid">{rawProductionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>WR Player Data percentile</small></div><b>{display(m.raw,m.pct,m.pct?1:m.digits)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-section-head compact"><div><span className="ey">Production Model</span><h2>Production</h2><p>Workbook model inputs, with current-school team context joined exactly where the WR sheet does it.</p></div></div>
        <div className="qb-analytics-grid wr-production-model-grid">{productionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.detail}</small></div><b>{m.displayValue??display(m.raw,m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-section-head compact"><div><span className="ey">Current Team Context</span><h2>{p.college}</h2></div></div>
        <div className="qb-stat-grid"><Stat label="Team Pass Attempts" value={display(college.passAttempts,false,0)}/><Stat label="Team Pass Yards" value={display(college.passYards,false,0)}/><Stat label="Team Pass TD" value={display(college.passTDs,false,0)}/><Stat label="Subdivision" value={college.subdivision||"—"}/></div>
      </div>}

      {tab==="Analytics"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">PFF + Calculated</span><h2>Analytical Profile</h2><p>WR Player Data percentiles mirror the workbook, including inverse treatment for drops, contested-target rate and screens.</p></div><div className="wr-analytics-head-actions">{showPenaltyBadge&&<span className="wr-penalty-badge" title="ADOT ≤ 13 and contested targets ≥ 23%">Low ADOT / High Contested Target</span>}<GradePill value={analytical}/></div></div>
        <div className="qb-analytics-grid">{metrics.map(m=><div className="qb-metric" key={m.key}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower raw is better":"Higher raw is better"}</small></div><b>{display(m.raw,m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
      </div>}

      {tab==="Combine"&&<CombineTestingSection playerName={p.name} position="WR" data={imp} grade={combine}/>}
      
      {tab==="Draft"&&<DraftAdjustmentPanel preDraft={preDraft} finalGrade={finalGrade} draftResult={draftCtx.result} draftTeam={draftCtx.team} teamScore={teamScore} draftCapital={draftCapital} teamAdj={teamAdj} capitalAdj={capitalAdj} production={true} updatedAt={draftUpdatedAt}/>}
      <PriorFilmReport report={priorReports?.[id]}/>
    </article>
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched WRs yet</h2><p>Add a wide receiver to the watched pool to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;
  const comparePlayers=rankedPlayers.filter(p=>compareIds.includes(String(p.id)));
  return <div className="qb-workspace wr-workspace">
    <aside className="qb-prospect-rail"><div className="qb-rail-head"><div><span className="ey">{draftClass} Wide Receivers</span><strong>{players.length} available</strong></div><button className="qb-add" onClick={onAdd} title="New Players Watched">+</button></div>
      <div className="qb-mode-toggle">{(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}</div>
      <input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wide receivers…"/>
      <div className="qb-prospect-list">{filtered.map(p=>{const g=rankingGradeFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length,rank=rankedPlayers.indexOf(p)+1;return <div className={"qb-prospect-row "+(String(p.id)===selectedId?"active":"")} key={p.id}><button className="qb-prospect-item" onClick={()=>jumpToPlayer(p)}><span className="qb-rank">WR{rank}</span><span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college||"College TBD"} · {done}/7 traits</small></span><span className="qb-mini-grade">{g==null?"—":g.toFixed(2)}</span></button></div>})}</div>
      {demoMode&&<div className="qb-demo-note">Previewing Jeremiah Smith, Cam Coleman and Jordan Faison with their existing film evaluations and WR Player Data.</div>}
    </aside>
    <section className={"qb-scouting-pane "+(mode==="Evaluate"?"evaluate":"compare")}>{mode==="Compare"?<CompareView players={comparePlayers} allPlayers={rankedPlayers} compareIds={compareIds} setCompareIds={setCompareIds} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} productionFor={productionFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor} finalGradeFor={finalGradeFor} draftContextFor={draftContextFor} gameCountFor={gameCountFor} metricDataFor={metricDataFor}/>:<div className="qb-evaluate-stack"><nav className="qb-section-tabs qb-shared-tabs">{(["Film","Production","Analytics","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}{tab==="Film"&&<button type="button" className="qb-game-log-global-toggle" aria-pressed="false" onClick={e=>{const root=e.currentTarget.closest(".qb-scouting-pane");const logs=Array.from(root?.querySelectorAll(".qb-game-log")||[]);const collapse=logs.some(log=>!log.classList.contains("collapsed"));logs.forEach(log=>log.classList.toggle("collapsed",collapse));e.currentTarget.setAttribute("aria-pressed",String(collapse))}}><span className="qb-game-log-global-collapse">Minimize all game logs</span><span className="qb-game-log-global-expand">Expand all game logs</span></button>}</nav>{rankedPlayers.map(renderPlayerSection)}</div>}</section>
  </div>
}

function CompareView({players,allPlayers,compareIds,setCompareIds,vals,importedFor,scoutingFor,productionFor,analyticalFor,preDraftFor,finalGradeFor,draftContextFor,gameCountFor,metricDataFor}:{players:Player[],allPlayers:Player[],compareIds:string[],setCompareIds:React.Dispatch<React.SetStateAction<string[]>>,vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,productionFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null,finalGradeFor:(p:Player)=>number|null,draftContextFor:(p:Player)=>any,gameCountFor:(p:Player)=>number,metricDataFor:(p:Player)=>any[]}){
  type M={key:string;group:string;label:string;numeric?:boolean;get:(p:Player)=>any;format?:(v:any)=>string};
  const [open,setOpen]=useState(false),[sortKey,setSortKey]=useState("rank"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const metrics:M[]=[
    {key:"scouting",group:"Grades",label:"Scouting",numeric:true,get:scoutingFor,format:fmt},{key:"production",group:"Grades",label:"Production",numeric:true,get:productionFor,format:fmt},{key:"analytical",group:"Grades",label:"Analytical",numeric:true,get:analyticalFor,format:fmt},{key:"predraft",group:"Grades",label:"Pre-Draft",numeric:true,get:preDraftFor,format:fmt},{key:"final",group:"Grades",label:"Final",numeric:true,get:finalGradeFor,format:fmt},
    {key:"games",group:"Profile",label:"Games Watched",numeric:true,get:gameCountFor},{key:"role",group:"Profile",label:"Role",get:p=>vals[p.id+"|Expected Role"]||"—"},{key:"archetype",group:"Profile",label:"Archetype",get:p=>vals[p.id+"|Archetype"]||"—"},{key:"proj",group:"Profile",label:"Draft Projection",get:p=>vals[p.id+"|Draft Projection"]||"—"},{key:"draftResult",group:"Profile",label:"Draft Result",get:p=>draftContextFor(p).result||"—"},
    ...FILM.map(label=>({key:"film-"+label,group:"Film",label,numeric:true,get:(p:Player)=>num(vals[p.id+"|"+label]),format:(v:any)=>v==null?"—":Number(v).toFixed(2)})),
    ...STATS.map(([label,key,pct])=>({key:"stat-"+key,group:"Production",label,numeric:true,get:(p:Player)=>num(sourceValue(importedFor(p),key),pct),format:(v:any)=>v==null?"—":pct?(Number(v)*100).toFixed(1)+"%":Number(v).toFixed(label.includes("Yards")||label.includes("YPTPA")?2:0)})),
    ...ANALYTICS.map(a=>({key:"a-"+a.key,group:"Analytics",label:a.label+" %ile",numeric:true,get:(p:Player)=>{const m=metricDataFor(p).find((x:any)=>x.key===a.key);return m?.percentile==null?null:m.percentile*100},format:(v:any)=>v==null?"—":Math.round(Number(v)).toString()}))
  ];
  const map=new Map(metrics.map(m=>[m.key,m])),groups=Array.from(new Set(metrics.map(m=>m.group))).map(group=>({group,count:metrics.filter(m=>m.group===group).length}));
  const change=(key:string)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir(key==="rank"||key==="player"?"asc":"desc")}};
  const sorted=[...players].sort((a,b)=>{let av:any,bv:any;if(sortKey==="rank"){av=allPlayers.indexOf(a)+1;bv=allPlayers.indexOf(b)+1}else if(sortKey==="player"){av=(a.name+" "+a.college).toLowerCase();bv=(b.name+" "+b.college).toLowerCase()}else{const m=map.get(sortKey);av=m?.get(a);bv=m?.get(b)}if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return sortDir==="asc"?cmp:-cmp});
  const arrow=(k:string)=>sortKey===k?(sortDir==="asc"?" ↑":" ↓"):"";
  return <div className="qb-compare-view"><div className="qb-compare-head"><div><span className="ey">Side-by-Side</span><h2>WR Comparison Board</h2><p>Every numeric column is sortable and conditionally formatted inside the current comparison set.</p></div><div className="qb-compare-controls"><button className="ghost" onClick={()=>setCompareIds(allPlayers.map(p=>String(p.id)))}>All players</button><div className="qb-compare-filter"><button className="qb-compare-filter-button" onClick={()=>setOpen(x=>!x)}>{players.length} of {allPlayers.length} Players ▾</button>{open&&<div className="qb-compare-filter-list">{allPlayers.map(p=><label key={p.id}><input type="checkbox" checked={compareIds.includes(String(p.id))} onChange={()=>setCompareIds(cur=>cur.includes(String(p.id))?cur.filter(x=>x!==String(p.id)):[...cur,String(p.id)])}/><span>WR{allPlayers.indexOf(p)+1}</span><b>{p.name}</b><small>{p.college}</small></label>)}</div>}</div></div></div><div className="qb-compare-scroll"><table className="qb-compare-matrix"><thead><tr className="groups"><th rowSpan={2}><button onClick={()=>change("rank")}>Rank{arrow("rank")}</button></th><th rowSpan={2}><button onClick={()=>change("player")}>Player / School{arrow("player")}</button></th>{groups.map(g=><th colSpan={g.count} key={g.group}>{g.group}</th>)}</tr><tr>{metrics.map(m=><th key={m.key}><button onClick={()=>change(m.key)}>{m.label}{arrow(m.key)}</button></th>)}</tr></thead><tbody>{sorted.map(p=><tr key={p.id}><th className="rank">WR{allPlayers.indexOf(p)+1}</th><th className="player" style={schoolStyle(p.college)}><b>{p.name}</b><small> · {p.college}</small></th>{metrics.map(m=>{const raw=m.get(p),values=m.numeric?players.map(x=>m.get(x)).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)):[];return <td key={m.key} className={m.numeric?"numeric":""} style={m.numeric?conditionalStyle(raw,values):undefined}>{m.format?m.format(raw):(raw??"—")}</td>})}</tr>)}</tbody></table></div></div>
}

function GradeCard({label,value,accent,hint}:{label:string,value:number|null,accent:string,hint:string}){return <div className={"qb-grade-card "+accent}><span>{label}</span><strong>{value==null?"—":value.toFixed(2)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{value==null?"—":value.toFixed(2)}</b></div>}
function Field({label,source,children}:{label:string,source:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>{source}</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
function Stat({label,value}:{label:string,value:any}){return <div className="qb-stat-card"><span>{label}</span><strong>{value}</strong></div>}
function ConstrainedField({label,value,options,onLocal,onCommit}:{label:string,value:string,options:string[],onLocal:(v:string)=>void,onCommit:(v:string)=>void|Promise<any>}){
  const isCustom=Boolean(value)&&!options.includes(value),[other,setOther]=useState(isCustom);
  useEffect(()=>setOther(Boolean(value)&&!options.includes(value)),[value,options]);
  return <Field label={label} source="Scout"><div className="qb-constrained"><select value={other?"Other":value} onChange={e=>{if(e.target.value==="Other"){setOther(true);onLocal("")}else{setOther(false);onLocal(e.target.value);onCommit(e.target.value)}}}><option value="">Select…</option>{options.map(x=><option key={x}>{x}</option>)}<option>Other</option></select>{other&&<input value={value} onChange={e=>onLocal(e.target.value)} onBlur={e=>onCommit(e.target.value)} placeholder={"Other "+label.toLowerCase()+"…"}/>}</div></Field>
}
