import Papa from "papaparse";
import {ensureTursoSchema,rows} from "@/lib/turso";
import {productionMetrics} from "@/lib/production-metrics";
import {asTeamStats} from "@/lib/team-stats";

type Position="QB"|"RB"|"WR"|"TE";
type ParsedFile={name:string;data:any[]};

const POSITIONS:Position[]=["QB","RB","WR","TE"];
const TEAM:Record<string,string>={'S JOSE ST':'San Jose State','BOWL GREEN':'Bowling Green','PENN STATE':'Penn State','OKLA STATE':'Oklahoma State','IOWA STATE':'Iowa State','ARK STATE':'Arkansas State','BALL ST':'Ball State','S ALABAMA':'South Alabama','OREGON ST':'Oregon State','USF':'South Florida','ARIZONA ST':'Arizona State','W KENTUCKY':'Western Kentucky','LA TECH':'Louisiana Tech','NWESTERN':'Northwestern','MISS STATE':'Mississippi State','WASH STATE':'Washington State','GA STATE':'Georgia State','E MICHIGAN':'Eastern Michigan','DOMINION':'Old Dominion','N TEXAS':'North Texas','GA SOUTHRN':'Georgia Southern','MIAMI FL':'Miami (FL)','BOSTON COL':'Boston College','TEXAS ST':'Texas State','GA TECH':'Georgia Tech','MISSOURI':'Mizzou','NC STATE':'NC State','BOISE ST':'Boise State','MIAMI OH':'Miami (OH)','UMASS':'Massachusetts','WAKE':'Wake Forest','MIDDLE TN':'Middle Tennessee','E CAROLINA':'East Carolina','FRESNO ST':'Fresno State','APP STATE':'Appalachian State','UTAH ST':'Utah State','MICH STATE':'Michigan State','JVILLE ST':'Jacksonville State','W VIRGINIA':'West Virginia','S DIEGO ST':'San Diego State','SM HOUSTON':'Sam Houston State','LA LAFAYET':'Louisiana','N CAROLINA':'North Carolina','JAMES MAD':'James Madison','COLO STATE':'Colorado State','VA TECH':'Virginia Tech','SO MISS':'Southern Miss','W MICHIGAN':'Western Michigan','COAST CAR':'Coastal Carolina','S CAROLINA':'South Carolina','N ILLINOIS':'Northern Illinois','NEW MEX ST':'New Mexico State','LA MONROE':'UL Monroe','FLORIDA ST':'Florida State','C MICHIGAN':'Central Michigan'};

const defs:Record<Position,Array<[string,string,string?]>>={
QB:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['completions','Completions'],['attempts','Passing Attempts'],['completion_percent','Comp %','pct'],['yards','Passing Yards'],['touchdowns','Passing TDs'],['interceptions','Interceptions'],['qb_rating','QBR'],['big_time_throws','Big Time Throws'],['btt_rate','BTT %','pct'],['turnover_worthy_plays','TO Worthy Plays'],['twp_rate','TWP %','pct'],['accuracy_percent','Adjusted Comp %','pct'],['sacks','Sacks'],['pressure_to_sack_rate','Pressure-to-Sack %','pct'],['avg_time_to_throw','Time to throw'],['avg_depth_of_target','ADOT'],['screen_attempts','Screen Throws'],['deep_completion_percent','20+ Comp %','pct'],['pa_btt_rate','PA BTT %','pct'],['no_pressure_dropbacks','Clean Dropbacks'],['no_pressure_completion_percent','Clean Comp %','pct'],['no_pressure_scrambles','Clean Scrambles'],['pressure_accuracy_percent','Pressured ADJ%','pct'],['pressure_btt_rate','Pressured BTT%','pct'],['pressure_twp_rate','Pressured TWP%','pct'],['self_percent','Allowed Press. %','pct'],['pressure_sack_percent','Pressured Sack %','pct'],['pressure_scrambles','Press. Scrambles']],
RB:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['attempts','Rush Attempts'],['yards','Rush Yards'],['touchdowns','Rush Touchdowns'],['first_downs','Rush 1st Downs'],['avoided_tackles','MTFs'],['yco_attempt','YAC/ATT'],['elusive_rating','Elusive Rating'],['breakaway_attempts','Breakaway Runs'],['breakaway_percent','Breakaway %','pct'],['breakaway_yards','Breakaway Yards'],['grades_hands_fumble','Fumble Grade'],['receptions','Receptions'],['targets','Targets'],['yprr','Y/RR'],['avg_depth_of_target','ADOT'],['grades_pass_block','Pass Block Grade']],
WR:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['receptions','Receptions'],['targets','Targets'],['routes','Routes'],['yards','Yards'],['yards_per_reception','Yards/Rec'],['touchdowns','Touchdowns'],['drops','Drops'],['drop_rate','Drop %','pct'],['contested_receptions','Catches in Traffic'],['contested_catch_rate','Catch in Traffic %','pct'],['first_downs','1st Downs'],['yprr','Y/RR'],['man_yprr','Y/RR vs Man'],['zone_yprr','Y/RR vs Zone'],['yards_after_catch','YAC'],['yards_after_catch_per_reception','YAC/Rec'],['avoided_tackles','MTFs'],['avg_depth_of_target','ADOT'],['slot_targets','Slot Targets'],['slot_routes','Slot Routes'],['screen_targets','Screen Targets'],['grades_run_block','Run Block Grade']],
TE:[['player','Player'],['team_name','College'],['player_game_count','Games'],['grades_offense','PFF Offense Grade'],['receptions','Receptions'],['targets','Targets'],['routes','Routes'],['yards','Yards'],['yards_per_reception','Yards/Rec'],['touchdowns','Touchdowns'],['drops','Drops'],['drop_rate','Drop %','pct'],['contested_receptions','Catches in Traffic'],['contested_catch_rate','Catch in Traffic %','pct'],['first_downs','1st Downs'],['yprr','Y/RR'],['man_yprr','Y/RR vs Man'],['zone_yprr','Y/RR vs Zone'],['yards_after_catch','YAC'],['yards_after_catch_per_reception','YAC/Rec'],['avoided_tackles','MTFs'],['avg_depth_of_target','ADOT'],['inline_rate','Inline Rate'],['slot_rate','Slot Rate'],['wide_rate','Wide Rate'],['grades_pass_block','Pass Block Grade'],['grades_run_block','Run Block Grade']]
};

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const num=(v:any)=>{const n=Number(String(v??"").replace(/[%,$]/g,"").replace(/,/g,"").trim());return Number.isFinite(n)?n:0};
const positionCode=(pos:Position)=>pos==="RB"?"HB":pos;
const primaryToken=(pos:Position)=>pos==="QB"?"passing_summary":pos==="RB"?"rushing_summary":"receiving_summary";
const volumeKey=(pos:Position)=>pos==="QB"||pos==="RB"?"attempts":"targets";
const volumeLabel=(pos:Position)=>pos==="QB"?"Passing Attempts":pos==="RB"?"Rush Attempts":"Targets";

function calc(pos:Position,r:any){
  if(pos==="QB"){
    r["Yards/Attempt"]=r["Passing Attempts"]?(+r["Passing Yards"]/+r["Passing Attempts"]).toFixed(2):0;
    r["Adjusted Y/A"]=r["Passing Attempts"]?((+r["Passing Yards"]+20*(+r["Passing TDs"]||0)-45*(+r.Interceptions||0))/+r["Passing Attempts"]).toFixed(2):0;
    r["Screen throw %"]=r["Passing Attempts"]?((+r["Screen Throws"]||0)/+r["Passing Attempts"]*100).toFixed(2)+"%":0;
    r["Clean Scramble %"]=r["Clean Dropbacks"]?((+r["Clean Scrambles"]||0)/+r["Clean Dropbacks"]*100).toFixed(2)+"%":0;
  }else if(pos==="RB"){
    r["Yards/Attempt"]=r["Rush Attempts"]?(+r["Rush Yards"]/+r["Rush Attempts"]).toFixed(2):0;
    r["1st/rush"]=r["Rush Attempts"]?((+r["Rush 1st Downs"]||0)/+r["Rush Attempts"]).toFixed(3):0;
    r["MTF/Att"]=r["Rush Attempts"]?((+r.MTFs||0)/+r["Rush Attempts"]).toFixed(3):0;
  }else{
    r["Yards/target"]=r.Targets?(+r.Yards/+r.Targets).toFixed(2):0;
    r["Catch %"]=r.Targets?((+r.Receptions/+r.Targets)*100).toFixed(2)+"%":0;
    r["1st/target"]=r.Targets?((+r["1st Downs"]||0)/+r.Targets).toFixed(3):0;
    if(pos==="WR"){
      r["Air Yards"]=(+r.Yards-(+r.YAC||0)).toFixed(1);
      r["Air Yards %"]=r.Yards?(+r["Air Yards"]/+r.Yards*100).toFixed(1)+"%":0;
      r["Screen target %"]=r.Targets?((+r["Screen Targets"]||0)/+r.Targets*100).toFixed(2)+"%":0;
    }
  }
  return r;
}

function usedRow(pos:Position,x:any){
  const r:any={};
  for(const [key,label,fmt] of defs[pos]){
    let v=x[key];
    if(key==="team_name"&&v)v=TEAM[String(v).toUpperCase()]||v;
    r[label]=fmt==="pct"&&v!==undefined&&v!==null?String(v).endsWith("%")?v:`${v}%`:(v??"N/A");
  }
  return calc(pos,r);
}

function mergeForPosition(parsed:ParsedFile[],pos:Position){
  const primary=parsed.find(f=>f.name.includes(primaryToken(pos)));
  if(!primary)throw new Error(`Missing required ${pos} ${primaryToken(pos)} file`);
  const code=positionCode(pos),key=(x:any)=>norm(x.player||x.Player);
  const selected=primary.data.filter((x:any)=>String(x.position||x.Position||x.POSITION||"").toUpperCase()===code);
  const supplemental=parsed.filter(f=>f!==primary).map(f=>new Map(
    f.data.filter((x:any)=>String(x.position||x.Position||x.POSITION||"").toUpperCase()===code).map((x:any)=>[key(x),x])
  ));
  return selected.map((x:any)=>{
    const merged={...x};
    for(const index of supplemental){const extra=index.get(key(x));if(extra)Object.assign(merged,extra)}
    return merged;
  });
}

export async function GET(){
  try{
    const db=await ensureTursoSchema();
    const history=rows(await db.execute("select id,season,draft_class,source,threshold_rate,leaders,thresholds,summary,created_at from pff_datasets order by id desc limit 8")).map((r:any)=>({
      ...r,
      leaders:JSON.parse(String(r.leaders||"{}")),
      thresholds:JSON.parse(String(r.thresholds||"{}")),
      summary:JSON.parse(String(r.summary||"{}"))
    }));
    if(!history.length)return Response.json({latest:null,history:[]});
    const latest=history[0];
    const counts=rows(await db.execute({sql:"select position,count(*) as stored,sum(threshold_eligible) as eligible,sum(case when threshold_eligible=0 and scouting_override=1 then 1 else 0 end) as overrides from pff_player_rows where dataset_id=? group by position order by position",args:[latest.id]}));
    return Response.json({latest:{...latest,counts},history});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load PFF warehouse status"},{status:500})}
}

export async function POST(req:Request){
  try{
    const db=await ensureTursoSchema(),fd=await req.formData();
    const files=fd.getAll("files") as File[];
    if(!files.length)return Response.json({error:"Choose at least one PFF CSV export."},{status:400});
    const season=Number(fd.get("season")||new Date().getFullYear()),draftClass=Number(fd.get("draftClass")||season+1);
    const parsed:ParsedFile[]=[];
    for(const file of files){
      const parsedCsv=Papa.parse(await file.text(),{header:true,dynamicTyping:true,skipEmptyLines:true});
      parsed.push({name:file.name.toLowerCase(),data:parsedCsv.data as any[]});
    }

    const scoutingRows=rows(await db.execute({sql:"select name,position,college from players where draft_class=?",args:[draftClass]}));
    const scoutingByPos=new Map<Position,Set<string>>(POSITIONS.map(pos=>[pos,new Set(scoutingRows.filter((p:any)=>p.position===pos).map((p:any)=>norm(p.name)))]));
    const collegeRows=rows(await db.execute("select team,subdivision,games,completions,pass_attempts as passAttempts,pass_yards as passYards,pass_tds as passTDs,rushes,rush_yards as rushYards,rush_tds as rushTDs,total_plays as totalPlays,air_yards as airYards from college_stats"));
    const colleges=new Map(collegeRows.map((r:any)=>[norm(r.team),r]));

    const leaders:any={},thresholds:any={},summary:any={},working:any={};
    for(const pos of POSITIONS){
      const merged=mergeForPosition(parsed,pos),vKey=volumeKey(pos);
      const leader=Math.max(0,...merged.map(x=>num(x[vKey])));
      const threshold=Math.ceil(leader*.20);
      leaders[pos]={metric:volumeLabel(pos),value:leader};
      thresholds[pos]=threshold;
      working[pos]={merged,threshold};
    }

    const datasetInsert=await db.execute({sql:"insert into pff_datasets(season,draft_class,source,threshold_rate,leaders,thresholds,summary) values(?,?,?,?,?,?,?)",args:[season,draftClass,"PFF",.20,JSON.stringify(leaders),JSON.stringify(thresholds),"{}"]});
    const datasetId=Number(datasetInsert.lastInsertRowid||0);
    if(!datasetId)throw new Error("Could not create PFF dataset snapshot.");

    const out:any={};
    const statements:any[]=[];
    for(const pos of POSITIONS){
      const {merged,threshold}=working[pos],scouting=scoutingByPos.get(pos)||new Set<string>();
      const mapped=merged.map((raw:any)=>{
        const used=usedRow(pos,raw),playerName=String(used.Player||raw.player||"").trim(),playerKey=norm(playerName);
        const volume=num(raw[volumeKey(pos)]),eligible=volume>=threshold,override=!eligible&&scouting.has(playerKey);
        const college=String(used.College||raw.team_name||"").trim(),team=colleges.get(norm(college));
        const withProduction={...used,...productionMetrics(pos,used,asTeamStats(team||null)),
          "_Threshold Eligible":eligible,
          "_Scouting Override":override,
          "_Usage Volume":volume,
          "_Usage Threshold":threshold,
          "_Dataset ID":datasetId
        };
        statements.push({sql:"insert into pff_player_rows(dataset_id,position,player_name,normalized_name,college,volume,threshold_value,threshold_eligible,scouting_override,used_payload,raw_payload) values(?,?,?,?,?,?,?,?,?,?,?)",args:[datasetId,pos,playerName,playerKey,college,volume,threshold,eligible?1:0,override?1:0,JSON.stringify(withProduction),JSON.stringify(raw)]});
        return {raw,used:withProduction,eligible,override};
      });
      const above=mapped.filter((x:any)=>x.eligible).map((x:any)=>x.used);
      const below=mapped.filter((x:any)=>x.override).map((x:any)=>x.used);
      out[pos]={above:{primary:above},below:{primary:below}};
      summary[pos]={
        stored:mapped.length,
        eligible:above.length,
        scoutingOverrides:below.length,
        hiddenBelowThreshold:mapped.length-above.length-below.length,
        leader:leaders[pos].value,
        threshold,
        usedMetrics:defs[pos].length,
        archivedFields:new Set(merged.flatMap((x:any)=>Object.keys(x))).size
      };
    }

    for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50),"write");
    await db.execute({sql:"update pff_datasets set summary=? where id=?",args:[JSON.stringify(summary),datasetId]});
    await db.execute({sql:"insert into pff_imports(thresholds,result) values(?,?)",args:[JSON.stringify(thresholds),JSON.stringify(out)]});

    return Response.json({datasetId,season,draftClass,files:files.length,leaders,thresholds,summary,result:out});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"PFF import failed"},{status:400});
  }
}
