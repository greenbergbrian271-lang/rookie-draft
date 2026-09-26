import { neon } from "@neondatabase/serverless";

let sql: any;
let schemaReady: Promise<void> | null = null;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return (sql ||= neon(process.env.DATABASE_URL));
}

/**
 * Idempotent bootstrap for the app-owned cloud schema.
 * Keep this in sync with db/schema.sql. It never drops or rewrites legacy data.
 */
export function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const q = db();
    await q`CREATE TABLE IF NOT EXISTS players (id bigserial primary key, name text not null, position text not null check(position in ('QB','RB','WR','TE')), college text, draft_class int not null, scouting_status text not null default 'TO_SCOUT', created_at timestamptz default now(), updated_at timestamptz default now(), unique(name,draft_class))`;
    await q`ALTER TABLE players ADD COLUMN IF NOT EXISTS watch_order bigint`;
    await q`ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey_number text`;
    await q`ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey_source text`;
    await q`ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey_updated_at timestamptz`;
    await q`UPDATE players SET watch_order=id WHERE watch_order IS NULL`;
    await q`CREATE TABLE IF NOT EXISTS evaluations (id bigserial primary key, player_id bigint references players(id) on delete cascade, category text not null, value numeric, commentary text, updated_at timestamptz default now(), unique(player_id,category))`;
    await q`CREATE TABLE IF NOT EXISTS scouting_sessions (id bigserial primary key, player_id bigint references players(id) on delete cascade, game_date date, opponent text, raw_notes text, overall_writeup text, grade_snapshot jsonb, created_at timestamptz default now())`;
    await q`CREATE TABLE IF NOT EXISTS historical_rankings (draft_class int not null, overall_rank int not null, position_rank text, grade numeric, player text not null, college text, primary key(draft_class,overall_rank))`;
    await q`CREATE TABLE IF NOT EXISTS planned_games (id bigserial primary key, espn_event_id text unique not null, kickoff timestamptz not null, home_team text, away_team text, status text default 'PLANNED')`;
    await q`CREATE TABLE IF NOT EXISTS game_notes (id bigserial primary key, espn_event_id text unique not null, kickoff timestamptz not null, home_team text, away_team text, title text not null, notes text not null, created_at timestamptz default now(), updated_at timestamptz default now())`;
    await q`ALTER TABLE game_notes ADD COLUMN IF NOT EXISTS need_to_grade boolean NOT NULL DEFAULT false`;\n    await q`CREATE TABLE IF NOT EXISTS settings (key text primary key, value jsonb not null, updated_at timestamptz default now())`;
    await q`CREATE TABLE IF NOT EXISTS pff_imports (id bigserial primary key, imported_at timestamptz default now(), thresholds jsonb not null, result jsonb not null)`;
    await q`CREATE TABLE IF NOT EXISTS nfl_draft_picks (year int not null, selection text not null, round int, overall_pick int, position text, player text not null, college text, team text, imported_at timestamptz default now(), primary key(year,selection))`;
    await q`CREATE TABLE IF NOT EXISTS workflow_tags (player_id bigint references players(id) on delete cascade, tag text not null, detail text, created_at timestamptz default now(), updated_at timestamptz default now(), primary key(player_id,tag))`;
    await q`CREATE TABLE IF NOT EXISTS college_stats (team text primary key, subdivision text not null check(subdivision in ('FBS','FCS')), rank int, players_to_scout int, players text, games numeric, completions numeric, pass_attempts numeric, pass_yards numeric, pass_tds numeric, rush_yards numeric, rush_tds numeric, total_plays numeric, yac numeric, air_yards numeric, updated_at timestamptz default now())`;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}
