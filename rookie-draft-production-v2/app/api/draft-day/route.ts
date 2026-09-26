import {db,ensureSchema} from "@/lib/db";
const LEAGUES=[{leagueId:"1221511485390340096",slug:"one-league",name:"One League to Rule them All",rounds:5,teams:10,tePremium:false,superflex:true},{leagueId:"1336778074775101440",slug:"last-man-standing",name:"Last Man Standing",rounds:4,teams:12,tePremium:true,superflex:true},{leagueId:"1241921337656623104",slug:"last-minute",name:"Last Minute",rounds:3,teams:10,tePremium:true,superflex:true},{leagueId:"1180230050186817536",slug:"dr",name:"D+R",rounds:3,teams:12,tePremium:false,superflex:true}];
async function j(url:string){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error("Sleeper returned "+r.status);return r.json()}
async function adp(){const all=await j("https://api.sleeper.app/v1/players/nfl"),year=new Date().getFullYear();return Object.entries(all).map(([playerId,p]:any)=>({...p,playerId})).filter((p:any)=>["QB","RB","WR","TE"].includes(p.position)&&p.search_rank&&((p.years_exp===0)||Number(p.rookie_year)===year)).map((p:any)=>({name:`${p.first_name||""} ${p.last_name||""}`.trim(),position:p.position,team:p.team||"FA",college:p.college||"",adp:Number(p.search_rank),playerId:p.playerId}))}
async function teamNames(leagueId:string){const [users,rosters]=await Promise.all([j(`https://api.sleeper.app/v1/league/${leagueId}/users`),j(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)]);const byUser:Record<string,string>={};for(const u of users)byUser[u.user_id]=u.metadata?.team_name||u.display_name||u.user_id;const byRoster:Record<number,string>={};for(const r of rosters)byRoster[r.roster_id]=byUser[r.owner_id]||`Roster ${r.roster_id}`;return byRoster}
async function leaguePicks(l:typeof LEAGUES[number]){
  const drafts=await j(`https://api.sleeper.app/v1/league/${l.leagueId}/drafts`),draft=[...drafts].sort((a:any,b:any)=>b.start_time-a.start_time)[0];
  const total=l.rounds*l.teams;
  if(!draft)return{league:l.name,slug:l.slug,draftId:null,total,status:"No draft",picks:[]};
  const [rawPicks,byRoster]=await Promise.all([j(`https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`),teamNames(l.leagueId)]);
  const picks=rawPicks.map((p:any)=>({round:p.round,pickNo:p.pick_no,slot:p.draft_slot,team:byRoster[p.roster_id]||p.picked_by||"—",playerId:p.player_id||null,player:p.metadata?`${p.metadata.first_name||""} ${p.metadata.last_name||""}`.trim():null,position:p.metadata?.position||null,proTeam:p.metadata?.team||null})).sort((a:any,b:any)=>a.pickNo-b.pickNo);
  return{league:l.name,slug:l.slug,draftId:draft.draft_id,total,status:draft.status,picks};
}
export async function GET(){
  return Response.json({leagues:LEAGUES.map(({leagueId,...l})=>l)});
}
export async function POST(req:Request){
  try{
    await ensureSchema();const {action}=await req.json(),q=db();
    if(action==="adp"||action==="force-adp"){
      const base=await adp(),lists=LEAGUES.map(l=>({league:l.name,slug:l.slug,top75:base.map(p=>({...p,adjustedADP:p.adp*(l.superflex&&p.position==="QB"?.7:1)*(l.tePremium&&p.position==="TE"?.85:1)})).sort((a,b)=>a.adjustedADP-b.adjustedADP).slice(0,75)}));
      await q`insert into settings(key,value,updated_at) values('sleeper_adp',${JSON.stringify({action,lists})}::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`;
      return Response.json({message:`Sleeper ADP updated for ${lists.length} league(s), top 75 each.`,lists});
    }
    const results:any[]=[];
    for(const l of LEAGUES){
      try{results.push(await leaguePicks(l))}
      catch(e:any){results.push({league:l.name,slug:l.slug,error:e.message,picks:[]})}
    }
    await q`insert into settings(key,value,updated_at) values('draft_day_status',${JSON.stringify({action,results})}::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`;
    return Response.json({message:`${action||"sync"}: refreshed ${results.filter(x=>!x.error).length} league(s).`,results});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Draft-day action failed"},{status:500})}
}
