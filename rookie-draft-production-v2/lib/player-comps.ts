import {getHistoricalScoutingRows,normHistoricalName,type HistoricalPosition,type HistoricalScoutingSnapshot} from "@/lib/historical-scouting";
import {historicalEvaluations} from "@/lib/historical-scouting";
import {allCompProfiles} from "@/lib/comp-profiles";
import {allCompOverlays} from "@/lib/comp-profiles/overlays";

/**
 * Player Comps: finds the most similar previously-scouted player for a card.
 * Pure + deterministic (no network). Only uses data already stored on the site.
 * - pool: scouted classes 2022-2026 (bundled historical snapshots); only classes BEFORE the target's class are eligible
 * - features compare on what BOTH players have; missing fields are dropped, never guessed
 * - draft capital is NOT a matching feature (it is shown on the comp, never used to match)
 * - archetypes are not used
 */

export type Pos=HistoricalPosition;
export type EvalRow={category:string;value?:number|string|null;commentary?:string|null};
export type CompTarget={name:string;position:Pos;draftClass:number;college?:string|null;evaluations:EvalRow[];grades?:Record<string,unknown>|null;notes?:string|null};

type Group="meas"|"prod"|"anal"|"skill"|"grade";
type Ctx={find:(labels:string[],groupRe?:RegExp)=>number|null;skill:(bases:string[])=>number|null;height:()=>number|null};
type FeatureSpec={id:string;label:string;group:Group;w?:number;fmt?:"int"|"1"|"2"|"pct"|"ratio"|"in";pct?:boolean;get:(c:Ctx)=>number|null};

export const POOL_YEARS=[2022,2023,2024,2025,2026] as const;
export type Weights=Record<Group|"notes",number>;
export const DEFAULT_WEIGHTS:Weights={meas:.25,prod:.28,anal:.23,skill:.15,grade:.04,notes:.05};
export const WEIGHT_KEYS=["meas","prod","anal","skill","grade","notes"] as const;
/** Accepts percents or fractions in any scale; returns non-negative weights that sum to 1 (falls back to defaults if unusable). */
export function normalizeWeights(input:unknown):Weights{
  const src=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const raw=Object.fromEntries(WEIGHT_KEYS.map(k=>{const n=Number(src[k]);return [k,Number.isFinite(n)&&n>0?n:0]})) as Weights;
  const total=WEIGHT_KEYS.reduce((a,k)=>a+raw[k],0);
  if(total<=0)return {...DEFAULT_WEIGHTS};
  return Object.fromEntries(WEIGHT_KEYS.map(k=>[k,raw[k]/total])) as Weights;
}
const STAT_GROUP=/stats|production/i;
const ANALYTIC_GROUP=/analytic/i;

// ---------- value parsing ----------
const toNum=(v:unknown):number|null=>{if(v==null||v==="")return null;const n=typeof v==="number"?v:Number(String(v).replace(/[%,$]/g,"").trim());return Number.isFinite(n)?n:null};
export function parseHeight(v:unknown):number|null{
  if(v==null)return null;
  const s=String(v).replace(/[″"”]/g,"").trim();
  const m=s.match(/(\d)\s*['′’-]\s*(\d{1,2}(?:\.\d+)?)?/);
  if(!m)return null;
  const inches=Number(m[1])*12+Number(m[2]||0);
  return inches>=60&&inches<=84?inches:null;
}
const splitCategory=(category:string)=>{const i=category.lastIndexOf(" · ");return i>=0?{group:category.slice(0,i),label:category.slice(i+3)}:{group:"",label:category}};
const stripScale=(label:string)=>{const m=label.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\)\s*$/);return m?{base:m[1].trim(),max:Number(m[2])}:{base:label.trim(),max:null as number|null}};

function makeCtx(rows:EvalRow[],grades?:Record<string,unknown>|null):Ctx{
  const parsed=rows.map(r=>({...splitCategory(String(r.category)),value:r.value})).filter(r=>r.label!=="__COMMENTARY__"&&r.label!=="__GAME_LABEL__");
  const find=(labels:string[],groupRe?:RegExp)=>{
    for(const r of parsed){
      if(!labels.includes(r.label))continue;
      // rows with no group prefix (live evaluations) can't be told apart, so first match wins
      if(groupRe&&r.group&&!groupRe.test(r.group))continue;
      const n=toNum(r.value);if(n!=null)return n;
    }
    return null;
  };
  const skill=(bases:string[])=>{
    for(const r of parsed){
      if(r.group&&r.group!=="Scouting")continue;
      const {base,max}=stripScale(r.label);
      if(!bases.includes(base))continue;
      const n=toNum(r.value);if(n==null)continue;
      const pct=max?n/max*100:n;
      return pct>=0&&pct<=100?pct:null;
    }
    return null;
  };
  const height=()=>{for(const r of parsed)if(r.label==="Height"){const h=parseHeight(r.value);if(h!=null)return h}return null};
  if(grades)for(const [k,v] of Object.entries(grades)){const n=toNum(v);if(n!=null)parsed.push({group:"Grades",label:k,value:n})}
  return {find,skill,height};
}

// ---------- feature definitions (shared across years; labels vary by class so each lists its aliases) ----------
const rate=(a:number|null,b:number|null)=>a!=null&&b!=null&&b>0?a/b:null;
const meas:FeatureSpec[]=[
  {id:"height",label:"Height",group:"meas",fmt:"in",get:c=>c.height()},
  {id:"weight",label:"Weight",group:"meas",fmt:"int",get:c=>c.find(["Weight"])},
  {id:"bmi",label:"BMI",group:"meas",fmt:"1",w:.6,get:c=>c.find(["BMI"])},
  {id:"forty",label:"40-yard dash",group:"meas",fmt:"2",get:c=>c.find(["40 Yard Dash"])},
  {id:"speedscore",label:"Speed Score",group:"meas",fmt:"int",w:.6,get:c=>c.find(["Speed Score"])},
];
const grades:FeatureSpec[]=[
  {id:"g_anal",label:"Analytical Grade",group:"grade",fmt:"1",get:c=>c.find(["Analytical Grade"],/grades/i)},
];
const G=(c:Ctx,labels:string[])=>c.find(labels,STAT_GROUP);
const A=(c:Ctx,labels:string[])=>c.find(labels,ANALYTIC_GROUP);
const perGame=(c:Ctx,labels:string[])=>rate(G(c,labels),G(c,["Games"]));

const SPECS:Record<Pos,FeatureSpec[]>={
  QB:[
    ...meas,...grades,
    {id:"comp",label:"Completion %",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Completion %"])},
    {id:"ypa",label:"Yards / Attempt",group:"prod",fmt:"1",get:c=>G(c,["Yards/Attempt"])},
    {id:"td_rate",label:"TD rate",group:"prod",fmt:"ratio",get:c=>{const td=G(c,["Touchdowns"]),a=G(c,["Attempts"]);return rate(td,a)}},
    {id:"int_rate",label:"INT rate",group:"prod",fmt:"ratio",get:c=>rate(G(c,["Interceptions"]),G(c,["Attempts"]))},
    {id:"rush_pg",label:"Rushes / game",group:"prod",fmt:"1",get:c=>perGame(c,["Rushes"])},
    {id:"adot",label:"ADOT",group:"anal",fmt:"1",get:c=>A(c,["ADOT"])},
    {id:"adj_comp",label:"Adjusted Comp %",group:"anal",pct:true,fmt:"1",get:c=>A(c,["ADJ Comp %","Adjusted Comp %"])},
    {id:"btt",label:"Big-time throw %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["BTT %"])},
    {id:"twp",label:"Turnover-worthy %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["TWP %"])},
    {id:"scr",label:"Scrambles",group:"anal",fmt:"int",w:.7,get:c=>A(c,["Scrambles"])},
    {id:"arm",label:"Arm Strength",group:"skill",fmt:"int",get:c=>c.skill(["Arm Strength"])},
    {id:"acc",label:"Accuracy",group:"skill",fmt:"int",get:c=>c.skill(["Accuracy"])},
    {id:"mob",label:"Mobility",group:"skill",fmt:"int",get:c=>c.skill(["Mobility"])},
  ],
  RB:[
    ...meas,...grades,
    {id:"ypc",label:"Yards / Carry",group:"prod",fmt:"1",get:c=>G(c,["Yards/Carry"])},
    {id:"ypt",label:"Yards / Touch",group:"prod",fmt:"1",get:c=>G(c,["Yards/Touch"])},
    {id:"yptp",label:"YPTP",group:"prod",fmt:"2",get:c=>G(c,["YPTP"])},
    {id:"recshare",label:"Reception share",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Rec Share %"])},
    {id:"dom",label:"Dominator rating",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Dom Rtg"])},
    {id:"car_pg",label:"Carries / game",group:"prod",fmt:"1",w:.8,get:c=>perGame(c,["Carries"])},
    {id:"elus",label:"Elusive rating",group:"anal",fmt:"1",get:c=>A(c,["Elusive Rating"])},
    {id:"brk",label:"Breakaway %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["Breakaway %"])},
    {id:"yac",label:"YAC / reception",group:"anal",fmt:"1",get:c=>A(c,["YAC/Rec"])},
    {id:"adot",label:"ADOT",group:"anal",fmt:"1",w:.7,get:c=>A(c,["ADOT"])},
    {id:"pbg",label:"Pass-block grade",group:"anal",fmt:"1",w:.7,get:c=>A(c,["Pass Block Grade"])},
    {id:"vision",label:"Vision",group:"skill",fmt:"int",get:c=>c.skill(["Ball Carrier Vision"])},
    {id:"carrying",label:"Carrying",group:"skill",fmt:"int",w:.7,get:c=>c.skill(["Carrying"])},
    {id:"elusiveness",label:"Elusiveness",group:"skill",fmt:"int",get:c=>c.skill(["Elusiveness"])},
    {id:"speed",label:"Speed",group:"skill",fmt:"int",get:c=>c.skill(["Game Speed","Big Play Speed"])},
    {id:"contact",label:"Contact balance",group:"skill",fmt:"int",get:c=>c.skill(["Body Ctrl / Contact Balance","Contact Balance"])},
    {id:"receiving",label:"Receiving",group:"skill",fmt:"int",get:c=>c.skill(["Receiving Skills"])},
    {id:"passblock",label:"Pass blocking",group:"skill",fmt:"int",w:.7,get:c=>c.skill(["Pass Blocking"])},
  ],
  WR:[
    ...meas,...grades,
    {id:"ypr",label:"Yards / Reception",group:"prod",fmt:"1",get:c=>G(c,["Yards/Rec"])},
    {id:"ypt",label:"Yards / Target",group:"prod",fmt:"1",get:c=>G(c,["Yards/Tgt"])},
    {id:"tgt",label:"Target share",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Target %"])},
    {id:"catch",label:"Catch %",group:"prod",pct:true,fmt:"pct",w:.8,get:c=>G(c,["Catch %"])},
    {id:"yptpa",label:"YPTPA",group:"prod",fmt:"2",get:c=>G(c,["YPTPA"])},
    {id:"dom",label:"Dominator rating",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Dom Rtg"])},
    {id:"drop",label:"Drop %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["Drop %"])},
    {id:"traffic",label:"Catch in traffic %",group:"anal",pct:true,fmt:"pct",w:.8,get:c=>A(c,["Catch in Traffic %"])},
    {id:"yrr",label:"Yards / route run",group:"anal",fmt:"2",get:c=>A(c,["Y/RR"])},
    {id:"yrr_man",label:"Y/RR vs man",group:"anal",fmt:"2",w:.7,get:c=>A(c,["Y/RR vs Man"])},
    {id:"yrr_zone",label:"Y/RR vs zone",group:"anal",fmt:"2",w:.7,get:c=>A(c,["Y/RR vs Zone"])},
    {id:"yac",label:"YAC / reception",group:"anal",fmt:"1",get:c=>A(c,["YAC/Rec"])},
    {id:"adot",label:"ADOT",group:"anal",fmt:"1",get:c=>A(c,["ADOT"])},
    {id:"catching",label:"Catching",group:"skill",fmt:"int",get:c=>c.skill(["Catching"])},
    {id:"routes",label:"Route running",group:"skill",fmt:"int",get:c=>c.skill(["Route Running"])},
    {id:"speed",label:"Speed",group:"skill",fmt:"int",get:c=>c.skill(["Game Speed"])},
    {id:"blocking",label:"Blocking",group:"skill",fmt:"int",w:.6,get:c=>c.skill(["Blocking"])},
  ],
  TE:[
    ...meas,...grades,
    {id:"ypr",label:"Yards / Reception",group:"prod",fmt:"1",get:c=>G(c,["Yards/Rec"])},
    {id:"ypt",label:"Yards / Target",group:"prod",fmt:"1",get:c=>G(c,["Yards/Tgt"])},
    {id:"tgt",label:"Target share",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Target %"])},
    {id:"catch",label:"Catch %",group:"prod",pct:true,fmt:"pct",w:.8,get:c=>G(c,["Catch %"])},
    {id:"yptpa",label:"YPTPA",group:"prod",fmt:"2",get:c=>G(c,["YPTPA"])},
    {id:"dom",label:"Dominator rating",group:"prod",pct:true,fmt:"pct",get:c=>G(c,["Dom Rtg"])},
    {id:"drop",label:"Drop %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["Drop %"])},
    {id:"yrr",label:"Yards / route run",group:"anal",fmt:"2",get:c=>A(c,["Y/RR"])},
    {id:"yac",label:"YAC / reception",group:"anal",fmt:"1",get:c=>A(c,["YAC/Rec"])},
    {id:"adot",label:"ADOT",group:"anal",fmt:"1",w:.8,get:c=>A(c,["ADOT"])},
    {id:"inline",label:"Inline snap %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["Inline Snap %"])},
    {id:"slot",label:"Slot snap %",group:"anal",pct:true,fmt:"pct",get:c=>A(c,["Slot Snap %"])},
    {id:"runblock",label:"Run-block grade",group:"anal",fmt:"1",get:c=>A(c,["Run Block Grade"])},
    {id:"catching",label:"Catching",group:"skill",fmt:"int",get:c=>c.skill(["Catching"])},
    {id:"routes",label:"Route running",group:"skill",fmt:"int",get:c=>c.skill(["Route Running"])},
    {id:"blocking",label:"Blocking",group:"skill",fmt:"int",get:c=>c.skill(["Blocking"])},
    {id:"versatility",label:"Versatility",group:"skill",fmt:"int",w:.7,get:c=>c.skill(["Versatility"])},
    {id:"athleticism",label:"Athleticism / speed",group:"skill",fmt:"int",get:c=>c.skill(["Speed","Athleticism"])},
  ],
};

// ---------- notes similarity (TF-IDF cosine; deterministic, no LLM) ----------
const STOP=new Set("the and for that this with his him has have had was were are but not you your from they them their there then than into about out all can could would should will just more most very much some any also been being its it's get got really like one two three guy player team game games watch watched seen see saw sure think thought feel felt look looks looked way lot lots good great well make makes made first second back next level position year years love love's".split(" "));
function tokens(text:string){return (text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z]{4,}/g)||[]).filter(w=>!STOP.has(w))}
const NOTE_MIN_CHARS=150;

// ---------- pool ----------
export type PoolEntry={
  key:string;name:string;college:string|null;draftClass:number;position:Pos;
  raw:Record<string,number|null>;tokens:string[];notesChars:number;
  draftResult:string|null;overall:number|null;compOnly?:boolean;
};

export function parseDraftResult(v:unknown):{text:string|null;overall:number|null}{
  const s=String(v??"").trim();if(!s)return {text:null,overall:null};
  if(/^UDFA/i.test(s))return {text:s,overall:null};
  const m=s.match(/^(\d+)\.(\d+)/);
  return {text:s,overall:m?Number(m[2]):null};
}

export const compKey=(draftClass:number,position:string,name:string)=>`${draftClass}:${position}:${normHistoricalName(name)}`;

function extract(position:Pos,rows:EvalRow[],grades?:Record<string,unknown>|null){
  const ctx=makeCtx(rows,grades);
  const out:Record<string,number|null>={};
  for(const f of SPECS[position]){
    let v=f.get(ctx);
    // some classes store percentages as fractions (0.73) and others as percents (73.0): put everything on the percent scale
    if(v!=null&&f.pct&&Math.abs(v)<=1.5)v=v*100;
    out[f.id]=v;
  }
  return out;
}

let POOL:PoolEntry[]|null=null;
export function getPool():PoolEntry[]{
  if(POOL)return POOL;
  const overlayIndex=new Map(allCompOverlays.map(o=>[compKey(o.draftClass,o.position,o.name),o]));
  const out:PoolEntry[]=[];
  for(const year of POOL_YEARS)for(const position of ["QB","RB","WR","TE"] as Pos[]){
    for(const snap of getHistoricalScoutingRows(year,position) as readonly HistoricalScoutingSnapshot[]){
      let evals=historicalEvaluations(snap) as EvalRow[];
      // comp-only backfill (e.g. 2022 analytics): adds labels the site data lacks, never overrides what is there
      const ov=overlayIndex.get(compKey(year,position,snap.name));
      if(ov){const have=new Set(evals.map(e=>splitCategory(String(e.category)).label));evals=[...evals,...ov.fields.filter(f=>!have.has(f.label)).map(f=>({category:`${f.group} · ${f.label}`,value:f.value}))]}
      const dr=parseDraftResult(snap.fields.find(f=>f.label==="Draft Result")?.value);
      const notes=String(snap.commentary||"");
      out.push({
        key:compKey(year,position,snap.name),name:snap.name,college:snap.college,draftClass:year,position,
        raw:extract(position,evals,snap.grades as Record<string,unknown>),
        tokens:tokens(notes),notesChars:notes.length,draftResult:dr.text,overall:dr.overall,
      });
    }
  }
  // analytics-only profiles: players with no scouting profile (no ratings, grades or notes); comp-only, never shown elsewhere
  for(const cp of allCompProfiles){
    const evals:EvalRow[]=cp.fields.map(f=>({category:`${f.group} · ${f.label}`,value:f.value}));
    const dr=parseDraftResult(cp.draftResult);
    out.push({key:compKey(cp.draftClass,cp.position,cp.name),name:cp.name,college:cp.college,draftClass:cp.draftClass,position:cp.position,
      raw:extract(cp.position,evals,null),tokens:[],notesChars:0,draftResult:dr.text,overall:dr.overall,compOnly:true});
  }
  POOL=out;return out;
}

type Stats={mean:number;sd:number};
let STATS:Record<string,Stats>|null=null;
function featureStats():Record<string,Stats>{
  if(STATS)return STATS;
  const acc:Record<string,number[]>={};
  for(const e of getPool())for(const [id,v] of Object.entries(e.raw))if(v!=null)(acc[e.position+":"+id]??=[]).push(v);
  const out:Record<string,Stats>={};
  for(const [k,vals] of Object.entries(acc)){
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,vals.length-1))||1;
    out[k]={mean,sd};
  }
  STATS=out;return out;
}
const zOf=(position:Pos,id:string,v:number)=>{const s=featureStats()[position+":"+id];if(!s)return null;return Math.max(-3,Math.min(3,(v-s.mean)/s.sd))};

let IDF:Map<string,number>|null=null;
function idf(){
  if(IDF)return IDF;
  const pool=getPool().filter(e=>e.notesChars>=NOTE_MIN_CHARS),df=new Map<string,number>();
  for(const e of pool)for(const t of new Set(e.tokens))df.set(t,(df.get(t)||0)+1);
  const out=new Map<string,number>(),n=pool.length;
  // drop one-off tokens (names, teams) and near-universal words
  for(const [t,c] of df)if(c>=2&&c<=n*.6)out.set(t,Math.log(1+n/c));
  IDF=out;return out;
}
function vec(tok:string[]){
  const w=idf(),tf=new Map<string,number>();
  for(const t of tok)if(w.has(t))tf.set(t,(tf.get(t)||0)+1);
  const v=new Map<string,number>();let norm=0;
  for(const [t,c] of tf){const x=(1+Math.log(c))*(w.get(t)||0);v.set(t,x);norm+=x*x}
  return {v,norm:Math.sqrt(norm)};
}
function cosine(a:ReturnType<typeof vec>,b:ReturnType<typeof vec>){
  if(!a.norm||!b.norm)return 0;
  let dot=0;const [s,l]=a.v.size<b.v.size?[a.v,b.v]:[b.v,a.v];
  for(const [t,x] of s){const y=l.get(t);if(y)dot+=x*y}
  return dot/(a.norm*b.norm);
}

// ---------- matching ----------
export type Trait={label:string;target:string;comp:string};
export type CompMatch={
  key:string;name:string;college:string|null;draftClass:number;position:Pos;draftResult:string|null;overall:number|null;
  similarity:number;matchPct:number;coverage:string;groupsUsed:string[];compOnly:boolean;
  shared:string[];difference:Trait|null;
};
export type CompResult={
  position:Pos;poolSize:number;candidates:CompMatch[];targetFeatureCount:number;
  confidence:"High"|"Medium"|"Low"|"None";note:string|null;
};

const fmtVal=(spec:FeatureSpec,v:number)=>{
  switch(spec.fmt){
    case "in":return `${Math.floor(v/12)}'${Math.round((v%12)*10)/10}"`;
    case "pct":return v.toFixed(1)+"%";
    case "ratio":return (v*100).toFixed(1)+"%";
    case "int":return String(Math.round(v));
    case "2":return v.toFixed(2);
    default:return v.toFixed(1);
  }
};

const DATA_GROUPS:Group[]=["meas","prod","anal"];
/** typical similarity of two unrelated players on one group (rms z-diff about 1.4 -> e^-1) */
const MISSING_PRIOR=.4;
const GROUP_LABEL:Record<Group|"notes",string>={meas:"measurables",prod:"production",anal:"analytics",skill:"scouting ratings",grade:"grades",notes:"notes"};
const minShared=(count:number)=>Math.min(count,Math.max(2,Math.ceil(count*.4)));

type MatchOpts={limit?:number;excludeKeys?:Set<string>;weights?:Weights};
type MatchInput={position:Pos;draftClass:number;targetKey:string;targetRaw:Record<string,number|null>;targetVec:ReturnType<typeof vec>|null};

export function findComps(target:CompTarget,opts:MatchOpts={}):CompResult{
  const position=target.position,notesText=String(target.notes||"");
  return matchPool({position,draftClass:target.draftClass,targetKey:compKey(target.draftClass,position,target.name),targetRaw:extract(position,target.evaluations,target.grades),targetVec:notesText.length>=NOTE_MIN_CHARS?vec(tokens(notesText)):null},opts);
}

/** Comps for a player who is already in the comp pool (used by the Comps Database). Same engine, same weights. */
export function findCompsForKey(key:string,opts:MatchOpts={}):CompResult|null{
  const e=getPool().find(p=>p.key===key);
  if(!e)return null;
  return matchPool({position:e.position,draftClass:e.draftClass,targetKey:e.key,targetRaw:e.raw,targetVec:e.notesChars>=NOTE_MIN_CHARS?vec(e.tokens):null},opts);
}

export type ReverseHit={targetKey:string|null;name:string;college:string|null;draftClass:number;position:Pos;source:"pool"|"prospect";matchPct:number;shared:string[];difference:CompMatch["difference"];coverage:string;compOnly:boolean};

/** Players from LATER classes (pool players, plus any extra prospects passed in) for whom the given pool player shows up as a comp at or above minPct. */
export function findReverseForKey(key:string,opts:{minPct:number;weights?:Weights;extraTargets?:(CompTarget&{id?:string})[]}):ReverseHit[]|null{
  const me=getPool().find(p=>p.key===key);
  if(!me)return null;
  const hits:ReverseHit[]=[];
  const consider=(t:{targetKey:string|null;name:string;college:string|null;draftClass:number;source:ReverseHit["source"];compOnly:boolean},r:CompResult)=>{
    const m=r.candidates.find(c=>c.key===key);
    if(m&&m.matchPct>=opts.minPct)hits.push({...t,position:me.position,matchPct:m.matchPct,shared:m.shared,difference:m.difference,coverage:m.coverage});
  };
  for(const t of getPool()){
    if(t.position!==me.position||t.draftClass<=me.draftClass)continue;
    consider({targetKey:t.key,name:t.name,college:t.college,draftClass:t.draftClass,source:"pool",compOnly:!!t.compOnly},
      matchPool({position:t.position,draftClass:t.draftClass,targetKey:t.key,targetRaw:t.raw,targetVec:t.notesChars>=NOTE_MIN_CHARS?vec(t.tokens):null},{limit:5000,weights:opts.weights}));
  }
  for(const t of opts.extraTargets||[]){
    if(t.position!==me.position||t.draftClass<=me.draftClass)continue;
    consider({targetKey:null,name:t.name,college:t.college||null,draftClass:t.draftClass,source:"prospect",compOnly:false},findComps(t,{limit:5000,weights:opts.weights}));
  }
  return hits.sort((a,b)=>b.matchPct-a.matchPct);
}

export type PoolSummary={key:string;name:string;college:string|null;draftClass:number;position:Pos;draftResult:string|null;overall:number|null;compOnly:boolean;hasNotes:boolean;coverage:Record<Group,number>;featureCount:number};
export function poolSummary():PoolSummary[]{
  return getPool().map(e=>{
    const coverage={meas:0,prod:0,anal:0,skill:0,grade:0} as Record<Group,number>;
    for(const f of SPECS[e.position])if(e.raw[f.id]!=null)coverage[f.group]++;
    return {key:e.key,name:e.name,college:e.college,draftClass:e.draftClass,position:e.position,draftResult:e.draftResult,overall:e.overall,compOnly:!!e.compOnly,hasNotes:e.notesChars>=NOTE_MIN_CHARS,coverage,featureCount:Object.values(coverage).reduce((a,b)=>a+b,0)};
  });
}

function matchPool(t:MatchInput,opts:MatchOpts):CompResult{
  const GROUP_WEIGHT=opts.weights?normalizeWeights(opts.weights):DEFAULT_WEIGHTS;
  const {position,targetRaw,targetKey,targetVec}=t,specs=SPECS[position];
  const targetFeatureCount=Object.values(targetRaw).filter(v=>v!=null).length;

  const pool=getPool().filter(e=>e.position===position&&e.draftClass<t.draftClass&&e.key!==targetKey&&!opts.excludeKeys?.has(e.key));
  if(!pool.length)return {position,poolSize:0,candidates:[],targetFeatureCount,confidence:"None",note:"No earlier scouted classes to compare against."};
  if(targetFeatureCount<4)return {position,poolSize:pool.length,candidates:[],targetFeatureCount,confidence:"None",note:"Not enough data on this player yet to find a comp."};

  const groups=["meas","prod","anal","skill","grade"] as Group[];
  const groupSpecs=Object.fromEntries(groups.map(g=>[g,specs.filter(s=>s.group===g)])) as Record<Group,FeatureSpec[]>;
  const totalWeight=Object.values(GROUP_WEIGHT).reduce((a,b)=>a+b,0);

  // data groups (measurables, production, analytics) the target has enough of; comps lacking scouting ratings/notes/grades are NOT penalised for that
  const targetHasData=new Set<Group>(DATA_GROUPS.filter(g=>specs.filter(f=>f.group===g&&targetRaw[f.id]!=null).length>=minShared(Math.min(groupSpecs[g].length,6))));

  const scored:CompMatch[]=[];
  for(const e of pool){
    let wSum=0,simSum=0;const used:string[]=[];const diffs:{spec:FeatureSpec;t:number;c:number;zt:number;zc:number}[]=[];
    let sharedCount=0;
    for(const g of groups){
      let num=0,den=0,n=0;
      for(const spec of groupSpecs[g]){
        const t=targetRaw[spec.id],c=e.raw[spec.id];
        if(t==null||c==null)continue;
        const zt=zOf(position,spec.id,t),zc=zOf(position,spec.id,c);
        if(zt==null||zc==null)continue;
        const w=spec.w??1;num+=w*(zt-zc)**2;den+=w;n++;diffs.push({spec,t,c,zt,zc});
      }
      if(n<minShared(Math.min(groupSpecs[g].length,6)))continue;
      const rms=Math.sqrt(num/den);
      simSum+=GROUP_WEIGHT[g]*Math.exp(-(rms*rms)/2);wSum+=GROUP_WEIGHT[g];used.push(g);sharedCount+=n;
    }
    if(targetVec&&e.notesChars>=NOTE_MIN_CHARS){
      const cos=cosine(targetVec,vec(e.tokens));
      simSum+=GROUP_WEIGHT.notes*Math.min(1,cos/.45);wSum+=GROUP_WEIGHT.notes;used.push("notes");
    }
    if(used.length<2||sharedCount<6)continue;
    // comps that can be compared on more of the target's own data groups get fuller credit
    // a data group the target has but this candidate lacks counts as an average-quality match (shrinkage), so thin comps can't win by having fewer ways to mismatch
    const missingW=DATA_GROUPS.reduce((a,g)=>a+(targetHasData.has(g)&&!used.includes(g)?GROUP_WEIGHT[g]:0),0);
    const similarity=(simSum+missingW*MISSING_PRIOR)/(wSum+missingW);

    const shared=diffs.filter(d=>Math.abs(d.zt)>=.8&&Math.abs(d.zc)>=.8&&Math.sign(d.zt)===Math.sign(d.zc)&&Math.abs(d.zt-d.zc)<=.6)
      .sort((a,b)=>(Math.abs(b.zt)+Math.abs(b.zc))-(Math.abs(a.zt)+Math.abs(a.zc))).slice(0,4)
      .map(d=>{
        const neg=d.spec.id==="drop"||d.spec.id==="twp"||d.spec.id==="int_rate";
        const high=d.zt>0;
        return `${(high!==neg)?"Strong":"Weak"} ${d.spec.label.toLowerCase()}`;
      });
    const worst=diffs.filter(d=>d.spec.group!=="grade").sort((a,b)=>Math.abs(b.zt-b.zc)-Math.abs(a.zt-a.zc))[0];
    const difference=worst&&Math.abs(worst.zt-worst.zc)>=1?{label:worst.spec.label,target:fmtVal(worst.spec,worst.t),comp:fmtVal(worst.spec,worst.c)}:null;
    scored.push({
      key:e.key,name:e.name,college:e.college,draftClass:e.draftClass,position,draftResult:e.draftResult,overall:e.overall,
      similarity,matchPct:Math.round(similarity*100),
      coverage:`${sharedCount} shared data points across ${used.map(g=>GROUP_LABEL[g as Group|"notes"]).join(", ")}`,
      groupsUsed:used,shared,difference,compOnly:!!e.compOnly,
    });
  }
  scored.sort((a,b)=>b.similarity-a.similarity);
  const top=scored.slice(0,opts.limit??12);
  const best=top[0];
  const coverageRatio=best?best.groupsUsed.reduce((a,g)=>a+GROUP_WEIGHT[g as Group|"notes"],0)/totalWeight:0;
  const confidence=!best?"None":best.matchPct>=70&&coverageRatio>=.6?"High":best.matchPct>=55&&coverageRatio>=.4?"Medium":"Low";
  return {position,poolSize:pool.length,candidates:top,targetFeatureCount,confidence,note:best?null:"No earlier player shares enough data points with this player."};
}
