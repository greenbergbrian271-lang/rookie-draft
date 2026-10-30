import {ensureTursoSchema,rows} from "@/lib/turso";
import {findComps,findCompsForKey,findReverseForKey,poolSummary,type CompMatch,type CompResult,type PoolSummary,type ReverseHit} from "@/lib/player-comps";
import {loadOutcome,type Outcome} from "@/lib/comp-outcomes";
import {loadProspectTargets,loadTarget,loadWeights} from "@/lib/player-comps-server";

/** Slim outcome for the list view (full season detail stays on the player cards). */
export type SlimOutcome={status:Outcome["status"];tier:Outcome["tier"];earlyCareer:boolean;best:Outcome["best"];top12:number;top24:number;seasonsCount:number;careerGp:number;careerPpg:number|null;sleeperId:string|null;teamAbbr:string|null;nfl:string|null};
export type DbPlayer=PoolSummary&{outcome:SlimOutcome|null};
export type Prospect={id:string;name:string;position:string;college:string|null;draftClass:number};

const slim=(o:Outcome):SlimOutcome=>({status:o.status,tier:o.tier,earlyCareer:o.earlyCareer,best:o.best,top12:o.top12,top24:o.top24,seasonsCount:o.seasonsCount,careerGp:o.careerGp,careerPpg:o.careerPpg,sleeperId:o.sleeperId,teamAbbr:o.teamAbbr,nfl:o.nfl});

let memo:{at:number;players:DbPlayer[]}|null=null;
export async function buildDatabase():Promise<{players:DbPlayer[];prospects:Prospect[];classes:number[]}>{
  if(!memo||Date.now()-memo.at>30*60*1000){
    const pool=poolSummary(),out:DbPlayer[]=[];
    for(let i=0;i<pool.length;i+=40){
      const chunk=pool.slice(i,i+40);
      const res=await Promise.all(chunk.map(p=>loadOutcome({name:p.name,position:p.position,draftClass:p.draftClass})));
      chunk.forEach((p,j)=>out.push({...p,outcome:slim(res[j])}));
    }
    memo={at:Date.now(),players:out};
  }
  let prospects:Prospect[]=[];
  try{
    const q=await ensureTursoSchema();
    prospects=(rows(await q.execute("select id,name,position,college,draft_class from players where draft_class>=2027 and position in ('QB','RB','WR','TE') order by name")) as any[])
      .map(p=>({id:String(p.id),name:String(p.name),position:String(p.position),college:p.college?String(p.college):null,draftClass:Number(p.draft_class)}));
  }catch{}
  const classes=[...new Set(memo.players.map(p=>p.draftClass))].sort((a,b)=>b-a);
  return {players:memo.players,prospects,classes};
}

export type MatchesResponse={target:{name:string;position:string;draftClass:number;key:string|null};confidence:string;note:string|null;poolSize:number;candidates:CompMatch[]};
const respond=(target:MatchesResponse["target"],r:CompResult):MatchesResponse=>({target,confidence:r.confidence,note:r.note,poolSize:r.poolSize,candidates:r.candidates});

/** Every player the target could be comped to (all earlier-class players at his position), ranked by match. Overrides/exclusions are not applied here. */
export async function buildMatches(input:{key?:string|null;playerId?:string|null}):Promise<MatchesResponse|null>{
  const weights=await loadWeights();
  if(input.key){
    const r=findCompsForKey(input.key,{limit:1000,weights});
    if(!r)return null;
    const p=poolSummary().find(x=>x.key===input.key)!;
    return respond({name:p.name,position:p.position,draftClass:p.draftClass,key:p.key},r);
  }
  if(input.playerId){
    const t=await loadTarget(input.playerId);
    if(!t)return null;
    return respond({name:t.name,position:t.position,draftClass:t.draftClass,key:null},findComps(t,{limit:1000,weights}));
  }
  return null;
}

export type ReverseResponse={target:{key:string;name:string;position:string;draftClass:number};floor:number;prospectsIncluded:number;hits:ReverseHit[]};
/** Later-class players (pool + 2027+ prospects) that this pool player would show up as a comp for, at or above the floor. The UI filters by the user's threshold. */
export async function buildReverse(key:string,floor:number):Promise<ReverseResponse|null>{
  const p=poolSummary().find(x=>x.key===key);
  if(!p)return null;
  const [weights,prospects]=await Promise.all([loadWeights(),loadProspectTargets().catch(()=>[])]);
  const hits=findReverseForKey(key,{minPct:floor,weights,extraTargets:prospects});
  if(!hits)return null;
  return {target:{key:p.key,name:p.name,position:p.position,draftClass:p.draftClass},floor,prospectsIncluded:prospects.filter(t=>t.position===p.position&&t.draftClass>p.draftClass).length,hits};
}
