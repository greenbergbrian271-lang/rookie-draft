import {ensureTursoSchema,rows} from "@/lib/turso";
import {TRUSTED_HOSTS,SOCIAL_HOSTS,hostOf,hostMatches,isOfficialSchoolHost,loadLearnedHosts} from "@/lib/draft-declarations";

export const maxDuration=60;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

type Evidence={outlet:string;url:string;headline:string;date:string;claim:string;kind:"news"|"official"|"social"|"learned";grounded:boolean};
type Result={playerId:number;decision:"DECLARED"|"RETURNING"|"UNDECIDED";confidence:"High"|"Medium"|"Low"|"None";summary:string;evidence:Evidence[]};

function prompt(players:any[],learned:string[]){
  const today=new Date().toISOString().slice(0,10),cls=players[0]?.draft_class;
  return `Today is ${today}. You are researching college football players who are eligible for the ${cls} NFL Draft (held in April ${cls}).
For each player below, use Google Search to find out whether he has publicly announced a decision to (a) DECLARE for the NFL Draft or (b) RETURN to school / withdraw from the draft for another college season.

Rules:
- Only treat a decision as made if a trusted source reports a concrete announcement by the player (or official confirmation by his school/agent). Mock drafts, speculation, "expected to", "considering", rankings and old-year news do NOT count; those are UNDECIDED.
- Trusted sources: NFL.com, ESPN, CBS Sports, NBC Sports, Fox Sports, Sports Illustrated, Yahoo Sports, USA Today, The Athletic, NYT, ProFootballTalk, 247Sports, On3, Rivals, NCAA.com, the player's school official athletics site, and the player's own verified social account (X/Instagram).${learned.length?" Also trusted because the user supplied them: "+learned.join(", ")+".":""}
- The news must concern the ${cls} draft cycle. Ignore declarations for earlier years.
- Match the right person: same name AND same school AND position.
- Never guess. If you cannot find a qualifying report, the decision is UNDECIDED with no evidence.
- Every piece of evidence must be a real page you found, with its real URL.

Return ONLY a JSON array (no markdown fences, no commentary), one object per player, in this exact shape:
[{"playerId":<id>,"decision":"DECLARED"|"RETURNING"|"UNDECIDED","summary":"one sentence on what was reported","evidence":[{"outlet":"ESPN","url":"https://...","headline":"...","date":"YYYY-MM-DD","claim":"what this source says"}]}]

Players:
${players.map(p=>`- playerId ${p.id}: ${p.name}, ${p.position}, ${p.college||"college unknown"}`).join("\n")}`;
}

async function callGemini(text:string,apiKey:string){
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
  let last="";
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep(900*Math.pow(2,attempt-1));
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,{
      method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
      body:JSON.stringify({contents:[{parts:[{text}]}],tools:[{google_search:{}}],generationConfig:{temperature:.1}})
    });
    last=await r.text();
    if(r.ok)return JSON.parse(last);
    if(r.status!==429&&r.status<500)break;
  }
  throw new Error("Search request failed: "+last.slice(0,200));
}

function parseArray(text:string):any[]{
  const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const start=clean.indexOf("["),end=clean.lastIndexOf("]");
  if(start<0||end<start)return[];
  try{const v=JSON.parse(clean.slice(start,end+1));return Array.isArray(v)?v:[]}catch{return[]}
}

export async function POST(req:Request){
  try{
    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey)return Response.json({error:"GEMINI_API_KEY is not configured for this deployment, so web scanning is unavailable."},{status:503});
    const body=await req.json(),ids:number[]=(Array.isArray(body?.playerIds)?body.playerIds:[]).map(Number).filter(Boolean).slice(0,8);
    if(!ids.length)return Response.json({error:"playerIds required"},{status:400});
    const c=await ensureTursoSchema(),marks=ids.map(()=>"?").join(",");
    const players=rows(await c.execute({sql:`select id,name,position,college,draft_class from players where id in (${marks})`,args:ids})) as any[];
    const declared=new Set((rows(await c.execute({sql:"select player_id from workflow_tags where tag='DECLARES'",args:[]})) as any[]).map(r=>Number(r.player_id)));
    const todo=players.filter(p=>!declared.has(Number(p.id)));
    if(!todo.length)return Response.json({results:[]});
    const learned=await loadLearnedHosts();

    const json=await callGemini(prompt(todo,learned),apiKey);
    const cand=json?.candidates?.[0];
    const text=(cand?.content?.parts||[]).map((x:any)=>String(x?.text||"")).join("");
    // Hosts the search engine actually retrieved; evidence must match one of these to count as grounded.
    const grounded=new Set<string>();
    for(const ch of cand?.groundingMetadata?.groundingChunks||[]){
      const w=ch?.web||{};
      const t=String(w.title||"").toLowerCase().replace(/^www\./,"");
      if(t.includes("."))grounded.add(t);
      const h=hostOf(String(w.uri||""));
      if(h&&!/vertexaisearch|googleapis/.test(h))grounded.add(h);
    }
    const isGrounded=(h:string)=>[...grounded].some(g=>g===h||g.endsWith("."+h)||h.endsWith("."+g));

    const byId=new Map<number,any>();
    for(const o of parseArray(text))byId.set(Number(o?.playerId),o);

    const results:Result[]=todo.map(p=>{
      const o=byId.get(Number(p.id));
      const raw=String(o?.decision||"UNDECIDED").toUpperCase();
      const want=raw==="DECLARED"||raw==="RETURNING"?raw:"UNDECIDED";
      const evidence:Evidence[]=[];
      for(const e of Array.isArray(o?.evidence)?o.evidence:[]){
        const url=String(e?.url||""),host=hostOf(url);
        if(!host)continue;
        const kind=hostMatches(host,TRUSTED_HOSTS)?"news":isOfficialSchoolHost(host)?"official":hostMatches(host,SOCIAL_HOSTS)?"social":hostMatches(host,learned)?"learned":null;
        if(!kind)continue; // untrusted source: dropped, never shown as support
        evidence.push({outlet:String(e?.outlet||host).slice(0,60),url,headline:String(e?.headline||"").slice(0,200),date:String(e?.date||"").slice(0,10),claim:String(e?.claim||"").slice(0,300),kind,grounded:isGrounded(host)});
      }
      if(want==="UNDECIDED"||!evidence.length){
        return {playerId:Number(p.id),decision:"UNDECIDED",confidence:"None",summary:want==="UNDECIDED"?String(o?.summary||"No qualifying announcement found."):"A decision was suggested but no trusted source backed it, so it was discarded.",evidence:[]};
      }
      const groundedHosts=new Set(evidence.filter(e=>e.grounded).map(e=>hostOf(e.url)));
      const confidence:Result["confidence"]=groundedHosts.size>=2||evidence.some(e=>e.grounded&&(e.kind==="official"||e.kind==="social"))?"High":groundedHosts.size===1?"Medium":"Low";
      return {playerId:Number(p.id),decision:want as Result["decision"],confidence,summary:String(o?.summary||"").slice(0,300),evidence};
    });
    return Response.json({results,searchesRun:(cand?.groundingMetadata?.webSearchQueries||[]).length});
  }catch(e:any){
    return Response.json({error:e?.message||"Scan failed"},{status:500});
  }
}
