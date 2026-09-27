import {getIntegrations} from "@/lib/integrations";

async function json(url:string){
  const res=await fetch(url,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

function matchRoster(rosters:any[],users:any[],identity:string){
  const id=String(identity||"").trim();
  let roster=rosters.find(r=>String(r.roster_id)===id)||rosters.find(r=>String(r.owner_id)===id);
  if(!roster){
    const user=users.find(u=>[u.display_name,u.username,u.user_id].some(v=>String(v||"").toLowerCase()===id.toLowerCase()));
    if(user)roster=rosters.find(r=>String(r.owner_id)===String(user.user_id));
  }
  if(!roster)return null;
  const owner=users.find(u=>String(u.user_id)===String(roster.owner_id));
  return {rosterId:String(roster.roster_id),ownerId:String(roster.owner_id||""),owner:owner?.display_name||owner?.username||""};
}

export async function GET(){
  const config=await getIntegrations();
  const checks=await Promise.all(config.sleeper.leagues.filter(l=>l.enabled!==false).map(async league=>{
    try{
      const root="https://api.sleeper.app/v1/league/"+league.leagueId;
      const [data,rosters,users]=await Promise.all([json(root),json(root+"/rosters"),json(root+"/users")]);
      return {
        key:league.key,
        configuredName:league.name,
        leagueId:league.leagueId,
        sleeperName:data?.name||"",
        season:data?.season||"",
        status:data?.status||"",
        teamIdentity:league.teamIdentity||"",
        rosterMatch:matchRoster(rosters,users,league.teamIdentity||""),
        ok:true,
      };
    }catch(e:any){
      return {key:league.key,configuredName:league.name,leagueId:league.leagueId,ok:false,error:e?.message||"Check failed"};
    }
  }));
  return Response.json({checks});
}
