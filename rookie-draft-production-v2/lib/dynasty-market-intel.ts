import type {SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,loadKtcDataset,type KtcDataset} from "@/lib/ktc";
import {ktcMovement} from "@/lib/ktc-history";
import {ensureTursoSchema} from "@/lib/turso";
import {GET as getFinalBoard} from "@/app/api/final-board/live/route";
import {getIntegrations} from "@/lib/integrations";
import {INTEL_POSITIONS,intelNorm,loadIntelBase,resolveIntelRoster,sleeperJson,valuedIntelPlayers} from "@/lib/dynasty-intelligence-core";
import {buildLeagueKtcHistoryTargets,getKtcHistoryBackfillStatus} from "@/lib/ktc-history-backfill";
import {getScoutingProcessExclusions,scoutingExclusionKey,type ScoutingProcessExclusion} from "@/lib/scouting-process-exclusions";

const ADP_SLUG:Record<string,string>={
  "one-league":"one-league",
  "last-man-standing":"last-man-standing",
  "last-minute-dynasty":"last-minute",
  "drew-ross":"dr",
};

async function emergingRadar(base:Awaited<ReturnType<typeof loadIntelBase>>,league:SleeperLeagueIntegration){
  const [adds,drops]=await Promise.all([
    sleeperJson("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=30").catch(()=>[]),
    sleeperJson("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=24&limit=30").catch(()=>[]),
  ]);
  const rostered=new Set(base.rosters.flatMap((r:any)=>[...(r.players||[]),...(r.taxi||[]),...(r.reserve||[])].map(String))),matcher=createKtcMatcher(base.dataset);
  const mapRows=(rows:any[],kind:string)=>rows.map(item=>{
    const id=String(item?.player_id||""),p=base.playerDb?.[id],position=String(p?.position||"").toUpperCase();
    if(!p||!INTEL_POSITIONS.includes(position as any))return null;
    const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||String(p.full_name||id),match=matcher(name,position);
    return {id,name,position,team:String(p.team||"FA"),count:Number(item?.count)||0,kind,rostered:rostered.has(id),value:match?(league.tePremium?match.player.tepValue:match.player.value):0};
  }).filter(Boolean);
  return {adds:mapRows(adds,"add").filter((x:any)=>!x.rostered).slice(0,15),drops:mapRows(drops,"drop").slice(0,15)};
}

async function portfolioExposure(playerDb:any,dataset:KtcDataset){
  const config=await getIntegrations(),matcher=createKtcMatcher(dataset),leagues=config.sleeper.leagues.filter(l=>l.enabled!==false),holdings=new Map<string,any>();
  await Promise.all(leagues.map(async league=>{
    try{
      const root="https://api.sleeper.app/v1/league/"+league.leagueId,[rosters,users]=await Promise.all([sleeperJson(root+"/rosters"),sleeperJson(root+"/users")]),mine=resolveIntelRoster(rosters,users,league.teamIdentity||"");
      if(!mine)return;
      const ids=[...new Set([...(mine.players||[]),...(mine.taxi||[]),...(mine.reserve||[])].map(String))];
      for(const id of ids){
        const p=playerDb?.[id],position=String(p?.position||"").toUpperCase();
        if(!p||!INTEL_POSITIONS.includes(position as any))continue;
        const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||String(p.full_name||id),key=intelNorm(name)+"|"+position,match=matcher(name,position),value=match?(league.tePremium?match.player.tepValue:match.player.value):0,row=holdings.get(key)||{name,position,team:String(p.team||"FA"),leagues:[],values:[]};
        row.leagues.push(league.name);row.values.push(value);holdings.set(key,row);
      }
    }catch{}
  }));
  return [...holdings.values()].map(row=>({...row,count:row.leagues.length,averageValue:row.values.length?Math.round(row.values.reduce((a:number,b:number)=>a+b,0)/row.values.length):0,exposureValue:row.values.reduce((a:number,b:number)=>a+b,0)})).sort((a,b)=>b.count-a.count||b.exposureValue-a.exposureValue);
}

async function marketGaps(leagueKey:string){
  const boardRes=await getFinalBoard(new Request("http://internal/api/final-board/live?view="+encodeURIComponent("league:"+leagueKey)+"&draftClass=2027")),board=await boardRes.json();
  if(!boardRes.ok)return [];
  const c=await ensureTursoSchema(),r=await c.execute({sql:"select value from settings where key='sleeper_adp'",args:[]});
  if(!r.rows.length)return [];
  let adp:any={};try{adp=JSON.parse(String(r.rows[0]?.value||"{}"))}catch{}
  const slug=ADP_SLUG[leagueKey]||leagueKey,list=(adp?.lists||[]).find((x:any)=>x.slug===slug)?.top75||[],byName=new Map(list.map((p:any,i:number)=>[intelNorm(p.name),i+1]));
  return (board?.rows||[]).map((row:any)=>{const adpRank=byName.get(intelNorm(row.name));if(!adpRank||!row.overallRank)return null;return {id:String(row.id),name:String(row.name),position:String(row.position),college:String(row.college||""),myRank:Number(row.overallRank),adpRank:Number(adpRank),delta:Number(adpRank)-Number(row.overallRank),grade:row.boardGrade==null?null:Number(row.boardGrade)}}).filter(Boolean).sort((a:any,b:any)=>Math.abs(b.delta)-Math.abs(a.delta));
}

function pearson(xs:number[],ys:number[]){
  if(xs.length<3||xs.length!==ys.length)return null;
  const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;let num=0,dx=0,dy=0;
  for(let i=0;i<xs.length;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b}
  return dx&&dy?num/Math.sqrt(dx*dy):null;
}

async function scoutingAlpha(dataset:KtcDataset,exclusions:ScoutingProcessExclusion[]){
  const matcher=createKtcMatcher(dataset),years=[2022,2023,2024,2025,2026],results:any[]=[],details:any[]=[],players:any[]=[];
  const excluded=new Set(exclusions.map(x=>scoutingExclusionKey(x.year,x.name)));

  const draftOrder=(value:any)=>{
    const text=String(value||"").trim();
    const match=text.match(/^(\d+)\.(\d+)/);
    if(!match)return null;
    const round=Number(match[1]),slot=Number(match[2]);
    return Number.isFinite(round)&&Number.isFinite(slot)?((round-1)*32+slot):null;
  };

  for(const year of years){
    const boardRes=await getFinalBoard(new Request("http://internal/api/final-board/live?view=base&draftClass="+year));
    const boardJson=await boardRes.json();
    const boardRows=boardRes.ok&&Array.isArray(boardJson?.rows)?boardJson.rows:[];

    const matched=boardRows
      .filter((row:any)=>INTEL_POSITIONS.includes(String(row.position||"").toUpperCase() as any)&&Number(row.overallRank)>0)
      .map((row:any)=>{
        const name=String(row.name||""),position=String(row.position||"").toUpperCase(),match=matcher(name,position);
        if(!match)return null;
        return {
          year,name,position,yourRank:Number(row.overallRank),
          nflOverall:draftOrder(row.draftResult),
          draftResult:String(row.draftResult||""),
          ktcValue:match.player.value,
        };
      }).filter(Boolean) as any[];

    const ktcSorted=[...matched].sort((a,b)=>b.ktcValue-a.ktcValue),ktcRank=new Map(ktcSorted.map((x,i)=>[intelNorm(x.name),i+1]));
    for(const row of matched)row.ktcRank=ktcRank.get(intelNorm(row.name));

    const drafted=[...matched].filter(x=>x.nflOverall!=null).sort((a,b)=>a.nflOverall-b.nflOverall);
    const nflRank=new Map(drafted.map((x,i)=>[intelNorm(x.name),i+1]));
    for(const row of matched)row.nflRank=nflRank.get(intelNorm(row.name))??null;

    const eligible=matched.filter(row=>!excluded.has(scoutingExclusionKey(year,row.name)));
    const yourCorr=pearson(eligible.map(x=>x.yourRank),eligible.map(x=>x.ktcRank));
    const nflComparable=eligible.filter(x=>x.nflRank!=null);
    const nflCorr=pearson(nflComparable.map(x=>x.nflRank),nflComparable.map(x=>x.ktcRank));
    const edge=yourCorr!=null&&nflCorr!=null?yourCorr-nflCorr:null;
    results.push({year,matched:eligible.length,excluded:matched.length-eligible.length,yourCorrelation:yourCorr,nflCorrelation:nflCorr,edge});

    for(const row of matched)players.push({...row,excluded:excluded.has(scoutingExclusionKey(year,row.name))});
    for(const row of eligible){
      if(row.nflRank==null)continue;
      const yourError=Math.abs(row.yourRank-row.ktcRank),nflError=Math.abs(row.nflRank-row.ktcRank);
      details.push({...row,processEdge:nflError-yourError});
    }
  }

  return {
    years:results,
    wins:[...details].sort((a,b)=>b.processEdge-a.processEdge).slice(0,12),
    lessons:[...details].sort((a,b)=>a.processEdge-b.processEdge).slice(0,12),
    players:players.sort((a,b)=>b.year-a.year||a.yourRank-b.yourRank),
    exclusions,
    note:"Your historical Final Draft Board is compared with today's KTC class ordering. NFL draft order is the outside baseline for drafted players. Players you exclude are removed from the class correlations and Process Wins/Lessons.",
  };
}

export async function marketIntelMode(league:SleeperLeagueIntegration){
  const base=await loadIntelBase(league),mine=resolveIntelRoster(base.rosters,base.users,league.teamIdentity||"");
  const historyTargets=buildLeagueKtcHistoryTargets({rosters:base.rosters,playerDb:base.playerDb,dataset:base.dataset,mineRosterId:Number(mine?.roster_id)||null});
  const [move7,move30,move90,emerging,exposure,gaps,historyStatus]=await Promise.all([
    ktcMovement(7),ktcMovement(30),ktcMovement(90),emergingRadar(base,league),portfolioExposure(base.playerDb,base.dataset),marketGaps(league.key),getKtcHistoryBackfillStatus(historyTargets)
  ]);
  const myNames=new Set(valuedIntelPlayers(mine,base.playerDb,base.dataset,league).map(p=>intelNorm(p.name)));
  const decorate=(pack:any)=>({...pack,rows:(pack.rows||[]).map((r:any)=>({...r,onMyRoster:myNames.has(intelNorm(r.name))}))});
  return {league:{key:league.key,name:String(base.leagueData?.name||league.name)},movement7:decorate(move7),movement30:decorate(move30),movement90:decorate(move90),historyStatus,emerging,exposure,marketGaps:gaps};
}

export async function processIntelMode(league:SleeperLeagueIntegration){
  const [dataset,exclusions]=await Promise.all([loadKtcDataset(false),getScoutingProcessExclusions()]);
  return {league:{key:league.key,name:league.name},scoutingAlpha:await scoutingAlpha(dataset,exclusions)};
}
