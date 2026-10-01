import {ensureTursoSchema,rows} from "@/lib/turso";
import {ALL_STAR_GAMES,basicPlayerError,normalizeName,resolveSchoolName,sanitizePlayerInput} from "@/lib/player-add";
import {syncCombineStatusForPlayer} from "@/lib/combine-invites";

async function setAllStar(q:any,playerId:number,game:string){
  if(!game||game==="None")return;
  if(!ALL_STAR_GAMES.includes(game as any))return;
  const now=new Date().toISOString();
  await q.execute({sql:"insert into workflow_tags(player_id,tag,detail,created_at,updated_at) values(?,?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",args:[playerId,"ALL_STAR",game,now,now]});
}

export async function POST(req:Request){
  try{
    const body=await req.json(),force=!!body?.force,rawPlayers:any[]=Array.isArray(body?.players)?body.players:[];
    const q=await ensureTursoSchema(),successful:any[]=[],failed:any[]=[];
    let existing=rows(await q.execute("select id,name,college,position,scouting_status from players where draft_class=2027"));
    for(const raw of rawPlayers){
      const player=sanitizePlayerInput(raw),basic=basicPlayerError(player);
      if(basic){failed.push({name:player.name||"Unnamed player",message:basic});continue}
      const school=resolveSchoolName(player.college);
      if(!school.found&&!force){failed.push({name:player.name,message:`College "${player.college}" needs review before it can be added.`});continue}
      const college=school.found?school.canonical:player.college;
      const exact=existing.find((p:any)=>normalizeName(String(p.name))===normalizeName(player.name));
      if(exact){
        if(!force){failed.push({name:player.name,message:"Player already added"});continue}
        const now=new Date().toISOString();
        await q.execute({sql:"update players set position=?,college=?,updated_at=? where id=?",args:[player.position,college,now,exact.id]});
        await setAllStar(q,Number(exact.id),String(player.allStarGame||"None"));
        await syncCombineStatusForPlayer(q,{id:Number(exact.id),name:player.name,position:player.position,college,draft_class:2027});
        successful.push({name:player.name,id:Number(exact.id),action:"existing"});
        exact.position=player.position;exact.college=college;
        continue;
      }
      const now=new Date().toISOString();
      try{
        await q.execute({sql:"insert into players(name,position,college,draft_class,scouting_status,watch_order,updated_at) values(?,?,?,?,?,(select coalesce(max(watch_order),0)+1 from players),?)",args:[player.name,player.position,college,2027,"TO_SCOUT",now]});
        const inserted=rows(await q.execute({sql:"select * from players where name=? and draft_class=2027 order by id desc limit 1",args:[player.name]}))[0] as any;
        if(!inserted)throw new Error("Player was inserted but could not be reloaded.");
        await setAllStar(q,Number(inserted.id),String(player.allStarGame||"None"));
        await syncCombineStatusForPlayer(q,inserted);
        successful.push({name:player.name,id:Number(inserted.id),action:"added"});
        existing.push(inserted);
      }catch(e:unknown){
        failed.push({name:player.name,message:e instanceof Error?e.message:"Could not save player"});
      }
    }
    return Response.json({successful,failed});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not add players"},{status:500});
  }
}
