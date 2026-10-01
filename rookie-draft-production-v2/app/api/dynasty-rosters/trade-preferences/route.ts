import {ensureTursoSchema} from "@/lib/turso";

export type TradePreference="actively-shopping"|"open"|"neutral"|"reluctant"|"untouchable";

const ALLOWED=new Set<TradePreference>(["actively-shopping","open","neutral","reluctant","untouchable"]);

export function tradePreferenceKey(name:string){
  return String(name||"")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]/g,"");
}

function settingKey(leagueKey:string){
  return "trade_preferences:"+leagueKey;
}

export async function readTradePreferences(leagueKey:string):Promise<Record<string,TradePreference>>{
  if(!leagueKey)return {};
  const c=await ensureTursoSchema();
  const result=await c.execute({sql:"select value from settings where key=?",args:[settingKey(leagueKey)]});
  if(!result.rows.length)return {};
  try{
    const parsed=JSON.parse(String(result.rows[0]?.value||"{}"));
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch{return {}}
}

async function writeTradePreferences(leagueKey:string,preferences:Record<string,TradePreference>){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:[settingKey(leagueKey),JSON.stringify(preferences),new Date().toISOString()],
  });
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
    if(!leagueKey||!playerName)return Response.json({error:"leagueKey and playerName are required"},{status:400});
    if(!ALLOWED.has(preference))return Response.json({error:"Invalid trade preference"},{status:400});

    const preferences=await readTradePreferences(leagueKey);
    const key=tradePreferenceKey(playerName);
    if(preference==="neutral")delete preferences[key];
    else preferences[key]=preference;
    await writeTradePreferences(leagueKey,preferences);
    return Response.json({leagueKey,playerName,preference,preferences});
  }catch(e:any){
    return Response.json({error:"Could not save trade preference",detail:e?.message},{status:500});
  }
}
