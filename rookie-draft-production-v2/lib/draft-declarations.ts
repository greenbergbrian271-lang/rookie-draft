import {ensureTursoSchema,rows} from "@/lib/turso";

// Outlets whose reporting counts as a trusted source for a draft decision.
export const TRUSTED_HOSTS=[
  "nfl.com","espn.com","cbssports.com","nbcsports.com","foxsports.com","si.com","yahoo.com","usatoday.com",
  "theathletic.com","nytimes.com","profootballtalk.com","247sports.com","on3.com","rivals.com","ncaa.com","bleacherreport.com"
];
// Player-own channels. A link here is only trusted if it is the player's own account, so the review table flags it.
export const SOCIAL_HOSTS=["x.com","twitter.com","instagram.com"];
export const LEARNED_KEY="draft_declaration_sources_v1";

export const hostOf=(url:string)=>{try{return new URL(/^https?:\/\//i.test(url)?url:"https://"+url).hostname.replace(/^www\./,"").toLowerCase()}catch{return""}};
export const hostMatches=(host:string,list:string[])=>!!host&&list.some(h=>host===h||host.endsWith("."+h));
// School athletics sites are official sources for their own players.
export const isOfficialSchoolHost=(host:string)=>/\.edu$/.test(host)||/(athletics|sports|gohuskies|hailstate|rolltide|ohiostatebuckeyes|mgoblue|texassports|ugasports|lsusports|seminoles|clemsontigers)/.test(host);

export async function loadLearnedHosts():Promise<string[]>{
  try{
    const c=await ensureTursoSchema(),r=rows(await c.execute({sql:"select value from settings where key=?",args:[LEARNED_KEY]}))[0] as any;
    const v=JSON.parse(String(r?.value||"{}"));
    return Array.isArray(v?.hosts)?v.hosts.map((x:any)=>String(x.host||x)).filter(Boolean):[];
  }catch{return[]}
}
