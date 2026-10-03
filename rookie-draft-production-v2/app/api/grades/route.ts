import {ensureTursoSchema,rows} from "@/lib/turso";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";
import {buildBoardGradeRows,type BoardPlayer} from "@/lib/scouting-board-grades";
import {findHistoricalScoutingSnapshot,historicalGradeData} from "@/lib/historical-scouting";
import {getNflDraftPicks,normalizeDraftName} from "@/lib/nfl-draft-results";

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027);
    const db=await ensureTursoSchema();
    if(draftClass<2027){
      const players=rows(await db.execute({
        sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url from players where draft_class=? and position in ('QB','RB','WR','TE') order by coalesce(watch_order,9999),id",
        args:[draftClass]
      })) as any[];
      const picks=await getNflDraftPicks(draftClass),pickMap=new Map(picks.map(p=>[normalizeDraftName(p.name),p]));
      const historical=players.map((p:any)=>{
        const snapshot=findHistoricalScoutingSnapshot(draftClass,String(p.position),String(p.name));
        const gd=historicalGradeData(snapshot);
        const draftField=snapshot?.fields?.find((f:any)=>String(f.label).trim()==="Draft Result")?.value;
        const pick=pickMap.get(normalizeDraftName(p.name));
        const finalGrade=gd.final,preDraftGrade=gd.pre;
        return {
          ...p,
          scoutingGrade:gd.scouting,
          productionGrade:gd.production,
          analyticalGrade:gd.analytical,
          preDraftGrade,
          finalGrade,
          authoritativeGrade:finalGrade??preDraftGrade??gd.scouting??null,
          gradeSource:finalGrade!=null?"Final":"Pre-Draft",
          draftResult:String(draftField??(pick?((Math.floor((pick.overall-1)/32)+1)+"."+String(((pick.overall-1)%32)+1).padStart(2,"0")+", "+pick.team):""))||null,
          draftTeam:pick?.team||null,
          historicalOrder:Number(p.watch_order)||null,
          hasHistoricalSnapshot:Boolean(snapshot)
        };
      }).filter((p:any)=>draftClass<=2021||p.hasHistoricalSnapshot);
      return Response.json(historical);
    }
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
    return Response.json(await buildBoardGradeRows({db,draftClass,players,evaluations:rows(evaluationsRaw),sessions:rows(sessionsRaw),glossary}));
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not calculate grades"},{status:500});
  }
}
