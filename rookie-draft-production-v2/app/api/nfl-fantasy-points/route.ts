import {cacheGet,cacheSet} from "@/lib/cache";
import {getIntegrations} from "@/lib/integrations";

export async function GET(req:Request){
  const u=new URL(req.url),season=Number(u.searchParams.get("season")||0),week=Number(u.searchParams.get("week")||0);
  if(!Number.isInteger(season)||!Number.isInteger(week)||season<2020||week<1||week>22)return Response.json({error:"Invalid season or week"},{status:400});
  const key=`nfl:fantasy:one-league:${season}:${week}`;
  try{
    const cached=await cacheGet<any>(key);if(cached)return Response.json(cached);
    const integrations=await getIntegrations(),league=integrations.sleeper.leagues.find(x=>x.key==="one-league");
    if(!league)throw new Error("One League to Rule them All integration is not configured.");
    const [leagueData,stats]=await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${league.leagueId}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Sleeper league settings unavailable");return r.json()}),
      fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Sleeper weekly stats unavailable");return r.json()})
    ]);
    const scoring=leagueData.scoring_settings||{},points:Record<string,number>={};
    for(const [id,stat] of Object.entries(stats||{})){
      const row=stat as Record<string,any>;let total=0;
      for(const [metric,multiplier] of Object.entries(scoring)){const value=Number(row[metric]);if(Number.isFinite(value)&&Number.isFinite(Number(multiplier)))total+=value*Number(multiplier)}
      if(Number.isFinite(total))points[id]=Math.round(total*100)/100;
    }
    const result={season,week,points,source:"Sleeper · One League to Rule them All"};
    try{await cacheSet(key,result,60*60*24)}catch{}
    return Response.json(result);
  }catch(e:any){return Response.json({error:"Could not load One League fantasy points",detail:e?.message},{status:502})}
}