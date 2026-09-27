import {ensureTursoSchema} from "@/lib/turso";
import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {workbookSecondary as w} from "@/lib/workbook-secondary";
import {createKtcMatcher,loadKtcDataset,type KtcDataset,type KtcMatch} from "@/lib/ktc";

type Player={name:string;position:string;team:string;age:string;ktc:string;ktcStatus?:string};
type Item={slot:string;name:string;team:string};
type RosterView={
  key:string;label:string;league:string;leagueId:string;updated:string;source:string;
  ktcUpdatedAt?:string;ktcSource?:string;
  players:Player[];totalKtc:number;avgAge:number;
  starters:Item[];benchPlayers:Item[];startingCoverage:Item[];benchCoverage:Item[];bonus:Item[];
};

const FALLBACK_ROWS:Record<string,readonly (readonly any[])[]>={
  "one-league":w.oneRoster,
  "last-man-standing":w.lmsRoster,
  "drew-ross":w.drRoster,
  "last-minute-dynasty":w.lmRoster,
};

const TEAM_NAMES:Record<string,string>={
  ARI:"Cardinals",ATL:"Falcons",BAL:"Ravens",BUF:"Bills",CAR:"Panthers",CHI:"Bears",CIN:"Bengals",CLE:"Browns",
  DEN:"Broncos",DET:"Lions",GB:"Packers",HOU:"Texans",IND:"Colts",JAX:"Jaguars",KC:"Chiefs",LAC:"Chargers",
  LAR:"Rams",LV:"Raiders",MIA:"Dolphins",MIN:"Vikings",NE:"Patriots",NO:"Saints",NYG:"Giants",NYJ:"Jets",
  PHI:"Eagles",PIT:"Steelers",SEA:"Seahawks",SF:"49ers",TB:"Bucs",TEN:"Titans",WAS:"Commanders",DAL:"Cowboys",
};

const SECTION_TITLES=new Set(["Starters to Handcuff","Bench Players to Handcuff","Starting Handcuffs","Bench Handcuffs"]);
const text=(v:any)=>v==null?"":String(v).trim();

function parseFallback(league:SleeperLeagueIntegration):RosterView|null{
  const rows=FALLBACK_ROWS[league.key];
  if(!rows)return null;
  const players=rows.slice(4).filter(r=>text(r[0])&&["QB","RB","WR","TE"].includes(text(r[1]))).map(r=>{
    const ktc=text(r[4]);
    return {name:text(r[0]),position:text(r[1]),team:text(r[2]),age:text(r[3]),ktc,ktcStatus:Number.isFinite(Number(ktc))?"sheet":"unmatched"};
  });
  const sections:Record<string,Item[]>={};
  let active="";
  for(let i=3;i<rows.length;i++){
    const g=text(rows[i]?.[6]),h=text(rows[i]?.[7]),team=text(rows[i]?.[8]);
    if(!g)continue;
    if(SECTION_TITLES.has(g)){
      active=g;
      sections[active]??=[];
      if(h)sections[active].push({slot:g==="Bench Handcuffs"?"Bench":"",name:h,team});
      continue;
    }
    if(active&&h)sections[active].push({slot:g,name:h,team});
  }
  const bonus=rows.slice(4).filter(r=>text(r[10])&&text(r[11])).map(r=>({slot:text(r[10]),name:text(r[11]),team:""}));
  const totalKtc=players.reduce((sum,p)=>sum+(Number.isFinite(Number(p.ktc))?Number(p.ktc):0),0);
  const ages=players.map(p=>Number(p.age)).filter(Number.isFinite);
  return {
    key:league.key,label:league.name,league:text(rows[0]?.[1])||league.name,leagueId:league.leagueId,
    updated:text(rows[1]?.[1]),source:"Google Sheet snapshot",players,totalKtc,
    avgAge:ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0,
    starters:sections["Starters to Handcuff"]||[],benchPlayers:sections["Bench Players to Handcuff"]||[],
    startingCoverage:sections["Starting Handcuffs"]||[],benchCoverage:sections["Bench Handcuffs"]||[],bonus,
  };
}

async function sleeperJson(url:string){
  const res=await fetch(url,{cache:"no-store",headers:{"accept":"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

function resolveRoster(rosters:any[],users:any[],identity:string){
  const id=identity.trim();
  if(!id)return null;
  let roster=rosters.find(r=>String(r.roster_id)===id)||rosters.find(r=>String(r.owner_id)===id);
  if(roster)return roster;
  const user=users.find(u=>[u.display_name,u.username,u.user_id].some(v=>String(v||"").toLowerCase()===id.toLowerCase()));
  if(user)roster=rosters.find(r=>String(r.owner_id)===String(user.user_id));
  return roster||null;
}

function rosterFormat(rosterPositions:any[]){
  const count=(value:string)=>rosterPositions.filter(x=>String(x).toUpperCase()===value).length;
  return {QB:count("QB"),RB:count("RB"),WR:count("WR"),TE:count("TE"),FLEX:count("FLEX"),SUPER:count("SUPER_FLEX")};
}

function startingLineup(players:any[],format:ReturnType<typeof rosterFormat>){
  const starters:any[]=[],rem=[...players].sort((a,b)=>Number(b.ktcValue||0)-Number(a.ktcValue||0));
  const fill=(n:number,test:(p:any)=>boolean,slot:string)=>{
    for(let i=0;i<n;i++){
      const idx=rem.findIndex(test);
      if(idx>=0){starters.push({...rem[idx],slotType:slot});rem.splice(idx,1)}
    }
  };
  fill(format.QB,p=>p.position==="QB","QB");
  fill(format.RB,p=>p.position==="RB","RB");
  fill(format.WR,p=>p.position==="WR","WR");
  fill(format.TE,p=>p.position==="TE","TE");
  fill(format.FLEX,p=>["RB","WR","TE"].includes(p.position),"Flex");
  fill(format.SUPER,p=>["QB","RB","WR","TE"].includes(p.position),"Super");
  return starters;
}

function ktcValue(match:KtcMatch|null,league:SleeperLeagueIntegration){
  if(!match)return null;
  return league.tePremium?match.player.tepValue:match.player.value;
}

async function refreshLeague(
  league:SleeperLeagueIntegration,
  playerDb:any,
  dataset:KtcDataset|null,
):Promise<RosterView>{
  const root="https://api.sleeper.app/v1/league/"+league.leagueId;
  const [leagueData,rosters,users]=await Promise.all([sleeperJson(root),sleeperJson(root+"/rosters"),sleeperJson(root+"/users")]);
  const mine=resolveRoster(rosters,users,league.teamIdentity||"");
  if(!mine)throw new Error("Could not identify your roster. Check My Team / Sleeper Username in Integrations.");

  const matcher=dataset?createKtcMatcher(dataset):null;
  const taxi=new Set((mine.taxi||[]).map(String)),reserve=new Set((mine.reserve||[]).map(String));
  const allIds=[...new Set([...(mine.players||[]),...(mine.taxi||[]),...(mine.reserve||[])].map(String))];
  const rawPlayers=allIds.map(id=>{
    const p=playerDb?.[id];
    if(!p||!["QB","RB","WR","TE"].includes(String(p.position||"")))return null;
    const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||p.full_name||id;
    const position=String(p.position);
    const match=matcher?matcher(name,position):null;
    const value=ktcValue(match,league);
    return {
      playerId:id,name,position,team:TEAM_NAMES[String(p.team||"")]||String(p.team||"FA"),
      age:p.age==null?"":String(p.age),ktcValue:value,
      ktcStatus:match?.method||"unmatched",
      rosterType:reserve.has(id)?"Reserve/IR":taxi.has(id)?"Taxi Squad":"Active Roster",
    };
  }).filter(Boolean) as any[];

  const fmt=rosterFormat(Array.isArray(leagueData?.roster_positions)?leagueData.roster_positions:[]);
  const starters=startingLineup(rawPlayers,fmt);
  const starterIds=new Set(starters.map(p=>p.playerId));
  const bench=rawPlayers.filter(p=>!starterIds.has(p.playerId)&&Number(p.ktcValue||0)>=2500);
  const startingCoverage:Item[]=[];
  for(const pos of ["QB","RB","WR","TE"]){
    const teams=[...new Set(starters.filter(p=>p.position===pos).map(p=>p.team).filter(Boolean))];
    if(teams.length)startingCoverage.push({slot:pos,name:teams.join(", "),team:""});
  }
  const benchTeams=[...new Set(bench.map(p=>p.team).filter(Boolean))];
  const bonus=parseFallback(league)?.bonus||[];
  const players:Player[]=rawPlayers.map(p=>({
    name:p.name,position:p.position,team:p.team,age:p.age,
    ktc:p.ktcValue==null?"N/A":String(p.ktcValue),ktcStatus:p.ktcStatus,
  }));
  const totalKtc=rawPlayers.reduce((sum,p)=>sum+(Number(p.ktcValue)||0),0);
  const ages=rawPlayers.map(p=>Number(p.age)).filter(Number.isFinite);

  return {
    key:league.key,label:league.name,league:String(leagueData?.name||league.name),leagueId:league.leagueId,
    updated:new Date().toLocaleString("en-US",{timeZone:"America/New_York"}),source:"Sleeper",
    ktcUpdatedAt:dataset?.fetchedAt||"",ktcSource:dataset?.source||"",
    players,totalKtc,avgAge:ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0,
    starters:starters.map(p=>({slot:p.slotType,name:p.name,team:p.team})),
    benchPlayers:bench.map(p=>({slot:p.position,name:p.name,team:p.team})),
    startingCoverage,
    benchCoverage:benchTeams.length?[{slot:"Bench",name:benchTeams.join(", "),team:""}]:[],
    bonus,
  };
}

async function readSnapshot(){
  const c=await ensureTursoSchema();
  const result=await c.execute({sql:"select value from settings where key=?",args:["dynasty_rosters_live"]});
  if(!result.rows.length)return null;
  try{return JSON.parse(String(result.rows[0]?.value||"null"))}catch{return null}
}

async function saveSnapshot(value:any){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:["dynasty_rosters_live",JSON.stringify(value),new Date().toISOString()],
  });
}

export async function GET(){
  try{
    const integrations=await getIntegrations();
    const enabled=integrations.sleeper.leagues.filter(l=>l.enabled!==false);
    const cached=await readSnapshot();
    if(cached?.rosters?.length){
      const byKey=new Map((cached.rosters as RosterView[]).map(r=>[r.key,r]));
      const rosters=enabled.map(l=>byKey.get(l.key)||parseFallback(l)).filter(Boolean);
      return Response.json({...cached,rosters});
    }
    return Response.json({rosters:enabled.map(parseFallback).filter(Boolean),errors:[],source:"Google Sheet snapshot"});
  }catch(e:any){
    return Response.json({error:"Could not load dynasty rosters",detail:e?.message},{status:500});
  }
}

export async function POST(){
  try{
    const integrations=await getIntegrations();
    const enabled=integrations.sleeper.leagues.filter(l=>l.enabled!==false);
    const previous=await readSnapshot();
    const previousByKey=new Map(((previous?.rosters||[]) as RosterView[]).map(r=>[r.key,r]));
    const [playerDb,dataset]=await Promise.all([
      sleeperJson("https://api.sleeper.app/v1/players/nfl"),
      loadKtcDataset(false).catch(()=>null),
    ]);

    const settled=await Promise.allSettled(enabled.map(l=>refreshLeague(l,playerDb,dataset)));
    const errors:string[]=[];
    const rosters:RosterView[]=[];
    settled.forEach((result,index)=>{
      const league=enabled[index];
      if(result.status==="fulfilled")rosters.push(result.value);
      else{
        errors.push(league.name+": "+String(result.reason?.message||result.reason||"Refresh failed"));
        const fallback=previousByKey.get(league.key)||parseFallback(league);
        if(fallback)rosters.push(fallback);
      }
    });

    const snapshot={
      rosters,errors,refreshedAt:new Date().toISOString(),
      ktcUpdatedAt:dataset?.fetchedAt||previous?.ktcUpdatedAt||"",
      source:"Sleeper",
    };
    await saveSnapshot(snapshot);
    return Response.json(snapshot,{status:errors.length===enabled.length?502:200});
  }catch(e:any){
    return Response.json({error:"Could not refresh rosters",detail:e?.message},{status:500});
  }
}
