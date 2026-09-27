import {ensureTursoSchema,rows} from "@/lib/turso";

type Position="QB"|"RB"|"WR"|"TE";
const POSITIONS=new Set<Position>(["QB","RB","WR","TE"]);

function uniqueIds(values:any[]):number[]{
  return [...new Set(values.map(x=>Number(x)).filter(x=>Number.isInteger(x)&&x>0))];
}

function orderValue(x:any){
  return Number.isFinite(Number(x?.watch_order))?Number(x.watch_order):Number.MAX_SAFE_INTEGER;
}

export async function POST(req:Request){
  try{
    const body=await req.json(),action=String(body?.action||""),q=await ensureTursoSchema(),now=new Date().toISOString();

    if(action==="to-maybe"){
      const ids=uniqueIds(Array.isArray(body?.playerIds)?body.playerIds:[]);
      if(!ids.length)return Response.json({error:"Select at least one player."},{status:400});
      const placeholders=ids.map(()=>"?").join(",");
      const found=rows(await q.execute({sql:`select * from players where id in (${placeholders})`,args:ids}))
        .filter((p:any)=>Number(p.draft_class)===2027&&p.scouting_status!=="MAYBE"&&p.scouting_status!=="FINISHED")
        .sort((a:any,b:any)=>orderValue(a)-orderValue(b)||Number(a.id)-Number(b.id));
      if(!found.length)return Response.json({error:"No eligible players were found."},{status:400});
      const maxRow=rows(await q.execute("select coalesce(max(watch_order),0) as max_order from players where draft_class=2027 and scouting_status='MAYBE'"))[0];
      let next=Number(maxRow?.max_order||0);
      await q.batch(found.map((p:any)=>({
        sql:"update players set scouting_status='MAYBE',watch_order=?,updated_at=? where id=?",
        args:[++next,now,p.id],
      })),"write");
      return Response.json({updated:found.length,action,players:found.map((p:any)=>({id:p.id,name:p.name,position:p.position}))});
    }

    if(action==="from-maybe"){
      const raw=Array.isArray(body?.moves)?body.moves:[];
      const requested=new Map<number,Position>();
      for(const item of raw){
        const id=Number(item?.id),position=String(item?.position||"") as Position;
        if(Number.isInteger(id)&&id>0&&POSITIONS.has(position))requested.set(id,position);
      }
      const ids=[...requested.keys()];
      if(!ids.length)return Response.json({error:"Select at least one player and confirm a position."},{status:400});
      const placeholders=ids.map(()=>"?").join(",");
      const found=rows(await q.execute({sql:`select * from players where id in (${placeholders}) and draft_class=2027 and scouting_status='MAYBE'`,args:ids}))
        .sort((a:any,b:any)=>orderValue(a)-orderValue(b)||Number(a.id)-Number(b.id));
      if(!found.length)return Response.json({error:"No selected players are currently in Maybe."},{status:400});

      const nextOrder=new Map<Position,number>();
      for(const position of POSITIONS){
        if(!found.some((p:any)=>requested.get(Number(p.id))===position))continue;
        const maxRow=rows(await q.execute({sql:"select coalesce(max(watch_order),0) as max_order from players where draft_class=2027 and position=? and scouting_status not in ('MAYBE','FINISHED')",args:[position]}))[0];
        nextOrder.set(position,Number(maxRow?.max_order||0));
      }

      const statements=found.map((p:any)=>{
        const position=requested.get(Number(p.id))||p.position as Position;
        const watch=(nextOrder.get(position)||0)+1;
        nextOrder.set(position,watch);
        return {
          sql:"update players set position=?,scouting_status='TO_SCOUT',watch_order=?,updated_at=? where id=?",
          args:[position,watch,now,p.id],
        };
      });
      await q.batch(statements,"write");
      return Response.json({updated:statements.length,action,players:found.map((p:any)=>({id:p.id,name:p.name,position:requested.get(Number(p.id))||p.position}))});
    }

    return Response.json({error:"Unknown Maybe Scout action."},{status:400});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Maybe Scout update failed."},{status:500});
  }
}
