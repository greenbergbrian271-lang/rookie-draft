import {ensureTursoSchema,rows} from "@/lib/turso";
import {storeBackup} from "@/lib/backup";
import {CORE_TABLES,HEAVY_TABLES,countTables,heavyFingerprint,legacyPayload,readTables} from "@/lib/backup-data";

export const maxDuration=60;

const LEGACY_TABLES=["players","evaluations","scouting_sessions","game_notes","planned_games","workflow_tags","nfl_draft_picks"];
const META_KEY="critical-data-backup";

export async function GET(req:Request){
  try{
    if(process.env.CRON_SECRET&&req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
    const q=await ensureTursoSchema();
    const createdAt=new Date().toISOString();

    let previous:any={};
    try{const r=rows(await q.execute({sql:"select value from settings where key=?",args:[META_KEY]}));previous=JSON.parse(String(r[0]?.value||"{}"))}catch{previous={}}

    // Daily: everything that cannot be regenerated. v3 top-level keys are kept; newer tables live under `tables`.
    const core=await readTables(q,CORE_TABLES,true);
    const extra=Object.fromEntries(Object.entries(core.data).filter(([t])=>!LEGACY_TABLES.includes(t)));
    const payload={version:4,createdAt,...legacyPayload(core.data),tables:extra,missingTables:core.missing};
    const remote=await storeBackup(payload,"daily");

    // Imports: PFF and NFL grade data is large and only changes on upload, so it is written only when it changes.
    const fingerprint=await heavyFingerprint(q);
    let importsPath:string|null=previous.importsPath??null,importsAt:string|null=previous.importsAt??null,importsFingerprint:string|null=previous.importsFingerprint??null;
    let importsCounts:Record<string,number>|undefined=previous.importsCounts;
    const importsChanged=fingerprint!==previous.importsFingerprint;
    let importsFailed:{table:string;error:string}[]=[];
    if(importsChanged){
      const heavy=await readTables(q,HEAVY_TABLES);
      importsFailed=heavy.failed;
      if(!heavy.failed.length){
        const stored=await storeBackup({version:4,createdAt,tables:heavy.data,missingTables:heavy.missing},"imports");
        // The stored fingerprint only advances on success, so a failed write is retried on the next run.
        if(stored){importsPath=stored.path;importsAt=createdAt;importsFingerprint=fingerprint;importsCounts=countTables(heavy.data)}
      }
    }

    const counts=countTables(core.data);
    const meta={createdAt,remotePath:remote?.path||null,counts,missingTables:core.missing,failedTables:core.failed,importsPath,importsAt,importsFingerprint,importsCounts};
    await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[META_KEY,JSON.stringify(meta),createdAt]});

    // A backup that was not durably stored, or that skipped a table because of an error, must show up as a failed cron run.
    const problems=[
      ...(remote?[]:["Daily backup was not stored remotely (UPSTASH_BLOB_TOKEN missing or upload failed)"]),
      ...core.failed.map(f=>`Could not read ${f.table}: ${f.error}`),
      ...importsFailed.map(f=>`Could not read ${f.table}: ${f.error}`),
    ];
    if(problems.length)return Response.json({ok:false,problems,remote:remote?.path||null,imports:importsPath,counts},{status:500});
    return Response.json({ok:true,remote:remote?.path||null,counts,missingTables:core.missing,importsChanged,imports:importsPath});
  }catch(e:any){return Response.json({error:"Backup failed",detail:e?.message},{status:500})}
}
