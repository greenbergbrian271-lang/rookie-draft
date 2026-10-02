export const ALL_STAR_GAMES=[
  {key:"senior-bowl",name:"Panini Senior Bowl",legacyName:"Senior Bowl",date:"2027-01-30T19:30:00.000Z",dateLabel:"January 30, 2027",location:"Mobile, Alabama",tagline:"The Draft Starts in Mobile",websiteUrl:"https://www.seniorbowl.com/",twitterUrl:"https://x.com/seniorbowl",rosterAName:"National",rosterBName:"American",accent:"#ee3d45",accent2:"#21a6c4",logoUrl:"https://unavatar.io/x/seniorbowl"},
  {key:"shrine-bowl",name:"Shriners Children's East-West Bowl",legacyName:"Shrine Bowl",date:"2027-02-05T00:00:00.000Z",dateLabel:"February 4, 2027",location:"Arlington, Texas",tagline:"A century of college all-star football",websiteUrl:"https://shrinersbowl.com/",twitterUrl:"https://x.com/shrinersbowl",rosterAName:"East",rosterBName:"West",accent:"#d61f2c",accent2:"#6b257e",logoUrl:"https://unavatar.io/x/shrinersbowl"},
  {key:"hula-bowl",name:"Hula Bowl",legacyName:"Hula Bowl",date:"2027-01-09T17:00:00.000Z",dateLabel:"January 9, 2027",location:"Daytona, Florida",tagline:"From the islands to the mainland",websiteUrl:"https://www.hulabowl.com/",twitterUrl:"https://x.com/Hula_Bowl",rosterAName:"Team Aina",rosterBName:"Team Kai",accent:"#2d8a67",accent2:"#f59a32",logoUrl:"https://unavatar.io/x/Hula_Bowl"},
  {key:"american-bowl",name:"The American Bowl",legacyName:"American Bowl",date:"2027-01-22T17:00:00.000Z",dateLabel:"January 22, 2027",location:"Miami, Florida",tagline:"Rosters are built at the American Bowl",websiteUrl:"https://theamericanbowl.com/",twitterUrl:"https://x.com/theamericanbowl",rosterAName:"Warhawks",rosterBName:"Guardians",accent:"#d3b45d",accent2:"#15191f",logoUrl:"https://unavatar.io/x/theamericanbowl"}
] as const;

export type AllStarGameKey=(typeof ALL_STAR_GAMES)[number]["key"];
export type AllStarConfig={
  gameKey:AllStarGameKey;
  websiteUrl:string;
  twitterUrl:string;
  rosterAName:string;
  rosterAUrl:string;
  rosterBName:string;
  rosterBUrl:string;
};

export function gameDefinition(key:string){return ALL_STAR_GAMES.find(g=>g.key===key)||null}
export function gameKeyFromLegacy(detail:string){return ALL_STAR_GAMES.find(g=>g.legacyName===detail||g.name===detail)?.key||null}

export function normalizePersonName(value:unknown){
  return String(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\b(jr|sr|ii|iii|iv|v)\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
export function normalizeSourceText(value:unknown){
  return String(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
export function safeHttpsUrl(raw:unknown,allowBlank=false){
  const value=String(raw??"").trim();
  if(!value&&allowBlank)return "";
  try{
    const u=new URL(value);
    if(u.protocol!=="https:")return null;
    const host=u.hostname.toLowerCase();
    if(host==="localhost"||host.endsWith(".local")||host==="0.0.0.0"||host==="127.0.0.1"||host==="::1")return null;
    if(/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host))return null;
    return u.toString();
  }catch{return null}
}

function stripHtml(html:string){
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/(p|li|h1|h2|h3|h4|div|section|article|tr)>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi,"'")
    .replace(/&ndash;|&mdash;/gi,"-")
    .replace(/\s+/g," ")
    .trim();
}

export async function fetchAllStarSource(rawUrl:string){
  const url=safeHttpsUrl(rawUrl);
  if(!url)throw new Error("Source URL must be a public HTTPS address.");
  const isSocial=/\b(x\.com|twitter\.com)$/i.test(new URL(url).hostname);
  const targets=isSocial?["https://r.jina.ai/"+url]:[url,"https://r.jina.ai/"+url];
  let last="";
  for(const target of targets){
    try{
      const response=await fetch(target,{cache:"no-store",signal:AbortSignal.timeout(12000),headers:{"user-agent":"rookie-draft-all-star-invites/1.0","accept":"text/html,text/plain,application/xhtml+xml"}});
      if(!response.ok){last="HTTP "+response.status;continue}
      const raw=(await response.text()).slice(0,1_500_000);
      const text=target.includes("r.jina.ai/")?raw:stripHtml(raw);
      if(text.trim().length<80){last="Source returned too little readable text.";continue}
      return {text,url};
    }catch(e:unknown){last=e instanceof Error?e.message:String(e)}
  }
  throw new Error(last||"Could not read source.");
}

export function sourceHasPlayer(text:string,playerName:string,kind:string,rosterNames:string[]){
  const hay=" "+normalizeSourceText(text)+" ",needle=" "+normalizePersonName(playerName)+" ";
  const at=hay.indexOf(needle);
  if(at<0)return false;
  if(kind==="roster_a"||kind==="roster_b")return true;
  const pageLead=hay.slice(0,7000);
  const pageIsInviteList=/\b(accepted invites?|accepted players?|player roster|game roster|2027 athletes|2027 roster)\b/.test(pageLead);
  if(pageIsInviteList)return true;
  const window=hay.slice(Math.max(0,at-220),Math.min(hay.length,at+needle.length+220));
  const rosterCue=rosterNames.map(normalizePersonName).filter(Boolean).some(x=>window.includes(" "+x+" "));
  return rosterCue||/\b(invite|invited|invitation|accept|accepted|selected|selection|welcome|headed|bound|will play|will participate|joins|roster|all star)\b/.test(window);
}

export function excerptAround(text:string,playerName:string){
  const lower=text.toLowerCase(),needle=playerName.toLowerCase(),i=lower.indexOf(needle);
  if(i<0)return "";
  return text.slice(Math.max(0,i-110),Math.min(text.length,i+needle.length+170)).replace(/\s+/g," ").trim().slice(0,360);
}
