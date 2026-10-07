import Papa from "papaparse";import {createHash} from "node:crypto";import {ensureTursoSchema,rows} from "@/lib/turso";import {identityMapForDraftClass} from "@/lib/player-identity";import {getDraftClassContext,setDraftClassAnalysisSeason} from "@/lib/draft-context";import {recordAudit} from "@/lib/audit";
const TEAM:any={'S JOSE ST':'San Jose State','BOWL GREEN':'Bowling Green','PENN STATE':'Penn State','OKLA STATE':'Oklahoma State','IOWA STATE':'Iowa State','ARK STATE':'Arkansas State','BALL ST':'Ball State','S ALABAMA':'South Alabama','OREGON ST':'Oregon State','USF':'South Florida','ARIZONA ST':'Arizona State','W KENTUCKY':'Western Kentucky','LA TECH':'Louisiana Tech','NWESTERN':'Northwestern','MISS STATE':'Mississippi State','WASH STATE':'Washington State','GA STATE':'Georgia State','E MICHIGAN':'Eastern Michigan','DOMINION':'Old Dominion','N TEXAS':'North Texas','GA SOUTHRN':'Georgia Southern','MIAMI FL':'Miami (FL)','BOSTON COL':'Boston College','TEXAS ST':'Texas State','GA TECH':'Georgia Tech','MISSOURI':'Mizzou','NC STATE':'NC State','BOISE ST':'Boise State','MIAMI OH':'Miami (OH)','UMASS':'Massachusetts','WAKE':'Wake Forest','MIDDLE TN':'Middle Tennessee','E CAROLINA':'East Carolina','FRESNO ST':'Fresno State','APP STATE':'Appalachian State','UTAH ST':'Utah State','MICH STATE':'Michigan State','JVILLE ST':'Jacksonville State','W VIRGINIA':'West Virginia','S DIEGO ST':'San Diego State','SM HOUSTON':'Sam Houston State','LA LAFAYET':'Louisiana','N CAROLINA':'North Carolina','JAMES MAD':'James Madison','COLO STATE':'Colorado State','VA TECH':'Virginia Tech','SO MISS':'Southern Miss','W MICHIGAN':'Western Michigan','COAST CAR':'Coastal Carolina','S CAROLINA':'South Carolina','N ILLINOIS':'Northern Illinois','NEW MEX ST':'New Mexico State','LA MONROE':'UL Monroe','FLORIDA ST':'Florida State','C MICHIGAN':'Central Michigan'};
const defs:any={
QB:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['completions','Completions'],['attempts','Passing Attempts'],['completion_percent','Comp %','pct'],['yards','Passing Yards'],['touchdowns','Passing TDs'],['interceptions','Interceptions'],['qb_rating','QBR'],['big_time_throws','Big Time Throws'],['btt_rate','BTT %','pct'],['turnover_worthy_plays','TO Worthy Plays'],['twp_rate','TWP %','pct'],['accuracy_percent','Adjusted Comp %','pct'],['sacks','Sacks'],['pressure_to_sack_rate','Pressure-to-Sack %','pct'],['avg_time_to_throw','Time to throw'],['avg_depth_of_target','ADOT'],['screen_attempts','Screen Throws'],['deep_completion_percent','20+ Comp %','pct'],['pa_btt_rate','PA BTT %','pct'],['no_pressure_dropbacks','Clean Dropbacks'],['no_pressure_completion_percent','Clean Comp %','pct'],['no_pressure_scrambles','Clean Scrambles'],['pressure_accuracy_percent','Pressured ADJ%','pct'],['pressure_btt_rate','Pressured BTT%','pct'],['pressure_twp_rate','Pressured TWP%','pct'],['self_percent','Allowed Press. %','pct'],['pressure_sack_percent','Pressured Sack %','pct'],['pressure_scrambles','Press. Scrambles']],
RB:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['attempts','Rush Attempts'],['yards','Rush Yards'],['touchdowns','Rush Touchdowns'],['first_downs','Rush 1st Downs'],['avoided_tackles','MTFs'],['yco_attempt','YAC/ATT'],['elusive_rating','Elusive Rating'],['breakaway_attempts','Breakaway Runs'],['breakaway_percent','Breakaway %','pct'],['breakaway_yards','Breakaway Yards'],['grades_hands_fumble','Fumble Grade'],['receptions','Receptions'],['targets','Targets'],['yprr','Y/RR'],['avg_depth_of_target','ADOT'],['grades_pass_block','Pass Block Grade']],
WR:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['receptions','Receptions'],['targets','Targets'],['routes','Routes'],['yards','Yards'],['yards_per_reception','Yards/Rec'],['touchdowns','Touchdowns'],['drops','Drops'],['drop_rate','Drop %','pct'],['contested_receptions','Catches in Traffic'],['contested_catch_rate','Catch in Traffic %','pct'],['first_downs','1st Downs'],['yprr','Y/RR'],['man_yprr','Y/RR vs Man'],['zone_yprr','Y/RR vs Zone'],['yards_after_catch','YAC'],['yards_after_catch_per_reception','YAC/Rec'],['avoided_tackles','MTFs'],['avg_depth_of_target','ADOT'],['slot_targets','Slot Targets'],['slot_routes','Slot Routes'],['screen_targets','Screen Targets'],['grades_run_block','Run Block Grade']],
TE:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['receptions','Receptions'],['targets','Targets'],['routes','Routes'],['yards','Yards'],['yards_per_reception','Yards/Rec'],['touchdowns','Touchdowns'],['drops','Drops'],['drop_rate','Drop %','pct'],['contested_receptions','Catches in Traffic'],['contested_catch_rate','Catch in Traffic %','pct'],['first_downs','1st Downs'],['yprr','Y/RR'],['man_yprr','Y/RR vs Man'],['zone_yprr','Y/RR vs Zone'],['yards_after_catch','YAC'],['yards_after_catch_per_reception','YAC/Rec'],['avoided_tackles','MTFs'],['avg_depth_of_target','ADOT'],['inline_rate','Inline Rate'],['slot_rate','Slot Rate'],['wide_rate','Wide Rate'],['grades_pass_block','Pass Block Grade'],['grades_run_block','Run Block Grade']]
};
function calc(pos:string,r:any){if(pos==='QB'){r['Yards/Attempt']=r['Passing Attempts']?(+r['Passing Yards']/+r['Passing Attempts']).toFixed(2):0;r['Adjusted Y/A']=r['Passing Attempts']?((+r['Passing Yards']+20*(+r['Passing TDs']||0)-45*(+r.Interceptions||0))/+r['Passing Attempts']).toFixed(2):0;r['Screen throw %']=r['Passing Attempts']?((+r['Screen Throws']||0)/+r['Passing Attempts']*100).toFixed(2)+'%':0;r['Clean Scramble %']=r['Clean Dropbacks']?((+r['Clean Scrambles']||0)/+r['Clean Dropbacks']*100).toFixed(2)+'%':0}else if(pos==='RB'){r['Yards/Attempt']=r['Rush Attempts']?(+r['Rush Yards']/+r['Rush Attempts']).toFixed(2):0;r['1st/rush']=r['Rush Attempts']?((+r['Rush 1st Downs']||0)/+r['Rush Attempts']).toFixed(3):0;r['MTF/Att']=r['Rush Attempts']?((+r.MTFs||0)/+r['Rush Attempts']).toFixed(3):0}else{r['Yards/target']=r.Targets?(+r.Yards/+r.Targets).toFixed(2):0;r['Catch %']=r.Targets?((+r.Receptions/+r.Targets)*100).toFixed(2)+'%':0;r['1st/target']=r.Targets?((+r['1st Downs']||0)/+r.Targets).toFixed(3):0;if(pos==='WR'){r['Air Yards']=(+r.Yards-(+r.YAC||0)).toFixed(1);r['Air Yards %']=r.Yards?(+r['Air Yards']/+r.Yards*100).toFixed(1)+'%':0;r['Screen target %']=r.Targets?((+r['Screen Targets']||0)/+r.Targets*100).toFixed(2)+'%':0}}return r}

type Position="QB"|"RB"|"WR"|"TE";
const W_POSITIONS:Position[]=["QB","RB","WR","TE"];
const W_RATE=.20;
const wNorm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const wNum=(v:any)=>{if(typeof v==="number")return Number.isFinite(v)?v:null;const s=String(v??"").replace(/[%,$]/g,"").replace(/,/g,"").trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null};
const wVolumeKey=(pos:Position)=>pos==="QB"?"attempts":pos==="RB"?"attempts":"targets";
const wVolumeLabel=(pos:Position)=>pos==="QB"?"Passing Attempts":pos==="RB"?"Rushing Attempts":"Targets";
const wMatches=(raw:any,pos:Position)=>{const p=String(raw??"").trim().toUpperCase();return pos==="RB"?(p==="RB"||p==="HB"):p===pos};
const wRowsForPosition=(data:any[],pos:Position)=>{const tagged=data.some(x=>x?.position!=null||x?.Position!=null||x?.POSITION!=null);return tagged?data.filter(x=>wMatches(x.position??x.Position??x.POSITION,pos)):data};
async function ensureWarehouse(q:any){
  for(const sql of [
    "create table if not exists pff_player_records(import_id integer not null references pff_imports(id) on delete cascade,position text not null,player_name text not null,normalized_name text not null,college text,volume real,threshold_eligible integer not null default 0,scouting_override integer not null default 0,raw_json text not null,used_json text not null,unused_json text not null,percentiles_json text not null,primary key(import_id,position,normalized_name))",
    "create index if not exists pff_player_records_projection_idx on pff_player_records(import_id,position,threshold_eligible,scouting_override)",
    "create table if not exists pff_thresholds(import_id integer not null references pff_imports(id) on delete cascade,position text not null,volume_metric text not null,leader_volume real not null default 0,threshold_value real not null default 0,eligible_count integer not null default 0,scout_override_count integer not null default 0,stored_count integer not null default 0,primary key(import_id,position))",
    "create table if not exists pff_dataset_registry(import_id integer primary key references pff_imports(id) on delete cascade,season integer not null,draft_class integer not null,dataset_mode text not null check(dataset_mode in (\'ACTIVE\',\'HISTORICAL\')),revision integer not null,content_hash text not null,created_at text default current_timestamp,unique(season,draft_class,revision))",
    "create index if not exists pff_dataset_registry_lookup_idx on pff_dataset_registry(draft_class,season,revision desc)",
    "create index if not exists pff_dataset_registry_hash_idx on pff_dataset_registry(season,draft_class,content_hash)",
    "create table if not exists pff_active_datasets(draft_class integer not null,position text not null,import_id integer not null references pff_imports(id) on delete cascade,activated_at text default current_timestamp,primary key(draft_class,position))"
  ])await q.execute(sql);
  try{await q.execute("alter table pff_player_records add column player_id integer references players(id) on delete set null")}catch(e:unknown){const m=e instanceof Error?e.message:String(e);if(!m.toLowerCase().includes("duplicate column"))throw e}
  await q.execute("create index if not exists pff_player_records_player_idx on pff_player_records(import_id,position,player_id)");
}
function wUsedRow(pos:Position,raw:any){
  const r:any={};
  for(const [key,label,fmt] of defs[pos]){
    let v=raw[key];
    if(key==="team_name"&&v)v=TEAM[String(v)]||v;
    r[label]=fmt==="pct"&&v!==undefined&&v!==null?String(v)+"%":(v??"N/A");
  }
  return calc(pos,r);
}
function wPercentRank(values:number[],value:any){
  const v=wNum(value);if(v==null||!values.length)return null;
  const a=[...values].sort((x,y)=>x-y);
  if(a.length===1)return v===a[0]?100:null;
  if(v<a[0]||v>a[a.length-1])return null;
  let lo=0;while(lo<a.length&&a[lo]<v)lo++;
  let out:number;
  if(lo<a.length&&a[lo]===v)out=lo/(a.length-1);
  else{const hi=lo,low=lo-1;out=(low+(v-a[low])/(a[hi]-a[low]))/(a.length-1)}
  return Math.round(out*10000)/100;
}
export async function GET(req:Request){
  try{
    const q=await ensureTursoSchema();await ensureWarehouse(q);
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027);
    const active=rows(await q.execute({sql:"select a.position,a.import_id,r.season,r.draft_class,r.revision,r.dataset_mode,r.created_at,t.volume_metric,t.leader_volume,t.threshold_value,t.eligible_count,t.scout_override_count,t.stored_count from pff_active_datasets a join pff_dataset_registry r on r.import_id=a.import_id join pff_thresholds t on t.import_id=a.import_id and t.position=a.position where a.draft_class=? order by a.position",args:[draftClass]}));
    const thresholds=Object.fromEntries(active.map((t:any)=>[t.position,{position:t.position,importId:Number(t.import_id),season:Number(t.season),draftClass:Number(t.draft_class),revision:Number(t.revision),volumeMetric:t.volume_metric,leaderVolume:Number(t.leader_volume||0),thresholdValue:Number(t.threshold_value||0),eligibleCount:Number(t.eligible_count||0),scoutOverrideCount:Number(t.scout_override_count||0),storedCount:Number(t.stored_count||0)}]));
    const history=rows(await q.execute({sql:"select import_id,season,draft_class,dataset_mode,revision,content_hash,created_at from pff_dataset_registry where draft_class=? order by season desc,revision desc limit 16",args:[draftClass]})).map((x:any)=>({importId:Number(x.import_id),season:Number(x.season),draftClass:Number(x.draft_class),datasetMode:String(x.dataset_mode),revision:Number(x.revision),contentHash:String(x.content_hash),createdAt:x.created_at,activePositions:active.filter((a:any)=>Number(a.import_id)===Number(x.import_id)).map((a:any)=>String(a.position))}));
    return Response.json({draftClass,warehouseVersion:3,thresholdRate:W_RATE,thresholds,history});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load PFF warehouse status"},{status:500})}
}
export async function POST(req:Request){
  try{
    const q=await ensureTursoSchema();await ensureWarehouse(q);
    const fd=await req.formData();
    const files=fd.getAll("files").filter((x:any)=>x&&typeof x==="object"&&"text" in x&&Number(x.size)>0) as File[];
    if(!files.length)return Response.json({error:"Upload at least one PFF CSV file."},{status:400});
    const season=Number(fd.get("season")||new Date().getFullYear()),draftClass=Number(fd.get("draftClass")||2027),datasetMode=String(fd.get("datasetMode")||"ACTIVE").toUpperCase()==="HISTORICAL"?"HISTORICAL":"ACTIVE";
    const previousActiveRows=rows(await q.execute({sql:"select position,import_id from pff_active_datasets where draft_class=?",args:[draftClass]})),previousActive=Object.fromEntries(previousActiveRows.map((x:any)=>[String(x.position),Number(x.import_id)])),previousContext=await getDraftClassContext(q,draftClass);
    const payloads=[] as {name:string;text:string}[];for(const f of files)payloads.push({name:f.name.toLowerCase(),text:await f.text()});payloads.sort((a,b)=>a.name.localeCompare(b.name));
    const contentHash=createHash("sha256").update(payloads.map(x=>x.name+"\\n"+x.text).join("\\n---rookie-draft-pff-file---\\n")).digest("hex");
    const parsed:{name:string,data:any[]}[]=payloads.map(x=>({name:x.name,data:Papa.parse(x.text,{header:true,dynamicTyping:true,skipEmptyLines:true}).data as any[]}));
    const duplicate=rows(await q.execute({sql:"select import_id,revision,dataset_mode from pff_dataset_registry where season=? and draft_class=? and content_hash=? order by revision desc limit 1",args:[season,draftClass,contentHash]}));
    if(duplicate.length){const importId=Number(duplicate[0].import_id),thresholdRows=rows(await q.execute({sql:"select position,volume_metric,leader_volume,threshold_value,eligible_count,scout_override_count,stored_count from pff_thresholds where import_id=? order by position",args:[importId]}));if(datasetMode==="ACTIVE"&&thresholdRows.length){await q.batch(thresholdRows.map((t:any)=>({sql:"insert into pff_active_datasets(draft_class,position,import_id,activated_at) values(?,?,?,current_timestamp) on conflict(draft_class,position) do update set import_id=excluded.import_id,activated_at=current_timestamp",args:[draftClass,String(t.position),importId]})),"write");await q.execute({sql:"update pff_dataset_registry set dataset_mode=\'ACTIVE\' where import_id=?",args:[importId]});await setDraftClassAnalysisSeason(q,draftClass,season,"active-pff");await recordAudit(q,{action:"PFF_DATASET_REACTIVATE",entityType:"pff_dataset",entityId:importId,summary:"Reactivated "+season+" PFF dataset for Draft Class "+draftClass,before:{active:previousActive,analysisSeason:previousContext.analysisSeason},after:{importId,season,draftClass,positions:thresholdRows.map((t:any)=>String(t.position))},undoKind:"pff_activation",undoPayload:{draftClass,previousActive,previousAnalysisSeason:previousContext.analysisSeason,positions:thresholdRows.map((t:any)=>String(t.position))}})}else await recordAudit(q,{action:"PFF_DATASET_REUSE",entityType:"pff_dataset",entityId:importId,summary:"Reused stored "+season+" PFF dataset for Draft Class "+draftClass,before:null,after:{importId,season,draftClass,datasetMode}});return Response.json({reused:true,importId,files:files.length,warehouseVersion:3,season,draftClass,datasetMode,revision:Number(duplicate[0].revision),thresholdRate:W_RATE,thresholds:Object.fromEntries(thresholdRows.map((t:any)=>[t.position,{position:t.position,volumeMetric:t.volume_metric,leaderVolume:Number(t.leader_volume||0),thresholdValue:Number(t.threshold_value||0),eligibleCount:Number(t.eligible_count||0),scoutOverrideCount:Number(t.scout_override_count||0),storedCount:Number(t.stored_count||0)}])),summary:datasetMode==="HISTORICAL"?"Identical historical dataset already stored; active Player Data was not changed.":"Identical dataset reused and set active for its imported positions."})}
    const scoutRows=rows(await q.execute({sql:"select id,name,position from players where draft_class=?",args:[draftClass]}));
    const scoutSets=Object.fromEntries(W_POSITIONS.map(pos=>[pos,new Set(scoutRows.filter((x:any)=>String(x.position).toUpperCase()===pos).map((x:any)=>wNorm(x.name)))])) as Record<Position,Set<string>>;
    const identityMap=await identityMapForDraftClass(q,draftClass);
    const revRows=rows(await q.execute({sql:"select coalesce(max(revision),0)+1 as revision from pff_dataset_registry where season=? and draft_class=?",args:[season,draftClass]})),revision=Number(revRows[0]?.revision||1);
    const result:any={meta:{warehouseVersion:3,season,draftClass,datasetMode,revision,contentHash,thresholdRate:W_RATE,files:files.map(f=>f.name)},positions:[]};
    const thresholds:Record<string,number>={},records:any[]=[],thresholdRows:any[]=[];
    for(const pos of W_POSITIONS){
      const needle=pos==="QB"?"passing_summary":pos==="RB"?"rushing_summary":"receiving_summary";
      const primary=parsed.find(f=>f.name.includes(needle));
      if(!primary)continue;
      const selected=wRowsForPosition(primary.data,pos);if(!selected.length)continue;
      const supplementals=parsed.filter(f=>f!==primary).map(f=>{
        const m=new Map<string,any>();
        for(const x of wRowsForPosition(f.data,pos)){const key=wNorm(x.player??x.Player);if(key)m.set(key,x)}
        return m;
      });
      const merged=selected.map((row:any)=>{const out={...row},key=wNorm(row.player??row.Player);for(const index of supplementals){const extra=index.get(key);if(extra)Object.assign(out,extra)}return out}).filter((row:any)=>wNorm(row.player??row.Player));
      const volumeKey=wVolumeKey(pos),leader=Math.max(0,...merged.map(row=>wNum(row[volumeKey])||0)),threshold=Math.ceil(leader*W_RATE),scouts=scoutSets[pos];
      thresholds[pos]=threshold;
      const usedKeys=new Set<string>(defs[pos].map((d:any[])=>String(d[0])));
      const working=merged.map(raw=>{
        const used=wUsedRow(pos,raw),player=String(used.Player||raw.player||raw.Player||"").trim(),college=String(used.College||raw.team_name||"").trim(),volume=wNum(raw[volumeKey])||0;
        const eligible=volume>=threshold,scoutingOverride=!eligible&&scouts.has(wNorm(player));
        used.Eligibility=eligible?"Threshold Eligible":scoutingOverride?"Scouting Override":"Below Threshold";
        const unused=Object.fromEntries(Object.entries(raw).filter(([key])=>!usedKeys.has(key)));
        const playerId=identityMap.get(wNorm(player))??null;
        return {raw,used,unused,player,playerId,college,volume,eligible,scoutingOverride,percentiles:{} as Record<string,number|null>};
      });
      const eligibleRows=working.filter(row=>row.eligible),numericKeys=new Set<string>();
      for(const row of eligibleRows)for(const [key,value] of Object.entries(row.used))if(wNum(value)!=null&&!["Player","College"].includes(key))numericKeys.add(key);
      const distributions=new Map<string,number[]>();
      for(const key of numericKeys)distributions.set(key,eligibleRows.map(row=>wNum(row.used[key])).filter((x):x is number=>x!=null));
      for(const row of working){for(const key of numericKeys)row.percentiles[key]=wPercentRank(distributions.get(key)||[],row.used[key]);row.used.Percentiles=row.percentiles}
      const above=working.filter(row=>row.eligible).map(row=>row.used),below=working.filter(row=>row.scoutingOverride).map(row=>row.used);
      const meta={position:pos,volumeMetric:wVolumeLabel(pos),leaderVolume:leader,thresholdValue:threshold,eligibleCount:above.length,scoutOverrideCount:below.length,storedCount:working.length};
      result[pos]={above:{primary:above},below:{primary:below},threshold:meta};result.positions.push(pos);thresholdRows.push(meta);
      for(const row of working)records.push({position:pos,...row});
    }
    if(!result.positions.length)return Response.json({error:"No required PFF summary files were detected. Include passing_summary, rushing_summary, and/or receiving_summary exports."},{status:400});
    const inserted=await q.execute({sql:"insert into pff_imports(thresholds,result) values(?,?)",args:[JSON.stringify(thresholds),JSON.stringify(result)]});
    let importId=Number(inserted.lastInsertRowid||0);if(!importId){const idRows=rows(await q.execute("select last_insert_rowid() as id"));importId=Number(idRows[0]?.id||0)}
    const statements=records.map(row=>({sql:"insert or replace into pff_player_records(import_id,position,player_name,normalized_name,player_id,college,volume,threshold_eligible,scouting_override,raw_json,used_json,unused_json,percentiles_json) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",args:[importId,row.position,row.player,wNorm(row.player),row.playerId,row.college,row.volume,row.eligible?1:0,row.scoutingOverride?1:0,JSON.stringify(row.raw),JSON.stringify(row.used),JSON.stringify(row.unused),JSON.stringify(row.percentiles)]}));
    for(let i=0;i<statements.length;i+=50)await q.batch(statements.slice(i,i+50),"write");
    const thresholdStatements=thresholdRows.map(t=>({sql:"insert into pff_thresholds(import_id,position,volume_metric,leader_volume,threshold_value,eligible_count,scout_override_count,stored_count) values(?,?,?,?,?,?,?,?)",args:[importId,t.position,t.volumeMetric,t.leaderVolume,t.thresholdValue,t.eligibleCount,t.scoutOverrideCount,t.storedCount]}));
    if(thresholdStatements.length)await q.batch(thresholdStatements,"write");
    await q.execute({sql:"insert into pff_dataset_registry(import_id,season,draft_class,dataset_mode,revision,content_hash) values(?,?,?,?,?,?)",args:[importId,season,draftClass,datasetMode,revision,contentHash]});
    if(datasetMode==="ACTIVE"&&thresholdRows.length){await q.batch(thresholdRows.map(t=>({sql:"insert into pff_active_datasets(draft_class,position,import_id,activated_at) values(?,?,?,current_timestamp) on conflict(draft_class,position) do update set import_id=excluded.import_id,activated_at=current_timestamp",args:[draftClass,t.position,importId]})),"write");await setDraftClassAnalysisSeason(q,draftClass,season,"active-pff")}
    await recordAudit(q,{action:"PFF_DATASET_IMPORT",entityType:"pff_dataset",entityId:importId,summary:(datasetMode==="ACTIVE"?"Activated ":"Stored historical ")+season+" PFF dataset for Draft Class "+draftClass,before:{active:previousActive,analysisSeason:previousContext.analysisSeason},after:{importId,season,draftClass,datasetMode,positions:thresholdRows.map(t=>t.position),records:records.length},undoKind:datasetMode==="ACTIVE"?"pff_activation":null,undoPayload:datasetMode==="ACTIVE"?{draftClass,previousActive,previousAnalysisSeason:previousContext.analysisSeason,positions:thresholdRows.map(t=>String(t.position))}:null});
    return Response.json({importId,files:files.length,warehouseVersion:3,season,draftClass,datasetMode,revision,thresholdRate:W_RATE,thresholds:Object.fromEntries(thresholdRows.map(t=>[t.position,t])),summary:(datasetMode==="HISTORICAL"?"Historical dataset stored; active Player Data unchanged. ":"Active Player Data updated. ")+thresholdRows.map(t=>t.position+": "+t.eligibleCount+" eligible + "+t.scoutOverrideCount+" scout override"+(t.scoutOverrideCount===1?"":"s")).join(" · ")});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"PFF processing failed"},{status:400})}
}
