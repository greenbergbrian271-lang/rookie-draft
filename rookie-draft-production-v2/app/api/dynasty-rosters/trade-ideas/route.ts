import {GET as getTradeAssets} from "../trade/route";
import {readTradePreferences,tradePreferenceKey,type TradePreference} from "@/lib/trade-preferences";

type Asset={
  id:string;
  type:"player"|"pick";
  name:string;
  detail?:string;
  value:number|null;
  position?:string;
  team?:string;
  preference?:TradePreference;
};

type Idea={
  kind:string;
  youSend:Asset[];
  youGet:Asset[];
  sendValue:number;
  receiveValue:number;
  sendAdjusted:number;
  receiveAdjusted:number;
  differencePct:number;
  preferenceNote?:string;
  score:number;
};

function weightedPackageValue(items:Asset[]){
  const values=items.map(x=>Number(x.value)||0).sort((a,b)=>b-a);
  return values.reduce((sum,value,index)=>sum+value*(index===0?1:index===1?.82:index===2?.72:.65),0);
}

function gapPct(a:number,b:number){
  return Math.round(Math.abs(a-b)/Math.max(a,b,1)*1000)/10;
}

function prefPenalty(items:Asset[]){
  const score:Record<TradePreference,number>={
    "actively-shopping":-10,
    "open":-4,
    "neutral":0,
    "reluctant":12,
    "untouchable":999,
  };
  return items.reduce((sum,item)=>sum+(item.type==="player"?score[item.preference||"neutral"]:0),0);
}

function packageKey(items:Asset[]){
  return items.map(x=>x.id).sort().join("|");
}

function makeIdea(kind:string,youSend:Asset[],youGet:Asset[]):Idea{
  const sendValue=Math.round(youSend.reduce((sum,x)=>sum+(Number(x.value)||0),0));
  const receiveValue=Math.round(youGet.reduce((sum,x)=>sum+(Number(x.value)||0),0));
  const sendAdjusted=Math.round(weightedPackageValue(youSend));
  const receiveAdjusted=Math.round(weightedPackageValue(youGet));
  const differencePct=gapPct(sendAdjusted,receiveAdjusted);
  const penalty=prefPenalty(youSend);
  const hasShopping=youSend.some(x=>x.preference==="actively-shopping");
  const hasReluctant=youSend.some(x=>x.preference==="reluctant");
  const hasPick=youSend.some(x=>x.type==="pick");
  const preferenceNote=hasShopping?"Includes a player you marked Actively Shopping":hasReluctant?"Includes a player you marked Reluctant":undefined;
  return {
    kind,youSend,youGet,sendValue,receiveValue,sendAdjusted,receiveAdjusted,differencePct,preferenceNote,
    score:differencePct+penalty+(youSend.length+youGet.length-2)*1.4-(hasPick?1.5:0),
  };
}

function combos(items:Asset[],size:1|2){
  if(size===1)return items.map(x=>[x]);
  const out:Asset[][]=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)out.push([items[i],items[j]]);
  return out;
}

function buildIdeas(myAssets:Asset[],theirAssets:Asset[]){
  const mine=myAssets
    .filter(x=>x.value!=null&&Number(x.value)>0&&x.preference!=="untouchable")
    .sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0))
    .slice(0,34);
  const theirs=theirAssets
    .filter(x=>x.value!=null&&Number(x.value)>0)
    .sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0))
    .slice(0,34);

  const mineSingles=combos(mine,1),theirSingles=combos(theirs,1);
  const minePairs=combos(mine.slice(0,24),2),theirPairs=combos(theirs.slice(0,24),2);
  const candidates:Idea[]=[];
  const seen=new Set<string>();

  const add=(kind:string,youSend:Asset[],youGet:Asset[])=>{
    if(
      youSend.length===1&&youGet.length===1&&
      youSend[0].type==="pick"&&youGet[0].type==="pick"&&
      youSend[0].name===youGet[0].name
    )return;
    const key=packageKey(youSend)+"=>"+packageKey(youGet);
    if(seen.has(key))return;
    seen.add(key);
    const next=makeIdea(kind,youSend,youGet);
    if(next.differencePct<=16&&prefPenalty(youSend)<900)candidates.push(next);
  };

  for(const a of mineSingles)for(const b of theirSingles)add("Straight up",a,b);
  for(const a of minePairs)for(const b of theirSingles)add("Two-for-one",a,b);
  for(const a of mineSingles)for(const b of theirPairs)add("One-for-two",a,b);

  candidates.sort((a,b)=>a.score-b.score||a.differencePct-b.differencePct);

  const chosen:Idea[]=[];
  const signature=new Set<string>();
  const addChosen=(idea:Idea)=>{
    const primary=idea.youSend.map(x=>x.id).sort().join("|")+"=>"+idea.youGet.map(x=>x.id).sort().join("|");
    if(signature.has(primary))return;
    signature.add(primary);
    chosen.push(idea);
  };

  for(const idea of candidates.filter(x=>x.youSend.some(a=>a.type==="pick")).slice(0,2))addChosen(idea);
  for(const idea of candidates){
    if(chosen.length>=8)break;
    const overused=chosen.some(existing=>{
      const shared=existing.youSend.filter(a=>idea.youSend.some(b=>b.id===a.id)).length;
      return shared===idea.youSend.length&&shared>0;
    });
    if(!overused||chosen.length<3)addChosen(idea);
  }
  return chosen.slice(0,8).map(({score,...idea})=>idea);
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const leagueKey=String(body?.leagueKey||"");
    const partnerRosterId=Number(body?.partnerRosterId||0);
    if(!leagueKey||!partnerRosterId)return Response.json({error:"leagueKey and partnerRosterId are required"},{status:400});

    const tradeRes=await getTradeAssets(new Request(
      "http://internal/api/dynasty-rosters/trade?leagueKey="+encodeURIComponent(leagueKey)+"&partnerRosterId="+encodeURIComponent(String(partnerRosterId)),
      {method:"GET"}
    ));
    const tradeData=await tradeRes.json();
    if(!tradeRes.ok)return Response.json(tradeData,{status:tradeRes.status});

    const preferences=await readTradePreferences(leagueKey);
    const decorate=(asset:Asset):Asset=>asset.type==="player"
      ?{...asset,preference:preferences[tradePreferenceKey(asset.name)]||"neutral"}
      :asset;

    const myAssets=[...(tradeData.myTeam?.assets?.players||[]),...(tradeData.myTeam?.assets?.picks||[])].map(decorate);
    const theirAssets=[...(tradeData.partnerTeam?.assets?.players||[]),...(tradeData.partnerTeam?.assets?.picks||[])].map(decorate);
    const ideas=buildIdeas(myAssets,theirAssets);

    return Response.json({
      league:tradeData.league,
      myTeam:{rosterId:tradeData.myTeam.rosterId,name:tradeData.myTeam.name},
      partnerTeam:{rosterId:tradeData.partnerTeam.rosterId,name:tradeData.partnerTeam.name},
      ideas,
      preferencesApplied:Object.keys(preferences).length,
      ktcUpdatedAt:tradeData.ktcUpdatedAt,
      valueNote:"Raw KTC values are shown alongside consolidation-adjusted package values. Untouchable players are excluded; Shopping/Open assets are favored and Reluctant assets are deprioritized.",
    });
  }catch(e:any){
    return Response.json({error:"Could not generate roster trade ideas",detail:e?.message},{status:500});
  }
}
