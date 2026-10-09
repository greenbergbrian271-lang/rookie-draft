import {ensureTursoSchema} from "@/lib/turso";

export type ScoutingProcessExclusion={
  year:number;
  name:string;
  createdAt:string;
};

const KEY="scouting_process_exclusions_v1";
const norm=(value:any)=>String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
export const scoutingExclusionKey=(year:number,name:string)=>String(year)+"|"+norm(name);

export async function getScoutingProcessExclusions(){
  const c=await ensureTursoSchema();
  const r=await c.execute({sql:"select value from settings where key=?",args:[KEY]});
  if(!r.rows.length)return [] as ScoutingProcessExclusion[];
  try{
    const parsed=JSON.parse(String(r.rows[0]?.value||"[]"));
    return Array.isArray(parsed)?parsed.filter((x:any)=>Number(x?.year)&&String(x?.name||"").trim()).map((x:any)=>({
      year:Number(x.year),
      name:String(x.name),
      createdAt:String(x.createdAt||""),
    })):[];
  }catch{return []}
}

export async function setScoutingProcessExclusion(action:"exclude"|"restore",year:number,name:string){
  const current=await getScoutingProcessExclusions();
  const key=scoutingExclusionKey(year,name);
  let next=current.filter(x=>scoutingExclusionKey(x.year,x.name)!==key);
  if(action==="exclude")next.push({year,name:String(name).trim(),createdAt:new Date().toISOString()});
  next.sort((a,b)=>a.year-b.year||a.name.localeCompare(b.name));
  const c=await ensureTursoSchema(),now=new Date().toISOString();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:[KEY,JSON.stringify(next),now],
  });
  return next;
}
