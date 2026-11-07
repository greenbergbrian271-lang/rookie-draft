import {getIntegrations} from "@/lib/integrations";
import {ensureTursoSchema} from "@/lib/turso";
import {refreshCollegeData} from "@/lib/college-football-sync";

export const dynamic="force-dynamic";
export const maxDuration=60;

type Check={id:string;label:string;ok:boolean;primary:boolean;detail:string;ms:number};

// Draft season = January through May (combine, all-star games, declarations, draft).
function inDraftSeason(d=new Date()){return d.getMonth()<=4}
// The draft class that is "next up": after May it is next year's class.
function draftYear(d=new Date()){return d.getMonth()<=4?d.getFullYear():d.getFullYear()+1}

async function timed(id:string,label:string,primary:boolean,fn:()=>Promise<string>):Promise<Check>{
  const start=Date.now();
  try{const detail=await fn();return {id,label,primary,ok:true,detail,ms:Date.now()-start}}
  catch(e:any){return {id,label,primary,ok:false,detail:e?.name==="AbortError"?"Timed out":(e?.message||"Check failed"),ms:Date.now()-start}}
}
async function getJson(url:string,init:RequestInit={},timeout=8000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const res=await fetch(url,{cache:"no-store",...init,signal:controller.signal,headers:{accept:"application/json","user-agent":"RookieDraftWebApp/2.0",...(init.headers||{})}});
    if(!res.ok)throw new Error("HTTP "+res.status);
    return await res.json();
  }finally{clearTimeout(timer)}
}

export async function POST(req:Request){
  const draftSeason=inDraftSeason(),year=draftYear(),origin=new URL(req.url).origin,cookie=req.headers.get("cookie")||"";

  const sleeper=timed("sleeper","Sleeper",true,async()=>{
    const config=await getIntegrations(),leagues=config.sleeper.leagues.filter(l=>l.enabled!==false);
    const [state,results]=await Promise.all([
      getJson("https://api.sleeper.app/v1/state/nfl"),
      Promise.allSettled(leagues.map(l=>getJson("https://api.sleeper.app/v1/league/"+l.leagueId)))
    ]);
    const good=results.filter(r=>r.status==="fulfilled").length;
    const bad=leagues.filter((_,i)=>results[i].status==="rejected").map(l=>l.name);
    if(bad.length)throw new Error(good+"/"+leagues.length+" leagues reachable · failed: "+bad.join(", "));
    const week=state?.season_type==="regular"?"Week "+state.week:state?.season_type==="pre"?"Preseason":"Offseason";
    return (state?.league_season||state?.season||"")+" "+week+" · "+good+"/"+leagues.length+" leagues reachable";
  });

  const espn=timed("espn","ESPN",true,async()=>{
    const tasks:Promise<any>[]=[getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")];
    if(draftSeason)tasks.push(getJson("https://site.web.api.espn.com/apis/v2/scoreboard/header?draft_year="+year+"&draft_round=1"));
    const [scoreboard]=await Promise.all(tasks);
    const games=Array.isArray(scoreboard?.events)?scoreboard.events.length:0;
    return "NFL scoreboard OK ("+games+" games)"+(draftSeason?" · "+year+" draft feed OK":"");
  });

  // NFL Draft source: the draft-picks feed behind NFL Draft War Room / Draft Day.
  // In draft season it is re-synced; otherwise only the stored copy is read.
  const draft=timed("nfl-draft","NFL Draft Source",true,async()=>{
    const url=origin+"/api/nfl-draft?year="+year+(draftSeason?"&refresh=1":"");
    const res=await fetch(url,{cache:"no-store",headers:{cookie}});
    const j=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(j?.error||"HTTP "+res.status);
    if(j?.syncError)throw new Error("Sync failed: "+j.syncError);
    const n=Array.isArray(j.picks)?j.picks.length:0;
    if(draftSeason&&!n)throw new Error("No "+year+" picks returned yet");
    return n?(n+" "+year+" picks · "+(j.complete?"complete":"in progress")+" · "+(j.source||"stored copy")):"No "+year+" picks yet (draft has not started)";
  });

  // College schedule + rankings: re-pull from ESPN and overwrite the cached copies so kickoff times and polls are current.
  const college=timed("college","College Football",true,async()=>{
    const r=await refreshCollegeData(10);
    const bits=[(r.poll||"Rankings")+" "+(r.rankedTeams?r.rankedTeams+" ranked teams":"unavailable")+(r.rankChanges?" · "+r.rankChanges+" rank change"+(r.rankChanges===1?"":"s"):" · no rank changes")];
    bits.push(r.games+" games in next "+r.days+" days"+(r.kickoffChanges?" · "+r.kickoffChanges+" kickoff time"+(r.kickoffChanges===1?"":"s")+" updated":" · kickoff times unchanged")+(r.newGames?" · "+r.newGames+" new":""));
    return bits.join(" · ");
  });
  const database=timed("database","Database",false,async()=>{const c=await ensureTursoSchema();await c.execute("select 1");return "Connected"});
  const ktc=timed("ktc","KeepTradeCut",false,async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{const res=await fetch("https://keeptradecut.com/dynasty-rankings",{method:"HEAD",cache:"no-store",signal:controller.signal});if(res.status>=500)throw new Error("HTTP "+res.status);return "Reachable"}
    finally{clearTimeout(timer)}
  });

  const checks=await Promise.all([sleeper,espn,college,draft,database,ktc]);
  return Response.json({checkedAt:new Date().toISOString(),draftSeason,draftYear:year,checks});
}
