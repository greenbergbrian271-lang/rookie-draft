import {loadWeights,saveWeights,weightsToPercent} from "@/lib/player-comps-server";
import {DEFAULT_WEIGHTS,WEIGHT_KEYS} from "@/lib/player-comps";

export const dynamic="force-dynamic";
const payload=(w:any)=>({weights:weightsToPercent(w),defaults:weightsToPercent(DEFAULT_WEIGHTS)});

export async function GET(){
  try{return Response.json(payload(await loadWeights()))}
  catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(b?.reset)return Response.json(payload(await saveWeights(null)));
    const input=b?.weights;
    if(!input||typeof input!=="object")return Response.json({error:"weights required"},{status:400});
    const vals=WEIGHT_KEYS.map(k=>Number((input as any)[k]));
    if(vals.some(v=>!Number.isFinite(v)||v<0||v>100))return Response.json({error:"Each weight must be a number from 0 to 100"},{status:400});
    if(Math.round(vals.reduce((a,b)=>a+b,0))!==100)return Response.json({error:"Weights must add up to 100%"},{status:400});
    return Response.json(payload(await saveWeights(input)));
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
