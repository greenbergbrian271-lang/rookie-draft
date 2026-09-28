import {collegeKey,collegeTeams} from "@/lib/college-team";
import {workbookReference as w} from "@/lib/workbook-reference";

export async function GET(){
  try{
    const teams=await collegeTeams();
    const schoolNames=[...new Set([
      ...(w.colleges as any[]).slice(2).map(r=>String(r?.[1]||"").trim()),
      ...(w.nonFbs as any[]).slice(2).map(r=>String(r?.[1]||"").trim())
    ].filter(Boolean))];
    const logos:Record<string,string>={};
    for(const school of schoolNames){
      const key=collegeKey(school);
      const hit=teams.find((team:any)=>[team.location,team.displayName,team.shortDisplayName,team.name,team.abbreviation]
        .filter(Boolean)
        .some((name:string)=>collegeKey(name)===key));
      if(hit?.logo)logos[school]=String(hit.logo);
    }
    return Response.json(logos);
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not load college logos"},{status:500});
  }
}
