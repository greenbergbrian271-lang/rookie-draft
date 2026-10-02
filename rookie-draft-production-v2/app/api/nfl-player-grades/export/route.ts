import {ensureTursoSchema,rows} from "@/lib/turso";

const csvCell=(value:unknown)=>{
  if(value==null)return "";
  const text=String(value);
  return /[",\n\r]/.test(text)?"\""+text.replace(/\"/g,"\"\"")+"\"":text;
};

export async function GET(req:Request){
  try{
    const q=await ensureTursoSchema();
    const url=new URL(req.url);
    const seasonParam=url.searchParams.get("season");
    const season=seasonParam?Number(seasonParam):null;
    if(seasonParam&&(!Number.isInteger(season)||season!<2000||season!>2100)){
      return new Response("Invalid season",{status:400});
    }

    const result=rows(await q.execute(season!=null?{
      sql:`select i.season,g.player_name,g.position,g.team_name,g.offense,g.pass_block,g.run_block,i.imported_at
           from nfl_grade_imports i
           join nfl_player_grades g on g.import_id=i.id
           where i.id=(select id from nfl_grade_imports where season=? order by id desc limit 1)
           order by g.team_name,g.position,g.player_name`,
      args:[season]
    }:`select i.season,g.player_name,g.position,g.team_name,g.offense,g.pass_block,g.run_block,i.imported_at
        from nfl_grade_imports i
        join nfl_player_grades g on g.import_id=i.id
        where i.id in (select max(id) from nfl_grade_imports group by season)
        order by i.season desc,g.team_name,g.position,g.player_name`));

    const header=["Season","Player","Position","NFL Team","Offense","Pass Block","Run Block","Imported At"];
    const lines=[header.join(",")];
    for(const row of result as any[]){
      lines.push([
        row.season,row.player_name,row.position,row.team_name,row.offense,row.pass_block,row.run_block,row.imported_at
      ].map(csvCell).join(","));
    }
    return new Response(lines.join("\n"),{
      status:200,
      headers:{
        "content-type":"text/csv; charset=utf-8",
        "cache-control":"no-store, max-age=0",
        "content-disposition":"inline; filename=\"nfl-player-grades.csv\""
      }
    });
  }catch(e:unknown){
    return new Response(e instanceof Error?e.message:"Could not export NFL player grades",{status:500});
  }
}
