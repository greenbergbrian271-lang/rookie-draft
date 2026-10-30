import {buildMatches} from "@/lib/comps-database-server";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(req:Request){
  try{
    const sp=new URL(req.url).searchParams,key=sp.get("key"),playerId=sp.get("playerId");
    if(!key&&!playerId)return Response.json({error:"key or playerId required"},{status:400});
    const r=await buildMatches({key,playerId});
    if(!r)return Response.json({error:"Player not found"},{status:404});
    return Response.json(r);
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
