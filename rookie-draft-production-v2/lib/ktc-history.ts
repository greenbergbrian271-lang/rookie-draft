import {ensureTursoSchema} from "@/lib/turso";

type SnapshotPlayer={name:string;position:string;team:string;value:number;tepValue:number};
export type KtcHistoricalPoint={date:string;value:number};
export type KtcHistoryBackfillRecord={
  ktcId:number;
  playerName:string;
  position:string;
  slug:string;
  firstDate:string;
  lastDate:string;
  points:number;
  fetchedAt:string;
  lastError:string;
};

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
  await c.execute(`create table if not exists ktc_history_backfill(
    ktc_id integer primary key,
    player_name text not null,
    position text not null,
    slug text not null,
    first_date text,
    last_date text,
    points integer not null default 0,
    fetched_at text,
    last_error text
  )`);
  await c.execute("create index if not exists ktc_history_backfill_name_idx on ktc_history_backfill(player_name,position)");
  await c.execute(`create table if not exists ktc_history_series(
    ktc_id integer primary key,
    player_name text not null,
    position text not null,
    slug text not null,
    history_json text not null,
    first_date text,
    last_date text,
    points integer not null default 0,
    fetched_at text not null
  )`);
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

export async function recordKtcHistoricalSeries(player:{name:string;position:string;team?:string;ktcId:number;slug:string},points:KtcHistoricalPoint[]){
  const clean=points
    .filter(point=>/^\d{4}-\d{2}-\d{2}$/.test(point.date)&&Number.isFinite(point.value)&&point.value>=0)
    .sort((a,b)=>a.date.localeCompare(b.date));
  if(!clean.length)throw new Error("KTC history contained no usable points");

  const today=new Date().toISOString().slice(0,10),cutoff=new Date(Date.now()-400*86400000).toISOString().slice(0,10);
  // Preserve the entire all-time KTC series compactly, while materializing the
  // most recent ~13 months into daily rows for fast 7/30/90/365-day queries.
  const rows=clean.filter(point=>point.date<today&&point.date>=cutoff);
  const c=await ensureHistorySchema(),now=new Date().toISOString();
  await c.execute({
    sql:"insert into ktc_history_series(ktc_id,player_name,position,slug,history_json,first_date,last_date,points,fetched_at) values(?,?,?,?,?,?,?,?,?) on conflict(ktc_id) do update set player_name=excluded.player_name,position=excluded.position,slug=excluded.slug,history_json=excluded.history_json,first_date=excluded.first_date,last_date=excluded.last_date,points=excluded.points,fetched_at=excluded.fetched_at",
    args:[player.ktcId,player.name,player.position,player.slug,JSON.stringify(clean),clean[0]?.date||"",clean[clean.length-1]?.date||"",clean.length,now],
  });

  const statements=rows.map(point=>({
    sql:"insert into ktc_value_history(snapshot_date,player_name,position,team,value,tep_value,captured_at) values(?,?,?,?,?,?,?) on conflict(snapshot_date,player_name,position) do update set team=excluded.team,value=excluded.value,captured_at=excluded.captured_at",
    args:[point.date,player.name,player.position,player.team||"",point.value,null,now],
  }));
  for(let i=0;i<statements.length;i+=200)await c.batch(statements.slice(i,i+200),"write");

  const firstDate=clean[0]?.date||"",lastDate=clean[clean.length-1]?.date||"";
  await c.execute({
    sql:"insert into ktc_history_backfill(ktc_id,player_name,position,slug,first_date,last_date,points,fetched_at,last_error) values(?,?,?,?,?,?,?,?,?) on conflict(ktc_id) do update set player_name=excluded.player_name,position=excluded.position,slug=excluded.slug,first_date=excluded.first_date,last_date=excluded.last_date,points=excluded.points,fetched_at=excluded.fetched_at,last_error=''",
    args:[player.ktcId,player.name,player.position,player.slug,firstDate,lastDate,clean.length,now,""],
  });
  return {firstDate,lastDate,points:clean.length,materializedPoints:rows.length};
}

export async function recordKtcHistoryBackfillError(player:{name:string;position:string;ktcId:number;slug:string},error:string){
  const c=await ensureHistorySchema(),now=new Date().toISOString();
  await c.execute({
    sql:"insert into ktc_history_backfill(ktc_id,player_name,position,slug,points,fetched_at,last_error) values(?,?,?,?,0,?,?) on conflict(ktc_id) do update set player_name=excluded.player_name,position=excluded.position,slug=excluded.slug,fetched_at=excluded.fetched_at,last_error=excluded.last_error",
    args:[player.ktcId,player.name,player.position,player.slug,now,String(error||"Unknown KTC history error").slice(0,500)],
  });
}

export async function readKtcHistoryBackfillRecords(ktcIds:number[]){
  if(!ktcIds.length)return [] as KtcHistoryBackfillRecord[];
  const c=await ensureHistorySchema(),out:KtcHistoryBackfillRecord[]=[];
  for(let i=0;i<ktcIds.length;i+=200){
    const chunk=ktcIds.slice(i,i+200),marks=chunk.map(()=>"?").join(",");
    const r=await c.execute({sql:`select ktc_id,player_name,position,slug,first_date,last_date,points,fetched_at,last_error from ktc_history_backfill where ktc_id in (${marks})`,args:chunk});
    for(const row of r.rows as any[])out.push({
      ktcId:Number(row.ktc_id),playerName:String(row.player_name||""),position:String(row.position||""),slug:String(row.slug||""),
      firstDate:String(row.first_date||""),lastDate:String(row.last_date||""),points:Number(row.points)||0,
      fetchedAt:String(row.fetched_at||""),lastError:String(row.last_error||""),
    });
  }
  return out;
}

export async function ktcMovement(days=30){
  const c=await ensureHistorySchema();
  const latest=await c.execute("select max(snapshot_date) as d from ktc_value_history");
  const latestDate=String(latest.rows[0]?.d||"");
  if(!latestDate)return {latestDate:"",baselineDate:"",rows:[] as any[]};
  const target=new Date(Date.parse(latestDate+"T12:00:00Z")-Math.max(0,days)*86400000).toISOString().slice(0,10);
  const result=await c.execute({
    sql:`with current_dates as (
        select player_name,position,max(snapshot_date) as current_date
        from ktc_value_history
        group by player_name,position
      ),
      current_rows as (
        select h.player_name,h.position,h.team,h.snapshot_date,h.value
        from ktc_value_history h
        join current_dates d on d.player_name=h.player_name and d.position=h.position and d.current_date=h.snapshot_date
      ),
      baseline_dates as (
        select c.player_name,c.position,max(h.snapshot_date) as baseline_date
        from current_rows c
        join ktc_value_history h on h.player_name=c.player_name and h.position=c.position
          and h.snapshot_date<=date(c.snapshot_date,'-' || ? || ' days')
        group by c.player_name,c.position
      )
      select c.player_name as name,c.position,c.team,c.value as current,b.value as previous,
        (c.value-b.value) as change,
        case when b.value>0 then ((c.value-b.value)*100.0/b.value) else null end as change_pct,
        b.snapshot_date as baseline_date
      from current_rows c
      join baseline_dates d on d.player_name=c.player_name and d.position=c.position
      join ktc_value_history b on b.player_name=c.player_name and b.position=c.position and b.snapshot_date=d.baseline_date
      order by abs(case when b.value>0 then ((c.value-b.value)*100.0/b.value) else 0 end) desc`,
    args:[Math.max(0,days)],
  });
  return {latestDate,baselineDate:target,rows:result.rows.map((r:any)=>({
    name:String(r.name),position:String(r.position),team:String(r.team||""),
    current:Number(r.current)||0,previous:Number(r.previous)||0,change:Number(r.change)||0,
    changePct:r.change_pct==null?null:Number(r.change_pct),baselineDate:String(r.baseline_date||target),
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
