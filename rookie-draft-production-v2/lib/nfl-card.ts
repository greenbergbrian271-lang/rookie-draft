import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {ensureTursoSchema,rows} from "@/lib/turso";

/**
 * Read-only data layer for the NFL player card. Everything here comes from Sleeper
 * (players DB, per-league scoring/rosters/transactions, weekly stats, schedule) or from
 * the site's own college `players` table (for the NCAA toggle). Nothing is invented:
 * anything Sleeper does not return is left null and shown as empty by the card.
 */

export const FANTASY_POSITIONS=["QB","RB","WR","TE"] as const;
const POS_SET=new Set<string>(FANTASY_POSITIONS);
const SLEEPER="https://api.sleeper.app/v1";
const SLEEPER_STATS="https://api.sleeper.com";

type Json=any;

// cap concurrent outbound requests so long league histories don't trip Sleeper's rate limit
let inflight=0;const waiters:(()=>void)[]=[];
async function slot<T>(run:()=>Promise<T>):Promise<T>{
  if(inflight>=30)await new Promise<void>(r=>waiters.push(r));
  inflight++;
  try{return await run()}finally{inflight--;waiters.shift()?.()}
}

async function getJson(url:string,opts:{revalidate?:number}={}):Promise<Json|null>{
  return slot(()=>getJsonRaw(url,opts));
}
async function getJsonRaw(url:string,opts:{revalidate?:number}={}):Promise<Json|null>{
  try{
    const res=await fetch(url,opts.revalidate?{headers:{accept:"application/json"},next:{revalidate:opts.revalidate}}:{cache:"no-store",headers:{accept:"application/json"}});
    if(!res.ok)return null;
    return await res.json();
  }catch{return null}
}

// ---------- small in-memory caches (per warm serverless instance) ----------
type CacheEntry<T>={at:number;value:T};
const memo=new Map<string,CacheEntry<any>>();
async function cached<T>(key:string,ttlMs:number,load:()=>Promise<T>):Promise<T>{
  const hit=memo.get(key);
  if(hit&&Date.now()-hit.at<ttlMs)return hit.value as T;
  const value=await load();
  memo.set(key,{at:Date.now(),value});
  return value;
}

export function normName(value:unknown){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,"").replace(/[^a-z0-9]/g,"");
}

// ---------- Sleeper players DB / NFL state ----------
export async function loadPlayerDb():Promise<Record<string,Json>>{
  return cached("sleeper-players",6*3600*1000,async()=>(await getJson(SLEEPER+"/players/nfl"))||{});
}
export async function loadState(){
  return cached("sleeper-state",5*60*1000,async()=>(await getJson(SLEEPER+"/state/nfl"))||{});
}

export type ResolvedPlayer={id:string;name:string;position:string;team:string|null;db:Json};

export async function resolvePlayer(input:{sleeperId?:string;name?:string;position?:string;team?:string}):Promise<ResolvedPlayer|null>{
  const db=await loadPlayerDb();
  const direct=input.sleeperId&&db[String(input.sleeperId)];
  const toResolved=(id:string,p:Json):ResolvedPlayer=>({
    id,name:String(p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||id),
    position:String(p.position||""),team:p.team||null,db:p,
  });
  if(direct)return toResolved(String(input.sleeperId),direct);
  const key=normName(input.name);
  if(!key)return null;
  const pos=String(input.position||"").toUpperCase();
  const matches:[string,Json][]=[];
  for(const [id,p] of Object.entries(db)){
    if(!p||!POS_SET.has(String(p.position)))continue;
    const full=p.full_name||((p.first_name||"")+" "+(p.last_name||""));
    if(normName(full)!==key)continue;
    matches.push([id,p]);
  }
  if(!matches.length)return null;
  const score=(p:Json)=>(pos&&p.position===pos?-1000:0)+(p.status==="Active"?-200:0)+(p.team?-100:0)+(input.team&&String(p.team||"")===String(input.team)?-50:0)+(Number(p.search_rank)||9999999)/100000;
  matches.sort((a,b)=>score(a[1])-score(b[1]));
  return toResolved(matches[0][0],matches[0][1]);
}

// ---------- scoring ----------
export type Scoring=Record<string,number>;

function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0}

export function scoreStats(stats:Record<string,number>,scoring:Scoring,position:string){
  let total=0;
  for(const [key,weight] of Object.entries(scoring)){
    if(!weight)continue;
    let value=stats[key];
    // TE premium: some feeds omit bonus_rec_te; it is the reception count for TEs
    if(value===undefined&&key==="bonus_rec_te"&&position==="TE")value=stats.rec;
    if(value===undefined)continue;
    total+=num(value)*weight;
  }
  return Math.round(total*100)/100;
}

// ---------- weekly stats ----------
export type WeekRow={week:number;team:string|null;opp:string|null;stats:Record<string,number>};
export type SeasonStats={season:number;weeks:number[];byPlayer:Map<string,WeekRow[]>;teamWeeks:Map<string,Map<number,Record<string,number>>>};

const TEAM_STAT_KEYS=["pass_att","pass_yd","pass_td","rush_att","rush_yd","rush_td"];

function didPlay(stats:Record<string,number>){
  return num(stats.gp)>0||num(stats.off_snp)>0||num(stats.pass_att)>0||num(stats.rush_att)>0||num(stats.rec_tgt)>0||num(stats.rec)>0;
}

async function fetchWeek(season:number,week:number,db:Record<string,Json>):Promise<{id:string;row:WeekRow}[]>{
  const pos=FANTASY_POSITIONS.map(p=>"position[]="+p).join("&");
  const url=`${SLEEPER_STATS}/stats/nfl/${season}/${week}?season_type=regular&${pos}&order_by=pts_ppr`;
  const data=await getJson(url);
  const out:{id:string;row:WeekRow}[]=[];
  if(Array.isArray(data)){
    for(const item of data){
      const id=String(item?.player_id||item?.player?.player_id||"");
      if(!id||!item?.stats)continue;
      const p=db[id];
      if(p&&!POS_SET.has(String(p.position)))continue;
      out.push({id,row:{week,team:item.team||p?.team||null,opp:item.opponent||null,stats:item.stats}});
    }
    return out;
  }
  // fallback: v1 map of player_id -> stats (no team/opponent on this feed)
  const fallback=await getJson(`${SLEEPER}/stats/nfl/regular/${season}/${week}`);
  if(fallback&&typeof fallback==="object"){
    for(const [id,stats] of Object.entries<Json>(fallback)){
      const p=db[id];
      if(!p||!POS_SET.has(String(p.position))||!stats)continue;
      out.push({id,row:{week,team:p.team||null,opp:null,stats}});
    }
  }
  return out;
}

export async function loadSeasonStats(season:number,throughWeek:number,db:Record<string,Json>):Promise<SeasonStats>{
  const weeks=Array.from({length:Math.max(1,throughWeek)},(_,i)=>i+1);
  const perWeek=await Promise.all(weeks.map(w=>{
    // completed weeks are stable; the in-progress week refreshes every few minutes
    const ttl=w<throughWeek?3600*1000:3*60*1000;
    return cached(`stats:${season}:${w}`,ttl,()=>fetchWeek(season,w,db));
  }));
  const byPlayer=new Map<string,WeekRow[]>();
  const teamWeeks=new Map<string,Map<number,Record<string,number>>>();
  perWeek.forEach(list=>{
    for(const {id,row} of list){
      if(!didPlay(row.stats))continue;
      if(!byPlayer.has(id))byPlayer.set(id,[]);
      byPlayer.get(id)!.push(row);
      if(row.team){
        if(!teamWeeks.has(row.team))teamWeeks.set(row.team,new Map());
        const wk=teamWeeks.get(row.team)!;
        const agg=wk.get(row.week)||{};
        for(const k of TEAM_STAT_KEYS)agg[k]=(agg[k]||0)+num(row.stats[k]);
        wk.set(row.week,agg);
      }
    }
  });
  return {season,weeks,byPlayer,teamWeeks};
}

export type SeasonLine={gp:number;pts:number;ppg:number|null};

export function seasonTotals(rowsForPlayer:WeekRow[]|undefined,scoring:Scoring,position:string):SeasonLine{
  const list=rowsForPlayer||[];
  const pts=Math.round(list.reduce((s,r)=>s+scoreStats(r.stats,scoring,position),0)*100)/100;
  return {gp:list.length,pts,ppg:list.length?Math.round(pts/list.length*100)/100:null};
}

export type RankTable={overall:Map<string,number>;pos:Map<string,number>;posCount:Record<string,number>;overallCount:number;pts:Map<string,SeasonLine>};

export function buildRanks(stats:SeasonStats,scoring:Scoring,db:Record<string,Json>):RankTable{
  const entries:{id:string;position:string;line:SeasonLine}[]=[];
  for(const [id,list] of stats.byPlayer){
    const position=String(db[id]?.position||"");
    if(!POS_SET.has(position))continue;
    entries.push({id,position,line:seasonTotals(list,scoring,position)});
  }
  entries.sort((a,b)=>b.line.pts-a.line.pts);
  const overall=new Map<string,number>(),pos=new Map<string,number>(),pts=new Map<string,SeasonLine>();
  const counters:Record<string,number>={};
  entries.forEach((e,i)=>{
    overall.set(e.id,i+1);
    counters[e.position]=(counters[e.position]||0)+1;
    pos.set(e.id,counters[e.position]);
    pts.set(e.id,e.line);
  });
  return {overall,pos,posCount:counters,overallCount:entries.length,pts};
}

// ---------- schedule ----------
export type ScheduleGame={week:number;home:string;away:string;date:string|null;status:string|null};

export async function loadSchedule(season:number):Promise<ScheduleGame[]>{
  return cached("schedule:"+season,30*60*1000,async()=>{
    const data=await getJson(`${SLEEPER_STATS}/schedule/nfl/regular/${season}`);
    if(!Array.isArray(data))return [];
    return data.map((g:Json)=>({
      week:num(g.week),home:String(g.home||""),away:String(g.away||""),
      date:g.date||g.metadata?.date||null,status:g.status||null,
    })).filter((g:ScheduleGame)=>g.week>0&&g.home&&g.away);
  });
}

export function teamGames(schedule:ScheduleGame[],team:string){
  return schedule.filter(g=>g.home===team||g.away===team).sort((a,b)=>a.week-b.week);
}

export function nextGame(schedule:ScheduleGame[],team:string|null,currentWeek:number){
  if(!team)return null;
  const games=teamGames(schedule,team);
  if(!games.length)return null;
  const upcoming=games.find(g=>g.week>=currentWeek&&String(g.status||"").toLowerCase()!=="complete");
  if(!upcoming)return null;
  const hasGameThisWeek=games.some(g=>g.week===currentWeek);
  return {
    week:upcoming.week,opp:upcoming.home===team?upcoming.away:upcoming.home,home:upcoming.home===team,
    date:upcoming.date,byeWeek:!hasGameThisWeek&&currentWeek<=Math.max(...games.map(g=>g.week))?currentWeek:null,
  };
}

// ---------- team ranks ----------
export type TeamRankRow={key:string;label:string;value:number|null;perGame:number|null;rank:number|null};

const TEAM_RANK_DEFS:{key:string;label:string;calc:(a:Record<string,number>)=>number}[]=[
  {key:"off_yd",label:"Offensive Yards",calc:a=>(a.pass_yd||0)+(a.rush_yd||0)},
  {key:"pass_yd",label:"Pass Yards",calc:a=>a.pass_yd||0},
  {key:"pass_att",label:"Pass Attempts",calc:a=>a.pass_att||0},
  {key:"pass_td",label:"Pass TDs",calc:a=>a.pass_td||0},
  {key:"rush_yd",label:"Rush Yards",calc:a=>a.rush_yd||0},
  {key:"rush_att",label:"Rush Attempts",calc:a=>a.rush_att||0},
  {key:"rush_td",label:"Rush TDs",calc:a=>a.rush_td||0},
];

export function buildTeamRanks(stats:SeasonStats,team:string|null):{rows:TeamRankRow[];games:number;teams:number}{
  const totals=new Map<string,{agg:Record<string,number>;games:number}>();
  for(const [t,weeks] of stats.teamWeeks){
    const agg:Record<string,number>={};
    for(const wk of weeks.values())for(const k of TEAM_STAT_KEYS)agg[k]=(agg[k]||0)+(wk[k]||0);
    totals.set(t,{agg,games:weeks.size});
  }
  const teams=[...totals.keys()];
  const out:TeamRankRow[]=TEAM_RANK_DEFS.map(def=>{
    const perGame=new Map(teams.map(t=>{const e=totals.get(t)!;return [t,e.games?def.calc(e.agg)/e.games:0] as [string,number]}));
    const mine=team?totals.get(team):undefined;
    if(!team||!mine)return {key:def.key,label:def.label,value:null,perGame:null,rank:null};
    const my=perGame.get(team)!;
    const rank=1+teams.filter(t=>(perGame.get(t)||0)>my).length;
    return {key:def.key,label:def.label,value:Math.round(def.calc(mine.agg)),perGame:Math.round(my*10)/10,rank};
  });
  return {rows:out,games:team?totals.get(team)?.games||0:0,teams:teams.length};
}

// ---------- leagues ----------
export type LeagueCtx={
  integration:SleeperLeagueIntegration;league:Json;rosters:Json[];users:Json[];scoring:Scoring;
  myRosterId:number|null;teamNames:Map<number,string>;
};

function teamNameOf(roster:Json,users:Json[]){
  const owner=users.find(u=>String(u.user_id)===String(roster?.owner_id));
  return String(owner?.metadata?.team_name||owner?.display_name||owner?.username||("Roster "+roster?.roster_id));
}
function resolveMine(rosters:Json[],users:Json[],identity:string){
  const id=String(identity||"").trim();
  if(!id)return null;
  let r=rosters.find(x=>String(x.roster_id)===id)||rosters.find(x=>String(x.owner_id)===id);
  if(r)return r;
  const u=users.find(x=>[x.display_name,x.username,x.user_id].some(v=>String(v||"").toLowerCase()===id.toLowerCase()));
  if(u)r=rosters.find(x=>String(x.owner_id)===String(u.user_id));
  return r||null;
}

export async function loadLeagues():Promise<LeagueCtx[]>{
  const config=await getIntegrations();
  const list=config.sleeper.leagues.filter(l=>l.enabled!==false);
  const ctxs=await Promise.all(list.map(async integration=>{
    const root=SLEEPER+"/league/"+integration.leagueId;
    const [league,rosters,users]=await Promise.all([
      getJson(root,{revalidate:300}),getJson(root+"/rosters",{revalidate:120}),getJson(root+"/users",{revalidate:600}),
    ]);
    if(!league||!Array.isArray(rosters))return null;
    const u=Array.isArray(users)?users:[];
    const mine=resolveMine(rosters,u,integration.teamIdentity||"");
    const teamNames=new Map<number,string>(rosters.map((r:Json)=>[Number(r.roster_id),teamNameOf(r,u)]));
    return {integration,league,rosters,users:u,scoring:(league.scoring_settings||{}) as Scoring,myRosterId:mine?Number(mine.roster_id):null,teamNames} as LeagueCtx;
  }));
  return ctxs.filter((c):c is LeagueCtx=>Boolean(c));
}

// ---------- availability ----------
export type Availability={
  leagueKey:string;leagueName:string;state:"mine"|"other"|"free";
  slot:"Starter"|"Bench"|"Taxi"|"IR / Reserve"|null;owner:string|null;ownerRosterId:number|null;record:string|null;
};

export function availabilityFor(ctx:LeagueCtx,playerId:string):Availability{
  const base={leagueKey:ctx.integration.key,leagueName:String(ctx.league.name||ctx.integration.name)};
  for(const r of ctx.rosters){
    const all=[...(r.players||[]),...(r.taxi||[]),...(r.reserve||[])].map(String);
    if(!all.includes(playerId))continue;
    const slot=(r.reserve||[]).map(String).includes(playerId)?"IR / Reserve":(r.taxi||[]).map(String).includes(playerId)?"Taxi":(r.starters||[]).map(String).includes(playerId)?"Starter":"Bench";
    const rid=Number(r.roster_id),s=r.settings||{};
    const record=s.wins!=null?`${s.wins||0}-${s.losses||0}${s.ties?"-"+s.ties:""}`:null;
    return {...base,state:rid===ctx.myRosterId?"mine":"other",slot,owner:ctx.teamNames.get(rid)||null,ownerRosterId:rid,record};
  }
  return {...base,state:"free",slot:null,owner:null,ownerRosterId:null,record:null};
}

// ---------- history (transactions + drafts across league seasons) ----------
export type HistoryEvent={
  leagueKey:string;season:number;ts:number;kind:"Trade"|"Waiver"|"Free Agent"|"Drop"|"Draft"|"Commissioner";
  title:string;detail:string|null;involvesMe:boolean;
};

function pickLabel(p:Json){
  const r=num(p.round);
  const suffix=r===1?"1st":r===2?"2nd":r===3?"3rd":r+"th";
  return `${p.season} ${suffix}`;
}

async function leagueChain(leagueId:string,depth=9){
  const chain:Json[]=[];
  let id:string|null=leagueId;
  for(let i=0;i<=depth&&id&&id!=="0";i++){
    const lg=await getJson(SLEEPER+"/league/"+id,{revalidate:3600});
    if(!lg)break;
    chain.push(lg);
    id=lg.previous_league_id?String(lg.previous_league_id):null;
  }
  return chain;
}

async function seasonTransactions(lg:Json){
  const isCurrent=String(lg.status)!=="complete";
  const maxRound=isCurrent?18:18;
  const rounds=Array.from({length:maxRound+1},(_,i)=>i);
  const results=await Promise.all(rounds.map(r=>getJson(`${SLEEPER}/league/${lg.league_id}/transactions/${r}`,{revalidate:isCurrent?180:86400})));
  const seen=new Set<string>(),out:Json[]=[];
  for(const list of results)if(Array.isArray(list))for(const t of list){
    const id=String(t.transaction_id);
    if(seen.has(id))continue;
    seen.add(id);out.push(t);
  }
  return out;
}

export async function buildHistory(ctx:LeagueCtx,playerId:string,db:Record<string,Json>,debug?:any[]):Promise<HistoryEvent[]>{
  const key=ctx.integration.key;
  const chain=await cached("chain:"+ctx.integration.leagueId,15*60*1000,()=>leagueChain(ctx.integration.leagueId));
  const events:HistoryEvent[]=[];
  const nameOf=(pid:string)=>{const p=db[pid];return p?String(p.full_name||((p.first_name||"")+" "+(p.last_name||"")).trim()||pid):pid};

  await Promise.all(chain.map(async lg=>{
    const season=num(lg.season);
    // roster / owner names for that season's league
    const [rosters,users]=lg.league_id===ctx.integration.leagueId
      ?[ctx.rosters,ctx.users]
      :await Promise.all([getJson(`${SLEEPER}/league/${lg.league_id}/rosters`,{revalidate:3600}),getJson(`${SLEEPER}/league/${lg.league_id}/users`,{revalidate:3600})]);
    const rs=Array.isArray(rosters)?rosters:[],us=Array.isArray(users)?users:[];
    const names=new Map<number,string>(rs.map((r:Json)=>[Number(r.roster_id),teamNameOf(r,us)]));
    // roster ids can change between seasons, so match "me" by owner (user id), not roster id
    const myOwner=ctx.rosters.find(r=>Number(r.roster_id)===ctx.myRosterId)?.owner_id;
    const mine=lg.league_id===ctx.integration.leagueId
      ?rs.find(r=>Number(r.roster_id)===ctx.myRosterId)
      :(myOwner?rs.find(r=>String(r.owner_id)===String(myOwner)):resolveMine(rs,us,ctx.integration.teamIdentity||""));
    const myId=mine?Number(mine.roster_id):null;
    const nm=(rid:number)=>names.get(rid)||("Roster "+rid);

    const txs=await seasonTransactions(lg);
    const dbg:any={league:ctx.integration.key,leagueId:lg.league_id,season:lg.season,status:lg.status,previous:lg.previous_league_id||null,txTotal:txs.length,txByType:{} as Record<string,number>,txStatus:{} as Record<string,number>,mentions:[] as any[]};
    for(const t of txs){dbg.txByType[t.type]=(dbg.txByType[t.type]||0)+1;dbg.txStatus[t.status]=(dbg.txStatus[t.status]||0)+1;if((t.adds&&t.adds[playerId]!=null)||(t.drops&&t.drops[playerId]!=null))dbg.mentions.push({type:t.type,status:t.status,leg:t.leg})}
    debug?.push(dbg);
    for(const t of txs){
      if(String(t.status)!=="complete")continue;
      const adds=t.adds||{},drops=t.drops||{};
      const added=adds[playerId]!=null,dropped=drops[playerId]!=null;
      if(!added&&!dropped)continue;
      const ts=num(t.status_updated||t.created);
      if(t.type==="trade"){
        const to=added?num(adds[playerId]):null,from=dropped?num(drops[playerId]):null;
        const roster_ids:number[]=(t.roster_ids||[]).map(Number);
        const receives=(rid:number)=>[
          ...Object.entries(adds).filter(([,v])=>num(v)===rid).map(([pid])=>nameOf(pid)),
          ...(t.draft_picks||[]).filter((p:Json)=>num(p.owner_id)===rid).map(pickLabel),
        ];
        const lines=roster_ids.map(rid=>`${nm(rid)} received ${receives(rid).join(", ")||"nothing"}`);
        events.push({
          leagueKey:key,season,ts,kind:"Trade",
          title:`Traded${from!=null?" from "+nm(from):""}${to!=null?" to "+nm(to):""}`,
          detail:lines.join(" · "),involvesMe:roster_ids.includes(myId??-1),
        });
        continue;
      }
      if(added){
        const rid=num(adds[playerId]);
        const droppedForIt=Object.entries(drops).filter(([,v])=>num(v)===rid).map(([pid])=>nameOf(pid));
        const bid=t.settings?.waiver_bid;
        const kind=t.type==="waiver"?"Waiver":t.type==="commissioner"?"Commissioner":"Free Agent";
        events.push({
          leagueKey:key,season,ts,kind,
          title:t.type==="waiver"?`Claimed off waivers by ${nm(rid)}`:t.type==="commissioner"?`Added by commissioner to ${nm(rid)}`:`Signed as a free agent by ${nm(rid)}`,
          detail:[bid!=null&&t.type==="waiver"?`FAAB bid $${bid}`:null,droppedForIt.length?`Dropped ${droppedForIt.join(", ")}`:null].filter(Boolean).join(" · ")||null,
          involvesMe:rid===myId,
        });
      }else if(dropped){
        const rid=num(drops[playerId]);
        events.push({leagueKey:key,season,ts,kind:t.type==="commissioner"?"Commissioner":"Drop",title:`Dropped by ${nm(rid)}`,detail:null,involvesMe:rid===myId});
      }
    }

    // draft selections (rookie drafts)
    const drafts=await getJson(`${SLEEPER}/league/${lg.league_id}/drafts`,{revalidate:3600});
    if(Array.isArray(drafts))await Promise.all(drafts.map(async d=>{
      const picks=await getJson(`${SLEEPER}/draft/${d.draft_id}/picks`,{revalidate:3600});
      if(!Array.isArray(picks))return;
      const pick=picks.find((p:Json)=>String(p.player_id)===playerId);
      dbg.drafts=[...(dbg.drafts||[]),{id:d.draft_id,status:d.status,type:d.type,picks:picks.length,found:Boolean(pick)}];
      if(!pick)return;
      const rid=num(pick.roster_id);
      events.push({
        leagueKey:key,season,ts:num(d.start_time||d.last_picked||pick.metadata?.updated||0),kind:"Draft",
        title:`Drafted by ${nm(rid)}`,
        detail:`Round ${pick.round}, pick ${pick.draft_slot||pick.pick_no}${d.type?" · "+String(d.type)+" draft":""}`,
        involvesMe:rid===myId,
      });
    }));
  }));
  return events.sort((a,b)=>b.ts-a.ts);
}

// ---------- college (NCAA) card lookup ----------
export async function findCollegePlayerId(name:string,position:string):Promise<number|null>{
  const all=await cached("college-players",5*60*1000,async()=>{
    const c=await ensureTursoSchema();
    return rows(await c.execute("select id,name,position,draft_class from players")) as any[];
  });
  const key=normName(name);
  const matches=all.filter(p=>normName(p.name)===key);
  if(!matches.length)return null;
  const pos=position.toUpperCase();
  const sorted=[...matches].sort((a,b)=>(String(b.position||"").toUpperCase()===pos?1:0)-(String(a.position||"").toUpperCase()===pos?1:0)||num(b.draft_class)-num(a.draft_class));
  return num(sorted[0].id);
}
