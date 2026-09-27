import {ensureTursoSchema,rows} from "@/lib/turso";

const defaultsFor=(position:string)=>position==="QB"
  ?{"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None"}
  :position==="TE"
    ?{"Special Teams":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None"}
    :{"Special Teams?":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None"};

export async function POST(req:Request){
  try{
    const x=await req.json(),ids=Array.isArray(x?.playerIds)?x.playerIds.map(Number).filter(Number.isFinite):[];
    if(!ids.length)return Response.json({error:"Select at least one player."},{status:400});
    const c=await ensureTursoSchema(),marks=ids.map(()=>"?").join(",");
    const found=rows(await c.execute({sql:`select id,name,position,college,scouting_status from players where draft_class=2027 and id in (${marks})`,args:ids}));
    if(!found.length)return Response.json({error:"No eligible 2027 players found."},{status:404});
    const now=new Date().toISOString(),statements:any[]=[];
    for(const p of found){
      if(p.scouting_status==="WATCHED"||p.scouting_status==="FINISHED")continue;
      statements.push({sql:"update players set scouting_status='WATCHED',updated_at=? where id=?",args:[now,p.id]});
      for(const [category,commentary] of Object.entries(defaultsFor(String(p.position)))){
        statements.push({sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,null,?,?) on conflict(player_id,category) do nothing",args:[p.id,category,commentary,now]});
      }
    }
    if(statements.length)await c.batch(statements,"write");
    const updated=found.filter(p=>p.scouting_status!=="WATCHED"&&p.scouting_status!=="FINISHED");
    return Response.json({updated:updated.length,players:updated.map(p=>({id:p.id,name:p.name,position:p.position,college:p.college}))});
  }catch(e:any){return Response.json({error:e?.message||"Could not add watched players."},{status:500})}
}
