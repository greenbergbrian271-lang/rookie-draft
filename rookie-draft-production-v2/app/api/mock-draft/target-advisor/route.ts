import {GET as getMockDraftRoom} from "../route";
import {scoreCandidate,tendencyFor,type MockLeagueRoom,type MockPosition} from "@/lib/mock-draft";
import {getKtcPickValue,loadKtcDataset,type KtcDataset} from "@/lib/ktc";
import {ktcMovement} from "@/lib/ktc-history";
import {ensureTursoSchema} from "@/lib/turso";

export const dynamic="force-dynamic";

const ADP_SLUG:Record<string,string>={
  "one-league":"one-league",
  "last-man-standing":"last-man-standing",
  "last-minute-dynasty":"last-minute",
  "drew-ross":"dr",
};

function norm(value:any){
  return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}

function hashNoise(input:string){
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  const u=Math.max(.0001,((h>>>0)%1000000)/1000000);
  return -Math.log(-Math.log(u));
}

function slotLabel(slot:{round:number;slot:number}){
  return slot.round+"."+String(slot.slot).padStart(2,"0");
}

function approxPickValue(dataset:KtcDataset,season:number,round:number,slot:number,teams:number){
  const early=getKtcPickValue(dataset,season,round,"Early");
  const mid=getKtcPickValue(dataset,season,round,"Mid");
  const late=getKtcPickValue(dataset,season,round,"Late");
  if(early==null&&mid==null&&late==null)return null;
  const e=early??mid??late??0,m=mid??early??late??0,l=late??mid??early??0;
  if(teams<=1)return Math.round(m);
  const middle=(teams+1)/2;
  if(slot<=middle){
    const t=Math.max(0,Math.min(1,(slot-1)/Math.max(1,middle-1)));
    return Math.round(e+(m-e)*t);
  }
  const t=Math.max(0,Math.min(1,(slot-middle)/Math.max(1,teams-middle)));
  return Math.round(m+(l-m)*t);
}

function statusFor(probability:number){
  if(probability>=.85)return "Very likely available";
  if(probability>=.72)return "Likely available";
  if(probability>=.48)return "True toss-up";
  if(probability>=.25)return "At risk";
  return "Unlikely to reach you";
}

async function marketOverlay(leagueKey:string,target:{name:string;rank:number;position:string}){
  let adpRank:number|null=null;
  try{
    const db=await ensureTursoSchema(),result=await db.execute({sql:"select value from settings where key='sleeper_adp'",args:[]});
    if(result.rows.length){
      const saved=JSON.parse(String(result.rows[0]?.value||"{}")),slug=ADP_SLUG[leagueKey]||leagueKey;
      const list=(saved?.lists||[]).find((x:any)=>x.slug===slug)?.top75||[];
      const index=list.findIndex((x:any)=>norm(x.name)===norm(target.name));
      if(index>=0)adpRank=index+1;
    }
  }catch{}

  let ktc7ChangePct:number|null=null;
  try{
    const movement=await ktcMovement(7);
    const row=(movement.rows||[]).find((x:any)=>norm(x.name)===norm(target.name)&&String(x.position||"")===target.position);
    if(row?.changePct!=null)ktc7ChangePct=Number(row.changePct);
  }catch{}

  let heat="Neutral";
  if((adpRank!=null&&adpRank<=target.rank-4)||(ktc7ChangePct!=null&&ktc7ChangePct>=7))heat="Market running hotter";
  else if((adpRank!=null&&adpRank>=target.rank+6)||(ktc7ChangePct!=null&&ktc7ChangePct<=-7))heat="Market cooler than your board";

  return {adpRank,boardRank:target.rank,adpDelta:adpRank==null?null:adpRank-target.rank,ktc7ChangePct,heat};
}

export async function POST(req:Request){
  try{
    const body=await req.json(),leagueKey=String(body?.leagueKey||""),draftClass=Number(body?.draftClass||2027),targetId=String(body?.targetId||""),requestedPick=Number(body?.pickNo||0),simulations=Math.min(1200,Math.max(300,Number(body?.simulations)||700));
    if(!leagueKey||!targetId)return Response.json({error:"leagueKey and targetId are required"},{status:400});

    const roomRes=await getMockDraftRoom(new Request("http://internal/api/mock-draft?leagueKey="+encodeURIComponent(leagueKey)+"&draftClass="+encodeURIComponent(String(draftClass))));
    const room=await roomRes.json() as MockLeagueRoom&{error?:string};
    if(!roomRes.ok)return Response.json(room,{status:roomRes.status});

    const target=room.candidates.find(c=>String(c.id)===targetId);
    if(!target)return Response.json({error:"Target player not found on this league board"},{status:404});
    const mine=room.teams.find(t=>t.isMine);
    if(!mine)return Response.json({error:"Could not identify your roster"},{status:409});

    const liveSelected=new Set(room.slots.filter(s=>s.livePlayer).map(s=>String(s.livePlayer).toLowerCase()));
    if(liveSelected.has(target.name.toLowerCase()))return Response.json({target,status:"Already selected",action:"SELECTED",simulations});

    const openMine=room.slots.filter(s=>s.rosterId===mine.rosterId&&!s.livePlayer).sort((a,b)=>a.pickNo-b.pickNo);
    const currentPick=requestedPick?openMine.find(s=>s.pickNo===requestedPick):openMine[0];
    if(!currentPick)return Response.json({error:"No open pick found for your roster"},{status:409});

    const windowStart=Math.max(1,currentPick.pickNo-6),windowEnd=Math.min(room.slots.length,currentPick.pickNo+8);
    const candidateSlots=room.slots.filter(s=>!s.livePlayer&&s.pickNo>=windowStart&&s.pickNo<=windowEnd);
    const maxCutoff=Math.max(currentPick.pickNo,...candidateSlots.map(s=>s.pickNo));
    const takenAt:(number|null)[]=[];
    const takers=new Map<string,{team:string;rosterId:number;count:number;picks:number[]}>();

    for(let sim=0;sim<simulations;sim++){
      const available=new Map(room.candidates.filter(c=>!liveSelected.has(c.name.toLowerCase())).map(c=>[c.id,c]));
      const draftedByTeam=new Map<number,Partial<Record<MockPosition,number>>>();
      let targetPickNo:number|null=null;

      for(const slot of room.slots){
        if(slot.pickNo>=maxCutoff)break;
        const team=room.teams.find(t=>t.rosterId===slot.rosterId);
        if(!team)continue;
        const counts=draftedByTeam.get(team.rosterId)||{};

        if(slot.livePlayer){
          const livePos=slot.livePosition as MockPosition|null;
          if(livePos)counts[livePos]=(counts[livePos]||0)+1;
          draftedByTeam.set(team.rosterId,counts);
          continue;
        }

        let best:any=null,bestScore=-Infinity;
        const tendency=tendencyFor(team,room.tendencies);
        for(const candidate of available.values()){
          const base=scoreCandidate(candidate,team,slot.pickNo,tendency,counts,{superflex:room.league.superflex,tePremium:room.league.tePremium}).score;
          const score=base+hashNoise("advisor:"+sim+":"+slot.pickNo+":"+candidate.id)*5.4;
          if(score>bestScore){bestScore=score;best=candidate}
        }
        if(!best)continue;
        available.delete(best.id);
        const pos=best.position as MockPosition;
        counts[pos]=(counts[pos]||0)+1;
        draftedByTeam.set(team.rosterId,counts);

        if(best.id===target.id){
          targetPickNo=slot.pickNo;
          const key=String(team.rosterId),row=takers.get(key)||{team:team.name,rosterId:team.rosterId,count:0,picks:[]};
          row.count++;row.picks.push(slot.pickNo);takers.set(key,row);
          break;
        }
      }
      takenAt.push(targetPickNo);
    }

    const probabilityAt=(pickNo:number)=>takenAt.filter(x=>x==null||x>=pickNo).length/simulations;
    const dataset=await loadKtcDataset(false),season=Number(room.league.draftClass||draftClass);
    const curve=candidateSlots.map(slot=>({
      pickNo:slot.pickNo,round:slot.round,slot:slot.slot,label:slotLabel(slot),rosterId:slot.rosterId,team:slot.team,isMine:slot.isMine,
      probability:probabilityAt(slot.pickNo),
      pickValue:approxPickValue(dataset,season,slot.round,slot.slot,room.league.teams),
    })).sort((a,b)=>a.pickNo-b.pickNo);

    const current=curve.find(x=>x.pickNo===currentPick.pickNo)||{
      pickNo:currentPick.pickNo,round:currentPick.round,slot:currentPick.slot,label:slotLabel(currentPick),rosterId:currentPick.rosterId,team:currentPick.team,isMine:true,
      probability:probabilityAt(currentPick.pickNo),pickValue:approxPickValue(dataset,season,currentPick.round,currentPick.slot,room.league.teams),
    };
    const currentProbability=current.probability;
    const up=curve.filter(x=>x.pickNo<current.pickNo&&!x.isMine);
    const down=curve.filter(x=>x.pickNo>current.pickNo&&!x.isMine);
    const safeUp=[...up].filter(x=>x.probability>=.80).sort((a,b)=>b.pickNo-a.pickNo)[0];
    const improvedUp=[...up].sort((a,b)=>b.pickNo-a.pickNo).find(x=>x.probability>=Math.min(.78,currentProbability+.16))||[...up].sort((a,b)=>a.pickNo-b.pickNo)[0];
    const tradeUp=safeUp||improvedUp;
    const tradeDown=[...down].filter(x=>x.probability>=.70).sort((a,b)=>b.pickNo-a.pickNo)[0];

    let action:"MOVE UP"|"HOLD"|"TRADE DOWN"="HOLD";
    let recommended:any=current;
    if(currentProbability<.72&&tradeUp){action="MOVE UP";recommended=tradeUp}
    else if(currentProbability>=.88&&tradeDown){action="TRADE DOWN";recommended=tradeDown}

    const valueDelta=current.pickValue!=null&&recommended.pickValue!=null
      ? action==="MOVE UP"?Math.max(0,recommended.pickValue-current.pickValue)
        :action==="TRADE DOWN"?Math.max(0,current.pickValue-recommended.pickValue):0
      :null;

    const threats=[...takers.values()].map(x=>({
      ...x,
      share:x.picks.filter(p=>p<current.pickNo).length/simulations,
      averagePick:x.picks.length?x.picks.reduce((a,b)=>a+b,0)/x.picks.length:null,
    })).filter(x=>x.share>0).sort((a,b)=>b.share-a.share).slice(0,5);

    const rationale:string[]=[];
    if(action==="MOVE UP"){
      rationale.push(target.name+" reaches "+current.label+" in only "+Math.round(currentProbability*100)+"% of simulations.");
      rationale.push(recommended.label+" raises that to "+Math.round(recommended.probability*100)+"% and is the latest open pick in the window that clears the safety target.");
      if(threats[0])rationale.push(threats[0].team+" is the biggest modeled threat before your pick.");
    }else if(action==="TRADE DOWN"){
      rationale.push(target.name+" reaches "+current.label+" in "+Math.round(currentProbability*100)+"% of simulations.");
      rationale.push("You can move as far as "+recommended.label+" and still retain a "+Math.round(recommended.probability*100)+"% modeled chance.");
      rationale.push("That is the furthest open pick in the tested window that stays above the trade-down safety floor.");
    }else{
      rationale.push(target.name+" reaches "+current.label+" in "+Math.round(currentProbability*100)+"% of simulations.");
      rationale.push(currentProbability>=.72?"The current pick already clears the hold threshold without giving away unnecessary value.":"The model does not find a clean trade-up point that improves certainty enough to justify forcing a move.");
      if(tradeDown)rationale.push("A move down to "+tradeDown.label+" is possible, but the survival probability falls to "+Math.round(tradeDown.probability*100)+"%.");
    }

    const market=await marketOverlay(leagueKey,target);
    return Response.json({
      target,
      simulations,
      currentPick:current,
      probability:currentProbability,
      status:statusFor(currentProbability),
      action,
      recommendedPick:recommended,
      valueDelta,
      valueBasis:"Approximate KTC rookie-pick value interpolated between Early/Mid/Late buckets.",
      safeThreshold:.80,
      tradeDownThreshold:.70,
      rationale,
      likelyTakers:threats,
      curve,
      market,
      generatedAt:new Date().toISOString(),
    });
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build target advice"},{status:500});
  }
}
