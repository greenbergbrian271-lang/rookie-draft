import {cacheGet,cacheSet} from "@/lib/cache";

export async function GET(req:Request){
  const u=new URL(req.url),date=(u.searchParams.get("date")||"").replace(/[^0-9]/g,""),fresh=u.searchParams.get("fresh")==="1";
  if(!/^\d{8}$/.test(date))return Response.json({error:"Provide date as YYYYMMDD"},{status:400});
  const gameDate=new Date(Number(date.slice(0,4)),Number(date.slice(4,6))-1,Number(date.slice(6,8)));\n  if(gameDate<new Date(2026,8,9))return Response.json({events:[],source:"season-start-guard",date});\n  const key="nfl:schedule:"+date;
  try{
    let data=fresh?null:await cacheGet<any>(key);
    if(!data){
      const r=await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates="+date,{cache:"no-store"});
      if(!r.ok)throw new Error("ESPN NFL schedule returned "+r.status);
      data=await r.json();
      try{await cacheSet(key,data,60*15)}catch{}
    }
    return Response.json({events:data?.events||[],source:fresh?"live-ESPN":"cached-ESPN",date});
  }catch(e:any){return Response.json({error:"Could not load NFL schedule",detail:e?.message},{status:502})}
}
