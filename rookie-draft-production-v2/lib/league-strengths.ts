import {createKtcMatcher,getKtcPickValue,getKtcPickYears,type KtcDataset} from "@/lib/ktc";
import type {SleeperLeagueIntegration} from "@/lib/integrations";

export type StrengthPosition="QB"|"RB"|"WR"|"TE";
export const STRENGTH_POSITIONS:StrengthPosition[]=["QB","RB","WR","TE"];

export type LeagueStrengthCell={
  value:number;
  rank:number;
  strength:number;
  need:number;
  label:"Priority"|"Need"|"Depth"|"Strength";
  depth:number;
  matched:number;
};

export type LeagueStrengthRow={
  rosterId:number;
  ownerId:string;
  name:string;
  isMine:boolean;
  overall:{value:number;rank:number};
  picks:{value:number;rank:number};
  positions:Record<StrengthPosition,LeagueStrengthCell>;
  matchedPlayers:number;
  unmatchedPlayers:number;
};

export type LeagueStrengths={
  teams:number;
  season:number;
  rounds:number;
  years:number[];
  ktcUpdatedAt:string;
  rows:LeagueStrengthRow[];
};

const norm=(value:any)=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const text=(value:any)=>String(value??"").trim();

function ownerName(user:any,roster:any){
  return text(user?.metadata?.team_name)||text(user?.display_name)||text(user?.username)||("Roster "+String(roster?.roster_id||""));
}

function isMine(user:any,roster:any,identity:string){
  const wanted=norm(identity);
  if(!wanted)return false;
  return [roster?.roster_id,roster?.owner_id,user?.user_id,user?.display_name,user?.username,user?.metadata?.team_name]
    .some(value=>norm(value)===wanted);
}

function expectedAtPosition(rosterPositions:any[],position:StrengthPosition){
  const upper=(Array.isArray(rosterPositions)?rosterPositions:[]).map(x=>String(x).toUpperCase());
  const direct=upper.filter(x=>x===position).length;
  const superflex=upper.includes("SUPER_FLEX");
  if(position==="QB")return Math.max(superflex?2:1,direct);
  if(position==="RB")return Math.max(2,direct);
  if(position==="WR")return Math.max(3,direct);
  return Math.max(1,direct);
}

function weightedPositionValue(values:number[],core:number){
  const sorted=[...values].filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>b-a);
  return Math.round(sorted.reduce((sum,value,index)=>{
    const weight=index<core?1:index<core+2?0.55:index<core+4?0.30:0.12;
    return sum+value*weight;
  },0));
}

function currentPickOwner(originalRosterId:number,round:number,season:number,traded:any[]){
  const matches=(traded||[]).filter((p:any)=>
    Number(p?.roster_id)===originalRosterId&&
    Number(p?.round)===round&&
    Number(p?.season)===season
  );
  return Number(matches[matches.length-1]?.owner_id||originalRosterId);
}

function rankMap<T>(rows:T[],getValue:(row:T)=>number,getId:(row:T)=>number){
  const sorted=[...rows].sort((a,b)=>getValue(b)-getValue(a)||getId(a)-getId(b));
  const out=new Map<number,number>();
  sorted.forEach((row,index)=>out.set(getId(row),index+1));
  return out;
}

function needLabel(need:number):LeagueStrengthCell["label"]{
  if(need>=.72)return "Priority";
  if(need>=.50)return "Need";
  if(need>=.30)return "Depth";
  return "Strength";
}

export function buildLeagueStrengths({
  leagueData,rosters,users,playerDb,tradedPicks,dataset,integration,
}:{
  leagueData:any;
  rosters:any[];
  users:any[];
  playerDb:any;
  tradedPicks:any[];
  dataset:KtcDataset;
  integration:SleeperLeagueIntegration;
}):LeagueStrengths{
  const matcher=createKtcMatcher(dataset);
  const userById=new Map((users||[]).map((u:any)=>[String(u.user_id),u]));
  const rosterPositions=Array.isArray(leagueData?.roster_positions)?leagueData.roster_positions:[];
  const currentSeason=Number(leagueData?.season)||new Date().getFullYear();
  let years=getKtcPickYears(dataset).filter(year=>year>currentSeason).slice(0,3);
  if(!years.length)years=[currentSeason+1,currentSeason+2,currentSeason+3];

  const tradedMax=Math.max(0,...(tradedPicks||[]).filter((p:any)=>years.includes(Number(p?.season))).map((p:any)=>Number(p?.round)||0));
  const rounds=Math.max(Number(leagueData?.settings?.draft_rounds)||0,tradedMax,4);

  const pickValueByRoster=new Map<number,number>();
  for(const roster of rosters||[])pickValueByRoster.set(Number(roster.roster_id),0);
  for(const roster of rosters||[]){
    const original=Number(roster.roster_id);
    for(const season of years){
      for(let round=1;round<=rounds;round++){
        const owner=currentPickOwner(original,round,season,tradedPicks||[]);
        const value=getKtcPickValue(dataset,season,round,"Mid");
        if(value!=null)pickValueByRoster.set(owner,(pickValueByRoster.get(owner)||0)+value);
      }
    }
  }

  const base=(rosters||[]).map((roster:any)=>{
    const rosterId=Number(roster.roster_id);
    const user=userById.get(String(roster.owner_id));
    const ids=[...new Set([...(roster.players||[]),...(roster.taxi||[]),...(roster.reserve||[])].map(String))];
    const valuesByPos={QB:[],RB:[],WR:[],TE:[]} as Record<StrengthPosition,number[]>;
    let rawPlayerValue=0,matchedPlayers=0,unmatchedPlayers=0;

    for(const id of ids){
      const player=playerDb?.[id];
      const position=String(player?.position||"").toUpperCase() as StrengthPosition;
      if(!player||!STRENGTH_POSITIONS.includes(position))continue;
      const name=((player.first_name||"")+" "+(player.last_name||"")).trim()||String(player.full_name||id);
      const match=matcher(name,position);
      const value=match?(integration.tePremium?match.player.tepValue:match.player.value):null;
      if(value==null){unmatchedPlayers++;continue}
      matchedPlayers++;
      rawPlayerValue+=value;
      valuesByPos[position].push(value);
    }

    const positionRaw={} as Record<StrengthPosition,{value:number;depth:number;matched:number}>;
    for(const position of STRENGTH_POSITIONS){
      positionRaw[position]={
        value:weightedPositionValue(valuesByPos[position],expectedAtPosition(rosterPositions,position)),
        depth:valuesByPos[position].length,
        matched:valuesByPos[position].length,
      };
    }
    const pickValue=pickValueByRoster.get(rosterId)||0;
    return {
      rosterId,
      ownerId:String(roster.owner_id||""),
      name:ownerName(user,roster),
      isMine:isMine(user,roster,String(integration.teamIdentity||"")),
      rawPlayerValue,
      pickValue,
      overallValue:rawPlayerValue+pickValue,
      positionRaw,
      matchedPlayers,
      unmatchedPlayers,
    };
  });

  const overallRanks=rankMap(base,row=>row.overallValue,row=>row.rosterId);
  const pickRanks=rankMap(base,row=>row.pickValue,row=>row.rosterId);
  const positionRanks={} as Record<StrengthPosition,Map<number,number>>;
  for(const position of STRENGTH_POSITIONS){
    positionRanks[position]=rankMap(base,row=>row.positionRaw[position].value,row=>row.rosterId);
  }

  const teams=Math.max(base.length,1);
  const rows:LeagueStrengthRow[]=base.map(row=>{
    const positions={} as Record<StrengthPosition,LeagueStrengthCell>;
    for(const position of STRENGTH_POSITIONS){
      const rank=positionRanks[position].get(row.rosterId)||teams;
      const need=teams<=1?0:(rank-1)/(teams-1);
      positions[position]={
        value:row.positionRaw[position].value,
        rank,
        strength:1-need,
        need,
        label:needLabel(need),
        depth:row.positionRaw[position].depth,
        matched:row.positionRaw[position].matched,
      };
    }
    return {
      rosterId:row.rosterId,
      ownerId:row.ownerId,
      name:row.name,
      isMine:row.isMine,
      overall:{value:row.overallValue,rank:overallRanks.get(row.rosterId)||teams},
      picks:{value:row.pickValue,rank:pickRanks.get(row.rosterId)||teams},
      positions,
      matchedPlayers:row.matchedPlayers,
      unmatchedPlayers:row.unmatchedPlayers,
    };
  }).sort((a,b)=>a.overall.rank-b.overall.rank||a.name.localeCompare(b.name));

  return {teams:base.length,season:currentSeason,rounds,years,ktcUpdatedAt:dataset.fetchedAt,rows};
}
