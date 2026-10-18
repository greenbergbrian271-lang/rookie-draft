import {buildHistory,loadLeagues,loadPlayerDb} from "@/lib/nfl-card";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(req:Request){
  try{
    const sp=new URL(req.url).searchParams;const sleeperId=String(sp.get("sleeperId")||"");const debug:any[]|undefined=sp.get("debug")?[]:undefined;
    if(!sleeperId)return Response.json({error:"sleeperId is required"},{status:400});
    const [leagues,db]=await Promise.all([loadLeagues(),loadPlayerDb()]);
    const histories=await Promise.all(leagues.map(async l=>[l.integration.key,await buildHistory(l,sleeperId,db,debug)] as const));
    return Response.json({debug,leagues:leagues.map(l=>({key:l.integration.key,name:String(l.league.name||l.integration.name)})),history:Object.fromEntries(histories)});
  }catch(e:any){
    return Response.json({error:"Could not load player history",detail:e?.message},{status:500});
  }
}
