import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {playerTransactionHistory} from "@/lib/dynasty-manager-intel";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    const playerId=String(params.get("playerId")||"").trim();
    const leagueKey=String(params.get("leagueKey")||"").trim();
    if(!playerId||!leagueKey)return Response.json({error:"Player ID and league key are required."},{status:400});
    const config=await getIntegrations();
    const league=(config.sleeper?.leagues||[]).find((item:SleeperLeagueIntegration)=>item.key===leagueKey&&item.enabled!==false);
    if(!league)return Response.json({error:"League not found or disabled."},{status:404});
    const transactions=await playerTransactionHistory(league,playerId);
    return Response.json({transactions});
  }catch(error:any){
    return Response.json({error:error?.message||"Could not load transaction history."},{status:500});
  }
}
