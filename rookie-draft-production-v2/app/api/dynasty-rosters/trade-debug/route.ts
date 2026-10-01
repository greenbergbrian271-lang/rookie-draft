import {POST as draftIdeas} from "../../draft-day/trade-ideas/route";
import {POST as rosterIdeas} from "../trade-ideas/route";

export const dynamic="force-dynamic";

export async function GET(){
  const [draftRes,rosterRes]=await Promise.all([
    draftIdeas(new Request("http://internal/api/draft-day/trade-ideas",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({slug:"one-league",pickNo:20})
    })),
    rosterIdeas(new Request("http://internal/api/dynasty-rosters/trade-ideas",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({leagueKey:"one-league",partnerRosterId:9})
    }))
  ]);
  const draft=await draftRes.json();
  const roster=await rosterRes.json();
  return Response.json({
    draftStatus:draftRes.status,
    draft:{
      pick:draft?.pick,
      me:draft?.me,
      ideas:(draft?.ideas||[]).map((x:any)=>({
        kind:x.kind,
        send:x.youSend?.map((a:any)=>({name:a.name,position:a.position,value:a.value,preference:a.preference})),
        get:x.youGet?.map((a:any)=>({name:a.name,position:a.position,value:a.value})),
        gap:x.differencePct
      }))
    },
    rosterStatus:rosterRes.status,
    roster:{
      partner:roster?.partnerTeam,
      preferencesApplied:roster?.preferencesApplied,
      ideas:(roster?.ideas||[]).map((x:any)=>({
        kind:x.kind,
        send:x.youSend?.map((a:any)=>({name:a.name,type:a.type,value:a.value,preference:a.preference})),
        get:x.youGet?.map((a:any)=>({name:a.name,type:a.type,value:a.value})),
        gap:x.differencePct
      }))
    }
  });
}