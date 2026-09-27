import {ensureTursoSchema,rows} from "@/lib/turso";
import {findCollegeTeam,resolvePlayerMedia} from "@/lib/college-team";

const key=(v:any)=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export async function POST(req:Request){
  try{
    const x=await req.json(),id=String(x?.id||""),requested=String(x?.toCollege||"").trim();
    if(!id||!requested)return Response.json({error:"Player and destination school are required."},{status:400});
    const c=await ensureTursoSchema(),current=rows(await c.execute({sql:"select * from players where id=?",args:[id]}))[0];
    if(!current)return Response.json({error:"Player not found."},{status:404});
    const team=await findCollegeTeam(requested).catch(()=>null);
    if(!team)return Response.json({error:`Could not match "${requested}" to a college football team.`},{status:400});
    const toCollege=String(team.location||team.shortDisplayName||team.displayName||requested).trim();
    if(key(toCollege)===key(current.college))return Response.json({error:`${current.name} is already listed at ${toCollege}.`},{status:400});
    const effectiveSeason=Number.isFinite(Number(x?.effectiveSeason))?Number(x.effectiveSeason):new Date().getFullYear(),now=new Date().toISOString();
    const media=await resolvePlayerMedia(String(current.name),toCollege).catch(()=>null);
    const espnId=String(media?.espnId||current.espn_athlete_id||""),headshot=String(media?.url||current.headshot_url||"");
    await c.batch([
      {sql:"insert into player_school_history(player_id,from_college,to_college,effective_season,recorded_at) values(?,?,?,?,?)",args:[id,current.college||null,toCollege,effectiveSeason,now]},
      {sql:"update players set college=?,espn_athlete_id=?,headshot_url=?,headshot_source=?,jersey_number=?,jersey_source=?,jersey_updated_at=?,updated_at=? where id=?",args:[toCollege,espnId||null,headshot||null,media?.source||current.headshot_source||"transfer",media?.jersey||null,media?.source||"transfer",now,now,id]}
    ],"write");
    const player=rows(await c.execute({sql:"select * from players where id=?",args:[id]}))[0],transfer=rows(await c.execute({sql:"select id,from_college,to_college,effective_season,recorded_at from player_school_history where player_id=? order by id desc limit 1",args:[id]}))[0];
    return Response.json({player,transfer});
  }catch(e:any){return Response.json({error:"Could not save transfer.",detail:e?.message},{status:500})}
}
