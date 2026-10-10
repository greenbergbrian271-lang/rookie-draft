import {ensureTursoSchema} from "@/lib/turso";
import {CORE_TABLES,countTables,legacyPayload,readTables} from "@/lib/backup-data";

const LEGACY_TABLES=["players","evaluations","scouting_sessions","game_notes","planned_games","workflow_tags","nfl_draft_picks"];

// Manual download of the same irreplaceable tables the nightly backup stores.
// PFF/NFL grade import tables are large and live in the nightly "imports" backup instead.
export async function GET(){
  try{
    const q=await ensureTursoSchema();
    const core=await readTables(q,CORE_TABLES,true);
    if(core.failed.length)return Response.json({error:"Could not export cloud backup",detail:core.failed.map(f=>`${f.table}: ${f.error}`).join("; ")},{status:500});
    const extra=Object.fromEntries(Object.entries(core.data).filter(([t])=>!LEGACY_TABLES.includes(t)));
    const body=JSON.stringify({version:4,exportedAt:new Date().toISOString(),...legacyPayload(core.data),tables:extra,missingTables:core.missing,counts:countTables(core.data)});
    return new Response(body,{headers:{"content-type":"application/json","content-disposition":`attachment; filename="rookie-draft-cloud-backup-${new Date().toISOString().slice(0,10)}.json"`}});
  }catch(e:any){return Response.json({error:"Could not export cloud backup",detail:e?.message},{status:500})}
}
