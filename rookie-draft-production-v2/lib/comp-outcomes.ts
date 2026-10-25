import {ensureTursoSchema,rows} from "@/lib/turso";
import {loadPlayerDb,loadState,loadSeasonStats,resolvePlayer,scoreStats,type Scoring} from "@/lib/nfl-card";

/**
 * NFL outcomes for Player Comps. Source: the same Sleeper weekly stats the NFL card already uses.
 * Scored in standard PPR. Season summaries are cached in the settings table; finished seasons are permanent.
 * Nothing is invented: a player Sleeper can't match is reported as "no NFL stats found".
 */
export const PPR:Scoring={pass_yd:.04,pass_td:4,pass_int:-2,rush_yd:.1,rush_td:6,rec:1,rec_yd:.1,rec_td:6,fum_lost:-2,pass_2pt:2,rush_2pt:2,rec_2pt:2};

type SeasonRec=[id:string,pos:string,gp:number,pts:number,rank:number];
type SeasonSummary={season:number;lastWeek:number;complete:boolean;at:string;rows:SeasonRec[]};
const memo=new Map<string,{at:number;value:Map<string,SeasonRec>}>();

async function readSetting(key:string){try{const q=await ensureTursoSchema();const r:any=rows(await q.execute({sql:"select value from settings where key=?",args:[key]}))[0];return r?.value?JSON.parse(String(r.value)):null}catch{return null}}
async function writeSetting(key:string,value:unknown){try{const q=await ensureTursoSchema();await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[key,JSON.stringify(value),new Date().toISOString()]})}catch{}}

export async function seasonRecords(season:number,state:any,db:Record<string,any>):Promise<Map<string,SeasonRec>>{
  const current=Number(state?.season)||new Date().getFullYear();
  const complete=season<current||(season===current&&String(state?.season_type)==="post");
  const lastWeek=complete?18:Math.max(1,(Number(state?.week)||1)-1);
  const key=`comp-season-ppr:v1:${season}`,hit=memo.get(key);
  if(hit&&Date.now()-hit.at<(complete?24:1)*3600*1000)return hit.value;
  const saved:SeasonSummary|null=await readSetting(key);
  const fresh=saved&&(saved.complete||(saved.lastWeek===lastWeek&&Date.now()-Date.parse(saved.at)<3*3600*1000));
  let list:SeasonRec[];
  if(saved&&fresh)list=saved.rows;
  else{
    const stats=await loadSeasonStats(season,lastWeek,db);
    const byPos=new Map<string,{id:string;gp:number;pts:number}[]>();
    for(const [id,weeks] of stats.byPlayer){
      const pos=String(db[id]?.position||"");if(!pos)continue;
      let pts=0;for(const w of weeks){const v=Number(w.stats.pts_ppr);pts+=Number.isFinite(v)&&w.stats.pts_ppr!=null?v:scoreStats(w.stats,PPR,pos)}
      (byPos.get(pos)||byPos.set(pos,[]).get(pos)!).push({id,gp:weeks.length,pts:Math.round(pts*100)/100});
    }
    list=[];
    for(const [pos,arr] of byPos){arr.sort((a,b)=>b.pts-a.pts);arr.forEach((r,i)=>list.push([r.id,pos,r.gp,r.pts,i+1]))}
    // only persist if Sleeper actually returned data (an empty season means the feed was down)
    if(list.length>50)await writeSetting(key,{season,lastWeek,complete,at:new Date().toISOString(),rows:list} satisfies SeasonSummary);
  }
  const map=new Map(list.map(r=>[r[0],r] as [string,SeasonRec]));
  memo.set(key,{at:Date.now(),value:map});
  return map;
}

export type Tier="Elite"|"Starter"|"Flex"|"Miss";
export type Outcome={
  status:"ok"|"unresolved"|"unavailable"|"none";
  seasons:{season:number;gp:number;pts:number;ppg:number|null;rank:number|null}[];
  best:{season:number;rank:number;ppg:number|null}|null;
  top12:number;top24:number;seasonsCount:number;careerGp:number;careerPpg:number|null;
  sleeperId:string|null;teamAbbr:string|null;nfl:string|null;tier:Tier|null;tierScore:number;earlyCareer:boolean;tierRule:string|null;
};

const CUTOFFS:Record<string,[number,number,number]>={QB:[3,12,20],RB:[6,18,36],WR:[6,18,36],TE:[3,10,18]};
const TIER_RANK:Record<Tier,number>={Elite:3,Starter:2,Flex:1,Miss:0};
const empty=(status:Outcome["status"]):Outcome=>({status,seasons:[],best:null,top12:0,top24:0,seasonsCount:0,careerGp:0,careerPpg:null,sleeperId:null,teamAbbr:null,nfl:null,tier:null,tierScore:-1,earlyCareer:false,tierRule:null});

export async function loadOutcome(c:{name:string;position:string;draftClass:number}):Promise<Outcome>{
  try{
    const [state,db]=await Promise.all([loadState(),loadPlayerDb()]);
    if(!db||!Object.keys(db).length)return empty("unavailable");
    const rp=await resolvePlayer({name:c.name,position:c.position});
    if(!rp)return empty("unresolved");
    const current=Number(state?.season)||new Date().getFullYear();
    const seasons=[];
    for(let s=c.draftClass;s<=current;s++){
      const map=await seasonRecords(s,state,db),r=map.get(rp.id);
      if(!r){seasons.push({season:s,gp:0,pts:0,ppg:null,rank:null});continue}
      seasons.push({season:s,gp:r[2],pts:r[3],ppg:r[2]?Math.round(r[3]/r[2]*100)/100:null,rank:r[4]});
    }
    const played=seasons.filter(s=>s.gp>0);
    const best=played.filter(s=>s.rank!=null).sort((a,b)=>a.rank!-b.rank!||(b.ppg||0)-(a.ppg||0))[0];
    const careerGp=played.reduce((a,s)=>a+s.gp,0),careerPts=played.reduce((a,s)=>a+s.pts,0);
    const completed=seasons.filter(s=>s.season<current||String(state?.season_type)==="post").length;
    const cut=CUTOFFS[c.position]||CUTOFFS.WR;
    const bestRank=best?.rank??null;
    const tier:Tier=bestRank==null?"Miss":bestRank<=cut[0]?"Elite":bestRank<=cut[1]?"Starter":bestRank<=cut[2]?"Flex":"Miss";
    const early=completed<2;
    const nfl=rp.team?`${rp.team}${rp.db?.status&&rp.db.status!=="Active"?` (${rp.db.status})`:""}`:(rp.db?.status&&rp.db.status!=="Active"?String(rp.db.status):"No current team");
    return {
      status:"ok",seasons,best:best&&best.rank!=null?{season:best.season,rank:best.rank,ppg:best.ppg}:null,
      top12:played.filter(s=>s.rank!=null&&s.rank<=12).length,top24:played.filter(s=>s.rank!=null&&s.rank<=24).length,
      seasonsCount:played.length,careerGp,careerPpg:careerGp?Math.round(careerPts/careerGp*100)/100:null,
      sleeperId:String(rp.id),teamAbbr:rp.team?String(rp.team):null,nfl,tier,tierScore:TIER_RANK[tier]*1000-(bestRank??999),earlyCareer:early,
      tierRule:`Best finish by total PPR points: ${c.position} top ${cut[0]} = Elite, top ${cut[1]} = Starter, top ${cut[2]} = Flex, else Miss.`,
    };
  }catch{return empty("unavailable")}
}

/** Sleeper id + team for a comp, used for the headshot. Null when Sleeper can't match the player. */
export async function resolveHeadshot(c:{name:string;position:string}):Promise<{sleeperId:string;teamAbbr:string|null}|null>{
  try{const rp=await resolvePlayer({name:c.name,position:c.position});return rp?{sleeperId:String(rp.id),teamAbbr:rp.team?String(rp.team):null}:null}catch{return null}
}
