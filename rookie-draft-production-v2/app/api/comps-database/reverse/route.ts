import {buildReverse} from "@/lib/comps-database-server";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(req:Request){
  try{
    const sp=new URL(req.url).searchParams,key=sp.get("key"),floor=Math.max(30,Math.min(95,Number(sp.get("min"))||50));
    if(!key)return Response.json({error:"key required"},{status:400});
    const r=await buildReverse(key,floor);
    if(!r)return Response.json({error:"Player not found"},{status:404});
    return Response.json(r);
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
