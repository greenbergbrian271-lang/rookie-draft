import {ensureTursoSchema,rows} from "@/lib/turso";
import {fetchNflseBoard,matchPlayers,NFLSE_CATEGORIES,type DbPlayer} from "@/lib/nflse";

export const dynamic="force-dynamic";
export const maxDuration=60;

async function run(draftClass:number,write:boolean){
  const c=await ensureTursoSchema();
  const board=await fetchNflseBoard();
  const db=rows(await c.execute({sql:"select id,name,position,college from players where draft_class=?",args:[draftClass]})) as unknown as DbPlayer[];
  const {matches,unmatched,ambiguous,possible}=matchPlayers(db,board.players);
  let written=0;
  if(write){
    const now=new Date().toISOString();
    const up="insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at";
    for(const m of matches){
      const stmts:{sql:string;args:any[]}[]=[{sql:up,args:[m.playerId,NFLSE_CATEGORIES.rank,m.nflse.rank,null,now]}];
      if(m.projection)stmts.push({sql:up,args:[m.playerId,NFLSE_CATEGORIES.projection,null,m.projection,now]});
      if(m.archetype)stmts.push({sql:up,args:[m.playerId,NFLSE_CATEGORIES.archetype,null,m.archetype,now]});
      await c.batch(stmts,"write");written+=stmts.length;
    }
  }
  const counts={board:board.players.length,players:db.length,matched:matches.length,unmatched:unmatched.length,ambiguous:ambiguous.length,archetypeFilled:matches.filter(m=>m.archetype).length,projectionFilled:matches.filter(m=>m.projection).length};
  return {ok:true,dryRun:!write,source:{version:board.version,label:board.label},draftClass,counts,written,
    matches:matches.map(m=>({player:m.name,position:m.position,nflseRank:m.nflse.rank,nflsePosition:m.nflse.advancedPosition,projection:m.projection,archetype:m.archetype,how:m.how})),
    unmatched:unmatched.map(p=>({player:p.name,position:p.position,college:p.college})),
    ambiguous:ambiguous.map(a=>({player:a.player.name,candidates:a.candidates.map(x=>x.name+" ("+x.school+")")})),
    possibleNameMismatches:possible.map(x=>({ours:x.player.name,nflse:x.candidate.name,school:x.candidate.school}))};
}

// GET = dry run (nothing written). POST = write NFLSE values into the separate NFLSE categories.
export async function GET(req:Request){
  try{const dc=Number(new URL(req.url).searchParams.get("draftClass")||2027);return Response.json(await run(dc,false))}
  catch(e:any){return Response.json({error:"Could not read NFLSE board",detail:e?.message},{status:502})}
}
export async function POST(req:Request){
  try{const dc=Number(new URL(req.url).searchParams.get("draftClass")||2027);return Response.json(await run(dc,true))}
  catch(e:any){return Response.json({error:"Could not sync NFLSE board",detail:e?.message},{status:502})}
}
