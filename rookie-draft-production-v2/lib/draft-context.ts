import {rows} from "@/lib/turso";

export async function getDraftClassContext(c:any,draftClass:number){
  const existing=rows(await c.execute({sql:"select draft_class as draftClass,analysis_season as analysisSeason,source,updated_at as updatedAt from draft_class_context where draft_class=?",args:[draftClass]}))[0] as any;
  if(existing)return {...existing,draftClass:Number(existing.draftClass),analysisSeason:existing.analysisSeason==null?null:Number(existing.analysisSeason)};
  let analysisSeason:number|null=null;
  try{
    const active=rows(await c.execute({sql:"select max(r.season) as season from pff_active_datasets a join pff_dataset_registry r on r.import_id=a.import_id where a.draft_class=?",args:[draftClass]}))[0] as any;
    if(active?.season!=null)analysisSeason=Number(active.season);
  }catch{}
  const now=new Date().toISOString();
  await c.execute({sql:"insert into draft_class_context(draft_class,analysis_season,source,updated_at) values(?,?,?,?) on conflict(draft_class) do nothing",args:[draftClass,analysisSeason,analysisSeason==null?"unassigned":"active-pff",now]});
  return {draftClass,analysisSeason,source:analysisSeason==null?"unassigned":"active-pff",updatedAt:now};
}

export async function setDraftClassAnalysisSeason(c:any,draftClass:number,analysisSeason:number|null,source="manual"){
  const now=new Date().toISOString();
  await c.execute({sql:"insert into draft_class_context(draft_class,analysis_season,source,updated_at) values(?,?,?,?) on conflict(draft_class) do update set analysis_season=excluded.analysis_season,source=excluded.source,updated_at=excluded.updated_at",args:[draftClass,analysisSeason,source,now]});
  return {draftClass,analysisSeason,source,updatedAt:now};
}
