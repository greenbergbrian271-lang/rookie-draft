// NFLSE (NFL Stock Exchange) ingestion: Draft Projection + Archetype for fantasy-eligible prospects.
// Source: https://nflseshow.com/demo.json (predictive big board). Values are stored in SEPARATE
// evaluation categories ("NFLSE Archetype", "NFLSE Draft Projection", "NFLSE Rank") so manual
// Scout Inputs are never overwritten. Nothing here feeds grades.
import {playerNameKey,likelySamePlayer} from "@/lib/player-name";

export const NFLSE_URL="https://nflseshow.com/demo.json";
export const NFLSE_CATEGORIES={archetype:"NFLSE Archetype",projection:"NFLSE Draft Projection",rank:"NFLSE Rank"} as const;
export type FantasyPosition="QB"|"RB"|"WR"|"TE";
const FANTASY=new Set<string>(["QB","RB","WR","TE"]);

// Draft Projection buckets by NFLSE predictive overall rank (all positions).
// 1-5 Top 5 · 6-10 Top 10 · 11-32 First Round · 33-100 Day 2 · 101-178 Early Day 3 · 179-256 Late Day 3 · 257+ UDFA
export const PROJECTION_CUTOFFS=[
  {max:5,label:"Top 5"},{max:10,label:"Top 10"},{max:32,label:"First Round"},{max:100,label:"Day 2"},
  {max:178,label:"Early Day 3"},{max:256,label:"Late Day 3"}
] as const;
export function projectionFromRank(rank:number){
  if(!Number.isFinite(rank)||rank<1)return null;
  for(const c of PROJECTION_CUTOFFS)if(rank<=c.max)return c.label;
  return "UDFA";
}

// NFLSE detailed position -> the archetype options already used in the scouting workspaces.
// QB and RB are not subdivided by NFLSE, so those archetypes stay manual.
const ARCHETYPE_MAP:Record<string,Record<string,string>>={
  WR:{"X-WR":"X WR","Z-WR":"Z WR","SLOT WR":"Slot WR"},
  TE:{"F-TE":"Move TE / Big Slot","Y-TE":"Blocking TE"}
};
export function archetypeFromNflse(position:string,advancedPosition:string){
  const raw=String(advancedPosition||"").trim().toUpperCase().replace(/\s+/g," ");
  return ARCHETYPE_MAP[position]?.[raw]||null;
}

export type NflsePlayer={id:string;name:string;position:string;school:string;rank:number;advancedPosition:string};
export async function fetchNflseBoard():Promise<{version:string;label:string;players:NflsePlayer[]}>{
  const res=await fetch(NFLSE_URL,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("NFLSE responded "+res.status);
  const j:any=await res.json();
  if(!j||!Array.isArray(j.players))throw new Error("Unexpected NFLSE format (no players array)");
  const players:NflsePlayer[]=[];
  for(const p of j.players){
    if(p?.inactive)continue;
    const position=String(p?.sourcePosition||p?.position||"").toUpperCase();
    const rank=Number(p?.predictiveRank??p?.rank);
    if(!p?.name||!FANTASY.has(position)||!Number.isFinite(rank))continue;
    players.push({id:String(p.id||""),name:String(p.name),position,school:String(p.school||""),rank,advancedPosition:String(p.advancedPosition||p.detailedPosition||"")});
  }
  return {version:String(j.version||""),label:String(j.label||""),players};
}

const schoolKey=(v:unknown)=>String(v||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"");
export type DbPlayer={id:number|string;name:string;position:string;college:string|null};
export type NflseMatch={playerId:number|string;name:string;position:string;nflse:NflsePlayer;archetype:string|null;projection:string|null;how:"exact"|"exact+school"};
export function matchPlayers(db:DbPlayer[],board:NflsePlayer[]){
  const byKey=new Map<string,NflsePlayer[]>();
  for(const b of board){const k=playerNameKey(b.name);if(!k)continue;byKey.set(k,[...(byKey.get(k)||[]),b])}
  const matches:NflseMatch[]=[],unmatched:DbPlayer[]=[],ambiguous:{player:DbPlayer;candidates:NflsePlayer[]}[]=[],possible:{player:DbPlayer;candidate:NflsePlayer}[]=[];
  for(const p of db){
    const pos=String(p.position||"").toUpperCase();
    if(!FANTASY.has(pos)){continue}
    const cands=(byKey.get(playerNameKey(p.name))||[]).filter(c=>c.position===pos);
    let pick:NflsePlayer|null=null,how:"exact"|"exact+school"="exact";
    if(cands.length===1)pick=cands[0];
    else if(cands.length>1){
      const bySchool=cands.filter(c=>schoolKey(c.school)&&schoolKey(c.school)===schoolKey(p.college));
      if(bySchool.length===1){pick=bySchool[0];how="exact+school"}else ambiguous.push({player:p,candidates:cands});
    }
    if(pick)matches.push({playerId:p.id,name:p.name,position:pos,nflse:pick,archetype:archetypeFromNflse(pos,pick.advancedPosition),projection:projectionFromRank(pick.rank),how});
    else if(!cands.length){
      unmatched.push(p);
      const near=board.find(b=>b.position===pos&&likelySamePlayer(p.name,b.name,{collegeA:p.college,collegeB:b.school,positionA:pos,positionB:b.position}));
      if(near)possible.push({player:p,candidate:near});
    }
  }
  return {matches,unmatched,ambiguous,possible};
}
