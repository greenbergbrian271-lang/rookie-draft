import {cacheGet} from "@/lib/cache";
import {currentFootballWeek,syncRange,syncDates,saveRankings,ymd} from "@/lib/college-football-sync";

const parse=(s:string)=>new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),16));

export async function GET(req:Request){
  try{
    const u=new URL(req.url),fresh=u.searchParams.get("fresh")==="1",dateParam=u.searchParams.get("dates"),idParam=u.searchParams.get("ids");
    let start=u.searchParams.get("start"),end=u.searchParams.get("end"),events:any[]=[];
    if(dateParam){
      const dates=Array.from(new Set(dateParam.split(",").map(x=>x.trim()).filter(x=>/^\d{8}$/.test(x)))).slice(0,20);
      if(!dates.length)return Response.json({error:"Provide one or more YYYYMMDD dates."},{status:400});
      events=await syncDates(dates,fresh);if(idParam){const ids=new Set(idParam.split(",").map(x=>x.trim()).filter(x=>/^\\d+$/.test(x)).slice(0,40));events=events.filter((event:any)=>ids.has(String(event.id)))}start=dates[0];end=dates[dates.length-1];
    }else{
      if(!start||!end){const w=currentFootballWeek();start=ymd(w.start);end=ymd(w.end)}
      const key="cfb:schedule:"+start+":"+end;
      events=fresh?[]:(await cacheGet<any[]>(key))||[];
      if(!events.length)events=await syncRange(parse(start),parse(end));
    }
    let rankings:any[]=[];
    if(!dateParam){
      rankings=fresh?[]:(await cacheGet<any[]>("cfb:rankings"))||[];
      if(!rankings.length)rankings=await saveRankings();
    }
    return Response.json({source:dateParam?"historical-ESPN":fresh?"live-ESPN":"cached-ESPN",fresh,start,end,events:events||[],rankings:rankings||[],refreshedAt:new Date().toISOString(),rosterByTeam:{}});
  }catch(e:any){
    return Response.json({error:"Could not load college football schedule",detail:e?.message},{status:502});
  }
}
