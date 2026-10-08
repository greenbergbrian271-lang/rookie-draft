import {getIntelLeague,leagueIntelMode} from "@/lib/dynasty-intelligence-core";
import {managerIntelMode} from "@/lib/dynasty-manager-intel";
import {marketIntelMode,processIntelMode} from "@/lib/dynasty-market-intel";

export const dynamic="force-dynamic";

export async function GET(req:Request){
  try{
    const url=new URL(req.url),leagueKey=String(url.searchParams.get("leagueKey")||""),mode=String(url.searchParams.get("mode")||"league");
    const league=await getIntelLeague(leagueKey);
    if(!league)return Response.json({error:"League integration not found"},{status:404});
    if(mode==="managers")return Response.json(await managerIntelMode(league));
    if(mode==="market")return Response.json(await marketIntelMode(league));
    if(mode==="process")return Response.json(await processIntelMode(league));
    return Response.json(await leagueIntelMode(league));
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build dynasty intelligence"},{status:500});
  }
}
