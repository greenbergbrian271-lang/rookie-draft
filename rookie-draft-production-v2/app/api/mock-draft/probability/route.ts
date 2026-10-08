import {GET as getMockDraftRoom} from "../route";
import {scoreCandidate,tendencyFor,type MockLeagueRoom,type MockPosition} from "@/lib/mock-draft";

export const dynamic="force-dynamic";

function hashNoise(input:string){
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  const u=Math.max(.0001,((h>>>0)%1000000)/1000000);
  return -Math.log(-Math.log(u));
}

export async function POST(req:Request){
  try{
    const body=await req.json(),leagueKey=String(body?.leagueKey||""),draftClass=Number(body?.draftClass||2027),targetId=String(body?.targetId||""),requestedPick=Number(body?.pickNo||0),simulations=Math.min(1200,Math.max(250,Number(body?.simulations)||700));
    if(!leagueKey||!targetId)return Response.json({error:"leagueKey and targetId are required"},{status:400});

    const roomRes=await getMockDraftRoom(new Request("http://internal/api/mock-draft?leagueKey="+encodeURIComponent(leagueKey)+"&draftClass="+encodeURIComponent(String(draftClass))));
    const room=await roomRes.json() as MockLeagueRoom&{error?:string};
    if(!roomRes.ok)return Response.json(room,{status:roomRes.status});

    const target=room.candidates.find(c=>String(c.id)===targetId);
    if(!target)return Response.json({error:"Target player not found on this league board"},{status:404});

    const mine=room.teams.find(t=>t.isMine);
    if(!mine)return Response.json({error:"Could not identify your roster"},{status:409});
    const liveSelected=new Set(room.slots.filter(s=>s.livePlayer).map(s=>String(s.livePlayer).toLowerCase()));
    if(liveSelected.has(target.name.toLowerCase()))return Response.json({target,probability:0,simulations,targetPick:null,status:"Already selected"});

    const openMine=room.slots.filter(s=>s.rosterId===mine.rosterId&&!s.livePlayer);
    const targetPick=requestedPick?openMine.find(s=>s.pickNo===requestedPick):openMine[0];
    if(!targetPick)return Response.json({error:"No open pick found for your roster"},{status:409});

    let survives=0;
    const takers=new Map<string,{team:string;rosterId:number;count:number;picks:number[]}>();
    const takenAt:number[]=[];

    for(let sim=0;sim<simulations;sim++){
      const available=new Map(room.candidates.filter(c=>!liveSelected.has(c.name.toLowerCase())).map(c=>[c.id,c]));
      const draftedByTeam=new Map<number,Partial<Record<MockPosition,number>>>();
      let taken=false;

      for(const slot of room.slots){
        if(slot.pickNo>=targetPick.pickNo)break;
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
          const noise=hashNoise(sim+":"+slot.pickNo+":"+candidate.id)*5.4;
          const score=base+noise;
          if(score>bestScore){bestScore=score;best=candidate}
        }
        if(!best)continue;
        available.delete(best.id);
        const pickedPosition=best.position as MockPosition;
        counts[pickedPosition]=(counts[pickedPosition]||0)+1;
        draftedByTeam.set(team.rosterId,counts);

        if(best.id===target.id){
          taken=true;takenAt.push(slot.pickNo);
          const key=String(team.rosterId),row=takers.get(key)||{team:team.name,rosterId:team.rosterId,count:0,picks:[]};
          row.count++;row.picks.push(slot.pickNo);takers.set(key,row);
          break;
        }
      }
      if(!taken)survives++;
    }

    const probability=survives/simulations;
    const likelyTakers=[...takers.values()].sort((a,b)=>b.count-a.count).slice(0,5).map(x=>({...x,share:x.count/simulations,averagePick:x.picks.length?x.picks.reduce((a,b)=>a+b,0)/x.picks.length:null}));
    const avgTakenPick=takenAt.length?takenAt.reduce((a,b)=>a+b,0)/takenAt.length:null;
    const status=probability>=.75?"Likely available":probability>=.45?"True toss-up":probability>=.2?"At risk":"Unlikely to reach you";

    return Response.json({target,targetPick,mine:{rosterId:mine.rosterId,name:mine.name},probability,simulations,status,likelyTakers,averageTakenPick:avgTakenPick});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not calculate target probability"},{status:500});
  }
}
