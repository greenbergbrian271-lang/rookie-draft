
export type MockPosition="QB"|"RB"|"WR"|"TE";

export type MockCandidate={
  id:string;
  name:string;
  position:MockPosition;
  college:string;
  rank:number;
  positionRank:number|null;
  tier:number|null;
  grade:number|null;
  headshotUrl?:string|null;
};

export type MockNeed={
  position:MockPosition;
  strength:number;
  need:number;
  label:"Priority"|"Need"|"Depth"|"Strength";
  depth:number;
  rank:number;
};

export type MockTeam={
  rosterId:number;
  ownerId:string;
  ownerKey:string;
  name:string;
  isMine:boolean;
  needs:Record<MockPosition,MockNeed>;
};

export type MockSlot={
  pickNo:number;
  round:number;
  slot:number;
  rosterId:number;
  team:string;
  isMine:boolean;
  livePlayerId:string|null;
  livePlayer:string|null;
  livePosition:string|null;
};

export type MockTendency={
  ownerKey:string;
  ownerName:string;
  sampleSize:number;
  avgRankDelta:number|null;
  positionShare:Record<MockPosition,number>;
};

export type MockLeagueRoom={
  league:{
    key:string;
    name:string;
    leagueId:string;
    teams:number;
    rounds:number;
    draftId:string|null;
    draftStatus:string;
    draftClass:number;
    superflex:boolean;
    tePremium:boolean;
  };
  slots:MockSlot[];
  teams:MockTeam[];
  candidates:MockCandidate[];
  tendencies:MockTendency[];
  historySummary:{samples:number;managers:number;trained:boolean};
};

export type SimulatedPick={
  pickNo:number;
  rosterId:number;
  team:string;
  candidate:MockCandidate;
  byUser:boolean;
  rationale:string;
};

export const MOCK_POSITIONS:MockPosition[]=["QB","RB","WR","TE"];

function clamp(value:number,min=0,max=1){return Math.min(max,Math.max(min,value))}

function stableNoise(input:string){
  let h=2166136261;
  for(let i=0;i<input.length;i++){
    h^=input.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return ((h>>>0)%1000)/1000;
}

export function tendencyFor(team:MockTeam,tendencies:MockTendency[]){
  return tendencies.find(t=>t.ownerKey===team.ownerKey)||null;
}

export function adjustedNeed(team:MockTeam,position:MockPosition,drafted:Partial<Record<MockPosition,number>>){
  const base=team.needs[position]?.need??0.5;
  const already=drafted[position]||0;
  return clamp(base-(already*0.17),0.04,1);
}

export function scoreCandidate(
  candidate:MockCandidate,
  team:MockTeam,
  pickNo:number,
  tendency:MockTendency|null,
  drafted:Partial<Record<MockPosition,number>>,
  options:{superflex:boolean;tePremium:boolean},
){
  const boardValue=112-Math.min(candidate.rank,100)*1.08;
  let need=adjustedNeed(team,candidate.position,drafted);
  if(options.superflex&&candidate.position==="QB")need=clamp(need+0.08);
  if(options.tePremium&&candidate.position==="TE")need=clamp(need+0.06);

  const needValue=need*24;
  const historyConfidence=tendency?Math.min(1,tendency.sampleSize/18):0;
  const positionAffinity=tendency
    ? Math.max(-4,Math.min(7,((tendency.positionShare[candidate.position]||0)-0.25)*18))*historyConfidence
    : 0;

  let rangeFit=0;
  if(tendency?.avgRankDelta!=null){
    const expectedRank=pickNo-tendency.avgRankDelta;
    rangeFit=Math.max(-4,8-Math.abs(candidate.rank-expectedRank)*0.65)*historyConfidence;
  }

  const tierValue=candidate.tier==null?0:Math.max(0,5-(candidate.tier-1)*0.65);
  const gradeValue=candidate.grade==null?0:Math.max(-3,Math.min(5,(candidate.grade-70)*0.16));
  const noise=stableNoise(`${team.rosterId}:${pickNo}:${candidate.id}`)*2.3;
  const score=boardValue+needValue+positionAffinity+rangeFit+tierValue+gradeValue+noise;

  const needLabel=team.needs[candidate.position]?.label||"Depth";
  const reasonBits:string[]=[];
  if(need>=0.7)reasonBits.push(`${candidate.position} is a priority`);
  else if(need>=0.5)reasonBits.push(`${candidate.position} fills a roster need`);
  else if(candidate.rank<=pickNo+3)reasonBits.push("board value is hard to pass");
  else reasonBits.push("adds high-upside depth");
  if(tendency&&historyConfidence>=0.3&&(tendency.positionShare[candidate.position]||0)>=0.34){
    reasonBits.push(`${team.name} has historically leaned ${candidate.position}`);
  }else if(tendency?.avgRankDelta!=null&&historyConfidence>=0.35&&Math.abs(candidate.rank-(pickNo-tendency.avgRankDelta))<=5){
    reasonBits.push("fits this manager's historical draft range");
  }else if(needLabel==="Strength"){
    reasonBits.push("talent wins over positional strength");
  }

  return {score,need,reason:reasonBits.join("; ")+".",historyConfidence};
}

export function bestCpuPick(
  candidates:MockCandidate[],
  team:MockTeam,
  pickNo:number,
  tendency:MockTendency|null,
  drafted:Partial<Record<MockPosition,number>>,
  options:{superflex:boolean;tePremium:boolean},
){
  let best:MockCandidate|null=null;
  let bestScore=-Infinity;
  let rationale="";
  for(const candidate of candidates){
    const scored=scoreCandidate(candidate,team,pickNo,tendency,drafted,options);
    if(scored.score>bestScore){
      bestScore=scored.score;
      best=candidate;
      rationale=scored.reason;
    }
  }
  return best?{candidate:best,score:bestScore,rationale}:null;
}
