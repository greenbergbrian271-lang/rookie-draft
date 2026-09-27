import {ensureTursoSchema,rows} from "@/lib/turso";
import {basicPlayerError,findPossibleDuplicates,normalizeName,resolveSchoolName,sanitizePlayerInput,type AddPlayerIssue} from "@/lib/player-add";

export async function POST(req:Request){
  try{
    const body=await req.json(),rawPlayers=Array.isArray(body?.players)?body.players:[];
    if(!rawPlayers.length)return Response.json({players:[],issues:[]});
    const q=await ensureTursoSchema();
    const existing=rows(await q.execute("select id,name,college from players where draft_class=2027"));
    const normalized=rawPlayers.map(sanitizePlayerInput);
    const results:any[]=[];
    normalized.forEach((player,index)=>{
      const issues:AddPlayerIssue[]=[];
      const basic=basicPlayerError(player);
      if(basic)issues.push({type:"college_not_found",message:basic});
      for(const match of findPossibleDuplicates(player.name,existing)){
        const suffix=match.existing.college?\` · \${match.existing.college}\`:"";
        if(match.type==="exact")issues.push({type:"exact_duplicate",existingPlayerId:Number(match.existing.id),message:\`Exact match already on the scouting list: "\${match.existing.name}\${suffix}"\`});
        else if(match.type==="suffix")issues.push({type:"possible_duplicate",existingPlayerId:Number(match.existing.id),message:\`Likely the same player already exists (suffix difference): "\${match.existing.name}\${suffix}"\`});
        else issues.push({type:"possible_duplicate",existingPlayerId:Number(match.existing.id),message:\`Similar name already exists: "\${match.existing.name}\${suffix}"\`});
      }
      for(let prior=0;prior<index;prior++){
        if(normalizeName(normalized[prior].name)===normalizeName(player.name))issues.push({type:"queue_duplicate",message:\`This player also appears earlier in the current queue: "\${normalized[prior].name}"\`});
      }
      const school=resolveSchoolName(player.college);
      if(school.found)player.college=school.canonical;
      else if(school.suggestion)issues.push({type:"college_mismatch",suggestion:school.suggestion,message:\`College "\${player.college}" was not found exactly. Did you mean "\${school.suggestion}"?\`});
      else issues.push({type:"college_not_found",message:\`College "\${player.college}" is not in the workbook college list. If added anyway, it will use fallback formatting.\`});
      if(issues.length)results.push({index,name:player.name,college:player.college,issues});
    });
    return Response.json({players:normalized,issues:results});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Preflight check failed"},{status:500});
  }
}
