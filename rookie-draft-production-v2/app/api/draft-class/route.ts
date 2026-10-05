import {ensureTursoSchema,rows} from "@/lib/turso";

const FALLBACK_DRAFT_CLASS=2027;

async function state(){
  const c=await ensureTursoSchema();
  const activeResult=await c.execute({sql:"select value from settings where key=?",args:["active_draft_class"]});
  const activeDraftClass=Number(activeResult.rows[0]?.value||FALLBACK_DRAFT_CLASS);
  const lockedDraftClasses=rows(await c.execute("select draft_class from draft_class_state where is_locked=1 order by draft_class")).map((x:any)=>Number(x.draft_class));
  return {c,activeDraftClass,lockedDraftClasses};
}

export async function GET(){
  try{
    const {activeDraftClass,lockedDraftClasses}=await state();
    return Response.json({activeDraftClass,lockedDraftClasses});
  }catch(e:any){
    return Response.json({error:"Could not load draft class state",detail:e?.message},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({}));
    const {c,activeDraftClass}=await state();
    const expected=body?.currentDraftClass==null?activeDraftClass:Number(body.currentDraftClass);
    if(expected!==activeDraftClass){
      return Response.json({error:`The active draft class is already ${activeDraftClass}. Refresh before transitioning.`,activeDraftClass},{status:409});
    }
    const currentState=await c.execute({sql:"select is_locked from draft_class_state where draft_class=?",args:[activeDraftClass]});
    if(Number(currentState.rows[0]?.is_locked||0)===1){
      return Response.json({error:`${activeDraftClass} is already locked.`},{status:409});
    }
    const nextDraftClass=activeDraftClass+1;
    const nextState=await c.execute({sql:"select is_locked from draft_class_state where draft_class=?",args:[nextDraftClass]});
    if(Number(nextState.rows[0]?.is_locked||0)===1){
      return Response.json({error:`${nextDraftClass} is already a locked archive and cannot become the active class.`},{status:409});
    }
    const now=new Date().toISOString();
    await c.batch([
      {sql:"insert into draft_class_state(draft_class,is_locked,locked_at) values(?,1,?) on conflict(draft_class) do update set is_locked=1,locked_at=excluded.locked_at",args:[activeDraftClass,now]},
      {sql:"insert into draft_class_state(draft_class,is_locked,locked_at) values(?,0,null) on conflict(draft_class) do nothing",args:[nextDraftClass]},
      {sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:["active_draft_class",String(nextDraftClass),now]},
      {sql:"insert into draft_class_transitions(from_draft_class,to_draft_class,transitioned_at) values(?,?,?) on conflict(from_draft_class,to_draft_class) do nothing",args:[activeDraftClass,nextDraftClass,now]}
    ],"write");
    const lockedDraftClasses=rows(await c.execute("select draft_class from draft_class_state where is_locked=1 order by draft_class")).map((x:any)=>Number(x.draft_class));
    return Response.json({ok:true,lockedDraftClass:activeDraftClass,activeDraftClass:nextDraftClass,lockedDraftClasses,transitionedAt:now});
  }catch(e:any){
    return Response.json({error:"Could not transition to the next draft class",detail:e?.message},{status:500});
  }
}
