import {GET as getTradeAssets} from "@/app/api/dynasty-rosters/trade/route";
import {readTradePreferences,tradePreferenceKey,type TradePreference} from "@/lib/trade-preferences";

export const dynamic="force-dynamic";
export const maxDuration=60;

type Asset={id:string;type:"player"|"pick";name:string;detail:string;value:number|null;position?:string;team?:string;status?:string;preference?:TradePreference};
type StrengthRow={rosterId:number;positions:Record<string,{rank:number;need:number;label:string}>};

const WEIGHTS=[1,.82,.72,.65];
function packageValue(items:Asset[]){
  return Math.round(items.map(x=>Number(x.value)||0).sort((a,b)=>b-a).reduce((s,v,i)=>s+v*(WEIGHTS[Math.min(i,3)]),0));
}
const gap=(a:number,b:number)=>Math.round(Math.abs(a-b)/Math.max(a,b,1)*1000)/10;

const PREF_PENALTY:Record<TradePreference,number>={"actively-shopping":-10,open:-4,neutral:0,reluctant:12,untouchable:999};

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({}));
    const leagueKey=String(body?.leagueKey||""),sleeperId=String(body?.sleeperId||"");
    if(!leagueKey||!sleeperId)return Response.json({error:"leagueKey and sleeperId are required"},{status:400});

    const res=await getTradeAssets(new Request(`http://internal/api/dynasty-rosters/trade?leagueKey=${encodeURIComponent(leagueKey)}&allAssets=1`));
    const data=await res.json();
    if(!res.ok)return Response.json({error:data?.error||"Could not load league assets",detail:data?.detail},{status:res.status});

    const targetId="player:"+sleeperId;
    const owner=(data.leagueTeams||[]).find((t:any)=>(t.assets?.players||[]).some((p:Asset)=>p.id===targetId));
    if(!owner){
      const mine=(data.myTeam?.assets?.players||[]).some((p:Asset)=>p.id===targetId);
      return Response.json({error:mine?"You already roster this player in this league.":"This player is not on another team's roster in this league.",ideas:[]},{status:200});
    }
    const target:Asset=owner.assets.players.find((p:Asset)=>p.id===targetId);
    if(target.value==null||Number(target.value)<=0){
      return Response.json({target,partner:{rosterId:owner.rosterId,name:owner.name},ideas:[],note:"No KTC value is available for this player, so a fair offer can't be priced."});
    }

    const prefs=await readTradePreferences(leagueKey);
    const mineAll:Asset[]=[...(data.myTeam.assets.players||[]),...(data.myTeam.assets.picks||[])].map((a:Asset)=>({
      ...a,preference:a.type==="player"?(prefs[tradePreferenceKey(a.name)]||"neutral"):undefined,
    }));
    const mine=mineAll
      .filter(a=>a.value!=null&&Number(a.value)>0&&a.preference!=="untouchable")
      .sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0)).slice(0,30);

    const strengths:StrengthRow[]=data.leagueStrengths||[];
    const theirStrength=strengths.find(s=>s.rosterId===owner.rosterId);
    const myStrength=strengths.find(s=>s.rosterId===data.myTeam.rosterId);
    const targetValue=packageValue([target]);

    type Candidate={send:Asset[];sendAdj:number;diff:number;score:number};
    const candidates:Candidate[]=[];
    const consider=(send:Asset[])=>{
      const adj=packageValue(send);
      const diff=gap(adj,targetValue);
      if(diff>14)return;
      const penalty=send.reduce((s,a)=>s+(a.type==="player"?PREF_PENALTY[a.preference||"neutral"]:0),0);
      // need-fit: sending the owner a position they are short at makes the ask more realistic
      const sendPositions=[...new Set(send.filter(a=>a.type==="player"&&a.position).map(a=>String(a.position)))];
      const fit=sendPositions.length?sendPositions.reduce((s,p)=>s+Number(theirStrength?.positions?.[p]?.need||0),0)/sendPositions.length*6:0;
      candidates.push({send,sendAdj:adj,diff,score:diff+penalty+(send.length-1)*1.4-fit-(send.some(a=>a.type==="pick")?1.5:0)});
    };
    for(let i=0;i<mine.length;i++){
      consider([mine[i]]);
      for(let j=i+1;j<Math.min(mine.length,24);j++){
        consider([mine[i],mine[j]]);
        for(let k=j+1;k<Math.min(mine.length,16);k++)consider([mine[i],mine[j],mine[k]]);
      }
    }
    candidates.sort((a,b)=>a.score-b.score);

    // variety: best picks-only, best player-only, best mixed, then fill by score
    const kind=(c:Candidate)=>c.send.every(a=>a.type==="pick")?"Pick package":c.send.every(a=>a.type==="player")?"Player offer":"Players + picks";
    const chosen:Candidate[]=[];
    const seen=new Set<string>();
    const add=(c?:Candidate)=>{if(!c)return;const key=c.send.map(a=>a.id).sort().join("|");if(seen.has(key))return;seen.add(key);chosen.push(c)};
    for(const label of ["Pick package","Player offer","Players + picks"])add(candidates.find(c=>kind(c)===label));
    for(const c of candidates){if(chosen.length>=6)break;add(c)}

    const posFit=(c:Candidate)=>{
      const ps=[...new Set(c.send.filter(a=>a.type==="player"&&a.position).map(a=>String(a.position)))];
      const cell=ps.map(p=>({p,c:theirStrength?.positions?.[p]})).filter(x=>x.c).sort((a,b)=>Number(b.c!.need)-Number(a.c!.need))[0];
      return cell&&Number(cell.c!.need)>0?`${owner.name} ranks #${cell.c!.rank} at ${cell.p}, so that position is a need.`:undefined;
    };
    const myTargetPos=target.position&&myStrength?.positions?.[target.position];

    return Response.json({
      target,partner:{rosterId:owner.rosterId,name:owner.name},
      ideas:chosen.map(c=>({
        kind:kind(c),youSend:c.send,youGet:[target],
        sendValue:Math.round(c.send.reduce((s,a)=>s+(Number(a.value)||0),0)),receiveValue:Math.round(Number(target.value)),
        sendAdjusted:c.sendAdj,receiveAdjusted:targetValue,differencePct:c.diff,
        fitNote:posFit(c),
        preferenceNote:c.send.some(a=>a.preference==="actively-shopping")?"Includes a player you marked Actively Shopping.":c.send.some(a=>a.preference==="reluctant")?"Includes a player you marked Reluctant.":undefined,
      })),
      myPositionNote:myTargetPos?`Your team ranks #${myTargetPos.rank} at ${target.position}.`:undefined,
      valueNote:"Values are KeepTradeCut (KTC) based; packages use the same consolidation weighting as the Dynasty Rosters trade ideas.",
      note:chosen.length?undefined:"No packages from your roster land within ~14% of this player's value.",
    });
  }catch(e:any){
    return Response.json({error:"Could not generate trade ideas",detail:e?.message},{status:500});
  }
}

// GET mirrors POST so the generator can be opened/tested from a URL: ?leagueKey=...&sleeperId=...
export async function GET(req:Request){
  const url=new URL(req.url);
  return POST(new Request(req.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey:url.searchParams.get("leagueKey"),sleeperId:url.searchParams.get("sleeperId")})}));
}
