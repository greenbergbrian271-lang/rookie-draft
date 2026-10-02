"use client";

import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {draftAdjustedFinalGrade,glossaryNumber,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {teAnalyticalGrade} from "@/lib/analytical-grades";
import {teProductionGrade} from "@/lib/te-grades";
import {usePlayerProfile} from "@/components/PlayerProfile";
import PriorFilmReport from "@/components/PriorFilmReport";
import {DRAFT_PROJECTION_OPTIONS,DraftAdjustmentPanel,EarlyDeclareField,CombineTestingSection,ScoutingPlayerHero,MultiSelectField,earlyDeclareStatus,resolveDraftContext,useDraftFeed} from "./ScoutingShared";

type Player={id:string|number;name:string;position:"QB"|"RB"|"WR"|"TE";college?:string;draft_class:number;scouting_status:string;watch_order?:number;headshot_url?:string;jersey_number?:string};
type Session={id:string|number;opponent?:string|null;raw_notes?:string|null;game_date?:string|null;overall_writeup?:string|null;legacy?:boolean};
type Mode="Evaluate"|"Compare";
type Tab="Film"|"Production"|"Analytics"|"Combine"|"Draft";
type Props={players:Player[];vals:Record<string,any>;setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;imports:any[];glossary:any[][];onSave:(p:Player,category:string,value:any)=>Promise<any>;onAdd:()=>void;demoMode?:boolean;draftClass?:number;priorReports?:Record<string,any>};

const FILM=["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"] as const;
const ROLE_OPTIONS=["TE 1","TE 2","TE 3+","Special Teams / Depth"] as const;
const ARCHETYPE_OPTIONS=["Move TE / Big Slot","Blocking TE"] as const;
const PROJECTION_OPTIONS=DRAFT_PROJECTION_OPTIONS;
const ADJUSTMENTS=[
  ["Special Teams",["No","Yes"]],
  ["Injury Concerns",["No","Short Term","Long Term"]],
  ["Off-Field?",["No","Character","Arrest"]],
  ["All Star Game?",["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]],
  ["Combine Invite?",["None","Yes","No"]]
] as const;
const ANALYTICS=[
  {label:"Drop %",sheet:"AU",pct:true,inverse:true},{label:"Catch in Traffic %",sheet:"AV",pct:true,inverse:false},
  {label:"1st Downs",sheet:"AW",pct:false,inverse:false},{label:"1st Downs / Tgt",sheet:"AX",pct:true,inverse:false},
  {label:"Y/RR",sheet:"AY",pct:false,inverse:false},{label:"Y/RR vs Man",sheet:"AZ",pct:false,inverse:false},
  {label:"Y/RR vs Zone",sheet:"BA",pct:false,inverse:false},{label:"Air Yard %",sheet:"BB",pct:true,inverse:false},
  {label:"YAC/Rec",sheet:"BC",pct:false,inverse:false},{label:"MTFs",sheet:"BD",pct:false,inverse:false},
  {label:"Yards/Rec",sheet:"BE",pct:false,inverse:false},{label:"ADOT",sheet:"BF",pct:false,inverse:false},
  {label:"Catches in Traffic",sheet:"BG",pct:false,inverse:false},{label:"Inline Snap %",sheet:"BH",pct:true,inverse:true},
  {label:"Slot Snap %",sheet:"BI",pct:true,inverse:false},{label:"Wide Snap %",sheet:"BJ",pct:true,inverse:false},
  {label:"Run Block Grade",sheet:"BK",pct:false,inverse:false},{label:"Pass Block Grade",sheet:"BL",pct:false,inverse:false}
] as const;
const TE_DEMO_DEFAULTS:Record<string,any>={
  "Expected Role":"TE 1","Archetype":"Move TE / Big Slot","Draft Projection":"First Round","Early Declare":"Yes","Team Score (10)":3.762,"Draft Capital Score (10)":9.15,"Draft Result":"1.16 · New York Jets",
  Catching:84,"Route Running":81,Blocking:80,Athleticism:93,Competitiveness:79,Size:85,Versatility:90,
  "Special Teams":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"Yes",
  "__PREVIEW_COMBINE_GRADE__":78.595,
  "__PROD_PCT_YPR__":0.5628456510809452,"__PROD_PCT_YPT__":0.6535591274397243,"__PROD_PCT_TARGET__":0.90909090966,"__PROD_PCT_CATCH__":0.7243270825360377,
  "__PROD_PCT_WEIGHTED__":0.8571428572612521,"__PROD_PCT_YPTPA__":0.8701298701163791,"__PROD_PCT_DOM__":0.8766233766908387,"__PROD_PCT_SPEED__":0.9811320754716981,
  "__AN_PCT_AU":0.205,"__AN_PCT_AV":0.603,"__AN_PCT_AW":0.968,"__AN_PCT_AX":0.776,"__AN_PCT_AY":0.763,"__AN_PCT_AZ":0.609,"__AN_PCT_BA":0.705,"__AN_PCT_BB":0.673,
  "__AN_PCT_BC":0.333,"__AN_PCT_BD":0.891,"__AN_PCT_BE":0.564,"__AN_PCT_BF":0.75,"__AN_PCT_BG":0.917,"__AN_PCT_BH":0.929,"__AN_PCT_BI":0.929,"__AN_PCT_BJ":0.782,"__AN_PCT_BK":0.853,"__AN_PCT_BL":0.763,
  "__GAME_LABEL__":"2025 · Indiana / James Madison / Texas Tech",
  "__COMMENTARY__":"Texas Tech (CFP Quarters - Orange Bowl): I'm struggling to see the super athletic player that people view him as. He's not exactly lighting the world on fire by getting screaming open on his routes. He had 4 catches for 22 yards in this one. He made a really good catch to convert on 4th, which I COMMEND him for, but that doesn't exactly contribute to the super athletic build. He's not running away from LBs consistently. Also not an amazing blocker.\n\nJames Madison (CFP Round 1): A really nice, short game for him. I had 3 notes but they all touched on things I wanted to see out of him. Great block, athletic catch, run after catch. Maybe he does finish as pre-draft TE1.\n\nIndiana: The streets say that Kenyon Sadiq is the best TE in the nation...I did not see that today. This was his worst game in terms of PFF grades since his freshman year so perhaps it's an off day and this is why we watch multiple games before coming to conclusions...but not a great start tbh."
};
const KENYON_GAME_SESSIONS:Session[]=[
  {id:"demo-kenyon-texas-tech",opponent:"2025 · Texas Tech (CFP Quarters - Orange Bowl)",raw_notes:"I'm struggling to see the super athletic player that people view him as. He's not exactly lighting the world on fire by getting screaming open on his routes. He had 4 catches for 22 yards in this one. He made a really good catch to convert on 4th, which I COMMEND him for, but that doesn't exactly contribute to the super athletic build. He's not running away from LBs consistently. Also not an amazing blocker.",legacy:true},
  {id:"demo-kenyon-jmu",opponent:"2025 · James Madison (CFP Round 1)",raw_notes:"A really nice, short game for him. I had 3 notes but they all touched on things I wanted to see out of him. Great block, athletic catch, run after catch. Maybe he does finish as pre-draft TE1.",legacy:true},
  {id:"demo-kenyon-indiana",opponent:"2025 · Indiana",raw_notes:"The streets say that Kenyon Sadiq is the best TE in the nation...I did not see that today. This was his worst game in terms of PFF grades since his freshman year so perhaps it's an off day and this is why we watch multiple games before coming to conclusions...but not a great start tbh.",legacy:true}
];
const STATS=[
  ["Games","Games",false],["Receptions","Receptions",false],["Targets","Targets",false],["Yards","Yards",false],
  ["Yards/Rec","Yards/Rec",false],["Yards/Tgt","Yards/Tgt",false],["Touchdowns","Touchdowns",false],["Target %","Target %",true],["Catch %","Catch %",true]
] as const;

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
function heightInches(v:any){const s=String(v??"").trim(),m=s.match(/(\d+)\s*['′]\s*(\d+)?\s*([^"″]*)/);if(!m)return null;let n=Number(m[1])*12+Number(m[2]||0),f=String(m[3]||"");if(f.includes("¼"))n+=.25;else if(f.includes("½"))n+=.5;else if(f.includes("¾"))n+=.75;return n}
function enrichTE(row:any){const q:any={...row};q.Class??=q["Draft Class"];q["Yards/Tgt"]??=q["Yards/target"];q["1st Downs / Tgt"]??=q["1st/target"];q["Inline Snap %"]??=q["Inline Rate"];q["Slot Snap %"]??=q["Slot Rate"];q["Wide Snap %"]??=q["Wide Rate"];q["40 Yard Dash"]??=q["40-YD"];q["Bench Reps"]??=q["Bench Press"];q["Weighted Dom Rtg"]??=q["Weightd Dom Rtg"];const h=heightInches(q.Height),w=Number(q.Weight),forty=Number(q["40 Yard Dash"]);if(q.BMI==null&&h&&Number.isFinite(w))q.BMI=w*703/(h*h);if(q["Speed Score"]==null&&Number.isFinite(w)&&Number.isFinite(forty)&&forty>0)q["Speed Score"]=w*200/Math.pow(forty,4);return q}
function num(v:any,pct=false){if(v==null||v==="")return null;if(typeof v==="number")return Number.isFinite(v)?v:null;const s=String(v).trim(),n=Number(s.replace(/[%,$]/g,"").replace(/,/g,""));if(!Number.isFinite(n))return null;return pct||s.includes("%")?n/100:n}
function show(v:any,pct=false,digits=2){const n=num(v,pct);if(n==null)return "—";return pct?(n*100).toFixed(digits)+"%":n.toLocaleString(undefined,{maximumFractionDigits:digits})}
function fmt(v:number|null){return v==null?"—":v.toFixed(2)}
function heatColor(ratio:number){const r=Math.max(0,Math.min(1,ratio));return `hsl(${Math.round(r*120)} 72% 48%)`}
function conditionalStyle(value:any,values:number[]){const n=typeof value==="number"?value:null;if(n==null||!Number.isFinite(n)||!values.length)return undefined;const min=Math.min(...values),max=Math.max(...values),ratio=max===min?.5:(n-min)/(max-min),h=Math.round(ratio*120);return {background:`hsl(${h} 72% 42% / .18)`,boxShadow:`inset 0 -2px 0 hsl(${h} 72% 48% / .75)`}}
function scoreLabel(n:number|null){if(n==null)return "Not graded";if(n>=90)return"Elite";if(n>=80)return"Plus";if(n>=70)return"Solid";if(n>=60)return"Fringe";return"Concern"}

// Preview v2: verified TE scouting UX batch
export default function TEScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd,demoMode=false,draftClass=2027,priorReports={}}:Props){
  const {openPlayer}=usePlayerProfile();
  const [mode,setMode]=useState<Mode>("Evaluate"),[tab,setTab]=useState<Tab>("Film"),[search,setSearch]=useState(""),[selectedId,setSelectedId]=useState("");
  const [compareIds,setCompareIds]=useState<string[]>([]),[saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");
  const [sessions,setSessions]=useState<Record<string,Session[]>>({}),[newGameOpen,setNewGameOpen]=useState<Record<string,boolean>>({}),[newGame,setNewGame]=useState<Record<string,{opponent:string;notes:string}>>({});
  const [colleges,setColleges]=useState<any[]>([]);
  const {picks:draftPicks,updatedAt:draftUpdatedAt}=useDraftFeed();

  useEffect(()=>{fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json()).then(j=>Array.isArray(j)&&setColleges(j)).catch(()=>{})},[]);
  useEffect(()=>{if(!players.length){setSelectedId("");return}if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));setCompareIds(cur=>{const valid=cur.filter(id=>players.some(p=>String(p.id)===id));return valid.length?valid:players.map(p=>String(p.id))})},[players,selectedId]);
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"})},[]);

  const percentileImports=useMemo(()=>imports.filter((r:any)=>String(r?.Eligibility||"")!=="Scouting Override"),[imports]);
  const importMap=useMemo(()=>{const m=new Map<string,any>();for(const row of imports||[]){if(row?.Player)m.set(norm(row.Player),enrichTE(row))}return m},[imports]);
  const collegeMap=useMemo(()=>new Map<string,any>(colleges.map(x=>[norm(x.team),x] as [string,any])),[colleges]);
  const importedFor=(p:Player)=>importMap.get(norm(p.name))||{};
  const collegeFor=(p:Player)=>{const live=collegeMap.get(norm(p.college))||{},r=importMap.get(norm(p.name))||{};return demoMode&&r["Team Passing Attempts"]!=null?{...live,passAttempts:r["Team Passing Attempts"],passYards:r["Team Pass Yards"],passTDs:r["Team Pass TDs"],subdivision:r.Subdivision||live.subdivision||"FBS"}:live};
  const evalFor=(p:Player,cat:string)=>{
    const v=vals[p.id+"|"+cat];
    if(v!==undefined&&v!==null&&v!=="")return v;
    if(demoMode&&p.name==="Kenyon Sadiq")return TE_DEMO_DEFAULTS[cat];
    return v;
  };

  useEffect(()=>{for(const p of players){const id=String(p.id);if(sessions[id])continue;const legacy=String(evalFor(p,"__COMMENTARY__")||"").trim(),label=String(evalFor(p,"__GAME_LABEL__")||"").trim();if(demoMode){const seeded=p.name==="Kenyon Sadiq"?KENYON_GAME_SESSIONS:(legacy?[{id:"legacy-"+id,opponent:label||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]);setSessions(x=>x[id]?x:{...x,[id]:seeded});continue}fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{const live=Array.isArray(rows)?rows:[],fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:label||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];setSessions(x=>x[id]?x:{...x,[id]:live.length?live:fallback})}).catch(()=>{})}},[players,vals,demoMode]);

  function gameCountFor(p:Player){return (sessions[String(p.id)]||[]).length}
  function fieldsFor(p:Player){const out:any={...importedFor(p)};for(const cat of [...FILM,"Expected Role","Archetype","Draft Projection","Early Declare","Special Teams","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){const v=evalFor(p,cat);if(v!==undefined&&v!==null&&v!=="")out[cat]=v}out["Games watched"]=gameCountFor(p);return out}
  function earlyDeclareFor(p:Player){const r=importedFor(p);return earlyDeclareStatus(r.Class||r["Draft Class"],evalFor(p,"Early Declare"))}
  function scoutingFor(p:Player){return workbookScoutingGrade("TE",FILM.map(x=>num(evalFor(p,x))??NaN),fieldsFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  const combinePopulation=useMemo(()=>({forty:imports.map(r=>num(enrichTE(r)["40 Yard Dash"])).filter((x):x is number=>x!=null),speedScore:imports.map(r=>num(enrichTE(r)["Speed Score"])).filter((x):x is number=>x!=null),broadJump:[],handSize:imports.map(r=>num(enrichTE(r)["Hand Size"])).filter((x):x is number=>x!=null),vertical:[],benchReps:imports.map(r=>num(enrichTE(r)["Bench Reps"])).filter((x):x is number=>x!=null)}),[imports]);
  function combineFor(p:Player){const preview=demoMode?num(evalFor(p,"__PREVIEW_COMBINE_GRADE__")):null;if(preview!=null)return preview;const r=importedFor(p),height=heightInches(r.Height),weight=num(r.Weight),forty=num(r["40 Yard Dash"]),x={bmi:num(r.BMI)??undefined,forty:forty??undefined,speedScore:num(r["Speed Score"])??undefined,handSize:num(r["Hand Size"])??undefined,benchReps:num(r["Bench Reps"])??undefined,weight:weight??undefined,heightInches:height??undefined};return Object.values(x).some(v=>v!=null)?combineGrade("TE",x,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null}
  function prodMetrics(p:Player){const r=importedFor(p),c=collegeFor(p),recs=num(r.Receptions)||0,targets=num(r.Targets)||0,yards=num(r.Yards)||0,tds=num(r.Touchdowns)||0;const ydShare=num(c.passYards)?yards/(num(c.passYards)||1):null,tdShare=num(c.passTDs)?tds/(num(c.passTDs)||1):null;const career=[r["FR Yds/Rec"],r["Soph Yds/Rec"],r["JR Yds/Rec"],r["SR Yds/Rec"]].map(v=>num(v)).filter((v):v is number=>v!=null);const ypr=num(r["Yards/Rec"]),ypt=num(r["Yards/Tgt"]),targetShare=num(r["Target %"],true),catchPct=num(r["Catch %"],true),yptpa=num(r.YPTPA),weightedDomRtg=num(r["Weighted Dom Rtg"],true),domRtg=num(r["Dom Rtg"],true),maxYpr=num(r["Max Yds/Rec"]);return {yardsPerReception:ypr??(recs?yards/recs:null),yardsPerTarget:ypt??(targets?yards/targets:null),targetShare:targetShare??(num(c.passAttempts)?targets/(num(c.passAttempts)||1):null),catchPct:catchPct??(targets?recs/targets:null),yptpa:yptpa??(num(c.passAttempts)?yards/(num(c.passAttempts)||1):null),weightedDomRtg:weightedDomRtg??(ydShare!=null&&tdShare!=null?ydShare*.8+tdShare*.2:null),domRtg:domRtg??(ydShare!=null&&tdShare!=null?(ydShare+tdShare)/2:null),maxYardsPerRec:maxYpr??(career.length?Math.max(...career):null)}}
  const productionPopulation=useMemo(()=>({yardsPerReception:percentileImports.map(r=>num(enrichTE(r)["Yards/Rec"])).filter((x):x is number=>x!=null),yardsPerTarget:percentileImports.map(r=>num(enrichTE(r)["Yards/Tgt"])).filter((x):x is number=>x!=null),targetShare:percentileImports.map(r=>num(enrichTE(r)["Target %"],true)).filter((x):x is number=>x!=null),catchPct:percentileImports.map(r=>num(enrichTE(r)["Catch %"],true)).filter((x):x is number=>x!=null),yptpa:percentileImports.map(r=>num(enrichTE(r).YPTPA)).filter((x):x is number=>x!=null),weightedDomRtg:percentileImports.map(r=>num(enrichTE(r)["Weighted Dom Rtg"],true)).filter((x):x is number=>x!=null),domRtg:percentileImports.map(r=>num(enrichTE(r)["Dom Rtg"],true)).filter((x):x is number=>x!=null),speedScore:percentileImports.map(r=>num(enrichTE(r)["Speed Score"])).filter((x):x is number=>x!=null)}),[imports]);
  function productionFor(p:Player){const scouting=scoutingFor(p);if(scouting==null)return null;const r=importedFor(p),m=prodMetrics(p),college=collegeFor(p);const computed={yardsPerReception:m.yardsPerReception==null?undefined:percentRankInc(productionPopulation.yardsPerReception,m.yardsPerReception)??undefined,yardsPerTarget:m.yardsPerTarget==null?undefined:percentRankInc(productionPopulation.yardsPerTarget,m.yardsPerTarget)??undefined,targetShare:m.targetShare==null?undefined:percentRankInc(productionPopulation.targetShare,m.targetShare)??undefined,catchPct:m.catchPct==null?undefined:percentRankInc(productionPopulation.catchPct,m.catchPct)??undefined,yptpa:m.yptpa==null?undefined:percentRankInc(productionPopulation.yptpa,m.yptpa)??undefined,weightedDomRtg:m.weightedDomRtg==null?undefined:percentRankInc(productionPopulation.weightedDomRtg,m.weightedDomRtg)??undefined,domRtg:m.domRtg==null?undefined:percentRankInc(productionPopulation.domRtg,m.domRtg)??undefined,speedScore:num(r["Speed Score"])==null?undefined:percentRankInc(productionPopulation.speedScore,num(r["Speed Score"]))??undefined};const percentiles=demoMode?{yardsPerReception:num(evalFor(p,"__PROD_PCT_YPR__"))??computed.yardsPerReception,yardsPerTarget:num(evalFor(p,"__PROD_PCT_YPT__"))??computed.yardsPerTarget,targetShare:num(evalFor(p,"__PROD_PCT_TARGET__"))??computed.targetShare,catchPct:num(evalFor(p,"__PROD_PCT_CATCH__"))??computed.catchPct,yptpa:num(evalFor(p,"__PROD_PCT_YPTPA__"))??computed.yptpa,weightedDomRtg:num(evalFor(p,"__PROD_PCT_WEIGHTED__"))??computed.weightedDomRtg,domRtg:num(evalFor(p,"__PROD_PCT_DOM__"))??computed.domRtg,speedScore:num(evalFor(p,"__PROD_PCT_SPEED__"))??computed.speedScore}:computed;return teProductionGrade({scouting,yardsPerReception:m.yardsPerReception,yardsPerTarget:m.yardsPerTarget,targetShare:m.targetShare,catchPct:m.catchPct,yptpa:m.yptpa,weightedDomRtg:m.weightedDomRtg,domRtg:m.domRtg,speedScore:num(r["Speed Score"]),combineScore:combineFor(p),maxYardsPerRec:m.maxYardsPerRec,isNonFbs:college?.subdivision==="FCS"},productionPopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined,percentiles)}
  function rawProductionMetricDataFor(p:Player){
    const r=importedFor(p),m=prodMetrics(p);
    const specs=[
      {label:"Games",raw:num(r.Games),pct:false,values:percentileImports.map(x=>num(enrichTE(x).Games)).filter((v):v is number=>v!=null),digits:0},
      {label:"Receptions",raw:num(r.Receptions),pct:false,values:percentileImports.map(x=>num(enrichTE(x).Receptions)).filter((v):v is number=>v!=null),digits:0},
      {label:"Targets",raw:num(r.Targets),pct:false,values:percentileImports.map(x=>num(enrichTE(x).Targets)).filter((v):v is number=>v!=null),digits:0},
      {label:"Yards",raw:num(r.Yards),pct:false,values:percentileImports.map(x=>num(enrichTE(x).Yards)).filter((v):v is number=>v!=null),digits:0},
      {label:"Yards/Rec",raw:m.yardsPerReception,pct:false,values:productionPopulation.yardsPerReception,digits:2},
      {label:"Yards/Tgt",raw:m.yardsPerTarget,pct:false,values:productionPopulation.yardsPerTarget,digits:2},
      {label:"Touchdowns",raw:num(r.Touchdowns),pct:false,values:percentileImports.map(x=>num(enrichTE(x).Touchdowns)).filter((v):v is number=>v!=null),digits:0},
      {label:"Target %",raw:m.targetShare,pct:true,values:productionPopulation.targetShare,digits:1},
      {label:"Catch %",raw:m.catchPct,pct:true,values:productionPopulation.catchPct,digits:1}
    ];
    return specs.map(s=>({...s,percentile:s.raw==null?null:percentRankInc(s.values,s.raw)}));
  }
  function productionMetricDataFor(p:Player){
    const m=prodMetrics(p);
    const maxYpr=(row:any)=>{const vals=[row?.["FR Yds/Rec"],row?.["Soph Yds/Rec"],row?.["JR Yds/Rec"],row?.["SR Yds/Rec"],row?.["Max Yds/Rec"]].map(v=>num(v)).filter((v):v is number=>v!=null);return vals.length?Math.max(...vals):null};
    const specs=[
      {label:"Weighted Dom Rtg",raw:m.weightedDomRtg,pct:true,values:productionPopulation.weightedDomRtg,override:"__PROD_PCT_WEIGHTED__"},
      {label:"Dom Rtg",raw:m.domRtg,pct:true,values:productionPopulation.domRtg,override:"__PROD_PCT_DOM__"},
      {label:"YPTPA",raw:m.yptpa,pct:false,values:productionPopulation.yptpa,override:"__PROD_PCT_YPTPA__"},
      {label:"Max Yds/Rec",raw:m.maxYardsPerRec,pct:false,values:percentileImports.map(x=>maxYpr(enrichTE(x))).filter((v):v is number=>v!=null),override:null}
    ];
    return specs.map(s=>{const preview=demoMode&&s.override?num(evalFor(p,s.override)):null,base=s.raw==null?null:percentRankInc(s.values,s.raw);return {...s,percentile:preview??base}});
  }
  function metricDataFor(p:Player){const r=importedFor(p);return ANALYTICS.map(m=>{const population=percentileImports.map(x=>num(enrichTE(x)[m.label],m.pct)).filter((v):v is number=>v!=null),raw=num(r[m.label],m.pct),preview=demoMode?num(evalFor(p,"__AN_PCT_"+m.sheet)):null,base=raw==null?null:percentRankInc(population,raw),percentile=preview??(base==null?null:(m.inverse?1-base:base));return {...m,raw,percentile}})}
  function analyticalFor(p:Player){const scouting=scoutingFor(p);if(scouting==null)return null;const rec=Object.fromEntries(metricDataFor(p).map(m=>[m.sheet,m.percentile])) as Record<string,number|null>;return teAnalyticalGrade(scouting,rec,(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  function preDraftFor(p:Player){const s=scoutingFor(p);if(s==null)return null;return preDraftGrade("TE",s,productionFor(p),analyticalFor(p),earlyDeclareFor(p).yes,(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  function draftContextFor(p:Player){const fields=fieldsFor(p);return resolveDraftContext("TE",p.name,draftPicks,{result:fields["Draft Result"],teamScore:fields["Team Score (10)"],draftCapitalScore:fields["Draft Capital Score (10)"]})}
  function finalGradeFor(p:Player){const pre=preDraftFor(p);if(pre==null)return null;const d=draftContextFor(p);return d.finalized?draftAdjustedFinalGrade("TE",pre,d.teamScore,d.draftCapitalScore,(glossary.length?glossary:undefined) as GlossaryRows|undefined):pre}
  function rankingGradeFor(p:Player){return preDraftFor(p)??scoutingFor(p)}
  const rankedPlayers=useMemo(()=>[...players].sort((a,b)=>{const ga=rankingGradeFor(a),gb=rankingGradeFor(b);if(ga==null&&gb==null)return(a.watch_order||9999)-(b.watch_order||9999);if(ga==null)return 1;if(gb==null)return-1;return gb-ga||((a.watch_order||9999)-(b.watch_order||9999))}),[players,vals,imports,colleges,glossary,sessions]);
  const filtered=useMemo(()=>{const q=norm(search);return rankedPlayers.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q))},[rankedPlayers,search]);

  async function persist(p:Player,cat:string,value:any){setSaveState("saving");setVals(v=>({...v,[p.id+"|"+cat]:value}));if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}try{await onSave(p,cat,value);setSaveState("saved")}catch{setSaveState("error")}}
  function local(p:Player,cat:string,value:any){setVals(v=>({...v,[p.id+"|"+cat]:value}))}
  async function saveSession(p:Player,s:Session,patch:Partial<Session>){const id=String(p.id),next={...s,...patch};setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?next:y)}));if(s.legacy||demoMode){if(patch.raw_notes!==undefined)await persist(p,"__COMMENTARY__",patch.raw_notes||"");if(patch.opponent!==undefined)await persist(p,"__GAME_LABEL__",patch.opponent||"");return}await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,opponent:next.opponent,rawNotes:next.raw_notes})})}
  async function addSession(p:Player){const id=String(p.id),d=newGame[id]||{opponent:"",notes:""};if(!d.opponent.trim()&&!d.notes.trim())return;if(demoMode){setSessions(x=>({...x,[id]:[{id:"demo-"+Date.now(),opponent:d.opponent||"New game",raw_notes:d.notes,legacy:true},...(x[id]||[])]}))}else{const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,opponent:d.opponent,rawNotes:d.notes})});if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}}setNewGame(x=>({...x,[id]:{opponent:"",notes:""}}));setNewGameOpen(x=>({...x,[id]:false}))}

  useEffect(()=>{if(mode!=="Evaluate")return;const nodes=rankedPlayers.map(p=>document.getElementById("te-eval-"+p.id)).filter(Boolean) as HTMLElement[];if(!nodes.length)return;const obs=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setSelectedId(String((visible[0].target as HTMLElement).dataset.playerId||""))},{rootMargin:"-150px 0px -65% 0px",threshold:[0,.01]});nodes.forEach(n=>obs.observe(n));return()=>obs.disconnect()},[mode,rankedPlayers]);
  function jump(p:Player){setMode("Evaluate");setSelectedId(String(p.id));requestAnimationFrame(()=>document.getElementById("te-eval-"+p.id)?.scrollIntoView({behavior:"smooth",block:"start"}))}

  function renderPlayer(p:Player){const id=String(p.id),r=importedFor(p),c=collegeFor(p),metrics=metricDataFor(p),productionMetrics=productionMetricDataFor(p),rawProductionMetrics=rawProductionMetricDataFor(p),scouting=scoutingFor(p),production=productionFor(p),analytical=analyticalFor(p),pre=preDraftFor(p),fields=fieldsFor(p),combine=combineFor(p),draftCtx=draftContextFor(p),teamScore=draftCtx.teamScore,draftCap=draftCtx.draftCapitalScore,g=(glossary.length?glossary:undefined) as GlossaryRows|undefined,teamAdj=pre==null?null:(teamScore-5)*2*glossaryNumber(32,g),capitalAdj=pre==null?null:(draftCap-5)*2*glossaryNumber(33,g),final=pre==null?null:(draftCtx.finalized?draftAdjustedFinalGrade("TE",pre,teamScore,draftCap,g):pre),rank=rankedPlayers.indexOf(p)+1,complete=FILM.filter(x=>num(evalFor(p,x))!=null).length,games=gameCountFor(p),style=schoolStyle(p.college),d=newGame[id]||{opponent:"",notes:""},pm=prodMetrics(p);
    return <article className="qb-evaluate-player" id={"te-eval-"+p.id} data-player-id={p.id} key={p.id}>
      <ScoutingPlayerHero player={p} position="TE" rank={rank} style={style} age={r.Age} classLabel={r.Class} gamesWatched={games} draftTeam={draftCtx.automated?draftCtx.team:"TBD"} draftAutomated={draftCtx.automated} saveState={saveState} demoMode={demoMode} onOpen={!demoMode?()=>openPlayer(p.id):undefined} extraMeta={null}/>
      <div className="qb-grade-strip te-grade-strip" style={{gridTemplateColumns:"repeat(5,minmax(0,1fr))"}}><GradeCard label="Scouting" value={scouting} hint={complete+"/7 traits"}/><GradeCard label="Production" value={production} hint="Workbook production model"/><GradeCard label="Analytical" value={analytical} hint="PFF percentile model"/><GradeCard label="Pre-Draft" value={pre} hint="Scout + prod + analytics"/><GradeCard label="Final" value={final} hint={pre==null?"Waiting for pre-draft grade":draftCtx.finalized?"Draft-adjusted":"Matches Pre-Draft until NFL Draft"}/></div>

      {tab==="Film"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2></div><div className="qb-completion">{complete}/7 complete</div></div>
        <div className="qb-context-grid"><ConstrainedField label="Expected role" value={String(evalFor(p,"Expected Role")==="TE 3"?"TE 3+":(evalFor(p,"Expected Role")||""))} options={[...ROLE_OPTIONS]} onLocal={v=>local(p,"Expected Role",v)} onCommit={v=>persist(p,"Expected Role",v)}/><MultiSelectField label="Archetype" value={evalFor(p,"Archetype")} options={ARCHETYPE_OPTIONS} onCommit={v=>persist(p,"Archetype",v)}/><ConstrainedField label="Draft projection" value={String(evalFor(p,"Draft Projection")||"")} options={[...PROJECTION_OPTIONS]} onLocal={v=>local(p,"Draft Projection",v)} onCommit={v=>persist(p,"Draft Projection",v)}/></div>
        <div className="qb-film-grid">{FILM.map(trait=>{const n=num(evalFor(p,trait));return <div className="qb-trait-card" key={trait} style={{"--heat":heatColor((n??50)/100)} as any}><div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div><input className="qb-grade-slider heat" type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(p,trait,Number(e.target.value))} onPointerUp={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))}/><div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div><input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={evalFor(p,trait)??""} onChange={e=>local(p,trait,e.target.value)} onBlur={e=>persist(p,trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)}/></div>})}</div>
        <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Role & Risk</h2></div></div><div className="qb-context-grid scouting-adjustments-grid"><EarlyDeclareField classLabel={r.Class||r["Draft Class"]} value={evalFor(p,"Early Declare")} onCommit={v=>persist(p,"Early Declare",v)}/>{ADJUSTMENTS.map(([label,opts])=><Field key={label} label={label}><select value={evalFor(p,label)||opts[0]} onChange={e=>persist(p,label,e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select></Field>)}</div>
        <div className="qb-game-log"><div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2></div><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:!x[id]}))}>+ Add game</button></div>{newGameOpen[id]&&<div className="qb-game-note new"><input value={d.opponent} onChange={e=>setNewGame(x=>({...x,[id]:{...d,opponent:e.target.value}}))} placeholder="Season · Opponent"/><textarea value={d.notes} onChange={e=>setNewGame(x=>({...x,[id]:{...d,notes:e.target.value}}))}/><button onClick={()=>addSession(p)}>Add to top</button></div>}{(sessions[id]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}><div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{opponent:e.target.value})}/></div><textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{raw_notes:e.target.value})}/></div>)}</div>
      </div>}

      {tab==="Production"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Stats</span><h2>Raw Stats</h2><p>Season receiving output with TE Data percentiles for quick context.</p></div><GradePill value={production}/></div>
        <div className="qb-analytics-grid">{rawProductionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>TE Data percentile</small></div><b>{show(m.raw,m.pct,m.pct?1:m.digits)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-section-head compact"><div><span className="ey">Production Model</span><h2>Production</h2><p>Workbook production inputs: YPTPA, weighted dominator, dominator rating and peak yards per reception.</p></div></div>
        <div className="qb-analytics-grid te-production-model-grid">{productionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>Higher is better</small></div><b>{show(m.raw,m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-section-head compact"><div><span className="ey">Current Team Context</span><h2>{p.college}</h2></div></div><div className="qb-stat-grid"><Stat label="Team Pass Attempts" value={show(c.passAttempts,false,0)}/><Stat label="Team Pass Yards" value={show(c.passYards,false,0)}/><Stat label="Team Pass TD" value={show(c.passTDs,false,0)}/><Stat label="Subdivision" value={c.subdivision||"—"}/></div></div>}

      {tab==="Analytics"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">PFF + Calculated</span><h2>Analytical Profile</h2></div><GradePill value={analytical}/></div><div className="qb-analytics-grid">{metrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower raw is better":"Higher raw is better"}</small></div><b>{show(r[m.label],m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div></div>}

      {tab==="Combine"&&<CombineTestingSection playerName={p.name} position="TE" data={r} grade={combine}/>}
      
      {tab==="Draft"&&<DraftAdjustmentPanel preDraft={pre} finalGrade={final} draftResult={draftCtx.result} teamScore={teamScore} draftCapital={draftCap} teamAdj={teamAdj} capitalAdj={capitalAdj} production={true} updatedAt={draftUpdatedAt}/>}
      <PriorFilmReport report={priorReports?.[id]}/>
    </article>
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched TEs yet</h2><p>Add a tight end to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;
  const comparePlayers=rankedPlayers.filter(p=>compareIds.includes(String(p.id)));
  return <div className="qb-workspace te-workspace"><aside className="qb-prospect-rail"><div className="qb-rail-head"><div><span className="ey">{draftClass} Tight Ends</span><strong>{players.length} available</strong></div><button className="qb-add" onClick={onAdd}>+</button></div><div className="qb-mode-toggle">{(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}</div><input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tight ends…"/><div className="qb-prospect-list">{filtered.map(p=>{const rank=rankedPlayers.indexOf(p)+1,g=rankingGradeFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length;return <div className={"qb-prospect-row "+(String(p.id)===selectedId?"active":"")} key={p.id}><button className="qb-prospect-item" onClick={()=>jump(p)}><span className="qb-rank">TE{rank}</span><span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college} · {done}/7 traits</small></span><span className="qb-mini-grade">{fmt(g)}</span></button></div>})}</div>{demoMode&&<div className="qb-demo-note">Previewing Kenyon Sadiq as a 2027 TE test profile.</div>}</aside><section className={"qb-scouting-pane "+(mode==="Evaluate"?"evaluate":"compare")}>{mode==="Compare"?<CompareView players={comparePlayers} allPlayers={rankedPlayers} compareIds={compareIds} setCompareIds={setCompareIds} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} productionFor={productionFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor} finalGradeFor={finalGradeFor} draftContextFor={draftContextFor} gameCountFor={gameCountFor} metricDataFor={metricDataFor}/>:<div className="qb-evaluate-stack"><nav className="qb-section-tabs qb-shared-tabs">{(["Film","Production","Analytics","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>{rankedPlayers.map(renderPlayer)}</div>}</section></div>
}

function CompareView({players,allPlayers,compareIds,setCompareIds,vals,importedFor,scoutingFor,productionFor,analyticalFor,preDraftFor,finalGradeFor,draftContextFor,gameCountFor,metricDataFor}:{players:Player[],allPlayers:Player[],compareIds:string[],setCompareIds:React.Dispatch<React.SetStateAction<string[]>>,vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,productionFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null,finalGradeFor:(p:Player)=>number|null,draftContextFor:(p:Player)=>any,gameCountFor:(p:Player)=>number,metricDataFor:(p:Player)=>any[]}){
  type M={key:string;group:string;label:string;numeric?:boolean;get:(p:Player)=>any;format?:(v:any)=>string};
  const [open,setOpen]=useState(false),[sortKey,setSortKey]=useState("rank"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const metrics:M[]=[
    {key:"scouting",group:"Grades",label:"Scouting",numeric:true,get:scoutingFor,format:fmt},{key:"production",group:"Grades",label:"Production",numeric:true,get:productionFor,format:fmt},{key:"analytical",group:"Grades",label:"Analytical",numeric:true,get:analyticalFor,format:fmt},{key:"predraft",group:"Grades",label:"Pre-Draft",numeric:true,get:preDraftFor,format:fmt},{key:"final",group:"Grades",label:"Final",numeric:true,get:finalGradeFor,format:fmt},
    {key:"games",group:"Profile",label:"Games Watched",numeric:true,get:gameCountFor},{key:"role",group:"Profile",label:"Role",get:p=>vals[p.id+"|Expected Role"]||"—"},{key:"archetype",group:"Profile",label:"Archetype",get:p=>vals[p.id+"|Archetype"]||"—"},{key:"proj",group:"Profile",label:"Draft Projection",get:p=>vals[p.id+"|Draft Projection"]||"—"},{key:"draftResult",group:"Profile",label:"Draft Result",get:p=>draftContextFor(p).result||"—"},
    ...FILM.map(label=>({key:"film-"+label,group:"Film",label,numeric:true,get:(p:Player)=>num(vals[p.id+"|"+label]),format:(v:any)=>v==null?"—":Number(v).toFixed(2)})),
    ...STATS.map(([label,key,pct])=>({key:"stat-"+key,group:"Production",label,numeric:true,get:(p:Player)=>num(importedFor(p)[key],pct),format:(v:any)=>v==null?"—":pct?(Number(v)*100).toFixed(1)+"%":Number(v).toFixed(label.includes("Yards /")?2:0)})),
    ...ANALYTICS.map(a=>({key:"a-"+a.label,group:"Analytics",label:a.label+" %ile",numeric:true,get:(p:Player)=>{const m=metricDataFor(p).find((x:any)=>x.label===a.label);return m?.percentile==null?null:m.percentile*100},format:(v:any)=>v==null?"—":Math.round(Number(v)).toString()}))
  ];
  const map=new Map(metrics.map(m=>[m.key,m])),groups=Array.from(new Set(metrics.map(m=>m.group))).map(group=>({group,count:metrics.filter(m=>m.group===group).length}));
  const change=(key:string)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir(key==="rank"||key==="player"?"asc":"desc")}};
  const sorted=[...players].sort((a,b)=>{let av:any,bv:any;if(sortKey==="rank"){av=allPlayers.indexOf(a)+1;bv=allPlayers.indexOf(b)+1}else if(sortKey==="player"){av=(a.name+" "+a.college).toLowerCase();bv=(b.name+" "+b.college).toLowerCase()}else{const m=map.get(sortKey);av=m?.get(a);bv=m?.get(b)}if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return sortDir==="asc"?cmp:-cmp});
  const arrow=(k:string)=>sortKey===k?(sortDir==="asc"?" ↑":" ↓"):"";
  return <div className="qb-compare-view"><div className="qb-compare-head"><div><span className="ey">Side-by-Side</span><h2>TE Comparison Board</h2><p>Every numeric column is sortable and conditionally formatted inside the current comparison set.</p></div><div className="qb-compare-controls"><button className="ghost" onClick={()=>setCompareIds(allPlayers.map(p=>String(p.id)))}>All players</button><div className="qb-compare-filter"><button className="qb-compare-filter-button" onClick={()=>setOpen(x=>!x)}>{players.length} of {allPlayers.length} Players ▾</button>{open&&<div className="qb-compare-filter-list">{allPlayers.map(p=><label key={p.id}><input type="checkbox" checked={compareIds.includes(String(p.id))} onChange={()=>setCompareIds(cur=>cur.includes(String(p.id))?cur.filter(x=>x!==String(p.id)):[...cur,String(p.id)])}/><span>TE{allPlayers.indexOf(p)+1}</span><b>{p.name}</b><small>{p.college}</small></label>)}</div>}</div></div></div><div className="qb-compare-scroll"><table className="qb-compare-matrix"><thead><tr className="groups"><th rowSpan={2}><button onClick={()=>change("rank")}>Rank{arrow("rank")}</button></th><th rowSpan={2}><button onClick={()=>change("player")}>Player / School{arrow("player")}</button></th>{groups.map(g=><th colSpan={g.count} key={g.group}>{g.group}</th>)}</tr><tr>{metrics.map(m=><th key={m.key}><button onClick={()=>change(m.key)}>{m.label}{arrow(m.key)}</button></th>)}</tr></thead><tbody>{sorted.map(p=><tr key={p.id}><th className="rank">TE{allPlayers.indexOf(p)+1}</th><th className="player" style={schoolStyle(p.college)}><b>{p.name}</b><small> · {p.college}</small></th>{metrics.map(m=>{const raw=m.get(p),values=m.numeric?players.map(x=>m.get(x)).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)):[];return <td key={m.key} className={m.numeric?"numeric":""} style={m.numeric?conditionalStyle(raw,values):undefined}>{m.format?m.format(raw):(raw??"—")}</td>})}</tr>)}</tbody></table></div></div>
}

function GradeCard({label,value,hint}:{label:string,value:number|null,hint:string}){return <div className="qb-grade-card"><span>{label}</span><strong>{fmt(value)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{fmt(value)}</b></div>}
function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>Scout</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
function Stat({label,value}:{label:string,value:any}){return <div className="qb-stat-card"><span>{label}</span><strong>{value}</strong></div>}
function ConstrainedField({label,value,options,onLocal,onCommit}:{label:string,value:string,options:string[],onLocal:(v:string)=>void,onCommit:(v:string)=>void|Promise<any>}){
  const isCustom=Boolean(value)&&!options.includes(value);
  const [other,setOther]=useState(isCustom);
  useEffect(()=>setOther(Boolean(value)&&!options.includes(value)),[value,options]);
  return <Field label={label}><div className="qb-constrained">
    <select value={other?"Other":value} onChange={e=>{
      if(e.target.value==="Other"){setOther(true);onLocal("")}
      else{setOther(false);onLocal(e.target.value);onCommit(e.target.value)}
    }}>
      <option value="">Select…</option>
      {options.map(x=><option key={x}>{x}</option>)}
      <option>Other</option>
    </select>
    {other&&<input value={value} onChange={e=>onLocal(e.target.value)} onBlur={e=>onCommit(e.target.value)} placeholder={"Other "+label.toLowerCase()+"…"}/>}
  </div></Field>
}
