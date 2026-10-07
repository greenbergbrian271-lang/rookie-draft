import {ensureTursoSchema} from "@/lib/turso";
import {coveragePayload,loadScoutingWorkflow} from "@/lib/scouting-workflow";
export async function GET(req:Request){try{const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027),c=await ensureTursoSchema(),workflow=await loadScoutingWorkflow(c,draftClass);return Response.json({draftClass,...coveragePayload(workflow.players)})}catch(e:any){return Response.json({error:"Could not load scouting coverage",detail:e?.message},{status:500})}}
