import {rows} from "@/lib/turso";

type Executor={execute:(sql:string)=>Promise<any>};

// Irreplaceable data: written daily. Order is not significant.
export const CORE_TABLES=[
  "players","evaluations","scouting_sessions","game_notes","planned_games","workflow_tags",
  "nfl_draft_picks","historical_rankings","archived_players","college_stat_overrides",
  "draft_class_context","draft_class_state","draft_class_transitions","returning_player_reports",
  "player_identity_aliases","player_school_history","all_star_game_settings","all_star_invites",
  "mock_draft_history","yearly_power_rankings",
] as const;

// Large, import-driven tables (PFF and NFL grade imports). Written only when they change.
export const HEAVY_TABLES=[
  "pff_imports","pff_dataset_registry","pff_active_datasets","pff_player_records","pff_thresholds",
  "nfl_grade_imports","nfl_player_grades",
] as const;

// Deliberately not backed up: regenerable from upstream sources (college_stats, college_football_events,
// combine_*, ktc_*), secret-bearing (share_links), or bulky and derivative (audit_log).
// settings is backed up selectively, see SETTINGS_EXCLUDED_KEYS.
const SETTINGS_EXCLUDED_KEYS=["integrations","sleeper_adp","critical-data-backup"];

export type TableResult={data:Record<string,Record<string,unknown>[]>;missing:string[];failed:{table:string;error:string}[]};

const isMissingTable=(e:unknown)=>String(e instanceof Error?e.message:e).toLowerCase().includes("no such table");

// Some tables are created lazily by their own routes, so a table that does not exist yet is not an error.
export async function readTables(q:Executor,names:readonly string[],includeSettings=false):Promise<TableResult>{
  const out:TableResult={data:{},missing:[],failed:[]};
  await Promise.all(names.map(async table=>{
    try{out.data[table]=rows(await q.execute("select * from "+table))}
    catch(e){
      if(isMissingTable(e))out.missing.push(table);
      else out.failed.push({table,error:e instanceof Error?e.message:String(e)});
    }
  }));
  if(includeSettings){
    try{
      const all:Record<string,unknown>[]=rows(await q.execute("select * from settings"));
      out.data.settings=all.filter(r=>!SETTINGS_EXCLUDED_KEYS.includes(String(r.key)));
    }catch(e){out.failed.push({table:"settings",error:e instanceof Error?e.message:String(e)})}
  }
  return out;
}

export const countTables=(data:TableResult["data"])=>Object.fromEntries(Object.entries(data).map(([t,r])=>[t,r.length]));

// Cheap change detector for the heavy tables: row counts plus the latest import timestamp.
export async function heavyFingerprint(q:Executor):Promise<string>{
  const parts:Record<string,unknown>={};
  for(const table of HEAVY_TABLES){
    try{
      const hasStamp=table==="pff_imports"||table==="nfl_grade_imports";
      const r=rows(await q.execute(hasStamp?`select count(*) as n, max(imported_at) as latest from ${table}`:`select count(*) as n from ${table}`));
      parts[table]=r[0];
    }catch(e){parts[table]=isMissingTable(e)?"missing":"error"}
  }
  return JSON.stringify(parts);
}

// Keys that existing consumers of the v3 payload already expect.
export function legacyPayload(data:TableResult["data"]){
  return{
    players:data.players??[],evaluations:data.evaluations??[],scoutingSessions:data.scouting_sessions??[],
    gameNotes:data.game_notes??[],plannedGames:data.planned_games??[],workflowTags:data.workflow_tags??[],
    nflDraftPicks:data.nfl_draft_picks??[],
  };
}
