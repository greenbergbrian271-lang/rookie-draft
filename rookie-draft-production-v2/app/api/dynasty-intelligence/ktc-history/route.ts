import {getIntelLeague,loadIntelBase,resolveIntelRoster} from "@/lib/dynasty-intelligence-core";
import {backfillKtcHistory,buildLeagueKtcHistoryTargets,getKtcHistoryBackfillStatus} from "@/lib/ktc-history-backfill";

export const dynamic="force-dynamic";
export const maxDuration=60;

async function context(leagueKey:string){
  const league=await getIntelLeague(leagueKey);
  if(!league)throw new Error("League integration not found");
  const base=await loadIntelBase(league),mine=resolveIntelRoster(base.rosters,base.users,league.teamIdentity||"");
  const targets=buildLeagueKtcHistoryTargets({rosters:base.rosters,playerDb:base.playerDb,dataset:base.dataset,mineRosterId:Number(mine?.roster_id)||null});
  return {league,targets};
}

export async function GET(req:Request){
  try{
    const leagueKey=String(new URL(req.url).searchParams.get("leagueKey")||"");
    const {targets}=await context(leagueKey);
    return Response.json(await getKtcHistoryBackfillStatus(targets));
  }catch(e:unknown){
    const message=e instanceof Error?e.message:"Could not read KTC history status";
    return Response.json({error:message},{status:/not found/i.test(message)?404:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json(),leagueKey=String(body?.leagueKey||""),limit=Math.max(1,Math.min(10,Number(body?.limit)||6));
    const {targets}=await context(leagueKey);
    return Response.json(await backfillKtcHistory(targets,limit));
  }catch(e:unknown){
    const message=e instanceof Error?e.message:"Could not import KTC history";
    return Response.json({error:message},{status:/not found/i.test(message)?404:500});
  }
}
