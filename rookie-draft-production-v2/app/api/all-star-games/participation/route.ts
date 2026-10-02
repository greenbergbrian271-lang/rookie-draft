import {ensureTursoSchema,rows} from "@/lib/turso";
import {gameDefinition} from "@/lib/all-star-games";

export async function PATCH(req:Request){
  try{
    const x=await req.json(),gameKey=String(x?.gameKey||""),playerId=Number(x?.playerId),status=String(x?.status||"").toUpperCase();
    if(!gameDefinition(gameKey))return Response.json({error:"Unknown all-star game."},{status:400});
    if(!Number.isFinite(playerId)||playerId<1)return Response.json({error:"Invalid player."},{status:400});
    if(!["ACTIVE","OPTED_OUT"].includes(status))return Response.json({error:"Participation status must be ACTIVE or OPTED_OUT."},{status:400});
    const q=await ensureTursoSchema(),now=new Date().toISOString();
    const existing=rows(await q.execute({sql:"select player_id from all_star_invites where game_key=? and player_id=?",args:[gameKey,playerId]}));
    if(!existing.length)return Response.json({error:"This player is not currently tracked for that game."},{status:404});
    await q.execute({sql:"update all_star_invites set participation_status=?,updated_at=? where game_key=? and player_id=?",args:[status,now,gameKey,playerId]});
    return Response.json(rows(await q.execute({sql:"select game_key,player_id,roster_key,participation_status,updated_at from all_star_invites where game_key=? and player_id=?",args:[gameKey,playerId]}))[0]);
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not update all-star participation."},{status:500})}
}
