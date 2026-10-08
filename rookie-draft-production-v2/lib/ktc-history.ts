import {ensureTursoSchema} from "@/lib/turso";

type SnapshotPlayer={name:string;position:string;team:string;value:number;tepValue:number};

async function ensureHistorySchema(){
  const c=await ensureTursoSchema();
  await c.execute(`create table if not exists ktc_value_history(
    snapshot_date text not null,
    player_name text not null,
    position text not null,
    team text,
    value real not null,
    tep_value real,
    captured_at text not null default current_timestamp,
    primary key(snapshot_date,player_name,position)
  )`);
  await c.execute("create index if not exists ktc_value_history_player_idx on ktc_value_history(player_name,position,snapshot_date)");
  await c.execute(`create table if not exists yearly_power_rankings(
    league_key text not null,
    season integer not null,
    roster_id integer not null,
    team_name text not null,
    rank integer not null,
    score real not null,
    classification text,
    starter_value real,
    bench_value real,
    pick_value real,
    avg_age real,
    recorded_at text not null default current_timestamp,
    primary key(league_key,season,roster_id)
  )`);
  return c;
}

export async function recordKtcSnapshot(players:SnapshotPlayer[],date=new Date()){
  if(!players.length)return;
  const c=await ensureHistorySchema();
  const snapshotDate=date.toISOString().slice(0,10);
  const now=date.toISOString();
  const statements=players.map(player=>({
    sql:"insert into ktc_value_history(snapshot_date,player_name,position,team,value,tep_value,captured_at) values(?,?,?,?,?,?,?) on conflict(snapshot_date,player_name,position) do update set team=excluded.team,value=excluded.value,tep_value=excluded.tep_value,captured_at=excluded.captured_at",
    args:[snapshotDate,player.name,player.position,player.team||"",player.value,player.tepValue,now],
  }));
  for(let i=0;i<statements.length;i+=75)await c.batch(statements.slice(i,i+75),"write");
}

export async function ktcMovement(days=30){
  const c=await ensureHistorySchema();
  const latest=await c.execute("select max(snapshot_date) as d from ktc_value_history");
  const latestDate=String(latest.rows[0]?.d||"");
  if(!latestDate)return {latestDate:"",baselineDate:"",rows:[] as any[]};
  const baseline=await c.execute({
    sql:"select max(snapshot_date) as d from ktc_value_history where snapshot_date<=date(?,'-' || ? || ' days')",
    args:[latestDate,days],
  });
  const baselineDate=String(baseline.rows[0]?.d||"");
  if(!baselineDate)return {latestDate,baselineDate:"",rows:[] as any[]};
  const result=await c.execute({
    sql:`select a.player_name as name,a.position,a.team,a.value as current,b.value as previous,
      (a.value-b.value) as change,
      case when b.value>0 then ((a.value-b.value)*100.0/b.value) else null end as change_pct
      from ktc_value_history a
      join ktc_value_history b on b.player_name=a.player_name and b.position=a.position and b.snapshot_date=?
      where a.snapshot_date=?
      order by abs(a.value-b.value) desc`,
    args:[baselineDate,latestDate],
  });
  return {latestDate,baselineDate,rows:result.rows.map((r:any)=>({
    name:String(r.name),position:String(r.position),team:String(r.team||""),
    current:Number(r.current)||0,previous:Number(r.previous)||0,change:Number(r.change)||0,
    changePct:r.change_pct==null?null:Number(r.change_pct),
  }))};
}

export async function upsertYearlyPower(rows:{
  leagueKey:string;season:number;rosterId:number;teamName:string;rank:number;score:number;
  classification:string;starterValue:number;benchValue:number;pickValue:number;avgAge:number;
}[]){
  if(!rows.length)return;
  const c=await ensureHistorySchema();
  const now=new Date().toISOString();
  await c.batch(rows.map(row=>({
    sql:`insert into yearly_power_rankings(league_key,season,roster_id,team_name,rank,score,classification,starter_value,bench_value,pick_value,avg_age,recorded_at)
      values(?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict(league_key,season,roster_id) do update set team_name=excluded.team_name,rank=excluded.rank,score=excluded.score,
      classification=excluded.classification,starter_value=excluded.starter_value,bench_value=excluded.bench_value,pick_value=excluded.pick_value,
      avg_age=excluded.avg_age,recorded_at=excluded.recorded_at`,
    args:[row.leagueKey,row.season,row.rosterId,row.teamName,row.rank,row.score,row.classification,row.starterValue,row.benchValue,row.pickValue,row.avgAge,now],
  })),"write");
}

export async function readYearlyPower(leagueKey:string){
  const c=await ensureHistorySchema();
  const result=await c.execute({
    sql:"select league_key,season,roster_id,team_name,rank,score,classification,starter_value,bench_value,pick_value,avg_age,recorded_at from yearly_power_rankings where league_key=? order by season desc,rank asc",
    args:[leagueKey],
  });
  return result.rows.map((r:any)=>({
    leagueKey:String(r.league_key),season:Number(r.season),rosterId:Number(r.roster_id),teamName:String(r.team_name),
    rank:Number(r.rank),score:Number(r.score),classification:String(r.classification||""),
    starterValue:Number(r.starter_value)||0,benchValue:Number(r.bench_value)||0,pickValue:Number(r.pick_value)||0,
    avgAge:Number(r.avg_age)||0,recordedAt:String(r.recorded_at||""),
  }));
}
