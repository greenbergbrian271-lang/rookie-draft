import {buildDatabase} from "@/lib/comps-database-server";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(){
  try{return Response.json(await buildDatabase())}
  catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
