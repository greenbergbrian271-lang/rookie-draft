import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,getKtcPickValue,getKtcPickYears,loadKtcDataset,type KtcDataset} from "@/lib/ktc";
import {buildLeagueStrengths,type LeagueStrengths,type StrengthPosition} from "@/lib/league-strengths";
import {readYearlyPower,upsertYearlyPower} from "@/lib/ktc-history";

export const INTEL_POSITIONS:StrengthPosition[]=["QB","RB","WR","TE"];
export const intelNorm=(value:any)=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
export const intelText=(value:any)=>String(value??"").trim();
export const intelNumber=(value:any)=>{const n=Number(value);return Number.isFinite(n)?n:0};

export async function sleeperJson(url:string){
  const res=await fetch(url,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

export function resolveIntelRoster(rosters:any[],users:any[],identity:string){
  const wanted=String(identity||"").trim().toLowerCase();
  if(!wanted)return null;
  let roster=rosters.find(r=>String(r.roster_id)===wanted)||rosters.find(r=>String(r.owner_id)===wanted);
  if(roster)return roster;
  const user=users.find(u=>[u.display_name,u.username,u.user_id,u?.metadata?.team_name].some(v=>String(v||"").toLowerCase()===wanted));
  return user?rosters.find(r=>String(r.owner_id)===String(user.user_id))||null:null;
}

export function intelOwnerName(user:any,roster?:any){
  return intelText(user?.metadata?.team_name)||intelText(user?.display_name)||intelText(user?.username)||("Roster "+String(roster?.roster_id||""));
}

function currentOwner(originalRosterId:number,round:number,season:number,traded:any[]){
  const matches=(traded||[]).filter((p:any)=>Number(p?.roster_id)===originalRosterId&&Number(p?.round)===round&&Number(p?.season)===season);
  return Number(matches[matches.length-1]?.owner_id||originalRosterId);
}

function percentile(rank:number,teams:number){return teams<=1?1:Math.max(0,Math.min(1,(teams-rank)/(teams-1)))}

function ageRisk(position:string,age:number){
  const warn:Record<string,number>={QB:32,RB:27,WR:29,TE:29},high:Record<string,number>={QB:35,RB:29,WR:31,TE:31};
  if(!Number.isFinite(age)||!age)return "Unknown";
  if(age>=high[position])return "High";
  if(age>=warn[position])return "Watch";
  return "Low";
}

function expectedAtPosition(rosterPositions:any[],position:string){
  const upper=(Array.isArray(rosterPositions)?rosterPositions:[]).map(x=>String(x).toUpperCase());
  const direct=upper.filter(x=>x===position).length;
  if(position==="QB")return Math.max(upper.includes("SUPER_FLEX")?2:1,direct);
  if(position==="RB")return Math.max(2,direct);
  if(position==="WR")return Math.max(3,direct);
  return Math.max(1,direct);
}

function startingIds(roster:any,players:any[],rosterPositions:any[]){
  const explicit=new Set((roster?.starters||[]).map(String).filter((id:string)=>id&&id!=="0"));
  if(explicit.size)return explicit;
  const remaining=[...players].sort((a,b)=>b.value-a.value),out=new Set<string>();
  const fill=(n:number,test:(p:any)=>boolean)=>{for(let i=0;i<n;i++){const idx=remaining.findIndex(test);if(idx>=0){out.add(remaining[idx].id);remaining.splice(idx,1)}}};
  fill(expectedAtPosition(rosterPositions,"QB"),p=>p.position==="QB");
  fill(expectedAtPosition(rosterPositions,"RB"),p=>p.position==="RB");
  fill(expectedAtPosition(rosterPositions,"WR"),p=>p.position==="WR");
  fill(expectedAtPosition(rosterPositions,"TE"),p=>p.position==="TE");
  fill((rosterPositions||[]).filter((x:any)=>String(x).toUpperCase()==="FLEX").length,p=>["RB","WR","TE"].includes(p.position));
  fill((rosterPositions||[]).filter((x:any)=>String(x).toUpperCase()==="SUPER_FLEX").length,p=>INTEL_POSITIONS.includes(p.position));
  return out;
}

function buildPickInventory(rosters:any[],traded:any[],dataset:KtcDataset,currentSeason:number,rounds:number){
  let years=getKtcPickYears(dataset).filter(y=>y>currentSeason).slice(0,3);
  if(!years.length)years=[currentSeason+1,currentSeason+2,currentSeason+3];
  const byOwner=new Map<number,any[]>();
  for(const roster of rosters)byOwner.set(Number(roster.roster_id),[]);
  for(const roster of rosters){
    const original=Number(roster.roster_id);
    for(const season of years)for(let round=1;round<=rounds;round++){
      const owner=currentOwner(original,round,season,traded),value=getKtcPickValue(dataset,season,round,"Mid")||0,list=byOwner.get(owner)||[];
      list.push({season,round,originalRosterId:original,value});byOwner.set(owner,list);
    }
  }
  return {years,byOwner};
}

export async function loadIntelBase(league:SleeperLeagueIntegration){
  const root="https://api.sleeper.app/v1/league/"+league.leagueId;
  const [leagueData,rostersRaw,usersRaw,tradedRaw,playerDb,dataset]=await Promise.all([
    sleeperJson(root),sleeperJson(root+"/rosters"),sleeperJson(root+"/users"),sleeperJson(root+"/traded_picks").catch(()=>[]),
    sleeperJson("https://api.sleeper.app/v1/players/nfl"),loadKtcDataset(false),
  ]);
  const rosters=Array.isArray(rostersRaw)?rostersRaw:[],users=Array.isArray(usersRaw)?usersRaw:[],traded=Array.isArray(tradedRaw)?tradedRaw:[];
  const strengths=buildLeagueStrengths({leagueData,rosters,users,playerDb,tradedPicks:traded,dataset,integration:league});
  return {leagueData,rosters,users,traded,playerDb,dataset,strengths};
}

export function valuedIntelPlayers(roster:any,playerDb:any,dataset:KtcDataset,league:SleeperLeagueIntegration){
  const matcher=createKtcMatcher(dataset),ids=[...new Set([...(roster?.players||[]),...(roster?.taxi||[]),...(roster?.reserve||[])].map(String))];
  return ids.map(id=>{
    const p=playerDb?.[id],position=String(p?.position||"").toUpperCase();
    if(!p||!INTEL_POSITIONS.includes(position as StrengthPosition))return null;
    const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||String(p.full_name||id),match=matcher(name,position);
    return {id,name,position,team:String(p.team||"FA"),age:intelNumber(p.age),value:match?(league.tePremium?match.player.tepValue:match.player.value):0};
  }).filter(Boolean) as any[];
}

export function demandMap(strengths:LeagueStrengths){
  return INTEL_POSITIONS.map(position=>{
    const buyers=[...strengths.rows].sort((a,b)=>b.positions[position].need-a.positions[position].need).slice(0,3).map(row=>({rosterId:row.rosterId,name:row.name,rank:row.positions[position].rank,need:row.positions[position].need,label:row.positions[position].label}));
    const sellers=[...strengths.rows].sort((a,b)=>a.positions[position].rank-b.positions[position].rank).slice(0,3).map(row=>({rosterId:row.rosterId,name:row.name,rank:row.positions[position].rank,need:row.positions[position].need,label:row.positions[position].label}));
    return {position,buyers,sellers};
  });
}

export function buildTeamIntel(base:Awaited<ReturnType<typeof loadIntelBase>>,league:SleeperLeagueIntegration){
  const {leagueData,rosters,users,traded,playerDb,dataset,strengths}=base,teams=Math.max(rosters.length,1),userById=new Map(users.map((u:any)=>[String(u.user_id),u]));
  const rounds=Math.max(intelNumber(leagueData?.settings?.draft_rounds),4),picks=buildPickInventory(rosters,traded,dataset,intelNumber(leagueData?.season)||new Date().getFullYear(),rounds),strengthByRoster=new Map(strengths.rows.map(row=>[row.rosterId,row]));
  const raw=rosters.map((roster:any)=>{
    const rosterId=Number(roster.roster_id),ps=valuedIntelPlayers(roster,playerDb,dataset,league),starters=startingIds(roster,ps,leagueData?.roster_positions||[]);
    const starterValue=ps.filter(p=>starters.has(p.id)).reduce((s,p)=>s+p.value,0),benchValue=ps.filter(p=>!starters.has(p.id)).reduce((s,p)=>s+p.value,0),totalPlayerValue=starterValue+benchValue;
    const ownedPicks=picks.byOwner.get(rosterId)||[],pickValue=ownedPicks.reduce((s:any,p:any)=>s+p.value,0),den=ps.reduce((s,p)=>s+p.value,0),avgAge=den?ps.reduce((s,p)=>s+p.age*p.value,0)/den:0;
    const ageByPosition=Object.fromEntries(INTEL_POSITIONS.map(pos=>{const group=ps.filter(p=>p.position===pos),d=group.reduce((s,p)=>s+p.value,0),age=d?group.reduce((s,p)=>s+p.age*p.value,0)/d:0;return [pos,{age,risk:ageRisk(pos,age)}]}));
    const top5=ps.map(p=>p.value).sort((a,b)=>b-a).slice(0,5).reduce((a,b)=>a+b,0),concentration=totalPlayerValue?top5/totalPlayerValue:0;
    return {rosterId,ownerId:String(roster.owner_id||""),name:intelOwnerName(userById.get(String(roster.owner_id)),roster),isMine:Boolean(strengthByRoster.get(rosterId)?.isMine),players:ps,starterValue,benchValue,totalPlayerValue,pickValue,avgAge,ageByPosition,concentration,picks:ownedPicks,strength:strengthByRoster.get(rosterId)};
  });
  const rankMap=(key:string)=>new Map([...raw].sort((a:any,b:any)=>b[key]-a[key]).map((x,i)=>[x.rosterId,i+1]));
  const starterRanks=rankMap("starterValue"),playerRanks=rankMap("totalPlayerValue"),pickRanks=rankMap("pickValue"),ages=raw.map(x=>x.avgAge).filter(Boolean),minAge=Math.min(...ages,24),maxAge=Math.max(...ages,30);
  const profiles=raw.map(row=>{
    const starterRank=starterRanks.get(row.rosterId)||teams,playerRank=playerRanks.get(row.rosterId)||teams,pickRank=pickRanks.get(row.rosterId)||teams;
    const starterStrength=percentile(starterRank,teams),playerStrength=percentile(playerRank,teams),pickStrength=percentile(pickRank,teams),maturity=maxAge===minAge?.5:Math.max(0,Math.min(1,(row.avgAge-minAge)/(maxAge-minAge)));
    const windowScore=Math.round(100*Math.max(0,Math.min(1,starterStrength*.52+playerStrength*.23+maturity*.15+(1-pickStrength)*.10)));
    const classification=starterRank<=Math.ceil(teams*.35)&&playerRank<=Math.ceil(teams*.5)?"Contender":starterRank>Math.ceil(teams*.60)&&pickRank<=Math.ceil(teams*.45)?"Rebuilder":"Stuck in the Middle";
    const construction=row.benchValue>row.starterValue*.72&&row.concentration<.52?"Consolidate":row.benchValue<row.starterValue*.32||row.concentration>.68?"Add Depth":"Balanced";
    const powerScore=Math.round(100*(starterStrength*.45+playerStrength*.35+pickStrength*.12+(1-Math.min(1,Math.max(0,(row.avgAge-24)/10)))*.08));
    return {...row,starterRank,playerRank,pickRank,windowScore,classification,construction,powerScore};
  });
  const powerRanks=new Map([...profiles].sort((a,b)=>b.powerScore-a.powerScore).map((x,i)=>[x.rosterId,i+1]));
  return profiles.map(x=>({...x,powerRank:powerRanks.get(x.rosterId)||teams}));
}

export function deadlineOpportunities(profiles:any[]){
  const contenders=profiles.filter(p=>p.classification==="Contender"),sellers=profiles.filter(p=>p.classification==="Rebuilder"),out:any[]=[];
  for(const buyer of contenders){
    const needs=INTEL_POSITIONS.map(pos=>({pos,cell:buyer.strength?.positions?.[pos]})).filter(x=>x.cell).sort((a,b)=>b.cell.need-a.cell.need).slice(0,2);
    for(const need of needs)for(const seller of sellers){
      const candidates=seller.players.filter((p:any)=>p.position===need.pos&&p.value>=1800).sort((a:any,b:any)=>b.value-a.value).slice(0,3);
      if(candidates.length)out.push({buyer:{rosterId:buyer.rosterId,name:buyer.name},seller:{rosterId:seller.rosterId,name:seller.name},position:need.pos,buyerRank:need.cell.rank,candidates:candidates.map((p:any)=>({name:p.name,value:p.value,age:p.age}))});
    }
  }
  return out.slice(0,12);
}

export async function leagueIntelMode(league:SleeperLeagueIntegration){
  const base=await loadIntelBase(league),profiles=buildTeamIntel(base,league),season=Number(base.leagueData?.season)||new Date().getFullYear();
  await upsertYearlyPower(profiles.map(p=>({leagueKey:league.key,season,rosterId:p.rosterId,teamName:p.name,rank:p.powerRank,score:p.powerScore,classification:p.classification,starterValue:p.starterValue,benchValue:p.benchValue,pickValue:p.pickValue,avgAge:p.avgAge}))).catch(()=>{});
  const yearly=await readYearlyPower(league.key).catch(()=>[]);
  return {
    league:{key:league.key,name:String(base.leagueData?.name||league.name),season},
    strengths:base.strengths,demand:demandMap(base.strengths),
    teams:profiles.map(p=>({rosterId:p.rosterId,name:p.name,isMine:p.isMine,starterValue:p.starterValue,benchValue:p.benchValue,totalPlayerValue:p.totalPlayerValue,pickValue:p.pickValue,starterRank:p.starterRank,playerRank:p.playerRank,pickRank:p.pickRank,powerRank:p.powerRank,powerScore:p.powerScore,avgAge:p.avgAge,ageByPosition:p.ageByPosition,windowScore:p.windowScore,classification:p.classification,construction:p.construction,concentration:p.concentration,pickByYear:Object.entries(p.picks.reduce((acc:any,pick:any)=>{acc[pick.season]=(acc[pick.season]||0)+pick.value;return acc},{})).map(([y,v])=>({season:Number(y),value:Number(v)}))})),
    deadline:deadlineOpportunities(profiles),yearlyPower:yearly,
  };
}

export async function getIntelLeague(leagueKey:string){
  const config=await getIntegrations();
  return config.sleeper.leagues.find(l=>l.key===leagueKey&&l.enabled!==false)||null;
}
