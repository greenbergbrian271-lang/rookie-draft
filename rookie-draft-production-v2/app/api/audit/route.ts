import {ensureTursoSchema} from "@/lib/turso";
import {recentAudit,undoAudit} from "@/lib/audit";

export async function GET(req:Request){
  try{
    const c=await ensureTursoSchema(),limit=Number(new URL(req.url).searchParams.get("limit")||80);
    return Response.json({entries:await recentAudit(c,limit)});
  }catch(e:any){return Response.json({error:e?.message||"Could not load audit log"},{status:500})}
}

export async function POST(req:Request){
  try{
    const body=await req.json(),id=Number(body?.id);
    if(body?.action!=="undo"||!id)return Response.json({error:"A valid undo request is required."},{status:400});
    const c=await ensureTursoSchema();
    return Response.json(await undoAudit(c,id));
  }catch(e:any){return Response.json({error:e?.message||"Could not undo change"},{status:409})}
}
