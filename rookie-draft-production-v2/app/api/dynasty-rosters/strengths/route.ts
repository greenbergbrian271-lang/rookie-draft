import {getIntegrations} from "@/lib/integrations";
import {loadKtcDataset} from "@/lib/ktc";
import {buildLeagueStrengths} from "@/lib/league-strengths";

export const dynamic="force-dynamic";

async function sleeperJson(url:string){
  const res=await fetch(url,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const leagueKey=String(url.searchParams.get("leagueKey")||"");
    if(!leagueKey)return Response.json({error:"leagueKey is required"},{status:400});

    const integrations=await getIntegrations();
    const integration=integrations.sleeper.leagues.find(l=>l.key===leagueKey&&l.enabled!==false);
    if(!integration)return Response.json({error:"League integration not found"},{status:404});

    const root="https://api.sleeper.app/v1/league/"+integration.leagueId;
    const [leagueData,rosters,users,tradedPicks,playerDb,dataset]=await Promise.all([
      sleeperJson(root),
      sleeperJson(root+"/rosters"),
      sleeperJson(root+"/users"),
      sleeperJson(root+"/traded_picks").catch(()=>[]),
      sleeperJson("https://api.sleeper.app/v1/players/nfl"),
      loadKtcDataset(false),
    ]);

    const strengths=buildLeagueStrengths({
      leagueData,
      rosters:Array.isArray(rosters)?rosters:[],
      users:Array.isArray(users)?users:[],
      tradedPicks:Array.isArray(tradedPicks)?tradedPicks:[],
      playerDb,
      dataset,
      integration,
    });

    return Response.json({
      league:{key:integration.key,name:String(leagueData?.name||integration.name),leagueId:integration.leagueId},
      ...strengths,
      note:"Overall rank uses total KTC player value plus owned future-pick value. Position ranks weight starting-caliber players most heavily, then depth.",
    });
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not load league strengths"},{status:500});
  }
}
