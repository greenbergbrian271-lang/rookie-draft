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

function tieRanks<T>(rows:T[],score:(row:T)=>number,descending=true){
  const sorted=[...rows].sort((a,b)=>descending?score(b)-score(a):score(a)-score(b));
  const ranks=new Map<T,number>();
  let i=0;
  while(i<sorted.length){
    const value=score(sorted[i]);
    let j=i+1;
    while(j<sorted.length&&score(sorted[j])===value)j++;
    const averageRank=((i+1)+j)/2;
    for(let k=i;k<j;k++)ranks.set(sorted[k],averageRank);
    i=j;
  }
  return ranks;
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

    // The scouting sample is driven by YOUR historical board, not by whether
    // today's KTC dataset happens to contain the player. Only manual exclusions
    // remove a player from the sample.
    const classRows=boardRows
      .filter((row:any)=>INTEL_POSITIONS.includes(String(row.position||"").toUpperCase() as any)&&Number(row.overallRank)>0)
      .map((row:any)=>{
        const name=String(row.name||""),position=String(row.position||"").toUpperCase(),match=matcher(name,position);
        return {
          year,name,position,yourRank:Number(row.overallRank),
          nflOverall:draftOrder(row.draftResult),
          draftResult:String(row.draftResult||""),
          ktcValue:match?Number(match.player.value)||0:0,
          hasKtc:Boolean(match),
        };
      }) as any[];

    const eligible=classRows.filter(row=>!excluded.has(scoutingExclusionKey(year,row.name)));

    // KTC-missing players are not discarded. A player absent from today's KTC
    // universe is placed in a shared bottom-value tier (value 0).
    const ktcRanks=tieRanks(eligible,(row:any)=>Number(row.ktcValue)||0,true);
    for(const row of eligible)row.ktcRank=ktcRanks.get(row)??eligible.length;

    // NFL-drafted players rank by draft order. UDFAs are retained in the sample
    // and share one bottom NFL tier instead of disappearing from the analysis.
    const drafted=eligible.filter(row=>row.nflOverall!=null).sort((a,b)=>a.nflOverall-b.nflOverall);
    const udfas=eligible.filter(row=>row.nflOverall==null);
    drafted.forEach((row,index)=>{row.nflRank=index+1});
    const udfaRank=udfas.length?drafted.length+(udfas.length+1)/2:eligible.length;
    udfas.forEach(row=>{row.nflRank=udfaRank});

    const yourCorr=pearson(eligible.map(x=>x.yourRank),eligible.map(x=>x.ktcRank));
    const nflCorr=pearson(eligible.map(x=>x.nflRank),eligible.map(x=>x.ktcRank));
    const edge=yourCorr!=null&&nflCorr!=null?yourCorr-nflCorr:null;

    const ktcProfiles=eligible.filter(x=>x.hasKtc).length;
    const nflDrafted=drafted.length;
    results.push({
      year,
      matched:eligible.length,
      sample:eligible.length,
      totalBoard:classRows.length,
      excluded:classRows.length-eligible.length,
      ktcProfiles,
      ktcMissing:eligible.length-ktcProfiles,
      nflDrafted,
      udfa:eligible.length-nflDrafted,
      yourCorrelation:yourCorr,
      nflCorrelation:nflCorr,
      edge,
    });

    const eligibleKeys=new Set(eligible.map(row=>scoutingExclusionKey(year,row.name)));
    for(const row of classRows){
      const key=scoutingExclusionKey(year,row.name);
      const scored=eligibleKeys.has(key);
      const eligibleRow=scored?eligible.find(x=>scoutingExclusionKey(year,x.name)===key):null;
      players.push({
        ...row,
        ktcRank:eligibleRow?.ktcRank??null,
        nflRank:eligibleRow?.nflRank??null,
        excluded:excluded.has(key),
      });
    }

    for(const row of eligible){
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
    note:"The sample now includes every QB/RB/WR/TE on your historical Final Draft Board unless you manually exclude them. Players missing from today's KTC dataset remain in the sample in a shared bottom KTC tier, and UDFAs remain in the sample in a shared bottom NFL tier.",
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
