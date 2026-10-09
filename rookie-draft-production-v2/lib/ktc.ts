import {ensureTursoSchema} from "@/lib/turso";
import {recordKtcSnapshot} from "@/lib/ktc-history";

export type KtcPlayer={
  name:string;
  position:string;
  team:string;
  value:number;
  tepValue:number;
  ktcId?:number;
  slug?:string;
};

export type KtcDataset={
  players:KtcPlayer[];
  fetchedAt:string;
  source:string;
};

export type KtcMatch={
  player:KtcPlayer;
  method:"exact"|"alias"|"first-last";
};

const CACHE_KEY="ktc_values_cache_v4";
const SIX_HOURS=6*60*60*1000;

const NAME_ALIASES:Record<string,string>={
  "zonovan knight":"bam knight",
  "bam knight":"zonovan knight",
  "gabe davis":"gabriel davis",
  "gabriel davis":"gabe davis",
  "chig okonkwo":"chigoziem okonkwo",
  "chigoziem okonkwo":"chig okonkwo",
  "hollywood brown":"marquise brown",
  "marquise brown":"hollywood brown",
};

export function normalizeKtcName(value:string){
  return String(value||"")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/&/g," and ")
    .replace(/[’'‘`´.-]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function firstLast(value:string){
  const parts=normalizeKtcName(value).split(" ").filter(Boolean);
  return parts.length>=2?parts[0]+" "+parts[parts.length-1]:parts.join(" ");
}

function readNumeric(value:any){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}

function parseKtcPlayers(html:string):KtcPlayer[]{
  const match=html.match(/<script[^>]*id=["']ktc-players["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!match?.[1])throw new Error("KTC player dataset was not found in the rankings page");

  const raw=JSON.parse(match[1].trim());
  if(!Array.isArray(raw))throw new Error("KTC player dataset had an unexpected format");

  const players:KtcPlayer[]=[];
  for(const p of raw){
    if(!p?.playerName||!["QB","RB","WR","TE","PICK","RDP"].includes(String(p.position||"")))continue;
    const sf=p?.superflexValues||{};
    // KTC's current data model names the non-TE-premium bucket "tep".
    // "tepp" is the next TE-premium tier used by the TEP leagues in this app.
    const value=readNumeric(sf?.tep?.value??sf?.value);
    const tepValue=readNumeric(sf?.tepp?.value??sf?.tep?.value??sf?.value);
    if(value==null)continue;
    const rawId=Number(p.playerID);
    players.push({
      name:String(p.playerName).trim(),
      position:String(p.position),
      team:String(p.team||""),
      value,
      tepValue:tepValue??value,
      ktcId:Number.isFinite(rawId)&&rawId>0?rawId:undefined,
      slug:String(p.slug||"").trim()||undefined,
    });
  }
  if(!players.length)throw new Error("KTC rankings were fetched but no player values could be parsed");
  return players;
}

async function readCache():Promise<KtcDataset|null>{
  try{
    const c=await ensureTursoSchema();
    const result=await c.execute({sql:"select value from settings where key=?",args:[CACHE_KEY]});
    if(!result.rows.length)return null;
    const parsed=JSON.parse(String(result.rows[0]?.value||"null"));
    if(!parsed?.players?.length||!parsed?.fetchedAt)return null;
    return parsed as KtcDataset;
  }catch{return null}
}

async function writeCache(dataset:KtcDataset){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:[CACHE_KEY,JSON.stringify(dataset),new Date().toISOString()],
  });
}

export async function loadKtcDataset(force=false):Promise<KtcDataset>{
  const cached=await readCache();
  if(!force&&cached&&Date.now()-Date.parse(cached.fetchedAt)<SIX_HOURS){
    await recordKtcSnapshot(cached.players).catch(()=>{});
    return cached;
  }

  try{
    const res=await fetch("https://keeptradecut.com/dynasty-rankings?page=0",{
      cache:"no-store",
      headers:{
        "accept":"text/html,application/xhtml+xml",
        "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if(!res.ok)throw new Error("KTC returned HTTP "+res.status);
    const players=parseKtcPlayers(await res.text());
    const dataset:KtcDataset={players,fetchedAt:new Date().toISOString(),source:"KeepTradeCut"};
    await writeCache(dataset);
    await recordKtcSnapshot(dataset.players).catch(()=>{});
    return dataset;
  }catch(e){
    if(cached)return cached;
    throw e;
  }
}

export function createKtcMatcher(dataset:KtcDataset){
  const exact=new Map<string,KtcPlayer[]>();
  const compact=new Map<string,KtcPlayer[]>();
  const fl=new Map<string,KtcPlayer[]>();

  const add=(map:Map<string,KtcPlayer[]>,key:string,p:KtcPlayer)=>{
    if(!key)return;
    const list=map.get(key)||[];
    list.push(p);
    map.set(key,list);
  };

  for(const p of dataset.players){
    const norm=normalizeKtcName(p.name);
    add(exact,norm,p);
    add(compact,norm.replace(/\s/g,""),p);
    add(fl,firstLast(p.name),p);
  }

  const choose=(list:KtcPlayer[]|undefined,position:string)=>{
    if(!list?.length)return null;
    const pos=list.filter(p=>!position||p.position===position);
    if(pos.length===1)return pos[0];
    if(pos.length>1)return pos[0];
    return list.length===1?list[0]:null;
  };

  return (name:string,position:string):KtcMatch|null=>{
    const norm=normalizeKtcName(name);
    let player=choose(exact.get(norm),position);
    if(player)return {player,method:"exact"};

    const alias=NAME_ALIASES[norm];
    if(alias){
      player=choose(exact.get(normalizeKtcName(alias)),position);
      if(player)return {player,method:"alias"};
    }

    player=choose(compact.get(norm.replace(/\s/g,"")),position);
    if(player)return {player,method:"exact"};

    player=choose(fl.get(firstLast(name)),position);
    if(player)return {player,method:"first-last"};
    return null;
  };
}


export function getKtcPickYears(dataset:KtcDataset){
  const years=new Set<number>();
  for(const p of dataset.players){
    if(!["PICK","RDP"].includes(p.position))continue;
    const match=p.name.match(/^(\d{4})\s+(?:Early|Mid|Late)\s+/i);
    if(match)years.add(Number(match[1]));
  }
  return [...years].filter(Number.isFinite).sort((a,b)=>a-b);
}

export function getKtcPickValue(dataset:KtcDataset,season:number,round:number,tier:"Early"|"Mid"|"Late"="Mid"){
  const suffix=round===1?"st":round===2?"nd":round===3?"rd":"th";
  const wanted=normalizeKtcName(`${season} ${tier} ${round}${suffix}`);
  const exact=dataset.players.find(p=>["PICK","RDP"].includes(p.position)&&normalizeKtcName(p.name)===wanted);
  if(exact)return exact.value;

  // KTC sometimes omits ordinal suffixes in embedded data; tolerate that form.
  const fallback=normalizeKtcName(`${season} ${tier} ${round}`);
  const loose=dataset.players.find(p=>["PICK","RDP"].includes(p.position)&&normalizeKtcName(p.name)===fallback);
  return loose?.value??null;
}
