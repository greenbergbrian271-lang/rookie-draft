/**
 * Tab-switch speedup for /scouting.
 *
 * Switching QB/RB/WR/TE remounts a whole workspace. It used to start from empty
 * and then fetch one request per player (scouting sessions), plus college stats
 * and the NFL draft feed, and every response caused a full re-grade, re-sort and
 * re-render of every player card, which is the staged "provisional -> final"
 * flicker and the multi-second lag.
 *
 * This module loads that data once (sessions in a single batched request) and
 * keeps it for the life of the /scouting page, so a tab switch starts with the
 * data already in hand and renders once. The page clears it when you leave.
 */
type Row=any;
let batch:Promise<{map:Map<string,Row[]>;ok:boolean}>|null=null,batchClass:number|null=null;
const edited=new Map<string,Row[]>();      // latest rows from a workspace (includes your edits)
let resolved:{map:Map<string,Row[]>;ok:boolean}|null=null;

export function prefetchSessions(draftClass:number){
  if(batch&&batchClass===draftClass)return batch;
  batchClass=draftClass;resolved=null;
  const mine=fetch("/api/scouting-sessions?draftClass="+encodeURIComponent(String(draftClass)),{cache:"no-store"})
    .then(r=>r.ok?r.json():null)
    .then(j=>{const by=j&&typeof j==="object"?j.byPlayer:null,map=new Map<string,Row[]>();if(by&&typeof by==="object")for(const k of Object.keys(by))map.set(k,Array.isArray(by[k])?by[k]:[]);const out={map,ok:!!by};if(batch===mine)resolved=out;return out})
    .catch(()=>({map:new Map<string,Row[]>(),ok:false}));
  batch=mine;return mine;
}

/** Sessions for one player: your latest in-memory version, else the batched load, else a per-player fetch. */
export async function loadSessions(id:string,draftClass:number):Promise<Row[]>{
  const own=edited.get(id);if(own)return own;
  const {map,ok}=await prefetchSessions(draftClass);
  if(ok)return edited.get(id)??map.get(id)??[];
  const r=await fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"});
  return r.ok?r.json():[];
}

/** Keeps the cache in step with what a workspace is showing, so remounting a tab never shows stale notes. */
export function rememberSessions(id:string,rows:Row[]){edited.set(id,rows)}

/** Initial `sessions` state for a freshly mounted workspace: players with known game notes render correctly on the first paint. */
export function seedSessions(players:{id:any}[]):Record<string,Row[]>{
  const out:Record<string,Row[]>={};
  for(const p of players){const id=String(p.id),rows=edited.get(id)??resolved?.map.get(id);if(rows&&rows.length)out[id]=rows}
  return out;
}

const colleges={data:null as any[]|null,at:0,pending:null as Promise<any[]>|null};
export function cachedColleges(){return colleges.data}
export function loadColleges():Promise<any[]>{
  if(colleges.data&&Date.now()-colleges.at<300000)return Promise.resolve(colleges.data);
  if(colleges.pending)return colleges.pending;
  colleges.pending=fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json())
    .then(j=>{if(Array.isArray(j)){colleges.data=j;colleges.at=Date.now()}return colleges.data||[]})
    .catch(()=>colleges.data||[])
    .finally(()=>{colleges.pending=null});
  return colleges.pending;
}

export function resetScoutingCache(){batch=null;batchClass=null;resolved=null;edited.clear()}
