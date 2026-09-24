import {productionMetrics} from "@/lib/production-metrics";
import {findTeamStats,asTeamStats,type CollegeRow} from "@/lib/team-stats";
type Pos="QB"|"RB"|"WR"|"TE";
export async function POST(req:Request){try{const body=await req.json(),position=body.position as Pos,rows=Array.isArray(body.rows)?body.rows:[],colleges=(body.colleges||[]) as CollegeRow[];if(!["QB","RB","WR","TE"].includes(position))return Response.json({error:"Invalid position"},{status:400});return Response.json(rows.map((row:any)=>({...row,...productionMetrics(position,row,asTeamStats(findTeamStats(colleges,row.College||row.college)))})))}catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Calculation failed"},{status:500})}}
