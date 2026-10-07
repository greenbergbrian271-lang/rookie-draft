import {rows} from "@/lib/turso";

export type ScoutingPosition="QB"|"RB"|"WR"|"TE";
export const SCOUTING_POSITIONS:ScoutingPosition[]=["QB","RB","WR","TE"];
export const FILM_TRAITS:Record<ScoutingPosition,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};
const present=(v:any)=>v!==undefined&&v!==null&&String(v).trim()!=="";
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):0;

export async function loadScoutingWorkflow(c:any,draftClass:number){
  const players=rows(await c.execute({sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url,headshot_source,jersey_number,created_at,updated_at from players where draft_class=? and position in ('QB','RB','WR','TE') order by position,coalesce(watch_order,9999),name",args:[draftClass]}));
  const sessions=rows(await c.execute({sql:"select s.player_id,count(*) as game_count,max(coalesce(s.game_date,s.created_at)) as last_game_at,max(s.created_at) as last_session_at from scouting_sessions s join players p on p.id=s.player_id where p.draft_class=? group by s.player_id",args:[draftClass]}));
  const evals=rows(await c.execute({sql:"select e.player_id,e.category,e.value,e.commentary,e.updated_at from evaluations e join players p on p.id=e.player_id where p.draft_class=?",args:[draftClass]}));
  const sessionMap=new Map(sessions.map((x:any)=>[String(x.player_id),x]));
  const evalMap=new Map<string,Map<string,any>>();
  for(const e of evals as any[]){const id=String(e.player_id);if(!evalMap.has(id))evalMap.set(id,new Map());evalMap.get(id)!.set(String(e.category),e)}
  const records=players.map((p:any)=>{
    const id=String(p.id),sm:any=sessionMap.get(id),em=evalMap.get(id)||new Map<string,any>(),legacy=em.get("__COMMENTARY__");
    const live=n(sm?.game_count),gamesWatched=live>0?live:(present(legacy?.commentary)||present(legacy?.value)?1:0),traits=FILM_TRAITS[p.position as ScoutingPosition]||[];
    const filmComplete=traits.filter(x=>{const e=em.get(x);return present(e?.value)||present(e?.commentary)}).length;
    const legacyUpdated=legacy?.updated_at||null;
    return {...p,id:Number(p.id),gamesWatched,filmComplete,filmTotal:traits.length,lastScoutedAt:sm?.last_game_at||sm?.last_session_at||legacyUpdated||null};
  });
  return {players:records,evals};
}

export function inboxPayload(records:any[],plannedGames:any[]){
  const watched=records.filter(x=>x.scouting_status==="WATCHED");
  const newAdditions=watched.filter(x=>x.gamesWatched<1).sort((a,b)=>(a.watch_order||9999)-(b.watch_order||9999));
  const incompleteFilm=watched.filter(x=>x.gamesWatched>0&&x.filmComplete<x.filmTotal).sort((a,b)=>a.filmComplete-b.filmComplete||(a.watch_order||9999)-(b.watch_order||9999));
  const secondLook=watched.filter(x=>x.gamesWatched===1&&x.filmComplete>=x.filmTotal).sort((a,b)=>(a.watch_order||9999)-(b.watch_order||9999));
  const triage=records.filter(x=>x.scouting_status==="MAYBE").sort((a,b)=>(a.watch_order||9999)-(b.watch_order||9999));
  const nextUp:Record<string,any>={};
  for(const pos of SCOUTING_POSITIONS)nextUp[pos]=records.filter(x=>x.position===pos&&x.scouting_status==="TO_SCOUT").sort((a,b)=>(a.watch_order||9999)-(b.watch_order||9999))[0]||null;
  const upcoming=[...plannedGames].sort((a:any,b:any)=>String(a.kickoff).localeCompare(String(b.kickoff))).slice(0,8);
  return {newAdditions,incompleteFilm,secondLook,triage,nextUp,upcoming,counts:{newAdditions:newAdditions.length,incompleteFilm:incompleteFilm.length,secondLook:secondLook.length,triage:triage.length,upcoming:upcoming.length}};
}

function pct(numerator:number,denominator:number){return denominator?Math.round((numerator/denominator)*1000)/10:0}
export function coveragePayload(records:any[]){
  const positionRows=SCOUTING_POSITIONS.map(position=>{
    const list=records.filter(x=>x.position===position),withGames=list.filter(x=>x.gamesWatched>0),watched=list.filter(x=>["WATCHED","FINISHED"].includes(x.scouting_status)),watchedWithGames=watched.filter(x=>x.gamesWatched>0),zeroGames=watched.filter(x=>x.gamesWatched<1),oneGame=watched.filter(x=>x.gamesWatched===1),multiGame=watched.filter(x=>x.gamesWatched>=2);
    const filmDone=watched.reduce((s,x)=>s+x.filmComplete,0),filmPossible=watched.reduce((s,x)=>s+x.filmTotal,0);
    return {position,total:list.length,toScout:list.filter(x=>x.scouting_status==="TO_SCOUT").length,watched:watched.length,maybe:list.filter(x=>x.scouting_status==="MAYBE").length,finished:list.filter(x=>x.scouting_status==="FINISHED").length,withGames:withGames.length,zeroGames:zeroGames.length,oneGame:oneGame.length,multiGame:multiGame.length,classCoveragePct:pct(withGames.length,list.length),watchedCoveragePct:pct(watchedWithGames.length,watched.length),filmCompletionPct:pct(filmDone,filmPossible),avgGames:watchedWithGames.length?Math.round((watchedWithGames.reduce((s,x)=>s+x.gamesWatched,0)/watchedWithGames.length)*100)/100:0};
  });
  const total={position:"ALL",total:positionRows.reduce((s,x)=>s+x.total,0),toScout:positionRows.reduce((s,x)=>s+x.toScout,0),watched:positionRows.reduce((s,x)=>s+x.watched,0),maybe:positionRows.reduce((s,x)=>s+x.maybe,0),finished:positionRows.reduce((s,x)=>s+x.finished,0),withGames:positionRows.reduce((s,x)=>s+x.withGames,0),zeroGames:positionRows.reduce((s,x)=>s+x.zeroGames,0),oneGame:positionRows.reduce((s,x)=>s+x.oneGame,0),multiGame:positionRows.reduce((s,x)=>s+x.multiGame,0),classCoveragePct:0,watchedCoveragePct:0,filmCompletionPct:0,avgGames:0};
  total.classCoveragePct=pct(total.withGames,total.total);
  const watchedWithGames=records.filter(x=>["WATCHED","FINISHED"].includes(x.scouting_status)&&x.gamesWatched>0),watchedRecords=records.filter(x=>["WATCHED","FINISHED"].includes(x.scouting_status));
  total.watchedCoveragePct=pct(watchedWithGames.length,watchedRecords.length);
  total.filmCompletionPct=pct(watchedRecords.reduce((s,x)=>s+x.filmComplete,0),watchedRecords.reduce((s,x)=>s+x.filmTotal,0));
  total.avgGames=watchedWithGames.length?Math.round((watchedWithGames.reduce((s,x)=>s+x.gamesWatched,0)/watchedWithGames.length)*100)/100:0;
  const recent=[...records].filter(x=>x.lastScoutedAt).sort((a,b)=>String(b.lastScoutedAt).localeCompare(String(a.lastScoutedAt))).slice(0,12);
  return {total,positions:positionRows,players:records,recent};
}
