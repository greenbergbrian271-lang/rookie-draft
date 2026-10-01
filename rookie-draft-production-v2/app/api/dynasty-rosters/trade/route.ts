import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,getKtcPickValue,getKtcPickYears,loadKtcDataset} from "@/lib/ktc";

type TradeAsset={
  id:string;
  type:"player"|"pick";
  name:string;
  detail:string;
  value:number|null;
  valueLabel?:string;
  position?:string;
  team?:string;
  status?:string;
};

const TEAM_NAMES:Record<string,string>={
  ARI:"Cardinals",ATL:"Falcons",BAL:"Ravens",BUF:"Bills",CAR:"Panthers",CHI:"Bears",CIN:"Bengals",CLE:"Browns",
  DEN:"Broncos",DET:"Lions",GB:"Packers",HOU:"Texans",IND:"Colts",JAX:"Jaguars",KC:"Chiefs",LAC:"Chargers",
  LAR:"Rams",LV:"Raiders",MIA:"Dolphins",MIN:"Vikings",NE:"Patriots",NO:"Saints",NYG:"Giants",NYJ:"Jets",
  PHI:"Eagles",PIT:"Steelers",SEA:"Seahawks",SF:"49ers",TB:"Bucs",TEN:"Titans",WAS:"Commanders",DAL:"Cowboys",
};

async function sleeperJson(url:string,playerCache=false){
  const options:any=playerCache
    ? {headers:{accept:"application/json"},next:{revalidate:86400}}
    : {cache:"no-store",headers:{accept:"application/json"}};
  const res=await fetch(url,options);
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

function valueFor(match:any,league:SleeperLeagueIntegration){
  if(!match)return null;
  return league.tePremium?match.player.tepValue:match.player.value;
}

function pickSuffix(round:number){
  if(round===1)return "1st";
  if(round===2)return "2nd";
  if(round===3)return "3rd";
  return round+"th";
}

function buildPicks({
  rosters,tradedPicks,years,rounds,ownerRosterId,dataset,users,
}:{
  rosters:any[];tradedPicks:any[];years:number[];rounds:number;ownerRosterId:number;dataset:any;users:any[];
}):TradeAsset[]{
  const ownership=new Map<string,number>();
  for(const roster of rosters){
    const original=Number(roster.roster_id);
    for(const season of years){
      for(let round=1;round<=rounds;round++)ownership.set(`${season}:${round}:${original}`,original);
    }
  }

  for(const pick of tradedPicks||[]){
    const season=Number(pick.season),round=Number(pick.round),original=Number(pick.roster_id),owner=Number(pick.owner_id);
    const key=`${season}:${round}:${original}`;
    if(ownership.has(key))ownership.set(key,owner);
  }

  const rosterById=new Map(rosters.map(r=>[Number(r.roster_id),r]));
  const out:TradeAsset[]=[];
  for(const [key,owner] of ownership){
    if(owner!==ownerRosterId)continue;
    const [seasonS,roundS,originalS]=key.split(":");
    const season=Number(seasonS),round=Number(roundS),original=Number(originalS);
    const originalRoster=rosterById.get(original);
    const originalName=originalRoster?teamName(originalRoster,users):("Roster "+original);
    const own=original===ownerRosterId;
    out.push({
      id:`pick:${season}:${round}:${original}`,
      type:"pick",
      name:`${season} ${pickSuffix(round)}`,
      detail:own?"Own pick":`From ${originalName}`,
      value:getKtcPickValue(dataset,season,round,"Mid"),
      valueLabel:"KTC mid-pick estimate",
    });
  }
  return out.sort((a,b)=>{
    const ay=Number(a.name.slice(0,4)),by=Number(b.name.slice(0,4));
    if(ay!==by)return ay-by;
    const ar=Number(a.id.split(":")[2]),br=Number(b.id.split(":")[2]);
    return ar-br;
  });
}

function buildPlayers(roster:any,playerDb:any,matcher:any,league:SleeperLeagueIntegration):TradeAsset[]{
  const taxi=new Set((roster?.taxi||[]).map(String));
  const reserve=new Set((roster?.reserve||[]).map(String));
  const ids=[...new Set([...(roster?.players||[]),...(roster?.taxi||[]),...(roster?.reserve||[])].map(String))];
  const assets:TradeAsset[]=[];
  for(const id of ids){
    const p=playerDb?.[id];
    const position=String(p?.position||"");
    if(!p||!["QB","RB","WR","TE"].includes(position))continue;
    const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||p.full_name||id;
    const match=matcher(name,position);
    const value=valueFor(match,league);
    const status=reserve.has(id)?"IR / Reserve":taxi.has(id)?"Taxi":"Roster";
    const team=TEAM_NAMES[String(p.team||"")]||String(p.team||"FA");
    assets.push({
      id:"player:"+id,type:"player",name,
      detail:`${position} · ${team}${status==="Roster"?"":" · "+status}`,
      value,position,team,status,
    });
  }
  return assets.sort((a,b)=>(b.value??-1)-(a.value??-1)||a.name.localeCompare(b.name));
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const leagueKey=String(url.searchParams.get("leagueKey")||"");
    const partnerRosterIdRaw=url.searchParams.get("partnerRosterId");
    const mineAssetsOnly=url.searchParams.get("mineAssets")==="1";
    const allAssets=url.searchParams.get("allAssets")==="1";

    const integrations=await getIntegrations();
    const league=integrations.sleeper.leagues.find(l=>l.key===leagueKey&&l.enabled!==false);
    if(!league)return Response.json({error:"League integration not found"},{status:404});

    const root="https://api.sleeper.app/v1/league/"+league.leagueId;
    const [leagueData,rostersRaw,usersRaw]=await Promise.all([
      sleeperJson(root),sleeperJson(root+"/rosters"),sleeperJson(root+"/users"),
    ]);
    const rosters:any[]=Array.isArray(rostersRaw)?rostersRaw:[];
    const users:any[]=Array.isArray(usersRaw)?usersRaw:[];
    const mine=resolveRoster(rosters,users,league.teamIdentity||"");
    if(!mine)return Response.json({error:"Could not identify your roster for this league"},{status:409});
    const myRosterId=Number(mine.roster_id);

    const teams=rosters
      .filter(r=>Number(r.roster_id)!==myRosterId)
      .map(r=>({rosterId:Number(r.roster_id),name:teamName(r,users)}))
      .sort((a,b)=>a.name.localeCompare(b.name));

    if(!partnerRosterIdRaw&&!mineAssetsOnly&&!allAssets){
      return Response.json({
        league:{key:league.key,name:String(leagueData?.name||league.name),leagueId:league.leagueId},
        myTeam:{rosterId:myRosterId,name:teamName(mine,users)},
        teams,
      });
    }

    const partnerRosterId=partnerRosterIdRaw?Number(partnerRosterIdRaw):0;
    const partner=partnerRosterId?rosters.find(r=>Number(r.roster_id)===partnerRosterId):null;
    if(partnerRosterId&&(!partner||partnerRosterId===myRosterId))return Response.json({error:"Trade partner not found"},{status:404});

    const [playerDb,tradedPicks,dataset]=await Promise.all([
      sleeperJson("https://api.sleeper.app/v1/players/nfl",true),
      sleeperJson(root+"/traded_picks"),
      loadKtcDataset(false),
    ]);
    const matcher=createKtcMatcher(dataset);
    const currentSeason=Number(leagueData?.season)||new Date().getFullYear();
    let years=getKtcPickYears(dataset).filter(y=>y>currentSeason);
    if(!years.length)years=[currentSeason+1,currentSeason+2,currentSeason+3];
    years=years.slice(0,3);

    const tradedMax=Math.max(0,...(tradedPicks||[]).filter((p:any)=>years.includes(Number(p.season))).map((p:any)=>Number(p.round)||0));
    const rounds=Math.max(Number(leagueData?.settings?.draft_rounds)||0,tradedMax,4);

    const myAssets={
      players:buildPlayers(mine,playerDb,matcher,league),
      picks:buildPicks({rosters,tradedPicks,years,rounds,ownerRosterId:myRosterId,dataset,users}),
    };
    const base={
      league:{key:league.key,name:String(leagueData?.name||league.name),leagueId:league.leagueId},
      myTeam:{rosterId:myRosterId,name:teamName(mine,users),assets:myAssets},
      teams,
      ktcUpdatedAt:dataset.fetchedAt,
      pickValueNote:"Future picks use KTC's Mid-round value until an actual draft slot is known.",
    };

    if(mineAssetsOnly&&!allAssets&&!partnerRosterId){
      return Response.json(base);
    }

    if(allAssets){
      const leagueTeams=rosters
        .filter(r=>Number(r.roster_id)!==myRosterId)
        .map(r=>{
          const rosterId=Number(r.roster_id);
          return {
            rosterId,
            name:teamName(r,users),
            assets:{
              players:buildPlayers(r,playerDb,matcher,league),
              picks:buildPicks({rosters,tradedPicks,years,rounds,ownerRosterId:rosterId,dataset,users}),
            },
          };
        })
        .sort((a,b)=>a.name.localeCompare(b.name));
      return Response.json({...base,leagueTeams});
    }

    const partnerAssets={
      players:buildPlayers(partner,playerDb,matcher,league),
      picks:buildPicks({rosters,tradedPicks,years,rounds,ownerRosterId:partnerRosterId,dataset,users}),
    };

    return Response.json({
      ...base,
      partnerTeam:{rosterId:partnerRosterId,name:teamName(partner,users),assets:partnerAssets},
    });
  }catch(e:any){
    return Response.json({error:"Could not load trade calculator assets",detail:e?.message},{status:500});
  }
}
