import {cacheGet,cacheSetStrict} from "@/lib/cache";
import {currentFootballWeek,syncRange,saveRankings,ymd} from "@/lib/college-football-sync";

const parse=(s:string)=>new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),16));

export async function GET(req:Request){
  try{
    const u=new URL(req.url),fresh=u.searchParams.get("fresh")==="1";
    let start=u.searchParams.get("start"),end=u.searchParams.get("end");
    if(!start||!end){const w=currentFootballWeek();start=ymd(w.start);end=ymd(w.end)}
    const key=`cfb:schedule:${start}:${end}`;
    let events=fresh?null:await cacheGet<any[]>(key);
    if(!events)events=await syncRange(parse(start),parse(end));
    // Scores/status for the most recent three days can change after the initial schedule
    // fetch. Re-poll only that short window so a week-long schedule cache cannot leave
    // completed games looking live or upcoming.
    const now=new Date(),recentStart=new Date(now);recentStart.setUTCDate(recentStart.getUTCDate()-2);
    const rangeStart=parse(start),rangeEnd=parse(end);
    const refreshStart=new Date(Math.max(rangeStart.getTime(),recentStart.getTime()));
    const refreshEnd=new Date(Math.min(rangeEnd.getTime(),now.getTime()));
    if(refreshStart<=refreshEnd){
      const recent=await syncRange(refreshStart,refreshEnd);
      const byId=new Map((events||[]).map((event:any)=>[String(event.id),event]));
      for(const event of recent)byId.set(String(event.id),event);
      events=Array.from(byId.values());
      await cacheSetStrict(key,events,604800);
    }
    let rankings=fresh?null:await cacheGet<any[]>("cfb:rankings");
    if(!rankings)rankings=await saveRankings();
    return Response.json({source:fresh?"live-ESPN":"cached-ESPN",fresh,start,end,events:events||[],rankings:rankings||[],refreshedAt:new Date().toISOString(),rosterByTeam:{}});
  }catch(e:any){
    return Response.json({error:"Could not load college football schedule",detail:e?.message},{status:502});
  }
}
