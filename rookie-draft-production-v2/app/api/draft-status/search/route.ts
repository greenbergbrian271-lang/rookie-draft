import {ensureTursoSchema,rows} from "@/lib/turso";

type Finding={playerId:string;playerName:string;status:"ENTERING_DRAFT"|"RETURNING_TO_SCHOOL"|"TRANSFER_PORTAL";sourceUrl?:string;sourceTitle?:string;sourceType?:string;announcementDate?:string;evidence?:string};
const ALLOWED=new Set(["ENTERING_DRAFT","RETURNING_TO_SCHOOL","TRANSFER_PORTAL"]);
function parseJsonArray(text:string){
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  try{const parsed=JSON.parse(clean);return Array.isArray(parsed)?parsed:Array.isArray(parsed?.findings)?parsed.findings:[]}catch{}
  const start=clean.indexOf("["),end=clean.lastIndexOf("]");
  if(start>=0&&end>start){const parsed=JSON.parse(clean.slice(start,end+1));return Array.isArray(parsed)?parsed:[]}
  throw new Error("Gemini returned an unreadable search result.");
}
const host=(raw:string)=>{try{return new URL(raw).hostname.toLowerCase().replace(/^www\./,"")}catch{return ""}};
const trusted=(url:string,title="")=>{
  const h=host(url),t=title.toLowerCase();
  return h==="espn.com"||h.endsWith(".espn.com")||h==="cbssports.com"||h.endsWith(".cbssports.com")||h==="nbcsports.com"||h.endsWith(".nbcsports.com")||h==="x.com"||h.endsWith(".x.com")||h==="twitter.com"||h.endsWith(".twitter.com")||h==="instagram.com"||h.endsWith(".instagram.com")||/\b(espn|cbs sports|nbc sports|x\.com|twitter|instagram)\b/i.test(t);
};
const sourceType=(url:string,title:string)=>{
  const h=host(url),t=title.toLowerCase();
  if(h.includes("x.com")||h.includes("twitter.com")||h.includes("instagram.com")||/twitter|instagram|x\.com/.test(t))return "SOCIAL";
  return "NEWS";
};

function prompt(players:any[],draftClass:number){
  return `You are doing a verification-oriented NFL Draft status check for a private scouting database.

Search the live web for ONLY explicit announcements or definitive reports about these players and the ${draftClass} NFL Draft cycle:
${players.map(p=>`- ID ${p.id}: ${p.name} (${p.position}, ${p.college||"college unknown"})`).join("\n")}

Classify a player only when a reliable source explicitly supports one of these statuses:
- ENTERING_DRAFT: the player announced or a reliable report definitively states he will enter/declare for the ${draftClass} NFL Draft or forgo remaining eligibility.
- RETURNING_TO_SCHOOL: the player announced or a reliable report definitively states he will return to college/play another college season instead of entering this draft.
- TRANSFER_PORTAL: the player announced or a reliable report definitively states he entered or intends to enter the transfer portal. Treat this as returning to school for draft-class purposes.

SOURCE RULES — be strict:
- Accept ESPN, CBS Sports, NBC Sports, or the player's own X/Twitter/Instagram account.
- A social result from someone other than the player is acceptable only when the search result clearly identifies a verified/credentialed reporter or official account and directly reports the player's decision.
- Reject mock drafts, prospect rankings, eligibility lists, rumors, predictions, fan sites, forums, aggregators, repost-only pages, and statements that merely say a player is eligible or expected to declare.
- If the source or account cannot be confidently verified, omit the player entirely.
- Focus on the current decision cycle, beginning July ${draftClass-1}. Do not use an older transfer/declaration decision from a prior season.
- Do not infer a decision from silence.

Return JSON only: an array of objects with exactly these keys:
playerId, playerName, status, sourceUrl, sourceTitle, sourceType, announcementDate, evidence.
Use the exact player ID above. sourceUrl must be the exact page/post URL from search. evidence must be a short paraphrase, not a quote. announcementDate may be empty if unknown. Omit players for whom no qualifying announcement is found.`;
}

export async function POST(req:Request){
  try{
    const body=await req.json(),draftClass=Number(body?.draftClass),requested=Array.isArray(body?.playerIds)?body.playerIds.map((x:any)=>Number(x)).filter(Boolean):[];
    if(!draftClass||!requested.length)return Response.json({error:"draftClass and playerIds are required"},{status:400});
    if(requested.length>8)return Response.json({error:"Search batches are limited to 8 players."},{status:400});
    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey)return Response.json({error:"Gemini is not configured."},{status:503});
    const c=await ensureTursoSchema(),marks=requested.map(()=>"?").join(",");
    const players=rows(await c.execute({
      sql:`select p.id,p.name,p.position,p.college from players p left join draft_statuses d on d.player_id=p.id and d.draft_class=? where p.draft_class=? and p.id in (${marks}) and d.player_id is null order by p.position,p.name`,
      args:[draftClass,draftClass,...requested]
    }));
    if(!players.length)return Response.json({findings:[],searched:0,queries:[]});

    const model=process.env.GEMINI_SEARCH_MODEL||process.env.GEMINI_MODEL||"gemini-2.5-flash";
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,{
      method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
      body:JSON.stringify({contents:[{parts:[{text:prompt(players,draftClass)}]}],tools:[{google_search:{}}],generationConfig:{temperature:.1}})
    });
    const raw=await r.text();
    if(!r.ok)throw new Error(`Draft-status search failed: ${raw.slice(0,240)}`);
    const json=JSON.parse(raw),candidate=json?.candidates?.[0]||{},parts=Array.isArray(candidate?.content?.parts)?candidate.content.parts:[];
    const text=parts.map((p:any)=>String(p?.text||"")).filter(Boolean).join("\n").trim();
    const parsed:any[]=parseJsonArray(text);
    const metadata=candidate?.groundingMetadata||{},chunks=Array.isArray(metadata?.groundingChunks)?metadata.groundingChunks:[],supports=Array.isArray(metadata?.groundingSupports)?metadata.groundingSupports:[];
    const allowedPlayers=new Map(players.map((p:any)=>[String(p.id),p]));
    const findings:Finding[]=[];
    for(const item of parsed){
      const id=String(item?.playerId||""),p:any=allowedPlayers.get(id),status=String(item?.status||"");
      if(!p||!ALLOWED.has(status))continue;
      const nameIndex=text.toLowerCase().indexOf(String(p.name).toLowerCase());
      let grounded:any=null;
      if(nameIndex>=0){
        const nearby=supports.filter((s:any)=>{const a=Number(s?.segment?.startIndex??-1),b=Number(s?.segment?.endIndex??-1);return a>=0&&b>=0&&a<=nameIndex+450&&b>=Math.max(0,nameIndex-120)});
        for(const s of nearby){for(const idx of s?.groundingChunkIndices||[]){const w=chunks[idx]?.web;if(w?.uri&&trusted(String(w.uri),String(w.title||""))){grounded=w;break}}if(grounded)break}
      }
      const proposedUrl=String(item?.sourceUrl||""),proposedTitle=String(item?.sourceTitle||"");
      const source=grounded||((proposedUrl&&trusted(proposedUrl,proposedTitle))?{uri:proposedUrl,title:proposedTitle}:null);
      if(!source)continue;
      findings.push({
        playerId:id,playerName:String(p.name),status:status as Finding["status"],sourceUrl:String(source.uri||proposedUrl),sourceTitle:String(source.title||proposedTitle||"Source"),
        sourceType:String(item?.sourceType||sourceType(String(source.uri||proposedUrl),String(source.title||proposedTitle))),announcementDate:String(item?.announcementDate||""),evidence:String(item?.evidence||"").trim()
      });
    }
    const deduped=[...new Map(findings.map(x=>[x.playerId,x])).values()];
    return Response.json({findings:deduped,searched:players.length,queries:Array.isArray(metadata?.webSearchQueries)?metadata.webSearchQueries:[],model});
  }catch(e:any){return Response.json({error:e?.message||"Could not search draft statuses"},{status:500})}
}
