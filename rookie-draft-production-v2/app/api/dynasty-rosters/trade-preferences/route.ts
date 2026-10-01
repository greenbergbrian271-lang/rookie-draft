import {ensureTursoSchema} from "@/lib/turso";
import {
  readTradePreferences,
  tradePreferenceKey,
  TRADE_PREFERENCE_VALUES,
  writeTradePreferences,
  type TradePreference,
} from "@/lib/trade-preferences";

async function leaguesOwningPlayer(playerName:string){
  const c=await ensureTursoSchema();
  const result=await c.execute({sql:"select value from settings where key=?",args:["dynasty_rosters_live"]});
  if(!result.rows.length)return [];
  try{
    const parsed=JSON.parse(String(result.rows[0]?.value||"{}"));
    const wanted=tradePreferenceKey(playerName);
    return (parsed?.rosters||[])
      .filter((roster:any)=>(roster?.players||[]).some((p:any)=>tradePreferenceKey(String(p?.name||""))===wanted))
      .map((roster:any)=>String(roster?.key||""))
      .filter(Boolean);
  }catch{return []}
}

export async function GET(req:Request){
  try{
    const leagueKey=new URL(req.url).searchParams.get("leagueKey")||"";
    if(!leagueKey)return Response.json({error:"leagueKey is required"},{status:400});
    return Response.json({leagueKey,preferences:await readTradePreferences(leagueKey)});
  }catch(e:any){
    return Response.json({error:"Could not load trade preferences",detail:e?.message},{status:500});
  }
}

export async function PATCH(req:Request){
  try{
    const body=await req.json();
    const leagueKey=String(body?.leagueKey||"");
    const playerName=String(body?.playerName||"");
    const preference=String(body?.preference||"neutral") as TradePreference;
    const applyAllLeagues=Boolean(body?.applyAllLeagues);
    if(!leagueKey||!playerName)return Response.json({error:"leagueKey and playerName are required"},{status:400});
    if(!TRADE_PREFERENCE_VALUES.has(preference))return Response.json({error:"Invalid trade preference"},{status:400});

    const playerKey=tradePreferenceKey(playerName);
    let leagueKeys=[leagueKey];
    if(applyAllLeagues){
      const owned=await leaguesOwningPlayer(playerName);
      leagueKeys=[...new Set([leagueKey,...owned])];
    }

    for(const key of leagueKeys){
      const preferences=await readTradePreferences(key);
      if(preference==="neutral")delete preferences[playerKey];
      else preferences[playerKey]=preference;
      await writeTradePreferences(key,preferences);
    }

    return Response.json({
      leagueKey,
      playerName,
      preference,
      appliedLeagueKeys:leagueKeys,
      preferences:await readTradePreferences(leagueKey),
    });
  }catch(e:any){
    return Response.json({error:"Could not save trade preference",detail:e?.message},{status:500});
  }
}
