import {ensureTursoSchema} from "@/lib/turso";
import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {playerTransactionHistory} from "@/lib/dynasty-manager-intel";

export const dynamic="force-dynamic";

type StatRow={id:string;stats:Record<string,any>};
const ELIGIBLE=new Set(["QB","RB","WR","TE"]);
const DEFAULT_SCORING:Record<string,number>={pass_yd:0.04,pass_td:4,pass_int:-2,rush_yd:0.1,rush_td:6,rec:1,rec_yd:0.1,rec_td:6,fum_lost:-2,pass_2pt:2,rush_2pt:2,rec_2pt:2};
const TEAM_NAMES:Record<string,string>={ARI:"Cardinals",ATL:"Falcons",BAL:"Ravens",BUF:"Bills",CAR:"Panthers",CHI:"Bears",CIN:"Bengals",CLE:"Browns",DAL:"Cowboys",DEN:"Broncos",DET:"Lions",GB:"Packers",HOU:"Texans",IND:"Colts",JAX:"Jaguars",KC:"Chiefs",LAC:"Chargers",LAR:"Rams",LV:"Raiders",MIA:"Dolphins",MIN:"Vikings",NE:"Patriots",NO:"Saints",NYG:"Giants",NYJ:"Jets",PHI:"Eagles",PIT:"Steelers",SEA:"Seahawks",SF:"49ers",TB:"Buccaneers",TEN:"Titans",WAS:"Commanders"};

const text=(v:any)=>v==null?"":String(v).trim();
const number=(v:any)=>v==null||v===""?0:(Number.isFinite(Number(v))?Number(v):0);
const positionOf=(p:any)=>String(p?.position||"").toUpperCase();
const fullName=(p:any)=>text(p?.full_name)||[p?.first_name,p?.last_name].map(text).filter(Boolean).join(" ")||text(p?.search_full_name);
const normalizeName=(v:any)=>String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const normalizeTeam=(v:any)=>{const team=String(v||"").toUpperCase();return ({WSH:"WAS",JAC:"JAX",OAK:"LV",SD:"LAC",STL:"LAR"} as Record<string,string>)[team]||team};

async function cachedJson(url:string,revalidate=3600){
  const response=await fetch(url,{next:{revalidate},headers:{accept:"application/json"}});
  if(!response.ok)throw new Error("Data source returned "+response.status);
  return response.json();
}

function normalizeStats(payload:any):StatRow[]{
  if(Array.isArray(payload))return payload.map((row:any)=>({id:String(row?.player_id||row?.playerId||row?.id||""),stats:row?.stats&&typeof row.stats==="object"?row.stats:(row||{})})).filter((row:StatRow)=>row.id);
  if(Array.isArray(payload?.players))return payload.players.map((row:any)=>({id:String(row?.player_id||row?.playerId||row?.id||""),stats:row?.stats&&typeof row.stats==="object"?row.stats:(row||{})})).filter((row:StatRow)=>row.id);
  const root=payload?.players&&typeof payload.players==="object"?payload.players:payload;
  if(root&&typeof root==="object")return Object.entries(root).map(([id,value]:[string,any])=>({id:String(value?.player_id||value?.playerId||id),stats:value?.stats&&typeof value.stats==="object"?value.stats:(value||{})})).filter((row:StatRow)=>row.id);
  return [];
}

function statValue(stats:Record<string,any>,...keys:string[]){
  for(const key of keys){const value=stats?.[key];if(value!=null&&value!==""&&Number.isFinite(Number(value)))return Number(value)}
  return 0;
}

function hasPlayed(stats:Record<string,any>){
  if(statValue(stats,"gp","games_played","games")>0)return true;
  if(stats?.pts_ppr!=null||stats?.pts_half_ppr!=null||stats?.pts_std!=null)return true;
  return Object.entries(stats||{}).some(([key,value])=>!key.startsWith("pts_")&&value!=null&&Number.isFinite(Number(value))&&Number(value)!==0);
}

function fantasyPoints(stats:Record<string,any>,scoring:Record<string,any>,position:string){
  const rules=scoring&&Object.keys(scoring).length?scoring:DEFAULT_SCORING;
  let total=0,matched=0;
  for(const [key,weightRaw] of Object.entries(rules)){
    const weight=Number(weightRaw);
    if(!Number.isFinite(weight)||weight===0)continue;
    if(key.startsWith("bonus_")){
      const yards=key.match(/^bonus_(pass|rush|rec)_yd_(\d+)$/);
      if(yards){
        if(statValue(stats,yards[1]+"_yd",yards[1]+"_yds")>=Number(yards[2]))total+=weight;
        matched++;
        continue;
      }
      const receptionPosition=key.match(/^bonus_rec_(qb|rb|wr|te)$/);
      if(receptionPosition){
        if(position.toLowerCase()===receptionPosition[1])total+=weight*statValue(stats,"rec");
        matched++;
        continue;
      }
      const directBonus=key.replace(/^bonus_/,"");
      if(stats[directBonus]!=null&&Number.isFinite(Number(stats[directBonus]))){total+=Number(stats[directBonus])*weight;matched++}
      continue;
    }
    if(stats[key]!=null&&Number.isFinite(Number(stats[key]))){total+=Number(stats[key])*weight;matched++}
  }
  if(matched===0&&rules!==DEFAULT_SCORING){
    if(stats.pts_ppr!=null&&Number.isFinite(Number(stats.pts_ppr)))return Number(stats.pts_ppr);
    return fantasyPoints(stats,DEFAULT_SCORING,position);
  }
  return Number(total.toFixed(4));
}

function headshotUrl(player:any,id:string){
  const espnId=text(player?.espn_id||player?.espnId);
  return espnId?"https://a.espncdn.com/i/headshots/nfl/players/full/"+espnId+".png":"https://sleepercdn.com/content/nfl/players/"+id+".jpg";
}

function teamRanksFor(team:string,teamTotals:Record<string,Record<string,number>>){
  const key=normalizeTeam(team),target=teamTotals[key];
  const rank=(metric:string,value:number)=>({rank:1+Object.values(teamTotals).filter(row=>number(row[metric])>value).length,value:Math.round(value)});
  if(!target)return {offensiveYards:null,passYards:null,passAttempts:null,passTDs:null,rushYards:null,rushAttempts:null,rushTDs:null};
  return {
    offensiveYards:rank("offensiveYards",number(target.offensiveYards)),
    passYards:rank("passYards",number(target.passYards)),
    passAttempts:rank("passAttempts",number(target.passAttempts)),
    passTDs:rank("passTDs",number(target.passTDs)),
    rushYards:rank("rushYards",number(target.rushYards)),
    rushAttempts:rank("rushAttempts",number(target.rushAttempts)),
    rushTDs:rank("rushTDs",number(target.rushTDs)),
  };
}

async function upcomingGame(team:string){
  if(!team||team==="FA")return null;
  const now=new Date(),end=new Date(now);
  end.setDate(end.getDate()+45);
  const stamp=(date:Date)=>date.toISOString().slice(0,10).replace(/-/g,"");
  const url="https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates="+stamp(now)+"-"+stamp(end)+"&limit=100";
  try{
    const payload=await cachedJson(url,1800);
    const events=Array.isArray(payload?.events)?payload.events:[];
    const choices=events.map((event:any)=>{
      const kickoff=Date.parse(String(event?.date||""));
      if(!Number.isFinite(kickoff)||kickoff<now.getTime()-4*60*60*1000)return null;
      const state=String(event?.status?.type?.state||"").toLowerCase();
      if(state==="post")return null;
      const competitors=event?.competitions?.[0]?.competitors||[];
      const ours=competitors.find((c:any)=>normalizeTeam(c?.team?.abbreviation)===normalizeTeam(team));
      const opponent=competitors.find((c:any)=>c!==ours);
      if(!ours||!opponent)return null;
      return {opponent:String(opponent?.team?.displayName||opponent?.team?.name||opponent?.team?.abbreviation||"Opponent"),abbreviation:String(opponent?.team?.abbreviation||""),homeAway:String(ours?.homeAway||""),date:String(event.date),label:(ours.homeAway==="home"?"vs ":"@ ")+String(opponent?.team?.displayName||opponent?.team?.abbreviation||"Opponent")};
    }).filter(Boolean).sort((a:any,b:any)=>Date.parse(a.date)-Date.parse(b.date));
    return choices[0]||null;
  }catch{return null}
}

export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    const requestedName=text(params.get("name")),requestedId=text(params.get("playerId"));
    if(!requestedName&&!requestedId)return Response.json({error:"A player name or Sleeper player ID is required."},{status:400});
    const config=await getIntegrations();
    const configured=(config.sleeper?.leagues||[]).filter((league:SleeperLeagueIntegration)=>league.enabled!==false);
    const leagues:SleeperLeagueIntegration[]=configured.length?configured:[{key:"default-ppr",name:"Standard PPR fallback",leagueId:"",enabled:true}];
    const [playerDbRaw,state,leagueMetas]=await Promise.all([
      cachedJson("https://api.sleeper.app/v1/players/nfl",86400).catch(()=>({})),
      cachedJson("https://api.sleeper.app/v1/state/nfl",900).catch(()=>({})),
      Promise.all(leagues.map(league=>league.leagueId?cachedJson("https://api.sleeper.app/v1/league/"+league.leagueId,3600).catch(()=>null):Promise.resolve(null))),
    ]);
    const playerDb=playerDbRaw&&typeof playerDbRaw==="object"?playerDbRaw:{};
    let playerId=requestedId,player:any=playerDb[playerId];
    if(!player&&requestedName){
      const wanted=normalizeName(requestedName);
      const candidates=Object.entries(playerDb).filter(([id,p]:[string,any])=>{
        if(!ELIGIBLE.has(positionOf(p)))return false;
        const names=[fullName(p),p?.search_full_name,p?.search_first_name&&p?.search_last_name?String(p.search_first_name)+" "+String(p.search_last_name):""];
        return names.some(value=>normalizeName(value)===wanted);
      }).sort((a:any,b:any)=>{
        const ap=a[1],bp=b[1];
        return Number(Boolean(bp?.active))-Number(Boolean(ap?.active))||Number(Boolean(bp?.team))-Number(Boolean(ap?.team))||number(bp?.years_exp)-number(ap?.years_exp);
      });
      if(candidates.length){playerId=String(candidates[0][0]);player=candidates[0][1]}
    }
    if(!player||!ELIGIBLE.has(positionOf(player)))return Response.json({error:"NFL player not found in Sleeper."},{status:404});
    const name=fullName(player)||requestedName,position=positionOf(player),team=normalizeTeam(player?.team||player?.team_abbr||"FA");
    const season=Math.max(2000,number(state?.season)||new Date().getFullYear());
    const currentWeek=Math.max(1,Math.min(18,number(state?.week)||1));
    const seasonType=String(state?.season_type||"regular").toLowerCase().includes("post")?"post":"regular";
    const weeks=await Promise.all(Array.from({length:currentWeek},(_,index)=>index+1).map(async week=>{
      const url="https://api.sleeper.app/v1/stats/nfl/"+seasonType+"/"+season+"/"+week;
      const payload=await cachedJson(url,21600).catch(()=>[]);
      return {week,rows:normalizeStats(payload)};
    }));
    const teamTotals:Record<string,Record<string,number>>={};
    for(const [id,p] of Object.entries(playerDb) as [string,any][]){
      const pTeam=normalizeTeam(p?.team||p?.team_abbr||"");
      if(!pTeam||pTeam==="FA"||!ELIGIBLE.has(positionOf(p)))continue;
      if(!teamTotals[pTeam])teamTotals[pTeam]={passYards:0,passAttempts:0,passTDs:0,rushYards:0,rushAttempts:0,rushTDs:0,offensiveYards:0};
    }
    for(const week of weeks)for(const row of week.rows){
      const p=playerDb[row.id];
      if(!p)continue;
      const pTeam=normalizeTeam(p?.team||p?.team_abbr||"");
      if(!pTeam||!teamTotals[pTeam])continue;
      const stats=row.stats||{};
      teamTotals[pTeam].passYards+=statValue(stats,"pass_yd","pass_yds","passing_yards");
      teamTotals[pTeam].passAttempts+=statValue(stats,"pass_att","pass_attempts","passing_attempts");
      teamTotals[pTeam].passTDs+=statValue(stats,"pass_td","passing_tds");
      teamTotals[pTeam].rushYards+=statValue(stats,"rush_yd","rush_yds","rushing_yards");
      teamTotals[pTeam].rushAttempts+=statValue(stats,"rush_att","rush_attempts");
      teamTotals[pTeam].rushTDs+=statValue(stats,"rush_td","rushing_tds");
    }
    for(const row of Object.values(teamTotals))row.offensiveYards=row.passYards+row.rushYards;

    const [ncaaRow,upcoming]=await Promise.all([
      (async()=>{
        try{
          const db=await ensureTursoSchema();
          const result=await db.execute({sql:"select id,name,position,college,draft_class from players where lower(name)=lower(?) and upper(position)=upper(?) order by draft_class desc limit 1",args:[name,position]});
          return result.rows[0]||null;
        }catch{return null}
      })(),
      upcomingGame(team),
    ]);

    const leagueResults=leagues.map((league,index)=>{
      const meta=leagueMetas[index],scoring=meta?.scoring_settings&&Object.keys(meta.scoring_settings).length?meta.scoring_settings:DEFAULT_SCORING;
      const totals=new Map<string,{total:number;games:number;weekly:Record<number,number>}>();
      for(const week of weeks){
        const seen=new Set<string>();
        for(const row of week.rows){
          const p=playerDb[row.id];
          if(!p||!ELIGIBLE.has(positionOf(p)))continue;
          const current=totals.get(row.id)||{total:0,games:0,weekly:{}};
          const stats=row.stats||{};
          const points=fantasyPoints(stats,scoring,positionOf(p));
          current.total+=points;
          if(hasPlayed(stats))current.games+=1;
          current.weekly[week.week]=points;
          totals.set(row.id,current);
          seen.add(row.id);
        }
      }
      const ranked=[...totals.entries()].map(([id,value])=>({id,total:value.total,games:value.games,ppg:value.games?value.total/value.games:0})).sort((a,b)=>b.total-a.total||a.id.localeCompare(b.id));
      const overallRanks:Record<string,number>={};
      ranked.forEach((row,index)=>{overallRanks[row.id]=index+1});
      const positionRanks:Record<string,number>={};
      for(const pos of ["QB","RB","WR","TE"]){
        ranked.filter(row=>positionOf(playerDb[row.id])===pos).forEach((row,index)=>{positionRanks[row.id]=index+1});
      }
      const selected=totals.get(playerId)||{total:0,games:0,weekly:{}};
      const teammates=Object.entries(playerDb).filter(([id,p]:[string,any])=>id!==playerId&&normalizeTeam(p?.team||p?.team_abbr||"")===team&&ELIGIBLE.has(positionOf(p))).map(([id,p]:[string,any])=>{
        const stats=totals.get(id)||{total:0,games:0,weekly:{}};
        return {id,name:fullName(p)||id,position:positionOf(p),team,positionRank:positionRanks[id]||null,fantasyPoints:Number(stats.total.toFixed(2)),fantasyPointsPerGame:stats.games?Number((stats.total/stats.games).toFixed(2)):0,headshotUrl:headshotUrl(p,id)};
      }).sort((a,b)=>a.position.localeCompare(b.position)||number(a.positionRank||999)-number(b.positionRank||999)||a.name.localeCompare(b.name));
      return {
        key:league.key,label:league.name,leagueId:league.leagueId,
        scoringSource:meta?.scoring_settings&&Object.keys(meta.scoring_settings).length?"Sleeper league scoring settings":"Standard PPR fallback",
        summary:{fantasyPoints:Number(selected.total.toFixed(2)),fantasyPointsPerGame:selected.games?Number((selected.total/selected.games).toFixed(2)):0,overallRank:overallRanks[playerId]||null,positionRank:positionRanks[playerId]||null},
        weekly:weeks.map(week=>({week:week.week,points:Number(number(selected.weekly[week.week]).toFixed(2))})),
        teammates,
        teamRanks:teamRanksFor(team,teamTotals),
      };
    });
    const displayPlayer={
      id:playerId,name,position,team,teamName:TEAM_NAMES[team]||text(player?.team_name)||team,
      number:player?.number??player?.jersey_number??null,
      age:player?.age??null,college:text(player?.college)||text(player?.high_school)||"",
      yearsExp:player?.years_exp??null,status:text(player?.status),injuryStatus:text(player?.injury_status),
      headshotUrl:headshotUrl(player,playerId),upcomingGame:upcoming,
    };
    return Response.json({
      player:displayPlayer,season,week:currentWeek,leagues:leagueResults,
      defaultLeagueKey:leagueResults[0]?.key||"",
      ncaaPlayerId:ncaaRow?.id!=null?String(ncaaRow.id):null,
      ncaaPlayerName:text(ncaaRow?.name)||null,
    });
  }catch(error:any){
    return Response.json({error:error?.message||"Could not load NFL player profile"},{status:500});
  }
}
