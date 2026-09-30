import {ensureTursoSchema,rows} from "@/lib/turso";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";
import {buildBoardGradeRows,type BoardPlayer} from "@/lib/scouting-board-grades";

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027);
    const db=await ensureTursoSchema();
    const [glossary,playersRaw,evaluationsRaw,sessionsRaw]=await Promise.all([
      loadScoutingGlossary(db),
      db.execute({
        sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url from players where draft_class=? and scouting_status='WATCHED' and position in ('QB','RB','WR','TE') order by position,watch_order,name",
        args:[draftClass]
      }),
      db.execute({
        sql:"select e.player_id,e.category,e.value,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? and p.scouting_status='WATCHED' and p.position in ('QB','RB','WR','TE')",
        args:[draftClass]
      }),
      db.execute({
        sql:"select s.player_id,count(*) as game_count from scouting_sessions s join players p on p.id=s.player_id where p.draft_class=? and p.scouting_status='WATCHED' and p.position in ('QB','RB','WR','TE') group by s.player_id",
        args:[draftClass]
      })
    ]);
    const players=rows(playersRaw) as BoardPlayer[];
    return Response.json(await buildBoardGradeRows({
      db,
      draftClass,
      players,
      evaluations:rows(evaluationsRaw),
      sessions:rows(sessionsRaw),
      glossary
    }));
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not calculate grades"},{status:500});
  }
}
