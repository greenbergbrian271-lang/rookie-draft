import {ensureTursoSchema,rows} from "@/lib/turso";
import {findHistoricalScoutingSnapshot,historicalEvaluations} from "@/lib/historical-scouting";
import {GET as getFinalBoard} from "@/app/api/final-board/live/route";
import {GET as getPlayerData} from "@/app/api/player-data/route";
import {playerNameKey} from "@/lib/player-name";
import {compKey,findComps,normalizeWeights,DEFAULT_WEIGHTS,WEIGHT_KEYS,type CompMatch,type CompTarget,type EvalRow,type Pos,type Weights} from "@/lib/player-comps";
import {loadOutcome,type Outcome} from "@/lib/comp-outcomes";

const OVERRIDE_KEY="player-comp-overrides:v1";
const WEIGHTS_KEY="player-comp-weights:v1";

export async function loadWeights():Promise<Weights>{
  try{const q=await ensureTursoSchema();const r:any=rows(await q.execute({sql:"select value from settings where key=?",args:[WEIGHTS_KEY]}))[0];return r?.value?normalizeWeights(JSON.parse(String(r.value))):{...DEFAULT_WEIGHTS}}catch{return {...DEFAULT_WEIGHTS}}
}
export async function saveWeights(input:unknown|null){
  const q=await ensureTursoSchema();
  if(input==null){await q.execute({sql:"delete from settings where key=?",args:[WEIGHTS_KEY]});return {...DEFAULT_WEIGHTS}}
  const w=normalizeWeights(input);
  await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[WEIGHTS_KEY,JSON.stringify(w),new Date().toISOString()]});
  return w;
}
export const weightsToPercent=(w:Weights)=>{
  const out=Object.fromEntries(WEIGHT_KEYS.map(k=>[k,Math.round(w[k]*100)])) as Record<string,number>;
  const diff=100-WEIGHT_KEYS.reduce((a,k)=>a+out[k],0);
  if(diff){const big=[...WEIGHT_KEYS].sort((a,b)=>out[b]-out[a])[0];out[big]+=diff}
  return out;
};
type Overrides=Record<string,{pin?:string|null;exclude?:string[]}>;

async function readOverrides():Promise<Overrides>{
  try{const q=await ensureTursoSchema();const r:any=rows(await q.execute({sql:"select value from settings where key=?",args:[OVERRIDE_KEY]}))[0];return r?.value?JSON.parse(String(r.value)):{}}catch{return {}}
}
export async function saveOverride(targetKey:string,action:"pin"|"exclude"|"clear",comp?:string){
  const all=await readOverrides(),cur=all[targetKey]||{};
  if(action==="clear")delete all[targetKey];
  else if(action==="pin"&&comp)all[targetKey]={...cur,pin:comp,exclude:(cur.exclude||[]).filter(k=>k!==comp)};
  else if(action==="exclude"&&comp)all[targetKey]={pin:cur.pin===comp?null:cur.pin,exclude:[...new Set([...(cur.exclude||[]),comp])]};
  const q=await ensureTursoSchema();
  await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[OVERRIDE_KEY,JSON.stringify(all),new Date().toISOString()]});
}

async function boardRowFor(playerId:string,draftClass:number){
  try{
    const r=await getFinalBoard(new Request("http://internal/api/final-board/live?view=base&draftClass="+encodeURIComponent(String(draftClass))));
    const j=await r.json();
    return r.ok&&Array.isArray(j?.rows)?j.rows.find((x:any)=>String(x.id)===String(playerId)):null;
  }catch{return null}
}

// Live stats, measurables and analytics live in the player-data rows (same source the card's Production/Analytics tabs use)
async function playerDataFor(name:string,position:string,draftClass:number):Promise<EvalRow[]>{
  try{
    const r=await getPlayerData(new Request("http://internal/api/player-data?position="+encodeURIComponent(position)+"&draftClass="+encodeURIComponent(String(draftClass))));
    const j=await r.json();
    const row=r.ok&&Array.isArray(j?.rows)?j.rows.find((x:any)=>playerNameKey(x?.Player)===playerNameKey(name)):null;
    if(!row)return [];
    return Object.entries(row).filter(([k,v])=>k!=="Player"&&v!=null&&String(v).trim()!==""&&String(v).length<40).map(([k,v])=>({category:k,value:v as any}));
  }catch{return []}
}

export async function loadTarget(playerId:string):Promise<CompTarget|null>{
  const q=await ensureTursoSchema();
  const p:any=rows(await q.execute({sql:"select id,name,position,college,draft_class from players where id=?",args:[playerId]}))[0];
  if(!p||!["QB","RB","WR","TE"].includes(String(p.position)))return null;
  const draftClass=Number(p.draft_class),position=p.position as Pos;
  if(draftClass<2027){
    const snap=findHistoricalScoutingSnapshot(draftClass,position,String(p.name));
    return {name:String(p.name),position,draftClass,college:p.college,evaluations:snap?historicalEvaluations(snap) as EvalRow[]:[],grades:(snap?.grades||null) as any,notes:snap?.commentary||""};
  }
  const [evals,board,sessions,dataRows]=await Promise.all([
    q.execute({sql:"select category,value,commentary from evaluations where player_id=?",args:[playerId]}).then(rows),
    boardRowFor(playerId,draftClass),
    q.execute({sql:"select raw_notes,overall_writeup from scouting_sessions where player_id=?",args:[playerId]}).then(rows),
    playerDataFor(String(p.name),position,draftClass),
  ]);
  const have=new Set((evals as any[]).map(e=>String(e.category)));
  const legacy=String((evals as any[]).find(e=>String(e.category)==="__COMMENTARY__")?.value??"");
  const notes=[legacy,...(sessions as any[]).map(s=>[s.raw_notes,s.overall_writeup].filter(Boolean).join("\n"))].filter(Boolean).join("\n\n");
  const grades:Record<string,unknown>={};
  if(board?.scoutingGrade!=null)grades["Scouting Grade"]=board.scoutingGrade;
  if(board?.analyticalGrade!=null)grades["Analytical Grade"]=board.analyticalGrade;
  return {name:String(p.name),position,draftClass,college:p.college,evaluations:[...(evals as EvalRow[]),...dataRows.filter(r=>!have.has(String(r.category)))],grades,notes};
}

export type CompCard=CompMatch&{roles:("Most Similar"|"Ceiling"|"Floor"|"Pinned")[];outcome:Outcome|null};
export type CompsResponse={
  target:{name:string;position:Pos;draftClass:number;key:string};
  confidence:string;note:string|null;poolSize:number;cards:CompCard[];more:CompMatch[];
  pinned:string|null;excluded:{key:string;name:string}[];
};

export async function buildComps(playerId:string):Promise<CompsResponse|null>{
  const target=await loadTarget(playerId);
  if(!target)return null;
  const targetKey=compKey(target.draftClass,target.position,target.name);
  const ov=(await readOverrides())[targetKey]||{};
  const excludeKeys=new Set(ov.exclude||[]);
  const weights=await loadWeights();
  const result=findComps(target,{limit:14,excludeKeys,weights});
  const base={target:{name:target.name,position:target.position,draftClass:target.draftClass,key:targetKey},confidence:result.confidence,note:result.note,poolSize:result.poolSize,pinned:ov.pin||null};
  const excludedNames=[...excludeKeys].map(k=>({key:k,name:k.split(":").slice(2).join(":")}));
  if(!result.candidates.length)return {...base,cards:[],more:[],excluded:excludedNames};

  const pinned=ov.pin?findComps(target,{limit:200,excludeKeys,weights}).candidates.find(c=>c.key===ov.pin)||null:null;
  const primary=pinned||result.candidates[0];
  // Ceiling/Floor draw only from classes with 2+ finished NFL seasons and a real match
  const settled=result.candidates.filter(c=>c.draftClass<=2024&&c.matchPct>=50).slice(0,8);
  const wanted=new Map<string,CompMatch>();
  for(const c of [primary,...result.candidates.slice(0,3),...settled])wanted.set(c.key,c);
  const outcomes=new Map<string,Outcome>();
  await Promise.all([...wanted.values()].map(async c=>{outcomes.set(c.key,await loadOutcome({name:c.name,position:c.position,draftClass:c.draftClass}))}));

  const roles=new Map<string,CompCard["roles"]>();
  const addRole=(k:string,r:CompCard["roles"][number])=>roles.set(k,[...(roles.get(k)||[]),r]);
  addRole(primary.key,pinned?"Pinned":"Most Similar");
  const ranked=settled.filter(c=>outcomes.get(c.key)?.status==="ok"&&!outcomes.get(c.key)!.earlyCareer);
  if(ranked.length>=2){
    const byScore=[...ranked].sort((a,b)=>outcomes.get(b.key)!.tierScore-outcomes.get(a.key)!.tierScore||b.similarity-a.similarity);
    const ceil=byScore[0],floor=byScore[byScore.length-1];
    if(outcomes.get(ceil.key)!.tierScore!==outcomes.get(floor.key)!.tierScore){addRole(ceil.key,"Ceiling");addRole(floor.key,"Floor")}
  }
  const cards:CompCard[]=[...roles.keys()].map(k=>({...wanted.get(k)!,roles:roles.get(k)!,outcome:outcomes.get(k)||null}));
  const order=(c:CompCard)=>c.roles.includes("Pinned")||c.roles.includes("Most Similar")?0:c.roles.includes("Ceiling")?1:2;
  cards.sort((a,b)=>order(a)-order(b));
  const shown=new Set(cards.map(c=>c.key));
  return {...base,cards,more:result.candidates.filter(c=>!shown.has(c.key)).slice(0,6),excluded:excludedNames};
}
