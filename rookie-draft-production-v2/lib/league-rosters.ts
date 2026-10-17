import {type SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,getKtcPickValue,getKtcPickYears,loadKtcDataset} from "@/lib/ktc";

/**
 * Read-only view of every OTHER roster in a league (players, picks, handcuff eligibility).
 * Display/intelligence only: nothing here is read by Draft Day, the Final Draft Board or grade formulas.
 */

export type LeagueRosterPlayer={
  name:string;position:string;team:string;age:string;ktc:string;ktcStatus:string;
  status:"Roster"|"Taxi"|"IR / Reserve";
  handcuff:"Starter"|"Bench"|"";
};
export type LeagueRosterPick={id:string;name:string;detail:string;value:number|null};
export type HandcuffItem={slot:string;name:string;team:string};
export type LeagueRosterTeam={
  rosterId:number;name:string;players:LeagueRosterPlayer[];picks:LeagueRosterPick[];
  totalKtc:number;pickValue:number;avgAge:number;
  starters:HandcuffItem[];benchPlayers:HandcuffItem[];startingCoverage:HandcuffItem[];benchCoverage:HandcuffItem[];bonus:HandcuffItem[];
};

// Same threshold the Dynasty Rosters refresh uses for "Bench Players to Handcuff"
export const BENCH_MIN_KTC=2500;

const TEAM_NAMES:Record<string,string>={
  ARI:"Cardinals",ATL:"Falcons",BAL:"Ravens",BUF:"Bills",CAR:"Panthers",CHI:"Bears",CIN:"Bengals",CLE:"Browns",
  DEN:"Broncos",DET:"Lions",GB:"Packers",HOU:"Texans",IND:"Colts",JAX:"Jaguars",KC:"Chiefs",LAC:"Chargers",
  LAR:"Rams",LV:"Raiders",MIA:"Dolphins",MIN:"Vikings",NE:"Patriots",NO:"Saints",NYG:"Giants",NYJ:"Jets",
  PHI:"Eagles",PIT:"Steelers",SEA:"Seahawks",SF:"49ers",TB:"Bucs",TEN:"Titans",WAS:"Commanders",DAL:"Cowboys",
};

async function sleeperJson(url:string,cacheDay=false){
  const res=await fetch(url,cacheDay?{headers:{accept:"application/json"},next:{revalidate:86400}}:{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

function resolveRoster(rosters:any[],users:any[],identity:string){
  const id=String(identity||"").trim();
  if(!id)return null;
  let roster=rosters.find(r=>String(r.roster_id)===id)||rosters.find(r=>String(r.owner_id)===id);
  if(roster)return roster;
  const user=users.find(u=>[u.display_name,u.username,u.user_id].some(v=>String(v||"").toLowerCase()===id.toLowerCase()));
  if(user)roster=rosters.find(r=>String(r.owner_id)===String(user.user_id));
  return roster||null;
}

function teamName(roster:any,users:any[]){
  const owner=users.find(u=>String(u.user_id)===String(roster?.owner_id));
  return String(owner?.metadata?.team_name||owner?.display_name||owner?.username||("Roster "+roster?.roster_id));
}

function rosterFormat(rp:any[]){
  const count=(v:string)=>rp.filter(x=>String(x).toUpperCase()===v).length;
  return {QB:count("QB"),RB:count("RB"),WR:count("WR"),TE:count("TE"),FLEX:count("FLEX"),SUPER:count("SUPER_FLEX")};
}

// Identical lineup logic to /api/dynasty-rosters (best KTC value fills each slot)
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

function pickSuffix(r:number){return r===1?"1st":r===2?"2nd":r===3?"3rd":r+"th"}

export async function buildLeagueRosters(league:SleeperLeagueIntegration){
  const root="https://api.sleeper.app/v1/league/"+league.leagueId;
  const [leagueData,rostersRaw,usersRaw,tradedRaw,playerDb,dataset]=await Promise.all([
    sleeperJson(root),sleeperJson(root+"/rosters"),sleeperJson(root+"/users"),
    sleeperJson(root+"/traded_picks").catch(()=>[]),
    sleeperJson("https://api.sleeper.app/v1/players/nfl",true),
    loadKtcDataset(false),
  ]);
  const rosters:any[]=Array.isArray(rostersRaw)?rostersRaw:[];
  const users:any[]=Array.isArray(usersRaw)?usersRaw:[];
  const traded:any[]=Array.isArray(tradedRaw)?tradedRaw:[];
  const mine=resolveRoster(rosters,users,league.teamIdentity||"");
  if(!mine)throw new Error("Could not identify your roster for this league. Check My Team / Sleeper Username in Integrations.");
  const myRosterId=Number(mine.roster_id);

  const matcher=createKtcMatcher(dataset);
  const fmt=rosterFormat(Array.isArray(leagueData?.roster_positions)?leagueData.roster_positions:[]);

  // Pick ownership (same method as the trade calculator)
  const currentSeason=Number(leagueData?.season)||new Date().getFullYear();
  let years=getKtcPickYears(dataset).filter(y=>y>currentSeason);
  if(!years.length)years=[currentSeason+1,currentSeason+2,currentSeason+3];
  years=years.slice(0,3);
  const tradedMax=Math.max(0,...traded.filter(p=>years.includes(Number(p.season))).map(p=>Number(p.round)||0));
  const rounds=Math.max(Number(leagueData?.settings?.draft_rounds)||0,tradedMax,4);
  const ownership=new Map<string,number>();
  for(const r of rosters)for(const season of years)for(let round=1;round<=rounds;round++)ownership.set(`${season}:${round}:${Number(r.roster_id)}`,Number(r.roster_id));
  for(const p of traded){
    const key=`${Number(p.season)}:${Number(p.round)}:${Number(p.roster_id)}`;
    if(ownership.has(key))ownership.set(key,Number(p.owner_id));
  }
  const rosterById=new Map(rosters.map(r=>[Number(r.roster_id),r]));

  const teams:LeagueRosterTeam[]=rosters.filter(r=>Number(r.roster_id)!==myRosterId).map(r=>{
    const rosterId=Number(r.roster_id);
    const taxi=new Set((r.taxi||[]).map(String)),reserve=new Set((r.reserve||[]).map(String));
    const ids=[...new Set([...(r.players||[]),...(r.taxi||[]),...(r.reserve||[])].map(String))];
    const raw=ids.map(id=>{
      const p=playerDb?.[id];
      if(!p||!["QB","RB","WR","TE"].includes(String(p.position||"")))return null;
      const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||p.full_name||id;
      const position=String(p.position);
      const match=matcher(name,position);
      const ktcValue=match?(league.tePremium?match.player.tepValue:match.player.value):null;
      return {
        playerId:id,name,position,team:TEAM_NAMES[String(p.team||"")]||String(p.team||"FA"),
        age:p.age==null?"":String(p.age),rookie:p.years_exp===0,ktcValue,ktcStatus:match?.method||"unmatched",
        status:(reserve.has(id)?"IR / Reserve":taxi.has(id)?"Taxi":"Roster") as LeagueRosterPlayer["status"],
      };
    }).filter(Boolean) as any[];

    const starters=startingLineup(raw,fmt);
    const starterIds=new Set(starters.map(p=>p.playerId));
    const bench=raw.filter(p=>!starterIds.has(p.playerId)&&Number(p.ktcValue||0)>=BENCH_MIN_KTC);
    const benchIds=new Set(bench.map(p=>p.playerId));

    const startingCoverage:HandcuffItem[]=[];
    for(const pos of ["QB","RB","WR","TE"]){
      const nfl=[...new Set(starters.filter(p=>p.position===pos).map(p=>p.team).filter(Boolean))];
      if(nfl.length)startingCoverage.push({slot:pos,name:nfl.join(", "),team:""});
    }
    const benchTeams=[...new Set(bench.map(p=>p.team).filter(Boolean))];

    // Bonus = rookies (Sleeper years_exp 0) on this roster, best KTC first. Display only.
    const bonus:HandcuffItem[]=raw.filter(p=>p.rookie)
      .sort((a,b)=>Number(b.ktcValue||0)-Number(a.ktcValue||0)||a.name.localeCompare(b.name)).map(p=>({slot:p.position,name:p.name,team:p.team}));

    const players:LeagueRosterPlayer[]=raw.map(p=>({
      name:p.name,position:p.position,team:p.team,age:p.age,
      ktc:p.ktcValue==null?"N/A":String(p.ktcValue),ktcStatus:p.ktcStatus,status:p.status,
      handcuff:(starterIds.has(p.playerId)?"Starter":benchIds.has(p.playerId)?"Bench":"") as LeagueRosterPlayer["handcuff"],
    })).sort((a,b)=>(Number(b.ktc)||-1)-(Number(a.ktc)||-1)||a.name.localeCompare(b.name));

    const picks:LeagueRosterPick[]=[];
    for(const [key,owner] of ownership){
      if(owner!==rosterId)continue;
      const [s,rd,orig]=key.split(":").map(Number);
      const originalRoster=rosterById.get(orig);
      picks.push({
        id:`pick:${s}:${rd}:${orig}`,name:`${s} ${pickSuffix(rd)}`,
        detail:orig===rosterId?"Own pick":"From "+(originalRoster?teamName(originalRoster,users):"Roster "+orig),
        value:getKtcPickValue(dataset,s,rd,"Mid"),
      });
    }
    picks.sort((a,b)=>Number(a.name.slice(0,4))-Number(b.name.slice(0,4))||Number(a.id.split(":")[2])-Number(b.id.split(":")[2])||a.id.localeCompare(b.id));

    const ages=players.map(p=>Number(p.age)).filter(Number.isFinite);
    return {
      rosterId,name:teamName(r,users),players,picks,
      totalKtc:players.reduce((s,p)=>s+(Number(p.ktc)||0),0),
      pickValue:picks.reduce((s,p)=>s+(Number(p.value)||0),0),
      avgAge:ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0,
      starters:starters.map(p=>({slot:p.slotType,name:p.name,team:p.team})),
      benchPlayers:bench.map(p=>({slot:p.position,name:p.name,team:p.team})),
      startingCoverage,
      benchCoverage:benchTeams.length?[{slot:"Bench",name:benchTeams.join(", "),team:""}]:[],
      bonus,
    };
  }).sort((a,b)=>b.totalKtc-a.totalKtc);

  return {
    league:{key:league.key,name:String(leagueData?.name||league.name)},
    ktcUpdatedAt:dataset.fetchedAt||"",pickNote:"Future picks use KTC's Mid-round value until a draft slot is known.",
    teams,
  };
}
