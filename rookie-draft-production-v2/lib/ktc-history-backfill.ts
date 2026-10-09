import type {KtcDataset,KtcPlayer} from "@/lib/ktc";
import {createKtcMatcher} from "@/lib/ktc";
import {readKtcHistoryBackfillRecords,recordKtcHistoricalSeries,recordKtcHistoryBackfillError,type KtcHistoricalPoint} from "@/lib/ktc-history";

export type KtcHistoryTarget=KtcPlayer&{ktcId:number;slug:string;isMine:boolean};

const POSITIONS=new Set(["QB","RB","WR","TE"]);

function playerName(player:any,id:string){
  return String(player?.full_name||((player?.first_name||"")+" "+(player?.last_name||"")).trim()||id);
}

function idFromPlayer(player:KtcPlayer){
  if(Number.isFinite(Number(player.ktcId))&&Number(player.ktcId)>0)return Number(player.ktcId);
  const match=String(player.slug||"").match(/-(\d+)$/);
  return match?Number(match[1]):0;
}

export function buildLeagueKtcHistoryTargets(args:{rosters:any[];playerDb:any;dataset:KtcDataset;mineRosterId?:number|null}){
  const {rosters,playerDb,dataset,mineRosterId}=args,matcher=createKtcMatcher(dataset),seen=new Map<number,KtcHistoryTarget>();
  for(const roster of rosters||[]){
    const isMine=Number(roster?.roster_id)===Number(mineRosterId);
    const ids=[...new Set([...(roster?.players||[]),...(roster?.taxi||[]),...(roster?.reserve||[])].map(String))];
    for(const id of ids){
      const p=playerDb?.[id],position=String(p?.position||"").toUpperCase();
      if(!p||!POSITIONS.has(position))continue;
      const match=matcher(playerName(p,id),position);
      if(!match?.player?.slug)continue;
      const ktcId=idFromPlayer(match.player);
      if(!ktcId)continue;
      const existing=seen.get(ktcId);
      const target={...match.player,ktcId,slug:String(match.player.slug),isMine:Boolean(isMine||existing?.isMine)};
      seen.set(ktcId,target);
    }
  }
  return [...seen.values()].sort((a,b)=>Number(b.isMine)-Number(a.isMine)||b.value-a.value||a.name.localeCompare(b.name));
}

function parseHistoryDate(value:any){
  const raw=String(value||"").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  if(/^\d{8}$/.test(raw))return raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8);
  if(/^\d{6}$/.test(raw)){
    const yy=Number(raw.slice(0,2)),year=yy>=70?1900+yy:2000+yy;
    return String(year).padStart(4,"0")+"-"+raw.slice(2,4)+"-"+raw.slice(4,6);
  }
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?new Date(parsed).toISOString().slice(0,10):"";
}

function parsePlayerSuperflex(html:string){
  const match=html.match(/(?:var|let|const)\s+playerSuperflex\s*=\s*(\{[\s\S]*?\});/);
  if(!match?.[1])throw new Error("KTC player history payload was not found");
  let data:any;
  try{data=JSON.parse(match[1])}catch{throw new Error("KTC player history payload could not be parsed")}
  const raw=Array.isArray(data?.overallValue)?data.overallValue:[];
  const byDate=new Map<string,number>();
  for(const point of raw){
    const date=parseHistoryDate(point?.d),value=Number(point?.v);
    if(date&&Number.isFinite(value)&&value>=0)byDate.set(date,value);
  }
  return [...byDate.entries()].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date)) as KtcHistoricalPoint[];
}

async function fetchHistory(target:KtcHistoryTarget){
  const res=await fetch("https://keeptradecut.com/dynasty-rankings/players/"+encodeURIComponent(target.slug),{
    cache:"no-store",
    headers:{
      accept:"text/html,application/xhtml+xml",
      "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if(!res.ok)throw new Error("KTC returned HTTP "+res.status);
  return parsePlayerSuperflex(await res.text());
}

export async function getKtcHistoryBackfillStatus(targets:KtcHistoryTarget[]){
  const records=await readKtcHistoryBackfillRecords(targets.map(x=>x.ktcId)),byId=new Map(records.map(x=>[x.ktcId,x]));
  let completed=0,failed=0,oldestDate="",newestDate="";
  for(const target of targets){
    const row=byId.get(target.ktcId);
    if(row?.points&&row.firstDate){completed++;if(!oldestDate||row.firstDate<oldestDate)oldestDate=row.firstDate;if(!newestDate||row.lastDate>newestDate)newestDate=row.lastDate}
    else if(row?.lastError)failed++;
  }
  return {total:targets.length,completed,remaining:Math.max(0,targets.length-completed),failed,oldestDate,newestDate};
}

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export async function backfillKtcHistory(targets:KtcHistoryTarget[],limit=6){
  const records=await readKtcHistoryBackfillRecords(targets.map(x=>x.ktcId)),done=new Set(records.filter(x=>x.points>0&&x.firstDate).map(x=>x.ktcId));
  const queue=targets.filter(x=>!done.has(x.ktcId)).slice(0,Math.max(1,Math.min(10,limit)));
  const imported:any[]=[],errors:any[]=[];

  for(let i=0;i<queue.length;i+=2){
    const chunk=queue.slice(i,i+2);
    const settled=await Promise.allSettled(chunk.map(async target=>{
      const points=await fetchHistory(target);
      if(!points.length)throw new Error("KTC returned no historical values");
      const saved=await recordKtcHistoricalSeries(target,points);
      return {name:target.name,position:target.position,ktcId:target.ktcId,...saved};
    }));
    settled.forEach((result,index)=>{
      const target=chunk[index];
      if(result.status==="fulfilled")imported.push(result.value);
      else errors.push({name:target.name,error:result.reason instanceof Error?result.reason.message:String(result.reason||"Import failed"),target});
    });
    for(const item of errors.filter(x=>x.target&&chunk.some(t=>t.ktcId===x.target.ktcId))){
      await recordKtcHistoryBackfillError(item.target,item.error).catch(()=>{});
      delete item.target;
    }
    if(i+2<queue.length)await sleep(300);
  }

  return {...await getKtcHistoryBackfillStatus(targets),imported,errors};
}
