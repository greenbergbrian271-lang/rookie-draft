import {productionMetrics} from "@/lib/production-metrics";
import type {TeamStats} from "@/lib/production-metrics";
import {asTeamStats,findTeamStats} from "@/lib/team-stats";
import type {CollegeRow} from "@/lib/team-stats";

export async function POST(req:Request){
 try{
  const {position,row,team,college,colleges}=await req.json();
  if(!["QB","RB","WR","TE"].includes(position))return Response.json({error:"Invalid position"},{status:400});
  const matched=Array.isArray(colleges)?findTeamStats(colleges as CollegeRow[],college):null;
  const stats=(team||asTeamStats(matched)) as TeamStats;
  return Response.json({...productionMetrics(position,row||{},stats),teamStats:stats,teamMatched:matched?.team||null});
 }catch(e:unknown){
  return Response.json({error:e instanceof Error?e.message:"Invalid request"},{status:400});
 }
}
