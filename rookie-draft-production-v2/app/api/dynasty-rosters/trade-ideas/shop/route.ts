import {GET as getTradeAssets} from "../trade/route";
import {readTradePreferences,tradePreferenceKey,type TradePreference} from "@/lib/trade-preferences";

type Asset={
  id:string;
  type:"player"|"pick";
  name:string;
  detail:string;
  value:number|null;
  valueLabel?:string;
  position?:string;
  team?:string;
  status?:string;
  preference?:TradePreference;
};

type TeamAssets={
  rosterId:number;
  name:string;
  assets:{players:Asset[];picks:Asset[]};
};

type ShopIdea={
  partnerTeam:{rosterId:number;name:string};
  youSend:Asset[];
  youGet:Asset[];
  sendValue:number;
  receiveValue:number;
  sendAdjusted:number;
  receiveAdjusted:number;
  differencePct:number;
  score:number;
};

function weightedPackageValue(items:Asset[]){
  const values=items.map(x=>Number(x.value)||0).sort((a,b)=>b-a);
  return values.reduce((sum,value,index)=>sum+value*(index===0?1:index===1?0.82:index===2?0.72:0.65),0);
}

function gapPct(a:number,b:number){
  return Math.round(Math.abs(a-b)/Math.max(a,b,1)*1000)/10;
}

function rawValue(items:Asset[]){
  return Math.round(items.reduce((sum,item)=>sum+(Number(item.value)||0),0));
}

function poolForTarget(items:Asset[],target:number){
  const valued=items.filter(x=>x.value!=null&&Number(x.value)>0);
  const top=[...valued].sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0)).slice(0,18);
  const fill=[...valued]
    .sort((a,b)=>Math.abs((Number(a.value)||0)-target/3)-Math.abs((Number(b.value)||0)-target/3))
    .slice(0,10);
  const map=new Map<string,Asset>();
  for(const item of [...top,...fill])map.set(item.id,item);
  return [...map.values()].slice(0,26);
}

function candidatePackages(items:Asset[],targetAdjusted:number){
  const pool=poolForTarget(items,targetAdjusted);
  const candidates:{items:Asset[];adjusted:number;raw:number;gap:number;score:number}[]=[];
  const current:Asset[]=[];

  const walk=(start:number)=>{
    if(current.length){
      const adjusted=Math.round(weightedPackageValue(current));
      const gap=gapPct(adjusted,targetAdjusted);
      if(gap<=22){
        candidates.push({
          items:[...current],
          adjusted,
          raw:rawValue(current),
          gap,
          score:gap+(current.length-1)*.9,
        });
      }
    }
    if(current.length>=4)return;
    for(let i=start;i<pool.length;i++){
      current.push(pool[i]);
      walk(i+1);
      current.pop();
    }
  };
  walk(0);

  return candidates.sort((a,b)=>a.score-b.score||a.gap-b.gap);
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const leagueKey=String(body?.leagueKey||"");
    const selectedIds=Array.isArray(body?.selectedIds)?body.selectedIds.map(String).filter(Boolean):[];
    if(!leagueKey||!selectedIds.length)return Response.json({error:"Choose at least one player or pick to shop"},{status:400});
    if(selectedIds.length>4)return Response.json({error:"Select up to four assets at a time"},{status:400});

    const tradeRes=await getTradeAssets(new Request(
      "http://internal/api/dynasty-rosters/trade?leagueKey="+encodeURIComponent(leagueKey)+"&allAssets=1",
      {method:"GET"}
    ));
    const data=await tradeRes.json();
    if(!tradeRes.ok)return Response.json(data,{status:tradeRes.status});

    const preferences=await readTradePreferences(leagueKey);
    const decorate=(asset:Asset):Asset=>asset.type==="player"
      ?{...asset,preference:preferences[tradePreferenceKey(asset.name)]||"neutral"}
      :asset;

    const myAssets=[
      ...(data?.myTeam?.assets?.players||[]),
      ...(data?.myTeam?.assets?.picks||[]),
    ].map(decorate) as Asset[];
    const myById=new Map(myAssets.map(asset=>[asset.id,asset]));
    const selected=selectedIds.map(id=>myById.get(id)).filter(Boolean) as Asset[];
    if(selected.length!==selectedIds.length)return Response.json({error:"One or more selected assets are no longer on your roster"},{status:409});

    const untouchable=selected.find(x=>x.preference==="untouchable");
    if(untouchable)return Response.json({error:untouchable.name+" is marked Untouchable. Change the preference before shopping that player."},{status:400});

    const sendAdjusted=Math.round(weightedPackageValue(selected));
    const sendRaw=rawValue(selected);
    const ideas:ShopIdea[]=[];

    for(const partner of (data?.leagueTeams||[]) as TeamAssets[]){
      const theirs=[...(partner.assets?.players||[]),...(partner.assets?.picks||[])] as Asset[];
      const packages=candidatePackages(theirs,sendAdjusted);
      for(const candidate of packages.slice(0,4)){
        ideas.push({
          partnerTeam:{rosterId:partner.rosterId,name:partner.name},
          youSend:selected,
          youGet:candidate.items,
          sendValue:sendRaw,
          receiveValue:candidate.raw,
          sendAdjusted,
          receiveAdjusted:candidate.adjusted,
          differencePct:candidate.gap,
          score:candidate.score,
        });
      }
    }

    ideas.sort((a,b)=>a.score-b.score||a.differencePct-b.differencePct);
    const chosen:ShopIdea[]=[];
    const byPartner=new Map<number,number>();
    for(const next of ideas){
      if(chosen.length>=12)break;
      const count=byPartner.get(next.partnerTeam.rosterId)||0;
      if(count>=2)continue;
      chosen.push(next);
      byPartner.set(next.partnerTeam.rosterId,count+1);
    }

    return Response.json({
      league:data.league,
      myTeam:{rosterId:data.myTeam.rosterId,name:data.myTeam.name},
      selected,
      ideas:chosen.map(({score,...idea})=>idea),
      ktcUpdatedAt:data.ktcUpdatedAt,
      valueNote:"League-wide ideas use current Sleeper ownership and KTC values. Return packages may contain one to four players/picks; package-size adjustment prevents several smaller assets from being treated as perfectly additive.",
    });
  }catch(e:any){
    return Response.json({error:"Could not generate league-wide trade ideas",detail:e?.message},{status:500});
  }
}
