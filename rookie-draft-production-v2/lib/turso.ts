import {createClient} from "@libsql/client";
export function turso(){if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error("Turso is not configured");return createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN})}
export async function ensureTursoSchema(){const c=turso();for(const sql of [
`create table if not exists players(id integer primary key,name text not null,position text not null,college text,draft_class integer not null,scouting_status text not null,watch_order integer,jersey_number text,jersey_source text,jersey_updated_at text,espn_athlete_id text,headshot_url text,headshot_source text,created_at text,updated_at text)`,
`create table if not exists evaluations(id integer primary key,player_id integer,category text not null,value real,commentary text,updated_at text,unique(player_id,category))`,
`create table if not exists scouting_sessions(id integer primary key,player_id integer,game_date text,opponent text,raw_notes text,overall_writeup text,grade_snapshot text,created_at text)`,
`create table if not exists game_notes(id integer primary key,espn_event_id text unique not null,kickoff text not null,home_team text,away_team text,title text not null,notes text not null,need_to_grade integer default 0,matchup_snapshot text,created_at text,updated_at text)`,
`create table if not exists planned_games(id integer primary key,espn_event_id text unique not null,kickoff text not null,home_team text,away_team text,status text)`,
`create table if not exists workflow_tags(player_id integer,tag text,detail text,created_at text,updated_at text,primary key(player_id,tag))`,
`create table if not exists settings(key text primary key,value text not null,updated_at text)`
])await c.execute(sql);return c}
