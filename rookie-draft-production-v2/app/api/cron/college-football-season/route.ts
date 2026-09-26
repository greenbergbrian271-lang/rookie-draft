import {syncFullSeason} from "@/lib/college-football-sync";
export async function GET(req:Request){const secret=process.env.CRON_SECRET;if(secret&&req.headers.get("authorization")!==`Bearer ${secret}`)return new Response("Unauthorized",{status:401});try{return Response.json({ok:true,...await syncFullSeason()})}catch(e:any){return Response.json({ok:false,error:e?.message},{status:500})}}
