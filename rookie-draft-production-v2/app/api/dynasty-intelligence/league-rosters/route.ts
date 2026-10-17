import {getIntelLeague} from "@/lib/dynasty-intelligence-core";
import {buildLeagueRosters} from "@/lib/league-rosters";

export const dynamic="force-dynamic";

// Read-only. Other managers' rosters for League Intelligence; never consumed by Draft Day or grading.
export async function GET(req:Request){
  try{
    const leagueKey=String(new URL(req.url).searchParams.get("leagueKey")||"");
    const league=await getIntelLeague(leagueKey);
    if(!league)return Response.json({error:"League integration not found"},{status:404});
    return Response.json(await buildLeagueRosters(league));
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not load league rosters"},{status:500});
  }
}
