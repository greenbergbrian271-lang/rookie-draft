import {glossaryNumber,type GlossaryRows} from "./scouting-formulas";

export type FinalBoardPos="QB"|"RB"|"WR"|"TE";
export type FinalBoardGradeRow={
  id:string|number;name:string;position:FinalBoardPos;college?:string;draft_class:number;scouting_status:string;
  headshot_url?:string;scoutingGrade:number|null;preDraftGrade:number|null;finalGrade:number|null;authoritativeGrade:number|null;
  gradeSource:"Pre-Draft"|"Final";draftResult?:string|null;draftTeam?:string|null;
};
export type FinalBoardCoverageItem={slot:string;name:string;team?:string};
export type FinalBoardRoster={startingCoverage?:FinalBoardCoverageItem[];benchCoverage?:FinalBoardCoverageItem[]};
export type FinalBoardScoredRow=FinalBoardGradeRow&{
  sourceGrade:number|null;multiplier:number;handcuffAdjustment:number;boardGrade:number|null;
  overallRank:number|null;positionRank:number|null;tier:number|null;tierGapBefore:number|null;
};

export const FINAL_BOARD_POSITIONS:FinalBoardPos[]=["QB","RB","WR","TE"];
export const FINAL_BOARD_TIER_GAP=2.5;
const POS_MULTIPLIER_ROW:Record<FinalBoardPos,number>={QB:4,RB:5,WR:6,TE:7};
const HANDCUFF_ROW:Record<FinalBoardPos,number>={QB:15,RB:16,WR:17,TE:18};
const NFL_TEAM_ALIASES:Record<string,string[]>={
  "49ers":["49ers","san francisco 49ers"],bears:["bears","chicago bears"],bengals:["bengals","cincinnati bengals"],bills:["bills","buffalo bills"],
  broncos:["broncos","denver broncos"],browns:["browns","cleveland browns"],buccaneers:["buccaneers","bucs","tampa bay buccaneers"],cardinals:["cardinals","arizona cardinals"],
  chargers:["chargers","los angeles chargers"],chiefs:["chiefs","kansas city chiefs"],colts:["colts","indianapolis colts"],commanders:["commanders","washington commanders"],
  cowboys:["cowboys","dallas cowboys"],dolphins:["dolphins","miami dolphins"],eagles:["eagles","philadelphia eagles"],falcons:["falcons","atlanta falcons"],
  giants:["giants","new york giants"],jaguars:["jaguars","jacksonville jaguars"],jets:["jets","new york jets"],lions:["lions","detroit lions"],
  packers:["packers","green bay packers"],panthers:["panthers","carolina panthers"],patriots:["patriots","new england patriots"],raiders:["raiders","las vegas raiders"],
  rams:["rams","los angeles rams"],ravens:["ravens","baltimore ravens"],saints:["saints","new orleans saints"],seahawks:["seahawks","seattle seahawks"],
  steelers:["steelers","pittsburgh steelers"],texans:["texans","houston texans"],titans:["titans","tennessee titans"],vikings:["vikings","minnesota vikings"]
};
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
function teamKey(value:any){
  const n=norm(value);if(!n)return "";
  for(const [key,aliases] of Object.entries(NFL_TEAM_ALIASES))if(aliases.some(alias=>{const a=norm(alias);return n===a||n.endsWith(a)||n.includes(a)}))return key;
  return n;
}
function coverageHasTeam(items:FinalBoardCoverageItem[]|undefined,slot:string|undefined,team:string){
  if(!team)return false;
  return (items||[]).some(item=>{
    if(slot&&norm(item.slot)!==norm(slot))return false;
    return String(item.name||"").split(",").map(teamKey).filter(Boolean).includes(team);
  });
}

export function buildFinalBoardRows(
  grades:FinalBoardGradeRow[],
  options:{tePremium:boolean},
  activeRoster:FinalBoardRoster|undefined,
  glossary:GlossaryRows|undefined,
):FinalBoardScoredRow[]{
  const provisional=grades.map(row=>{
    const sourceGrade=row.finalGrade??row.preDraftGrade??null;
    const multiplierRow=row.position==="TE"&&options.tePremium?8:POS_MULTIPLIER_ROW[row.position];
    const multiplier=glossaryNumber(multiplierRow,glossary);
    const rookieTeam=teamKey(row.draftTeam||row.draftResult||"");
    const positionHit=coverageHasTeam(activeRoster?.startingCoverage,row.position,rookieTeam);
    const benchHit=!positionHit&&coverageHasTeam(activeRoster?.benchCoverage,undefined,rookieTeam);
    const handcuffAdjustment=positionHit?glossaryNumber(HANDCUFF_ROW[row.position],glossary):(benchHit?glossaryNumber(20,glossary):0);
    const boardGrade=sourceGrade==null?null:sourceGrade*multiplier+handcuffAdjustment;
    return {...row,sourceGrade,multiplier,handcuffAdjustment,boardGrade,overallRank:null,positionRank:null,tier:null,tierGapBefore:null};
  });
  const positionRanks=new Map<string,number>();
  for(const pos of FINAL_BOARD_POSITIONS){
    provisional.filter(x=>x.position===pos&&x.boardGrade!=null)
      .sort((a,b)=>(b.boardGrade??-Infinity)-(a.boardGrade??-Infinity)||a.name.localeCompare(b.name))
      .forEach((row,index)=>positionRanks.set(String(row.id),index+1));
  }
  const sorted=[...provisional].sort((a,b)=>{
    if(a.boardGrade==null&&b.boardGrade==null)return a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
    if(a.boardGrade==null)return 1;if(b.boardGrade==null)return -1;
    return b.boardGrade-a.boardGrade||a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
  });
  let rank=0,tier=1,previousGrade:number|null=null;
  return sorted.map(row=>{
    const overallRank=row.boardGrade==null?null:++rank;
    let rowTier:number|null=null,tierGapBefore:number|null=null;
    if(row.boardGrade!=null){
      if(previousGrade!=null){const gap=previousGrade-row.boardGrade;if(gap>=FINAL_BOARD_TIER_GAP){tier++;tierGapBefore=gap}}
      rowTier=tier;previousGrade=row.boardGrade;
    }
    return {...row,overallRank,positionRank:positionRanks.get(String(row.id))??null,tier:rowTier,tierGapBefore};
  });
}
