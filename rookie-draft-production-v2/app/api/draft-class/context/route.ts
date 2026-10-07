import {ensureTursoSchema} from "@/lib/turso";
import {getDraftClassContext,setDraftClassAnalysisSeason} from "@/lib/draft-context";
import {recordAudit} from "@/lib/audit";

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027),c=await ensureTursoSchema();
    return Response.json(await getDraftClassContext(c,draftClass));
  }catch(e:any){return Response.json({error:e?.message||"Could not load draft class context"},{status:500})}
}

export async function PUT(req:Request){
  try{
    const body=await req.json(),draftClass=Number(body?.draftClass),analysisSeason=body?.analysisSeason==null||body?.analysisSeason===""?null:Number(body.analysisSeason);
    if(!Number.isInteger(draftClass)||draftClass<2000||draftClass>2100)return Response.json({error:"Valid draftClass required."},{status:400});
    if(analysisSeason!=null&&(!Number.isInteger(analysisSeason)||analysisSeason<2000||analysisSeason>2100))return Response.json({error:"Valid analysisSeason required."},{status:400});
    const c=await ensureTursoSchema(),before=await getDraftClassContext(c,draftClass),after=await setDraftClassAnalysisSeason(c,draftClass,analysisSeason,"manual");
    await recordAudit(c,{action:"DRAFT_CONTEXT_UPDATE",entityType:"draft_class",entityId:draftClass,summary:"Set Draft Class "+draftClass+" analysis season to "+(analysisSeason??"unassigned"),before,after});
    return Response.json(after);
  }catch(e:any){return Response.json({error:e?.message||"Could not update draft class context"},{status:500})}
}
