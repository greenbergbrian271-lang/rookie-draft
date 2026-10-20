import {buildComps,loadTarget,saveOverride} from "@/lib/player-comps-server";
import {compKey} from "@/lib/player-comps";

export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(req:Request){
  try{
    const id=new URL(req.url).searchParams.get("playerId");
    if(!id)return Response.json({error:"playerId required"},{status:400});
    const result=await buildComps(id);
    if(!result)return Response.json({error:"Player not found"},{status:404});
    return Response.json(result);
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}

export async function POST(req:Request){
  try{
    const b=await req.json(),id=String(b?.playerId||""),action=String(b?.action||""),comp=b?.compKey?String(b.compKey):undefined;
    if(!id||!["pin","exclude","clear"].includes(action))return Response.json({error:"playerId and a valid action are required"},{status:400});
    const target=await loadTarget(id);
    if(!target)return Response.json({error:"Player not found"},{status:404});
    await saveOverride(compKey(target.draftClass,target.position,target.name),action as any,comp);
    return Response.json(await buildComps(id));
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
