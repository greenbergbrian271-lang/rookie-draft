import {ensureTursoSchema} from "@/lib/turso";

export type SleeperLeagueIntegration={
  key:string;
  name:string;
  leagueId:string;
  teamIdentity?:string;
  tePremium?:boolean;
  enabled?:boolean;
};

export type IntegrationsConfig={
  sleeper:{leagues:SleeperLeagueIntegration[]};
};

export const DEFAULT_SLEEPER_LEAGUES:SleeperLeagueIntegration[]=[
  {key:"one-league",name:"One League to Rule them All",leagueId:"1387925097968316416",teamIdentity:"4",tePremium:false,enabled:true},
  {key:"drew-ross",name:"Drew and Ross Present Superflex",leagueId:"1312070609894658048",teamIdentity:"cds1204",tePremium:false,enabled:true},
  {key:"last-man-standing",name:"Last Man Standing",leagueId:"1336778074775101440",teamIdentity:"cds1204",tePremium:true,enabled:true},
  {key:"last-minute-dynasty",name:"Last Minute Dynasty",leagueId:"1387508092408705024",teamIdentity:"cds1204",tePremium:true,enabled:true},
];

export const DEFAULT_INTEGRATIONS:IntegrationsConfig={
  sleeper:{leagues:DEFAULT_SLEEPER_LEAGUES},
};

export async function getIntegrations():Promise<IntegrationsConfig>{
  const c=await ensureTursoSchema();
  const result=await c.execute({sql:"select value from settings where key=?",args:["integrations"]});
  if(!result.rows.length)return DEFAULT_INTEGRATIONS;
  try{
    const parsed=JSON.parse(String(result.rows[0]?.value||"{}"));
    const leagues=Array.isArray(parsed?.sleeper?.leagues)?parsed.sleeper.leagues:DEFAULT_SLEEPER_LEAGUES;
    return {sleeper:{leagues}};
  }catch{
    return DEFAULT_INTEGRATIONS;
  }
}

export async function saveIntegrations(config:IntegrationsConfig){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:["integrations",JSON.stringify(config),new Date().toISOString()],
  });
}
