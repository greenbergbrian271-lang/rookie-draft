import {loadPlayerDb,loadState} from "@/lib/nfl-card";
import {seasonRecords} from "@/lib/comp-outcomes";

// TEMPORARY: lists NFL players of a rookie class who have scored fantasy points (used once to find analytics-only comp candidates)
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:Request){
  try{
    const cls=Number(new URL(req.url).searchParams.get("class"));
    const [state,db]=await Promise.all([loadState(),loadPlayerDb()]);
    const current=Number(state?.season)||new Date().getFullYear();
    const yrs=current-cls;
    const cand=Object.entries(db as Record<string,any>).filter(([,p])=>["QB","RB","WR","TE"].includes(String(p.position))&&Number(p.years_exp)===yrs);
    const seasons:Record<number,Map<string,any>>={};
    for(let s=cls;s<=current;s++)seasons[s]=await seasonRecords(s,state,db as any);
    const out=cand.map(([id,p])=>{
      const per:Record<number,{gp:number;pts:number;rank:number}>={};let pts=0;
      for(let s=cls;s<=current;s++){const r=seasons[s].get(id);if(r){per[s]={gp:r[2],pts:r[3],rank:r[4]};pts+=r[3]}}
      return {id,name:`${p.first_name} ${p.last_name}`,pos:p.position,college:p.college||null,team:p.team||null,pts:Math.round(pts*10)/10,seasons:per};
    }).filter(x=>x.pts>0).sort((a,b)=>b.pts-a.pts);
    return Response.json({class:cls,current,count:out.length,players:out.map(x=>[x.name,x.pos,x.college,x.team,x.pts,Object.entries(x.seasons).map(([s,v])=>`${s}:${v.gp}g/${v.pts}`).join(" ")])});
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
}
