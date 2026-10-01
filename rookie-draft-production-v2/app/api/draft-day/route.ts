import {ensureTursoSchema} from "@/lib/turso";
import {getIntegrations} from "@/lib/integrations";

const LEAGUE_VIEWS=[
  {slug:"one-league",boardKey:"one-league",name:"One League to Rule them All",fallbackRounds:5,fallbackTeams:10,superflex:true},
  {slug:"last-man-standing",boardKey:"last-man-standing",name:"Last Man Standing",fallbackRounds:4,fallbackTeams:12,superflex:true},
  {slug:"last-minute",boardKey:"last-minute-dynasty",name:"Last Minute",fallbackRounds:3,fallbackTeams:10,superflex:true},
  {slug:"dr",boardKey:"drew-ross",name:"D+R",fallbackRounds:3,fallbackTeams:12,superflex:true}
];

async function j(url:string){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw new Error("Sleeper returned "+r.status);
  return r.json();
}

async function leagueConfigs(){
  const config=await getIntegrations();
  return LEAGUE_VIEWS.map(view=>{
    const integration=config.sleeper.leagues.find(x=>x.key===view.boardKey);
    return {
      ...view,
      leagueId:integration?.leagueId||"",
      teamIdentity:String(integration?.teamIdentity||""),
      tePremium:Boolean(integration?.tePremium)
    };
  }).filter(x=>x.leagueId);
}

async function adp(){
  const all=await j("https://api.sleeper.app/v1/players/nfl"),year=new Date().getFullYear();
  return Object.entries(all).map(([playerId,p]:any)=>({...p,playerId}))
    .filter((p:any)=>["QB","RB","WR","TE"].includes(p.position)&&p.search_rank&&((p.years_exp===0)||Number(p.rookie_year)===year))
    .map((p:any)=>({name:`${p.first_name||""} ${p.last_name||""}`.trim(),position:p.position,team:p.team||"FA",college:p.college||"",adp:Number(p.search_rank),playerId:p.playerId}));
}

async function leaguePeople(leagueId:string,teamIdentity:string){
  const [users,rosters]=await Promise.all([
    j(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    j(`https://api.sleeper.app/v1/league/${leagueId}/rosters`)
  ]);
  const identity=teamIdentity.trim().toLowerCase();
  const byUser:Record<string,string>={};
  const matchedUsers=new Set<string>();
  for(const u of users){
    byUser[u.user_id]=u.metadata?.team_name||u.display_name||u.user_id;
    const candidates=[u.user_id,u.display_name,u.username,u.metadata?.team_name].map((v:any)=>String(v||"").trim().toLowerCase()).filter(Boolean);
    if(identity&&candidates.includes(identity))matchedUsers.add(String(u.user_id));
  }
  const byRoster:Record<number,string>={};
  const mine=new Set<number>();
  for(const r of rosters){
    const rosterId=Number(r.roster_id);
    byRoster[rosterId]=byUser[r.owner_id]||`Roster ${rosterId}`;
    if((identity&&String(rosterId)===identity)||matchedUsers.has(String(r.owner_id)))mine.add(rosterId);
  }
  return {byRoster,mine,users,rosters};
}

function currentOwner(originalRosterId:number,round:number,traded:any[],season?:number){
  const matches=traded.filter((p:any)=>
    Number(p.roster_id)===originalRosterId&&
    Number(p.round)===round&&
    (!season||!p.season||Number(p.season)===season)
  );
  const latest=matches[matches.length-1];
  return Number(latest?.owner_id||originalRosterId);
}

function slotForPick(pickNo:number,teams:number,type:string){
  const round=Math.floor((pickNo-1)/teams)+1;
  const within=((pickNo-1)%teams)+1;
  return String(type||"").toLowerCase()==="snake"&&round%2===0?teams-within+1:within;
}

async function leaguePicks(l:any){
  const [league,drafts,traded]=await Promise.all([
    j(`https://api.sleeper.app/v1/league/${l.leagueId}`),
    j(`https://api.sleeper.app/v1/league/${l.leagueId}/drafts`),
    j(`https://api.sleeper.app/v1/league/${l.leagueId}/traded_picks`).catch(()=>[])
  ]);
  const draft=[...drafts].sort((a:any,b:any)=>(b.start_time||0)-(a.start_time||0))[0];
  const teams=Number(league?.total_rosters||l.fallbackTeams||0);
  const rounds=Number(draft?.settings?.rounds||l.fallbackRounds||0);
  const total=teams*rounds;
  if(!draft)return{league:l.name,slug:l.slug,boardKey:l.boardKey,draftId:null,total,status:"No draft",teams,rounds,picks:[],slots:[]};

  const [rawPicks,people]=await Promise.all([
    j(`https://api.sleeper.app/v1/draft/${draft.draft_id}/picks`),
    leaguePeople(l.leagueId,l.teamIdentity)
  ]);

  const selectedByNo=new Map<number,any>(rawPicks.map((p:any)=>[Number(p.pick_no),p]));
  const slots=Array.from({length:total},(_,index)=>{
    const pickNo=index+1;
    const round=Math.floor(index/teams)+1;
    const slot=slotForPick(pickNo,teams,draft.type);
    const originalRosterId=Number(draft.slot_to_roster_id?.[slot]||slot);
    const rosterId=currentOwner(originalRosterId,round,traded,Number(draft.season||league?.season||0));
    const selected=selectedByNo.get(pickNo);
    return {
      round,
      pickNo,
      slot,
      rosterId,
      team:people.byRoster[rosterId]||`Roster ${rosterId}`,
      isMine:people.mine.has(rosterId),
      playerId:selected?.player_id||null,
      player:selected?.metadata?`${selected.metadata.first_name||""} ${selected.metadata.last_name||""}`.trim():null,
      position:selected?.metadata?.position||null,
      proTeam:selected?.metadata?.team||null
    };
  });

  const picks=slots.filter((p:any)=>p.playerId);
  return{league:l.name,slug:l.slug,boardKey:l.boardKey,draftId:draft.draft_id,total,status:draft.status,teams,rounds,picks,slots};
}

export async function GET(req:Request){
  try{
    const leagues=await leagueConfigs();
    const slug=new URL(req.url).searchParams.get("slug");
    if(slug){
      const league=leagues.find(x=>x.slug===slug);
      if(!league)return Response.json({error:"Draft league not found"},{status:404});
      return Response.json(await leaguePicks(league));
    }
    return Response.json({leagues:leagues.map(({leagueId,teamIdentity,fallbackRounds,fallbackTeams,...l})=>({...l,rounds:fallbackRounds,teams:fallbackTeams}))});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Draft-day data unavailable"},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const {action}=await req.json(),q=await ensureTursoSchema(),now=new Date().toISOString(),leagues=await leagueConfigs();
    if(action==="adp"||action==="force-adp"){
      const base=await adp();
      const lists=leagues.map(l=>({league:l.name,slug:l.slug,top75:base.map(p=>({...p,adjustedADP:p.adp*(l.superflex&&p.position==="QB"?.7:1)*(l.tePremium&&p.position==="TE"?.85:1)})).sort((a,b)=>a.adjustedADP-b.adjustedADP).slice(0,75)}));
      await q.execute({sql:"insert into settings(key,value,updated_at) values('sleeper_adp',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[JSON.stringify({action,lists}),now]});
      return Response.json({message:`Sleeper ADP updated for ${lists.length} league(s), top 75 each.`,lists});
    }
    const results:any[]=[];
    for(const l of leagues){
      try{results.push(await leaguePicks(l))}
      catch(e:any){results.push({league:l.name,slug:l.slug,boardKey:l.boardKey,error:e.message,picks:[],slots:[]})}
    }
    await q.execute({sql:"insert into settings(key,value,updated_at) values('draft_day_status',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[JSON.stringify({action,results}),now]});
    return Response.json({message:`${action||"sync"}: refreshed ${results.filter(x=>!x.error).length} league(s).`,results});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Draft-day action failed"},{status:500});
  }
}
