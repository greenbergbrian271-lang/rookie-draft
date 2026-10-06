import {GET as getProfile} from "@/app/api/player-profile/route";
import {ensureTursoSchema,rows} from "@/lib/turso";
import {resolveManagedShareToken} from "@/lib/share-links";

export async function GET(req:Request){
  try{
    const url=new URL(req.url),token=url.searchParams.get("token"),id=url.searchParams.get("id");
    if(!id)return Response.json({error:"Player id required"},{status:400});
    const scope=await resolveManagedShareToken(token);
    if(!scope||!scope.sections.includes("player_cards"))return Response.json({error:"Share link unavailable"},{status:403});
    const q=await ensureTursoSchema(),row=rows(await q.execute({sql:"select id,draft_class from players where id=?",args:[id]}))[0];
    if(!row)return Response.json({error:"Player not found"},{status:404});
    if(!scope.years.includes(Number(row.draft_class)))return Response.json({error:"This player is outside the years shared by this link."},{status:403});
    const response=await getProfile(new Request("http://internal/api/player-profile?id="+encodeURIComponent(id)+"&readOnly=1"));
    const data=await response.json();
    if(!response.ok||!data?.player)return Response.json({error:data?.error||"Could not load player card"},{status:response.status||500});
    const p=data.player,g=data.grades||{};
    return Response.json({
      player:{id:p.id,name:p.name,position:p.position,college:p.college,draft_class:p.draft_class,headshot_url:p.headshot_url,jersey_number:p.jersey_number,positionRank:p.positionRank},
      grades:{scouting:g.scouting,production:g.production,analytical:g.analytical,pre:g.pre,final:g.final,draftResult:g.draftResult,draftTeam:g.draftTeam,overallRank:g.overallRank,boardPositionRank:g.boardPositionRank},
      gradeFactors:data.gradeFactors||{},notesSummary:data.notesSummary||"",teamPlayers:Array.isArray(data.teamPlayers)?data.teamPlayers.map((x:any)=>({id:x.id,name:x.name,position:x.position,positionRank:x.positionRank})):[],
      schedule:Array.isArray(data.schedule)?data.schedule:[],scheduleSeason:data.scheduleSeason,teamLogo:data.teamLogo||"",transferHistory:Array.isArray(data.transferHistory)?data.transferHistory:[],stats:data.stats||{categories:[],sourceUrl:""}
    },{headers:{"cache-control":"private, no-store","referrer-policy":"no-referrer"}});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load shared player card"},{status:500})}
}
