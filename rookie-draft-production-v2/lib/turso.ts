import {createClient} from "@libsql/client";
import {rebuild2027} from "@/lib/rebuild-2027";
import {scoutingSeed2027} from "@/lib/scouting-seed-2027";
import {historicalPlayerSeeds} from "@/lib/historical-player-seeds";
let client:ReturnType<typeof createClient>|null=null,schemaReady:Promise<ReturnType<typeof createClient>>|null=null;
export function turso(){if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error("Turso is not configured");return client||=(createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN}))}
export function ensureTursoSchema(){if(schemaReady)return schemaReady;schemaReady=(async()=>{const c=turso();await c.execute("pragma foreign_keys=on");for(const sql of [
`create table if not exists players(id integer primary key autoincrement,name text not null,position text not null check(position in ('QB','RB','WR','TE')),college text,draft_class integer not null,scouting_status text not null default 'TO_SCOUT',watch_order integer,jersey_number text,jersey_source text,jersey_updated_at text,espn_athlete_id text,espn_source text,headshot_url text,headshot_source text,created_at text default current_timestamp,updated_at text default current_timestamp,unique(name,draft_class))`,
`create table if not exists evaluations(id integer primary key autoincrement,player_id integer not null references players(id) on delete cascade,category text not null,value real,commentary text,updated_at text default current_timestamp,unique(player_id,category))`,
`create table if not exists scouting_sessions(id integer primary key autoincrement,player_id integer not null references players(id) on delete cascade,game_date text,opponent text,raw_notes text,overall_writeup text,grade_snapshot text,created_at text default current_timestamp)`,
`create table if not exists returning_player_reports(id integer primary key autoincrement,player_id integer not null references players(id) on delete cascade,from_draft_class integer not null,to_draft_class integer not null,position text,college text,snapshot text not null,moved_at text default current_timestamp,unique(player_id,from_draft_class,to_draft_class))`,
`create table if not exists historical_rankings(draft_class integer not null,overall_rank integer not null,position_rank text,grade real,player text not null,college text,primary key(draft_class,overall_rank))`,
`create table if not exists planned_games(id integer primary key autoincrement,espn_event_id text unique not null,kickoff text not null,home_team text,away_team text,status text default 'PLANNED')`,
`create table if not exists game_notes(id integer primary key autoincrement,espn_event_id text unique not null,kickoff text not null,home_team text,away_team text,title text not null,notes text not null,need_to_grade integer not null default 0,matchup_snapshot text,created_at text default current_timestamp,updated_at text default current_timestamp)`,
`create table if not exists workflow_tags(player_id integer not null references players(id) on delete cascade,tag text not null,detail text,created_at text default current_timestamp,updated_at text default current_timestamp,primary key(player_id,tag))`,
`create table if not exists all_star_game_settings(game_key text primary key,website_url text not null,twitter_url text not null,roster_a_name text not null,roster_a_url text,roster_b_name text not null,roster_b_url text,updated_at text default current_timestamp)`,
`create table if not exists all_star_invites(id integer primary key autoincrement,game_key text not null,player_id integer not null references players(id) on delete cascade,roster_key text,source_kind text,source_url text,source_excerpt text,participation_status text not null default 'ACTIVE',discovered_at text default current_timestamp,updated_at text default current_timestamp,unique(game_key,player_id))`,
`create index if not exists all_star_invites_game_idx on all_star_invites(game_key,roster_key)`,
`create table if not exists player_school_history(id integer primary key autoincrement,player_id integer not null references players(id) on delete cascade,from_college text,to_college text not null,effective_season integer,recorded_at text default current_timestamp)`,
`create index if not exists player_school_history_player_idx on player_school_history(player_id,recorded_at desc)`,
`create table if not exists draft_class_state(draft_class integer primary key,is_locked integer not null default 0,locked_at text)`,
`create table if not exists draft_class_transitions(id integer primary key autoincrement,from_draft_class integer not null,to_draft_class integer not null,transitioned_at text default current_timestamp,unique(from_draft_class,to_draft_class))`,
`create table if not exists settings(key text primary key,value text not null,updated_at text default current_timestamp)`,
`create table if not exists archived_players(original_player_id integer primary key,player_name text not null,draft_class integer not null,position text,college text,reason text,snapshot text not null,archived_at text default current_timestamp)`,
`create table if not exists nfl_draft_picks(year integer not null,selection text not null,round integer,overall_pick integer,position text,player text not null,college text,team text,imported_at text default current_timestamp,primary key(year,selection))`,
`create table if not exists pff_imports(id integer primary key autoincrement,imported_at text default current_timestamp,thresholds text not null,result text not null)`,
`create table if not exists pff_dataset_registry(import_id integer primary key references pff_imports(id) on delete cascade,season integer not null,draft_class integer not null,dataset_mode text not null check(dataset_mode in ('ACTIVE','HISTORICAL')),revision integer not null,content_hash text not null,created_at text default current_timestamp,unique(season,draft_class,revision))`,
`create index if not exists pff_dataset_registry_lookup_idx on pff_dataset_registry(draft_class,season,revision desc)`,
`create index if not exists pff_dataset_registry_hash_idx on pff_dataset_registry(season,draft_class,content_hash)`,
`create table if not exists pff_active_datasets(draft_class integer not null,position text not null,import_id integer not null references pff_imports(id) on delete cascade,activated_at text default current_timestamp,primary key(draft_class,position))`,
`create table if not exists nfl_grade_imports(id integer primary key autoincrement,season integer not null,source_files text not null default '[]',row_count integer not null default 0,imported_at text default current_timestamp)`,
`create index if not exists nfl_grade_imports_season_idx on nfl_grade_imports(season desc,id desc)`,
`create table if not exists nfl_player_grades(import_id integer not null references nfl_grade_imports(id) on delete cascade,player_name text not null,normalized_name text not null,position text,team_name text,normalized_team text not null default '',offense real,pass_block real,run_block real,primary key(import_id,normalized_name,normalized_team,position))`,
`create index if not exists nfl_player_grades_lookup_idx on nfl_player_grades(import_id,normalized_name,normalized_team)`,
`create table if not exists college_stats(team text primary key,subdivision text not null default 'FBS',rank real,players_to_scout real,players text,games real,completions real,pass_attempts real,pass_yards real,pass_yards_per_attempt real,pass_yards_per_completion real,pass_tds real,pass_interceptions real,rushes real,rush_yards real,yards_per_rush real,rush_tds real,total_plays real,yac real,air_yards real,updated_at text default current_timestamp)`,
`create table if not exists college_stat_overrides(team text not null,subdivision text not null,column_index integer not null,value text,updated_at text default current_timestamp,primary key(team,subdivision,column_index))`,
`create table if not exists combine_results(player_id integer primary key references players(id) on delete cascade,season integer,player_name text not null,position text,school text,height text,weight real,forty real,bench real,vertical real,broad_jump real,cone real,shuttle real,source text,refreshed_at text default current_timestamp)`,
`create table if not exists combine_invite_sources(draft_class integer primary key,source_url text not null,source_title text,total_invites integer not null default 0,imported_at text default current_timestamp)`,
`create table if not exists combine_invites(draft_class integer not null,player_name text not null,normalized_name text not null,position text,school text,source_url text not null,imported_at text default current_timestamp,primary key(draft_class,normalized_name,position))`,
`create index if not exists combine_invites_lookup_idx on combine_invites(draft_class,normalized_name,position)`
])await c.execute(sql);
for(const sql of [
  `alter table players add column espn_source text`,
  `alter table college_stats add column pass_yards_per_attempt real`,
  `alter table college_stats add column pass_yards_per_completion real`,
  `alter table college_stats add column pass_interceptions real`,
  `alter table college_stats add column rushes real`,
  `alter table college_stats add column yards_per_rush real`,
  `alter table all_star_invites add column participation_status text not null default 'ACTIVE'`,
  `alter table planned_games add column draft_class integer not null default 2027`,
  `alter table game_notes add column draft_class integer not null default 2027`
]){try{await c.execute(sql)}catch(e:unknown){const message=e instanceof Error?e.message:String(e);if(!message.toLowerCase().includes("duplicate column"))throw e}}
const marker=await c.execute({sql:"select value from settings where key=?",args:["baseline_2027_seeded"]});
if(!marker.rows.length){
  const countResult=await c.execute("select count(*) as count from players where draft_class=2027"),count=Number(countResult.rows[0]?.count||0);
  if(count===0){
    const now=new Date().toISOString(),statements=rebuild2027.map(p=>({sql:"insert into players(name,position,college,draft_class,scouting_status,watch_order,updated_at) values(?,?,?,?,?,?,?)",args:[p.name,p.position,p.college,p.draftClass,"TO_SCOUT",p.watchOrder,now]}));
    for(let i=0;i<statements.length;i+=50)await c.batch(statements.slice(i,i+50),"write");
  }else if(count!==rebuild2027.length)throw new Error(`2027 player baseline is incomplete: expected ${rebuild2027.length}, found ${count}`);
  const verified=await c.execute("select count(*) as count from players where draft_class=2027");
  if(Number(verified.rows[0]?.count||0)!==rebuild2027.length)throw new Error("2027 player baseline verification failed");
  const now=new Date().toISOString();
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?)",args:["baseline_2027_seeded",JSON.stringify({source:"Players to Scout",count:rebuild2027.length,seededAt:now}),now]});
}
const historicalMarker=await c.execute({sql:"select value from settings where key=?",args:["historical_players_seed_v1"]});
if(!historicalMarker.rows.length){
  const now=new Date().toISOString(),statements:any[]=[];
  let count=0;
  for(const [yearText,seeds] of Object.entries(historicalPlayerSeeds)){
    const draftClass=Number(yearText);
    let watchOrder=0;
    for(const seed of seeds){
      if(seed.status==="WATCHED")watchOrder++;
      statements.push({
        sql:"insert into players(name,position,college,draft_class,scouting_status,watch_order,updated_at) values(?,?,?,?,?,?,?) on conflict(name,draft_class) do nothing",
        args:[seed.name,seed.position,seed.college??null,draftClass,seed.status,seed.status==="WATCHED"?watchOrder:null,now]
      });
      count++;
    }
  }
  for(let i=0;i<statements.length;i+=50)await c.batch(statements.slice(i,i+50),"write");
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?)",args:["historical_players_seed_v1",JSON.stringify({source:"2020-2026 historical rookie draft workbooks",count,seededAt:now}),now]});
}
const historicalOrderMarker=await c.execute({sql:"select value from settings where key=?",args:["historical_rank_order_v1"]});
if(!historicalOrderMarker.rows.length){
  const now=new Date().toISOString(),statements:any[]=[];
  for(const draftClass of [2020,2021]){
    const seeds=historicalPlayerSeeds[draftClass]||[];
    seeds.forEach((seed,index)=>statements.push({sql:"update players set watch_order=?,updated_at=? where draft_class=? and name=?",args:[index+1,now,draftClass,seed.name]}));
  }
  for(let i=0;i<statements.length;i+=50)await c.batch(statements.slice(i,i+50),"write");
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?)",args:["historical_rank_order_v1",JSON.stringify({years:[2020,2021],seededAt:now}),now]});
}
const scoutingMarker=await c.execute({sql:"select value from settings where key=?",args:["scouting_workspace_seed_v1"]});
if(!scoutingMarker.rows.length){
  const now=new Date().toISOString();
  for(const seed of scoutingSeed2027){
    const p=await c.execute({sql:"select id,scouting_status from players where draft_class=2027 and name=?",args:[seed.name]});
    if(!p.rows.length)continue;
    const id=Number(p.rows[0].id),status=String(p.rows[0].scouting_status||"");
    if(status==="TO_SCOUT")await c.execute({sql:"update players set scouting_status='WATCHED',updated_at=? where id=?",args:[now,id]});
    for(const [category,raw] of Object.entries(seed.values)){
      const isNum=typeof raw==="number";
      await c.execute({sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do nothing",args:[id,category,isNum?raw:null,isNum?null:String(raw),now]});
    }
  }
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?)",args:["scouting_workspace_seed_v1",JSON.stringify({seededAt:now,players:scoutingSeed2027.map(x=>x.name)}),now]});
}

const activeClassMarker=await c.execute({sql:"select value from settings where key=?",args:["active_draft_class"]});
if(!activeClassMarker.rows.length){
  const now=new Date().toISOString(),active=2027;
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?)",args:["active_draft_class",String(active),now]});
  await c.execute({sql:"insert into draft_class_state(draft_class,is_locked,locked_at) select distinct draft_class,case when draft_class<? then 1 else 0 end,case when draft_class<? then ? else null end from players on conflict(draft_class) do nothing",args:[active,active,now]});
  await c.execute({sql:"insert into draft_class_state(draft_class,is_locked,locked_at) values(?,0,null) on conflict(draft_class) do nothing",args:[active]});
}
for(const sql of [
  `create trigger if not exists lock_players_insert before insert on players when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_players_update before update on players when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_players_delete before delete on players when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_evaluations_insert before insert on evaluations when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_evaluations_update before update on evaluations when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_evaluations_delete before delete on evaluations when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_sessions_insert before insert on scouting_sessions when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_sessions_update before update on scouting_sessions when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_sessions_delete before delete on scouting_sessions when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_tags_insert before insert on workflow_tags when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_tags_update before update on workflow_tags when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_tags_delete before delete on workflow_tags when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_all_star_invites_insert before insert on all_star_invites when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_all_star_invites_update before update on all_star_invites when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_all_star_invites_delete before delete on all_star_invites when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_school_history_insert before insert on player_school_history when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_school_history_update before update on player_school_history when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_school_history_delete before delete on player_school_history when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_results_insert before insert on combine_results when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_results_update before update on combine_results when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 or coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=new.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_results_delete before delete on combine_results when coalesce((select s.is_locked from players p join draft_class_state s on s.draft_class=p.draft_class where p.id=old.player_id),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_returning_reports_insert before insert on returning_player_reports when coalesce((select is_locked from draft_class_state where draft_class=new.from_draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.to_draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_returning_reports_update before update on returning_player_reports when coalesce((select is_locked from draft_class_state where draft_class=old.from_draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=old.to_draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.from_draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.to_draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_returning_reports_delete before delete on returning_player_reports when coalesce((select is_locked from draft_class_state where draft_class=old.from_draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=old.to_draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_archived_insert before insert on archived_players when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_archived_update before update on archived_players when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_archived_delete before delete on archived_players when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_rankings_insert before insert on historical_rankings when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_rankings_update before update on historical_rankings when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_rankings_delete before delete on historical_rankings when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_planned_games_insert before insert on planned_games when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_planned_games_update before update on planned_games when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_planned_games_delete before delete on planned_games when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_game_notes_insert before insert on game_notes when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_game_notes_update before update on game_notes when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_game_notes_delete before delete on game_notes when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_draft_picks_insert before insert on nfl_draft_picks when coalesce((select is_locked from draft_class_state where draft_class=new.year),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_draft_picks_update before update on nfl_draft_picks when coalesce((select is_locked from draft_class_state where draft_class=old.year),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.year),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_draft_picks_delete before delete on nfl_draft_picks when coalesce((select is_locked from draft_class_state where draft_class=old.year),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_registry_insert before insert on pff_dataset_registry when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_registry_update before update on pff_dataset_registry when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_registry_delete before delete on pff_dataset_registry when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_active_insert before insert on pff_active_datasets when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_active_update before update on pff_active_datasets when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_pff_active_delete before delete on pff_active_datasets when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_sources_insert before insert on combine_invite_sources when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_sources_update before update on combine_invite_sources when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_sources_delete before delete on combine_invite_sources when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_invites_insert before insert on combine_invites when coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_invites_update before update on combine_invites when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 or coalesce((select is_locked from draft_class_state where draft_class=new.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`,
  `create trigger if not exists lock_combine_invites_delete before delete on combine_invites when coalesce((select is_locked from draft_class_state where draft_class=old.draft_class),0)=1 begin select raise(abort,'Draft class is locked'); end`
])await c.execute(sql);
return c})().catch(e=>{schemaReady=null;throw e});return schemaReady}
export const rows=(r:any)=>r.rows.map((x:any)=>Object.fromEntries(Object.entries(x)));
