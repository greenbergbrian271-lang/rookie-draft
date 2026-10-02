import {ensureTursoSchema,rows} from "@/lib/turso";
import {gameDefinition} from "@/lib/all-star-games";

export async function PATCH(req:Request){
  try{
    const x=await req.json(),gameKey=String(x?.gameKey||""),playerId=Number(x?.playerId),status=String(x?.status||"").toUpperCase();
    if(!gameDefinition(gameKey))return Response.json({error:"Unknown all-star game."},{status:400});
    if(!Number.isFinite(playerId)||playerId<1)return Response.json({error:"Invalid player."},{status:400});
    if(!["ACTIVE","OPTED_OUT"].includes(status))return Response.json({error:"Participation status must be ACTIVE or OPTED_OUT."},{status:400});
    const q=await ensureTursoSchema();
    const invite=rows(await q.execute({sql:"select player_id from all_star_invites where game_key=? and player_id=?",args:[gameKey,playerId]}));
    if(!invite.length)return Response.json({error:"This player is not currently tracked for that game."},{status:404});
    const key="all_star_optouts_"+gameKey;
    const current=rows(await q.execute({sql:"select value from settings where key=?",args:[key]}))[0] as any;
    let ids:number[]=[];try{ids=JSON.parse(String(current?.value||"[]"))}catch{}
    const set=new Set(ids.map(Number));
    if(status==="OPTED_OUT")set.add(playerId);else set.delete(playerId);
    const now=new Date().toISOString(),value=JSON.stringify(Array.from(set));
    await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[key,value,now]});
    return Response.json({gameKey,playerId,status,updatedAt:now});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not update all-star participation."},{status:500})}
}
