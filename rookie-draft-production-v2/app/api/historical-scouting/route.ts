import {ensureTursoSchema,rows as dbRows} from "@/lib/turso";
import {getHistoricalScoutingRows,normHistoricalName,type HistoricalPosition} from "@/lib/historical-scouting";
import {findHistoricalPriorReport} from "@/lib/historical-prior-reports";
export const dynamic="force-dynamic";
export async function GET(req:Request){
  try{
    const url=new URL(req.url),draftClass=Number(url.searchParams.get("draftClass")),position=String(url.searchParams.get("position")||"QB").toUpperCase() as HistoricalPosition;
    if(!Number.isInteger(draftClass)||draftClass<2020||draftClass>=2027)return Response.json({error:"Historical draft class required"},{status:400});
    if(!["QB","RB","WR","TE"].includes(position))return Response.json({error:"Invalid position"},{status:400});
    const db=await ensureTursoSchema(),players:any[]=dbRows(await db.execute({sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url,jersey_number,espn_athlete_id from players where draft_class=? and position=? order by coalesce(watch_order,9999),name",args:[draftClass,position]})) as any[];
    const byName=new Map<string,any>(players.map((p:any)=>[normHistoricalName(p.name),p])),snapshots=getHistoricalScoutingRows(draftClass,position);
    const matched=snapshots.map(snapshot=>{const player=byName.get(normHistoricalName(snapshot.name))||null;const prior=player?findHistoricalPriorReport(draftClass,position,String(player.name)):null;return {player,snapshot,priorReport:prior?{...prior,playerId:player.id}:null}}).filter(x=>x.player);
    const unmatched=snapshots.filter(snapshot=>!byName.has(normHistoricalName(snapshot.name))).map(x=>x.name);
    return Response.json({draftClass,position,available:Boolean(snapshots.length),rows:matched,unmatched,totalPlayers:players.length,scoutedPlayers:matched.length});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load historical scouting"},{status:500})}
}
