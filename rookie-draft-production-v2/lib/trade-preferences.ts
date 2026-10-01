import {ensureTursoSchema} from "@/lib/turso";

export type TradePreference="actively-shopping"|"open"|"neutral"|"reluctant"|"untouchable";

export const TRADE_PREFERENCE_VALUES=new Set<TradePreference>(["actively-shopping","open","neutral","reluctant","untouchable"]);

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

export async function writeTradePreferences(leagueKey:string,preferences:Record<string,TradePreference>){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:[settingKey(leagueKey),JSON.stringify(preferences),new Date().toISOString()],
  });
}
