import {getScoutingProcessExclusions,setScoutingProcessExclusion} from "@/lib/scouting-process-exclusions";

export const dynamic="force-dynamic";

export async function GET(){
  return Response.json({exclusions:await getScoutingProcessExclusions()});
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const action=String(body?.action||"") as "exclude"|"restore";
    const year=Number(body?.year);
    const name=String(body?.name||"").trim();
    if(!["exclude","restore"].includes(action)||!Number.isFinite(year)||!name)return Response.json({error:"action, year and name are required"},{status:400});
    const exclusions=await setScoutingProcessExclusion(action,year,name);
    return Response.json({ok:true,exclusions});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not update scouting-process exclusions"},{status:500});
  }
}
