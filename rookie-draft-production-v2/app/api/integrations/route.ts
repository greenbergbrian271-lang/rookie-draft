import {getIntegrations,saveIntegrations,type IntegrationsConfig,type SleeperLeagueIntegration} from "@/lib/integrations";

export async function GET(){
  try{return Response.json(await getIntegrations())}
  catch(e:any){return Response.json({error:"Could not load integrations",detail:e?.message},{status:500})}
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const leagues=(body?.sleeper?.leagues||[]) as SleeperLeagueIntegration[];
    if(!Array.isArray(leagues)||!leagues.length)return Response.json({error:"At least one Sleeper league is required"},{status:400});

    const seen=new Set<string>();
    const clean=leagues.map((league,index)=>{
      const name=String(league?.name||"").trim();
      const leagueId=String(league?.leagueId||"").trim();
      const key=String(league?.key||("league-"+index)).trim().replace(/[^a-zA-Z0-9_-]/g,"-");
      if(!name)throw new Error("Every league needs a name");
      if(!/^\d{10,25}$/.test(leagueId))throw new Error(name+" needs a valid Sleeper league ID");
      if(seen.has(key))throw new Error("League keys must be unique");
      seen.add(key);
      return {
        key,
        name,
        leagueId,
        teamIdentity:String(league?.teamIdentity||"").trim(),
        tePremium:Boolean(league?.tePremium),
        enabled:league?.enabled!==false,
      };
    });

    const config:IntegrationsConfig={sleeper:{leagues:clean}};
    await saveIntegrations(config);
    return Response.json({ok:true,config});
  }catch(e:any){
    return Response.json({error:e?.message||"Could not save integrations"},{status:400});
  }
}
