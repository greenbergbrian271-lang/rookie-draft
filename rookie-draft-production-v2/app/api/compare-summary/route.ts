import {ensureTursoSchema,rows} from "@/lib/turso";

type NoteBundle={id:string;name:string;position:string;notes:string;noteCount:number};
type Insight={playerId:string;summary:string;strengths:string[];concerns:string[];noteCount:number;source:"ai"|"fallback"|"none"};

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function sentences(text:string){return text.replace(/\s+/g," ").split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)}
function fallback(bundle:NoteBundle):Insight{
  if(!bundle.notes.trim())return {playerId:bundle.id,summary:"No scouting notes have been added yet.",strengths:[],concerns:[],noteCount:0,source:"none"};
  return {playerId:bundle.id,summary:"AI scouting synthesis is temporarily unavailable. Refresh the comparison to retry.",strengths:[],concerns:[],noteCount:bundle.noteCount,source:"fallback"};
}
function parseJson(text:string){const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");return JSON.parse(clean)}
function promptFor(bundles:NoteBundle[]){
  return `You are the scouting analyst inside a private dynasty rookie-draft workspace.

SYNTHESIZE the saved scouting notes. Do not quote, copy, or concatenate the notes.

For each player:
- Read every note from every game.
- Identify repeated traits and patterns across games.
- Separate recurring evidence from one-off observations.
- Reconcile contradictions or development over time.
- Write a concise 2-3 sentence synthesis in fresh language.
- Give 1-3 short recurring strength themes and 0-3 recurring concern themes.
- Stay strictly grounded in the notes; do not invent facts, stats, grades, or projections.
- Do not use first-person language even when the notes do.

Return strict JSON only, as an array with exactly these keys per player: playerId, summary, strengths, concerns.

${bundles.map((b,i)=>`PLAYER ${i+1}\nID: ${b.id}\nNAME: ${b.name}\nPOSITION: ${b.position}\nSAVED NOTES (${b.noteCount} note records):\n${b.notes||"[No notes]"}`).join("\n\n---\n\n")}`;
}
async function generateGateway(bundles:NoteBundle[],token:string){
  const model=process.env.AI_GATEWAY_MODEL||"openai/gpt-5.6-sol",prompt=promptFor(bundles);
  let last="";
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep(700*Math.pow(2,attempt-1));
    const r=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:prompt}],temperature:.15}),cache:"no-store"});
    last=await r.text();
    if(r.ok){const json=JSON.parse(last),text=String(json?.choices?.[0]?.message?.content||"");return parseJson(text)}
    if(r.status!==429&&r.status<500)break;
  }
  throw new Error(`AI Gateway summary request failed${last?": "+last.slice(0,180):""}`);
}
async function generateGemini(bundles:NoteBundle[],apiKey:string){
  const model=process.env.GEMINI_MODEL||"gemini-3.8-flash",prompt=promptFor(bundles);
  const body={model,input:prompt,store:false,generation_config:{temperature:.15,thinking_level:"low"}};
  let last="";
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep(700*Math.pow(2,attempt-1));
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify(body),cache:"no-store"});
    last=await r.text();
    if(r.ok){const json=JSON.parse(last),text=String(json?.output_text||"");return parseJson(text)}
    if(r.status!==429&&r.status<500)break;
  }
  throw new Error(`Gemini summary request failed${last?": "+last.slice(0,180):""}`);
}

export async function GET(req:Request){
  const url=new URL(req.url),test=url.searchParams.get("test")==="1";
  const gatewayToken=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  const geminiKey=process.env.GEMINI_API_KEY;
  if(!test)return Response.json({gatewayConfigured:Boolean(gatewayToken),geminiConfigured:Boolean(geminiKey),model:process.env.AI_GATEWAY_MODEL||"openai/gpt-5.6-sol"});
  const sample:NoteBundle={id:"health",name:"Health Check",position:"WR",notes:"Won repeatedly on intermediate routes. Had one concentration drop. Created separation late in the game.",noteCount:1};
  if(gatewayToken){
    try{
      const out=await generateGateway([sample],gatewayToken);
      return Response.json({ok:true,provider:"gateway",model:process.env.AI_GATEWAY_MODEL||"openai/gpt-5.6-sol",sample:Array.isArray(out)?out[0]:out});
    }catch(e:unknown){
      return Response.json({ok:false,provider:"gateway",error:e instanceof Error?e.message:"Gateway test failed"},{status:502});
    }
  }
  if(geminiKey){
    try{
      const out=await generateGemini([sample],geminiKey);
      return Response.json({ok:true,provider:"gemini",model:process.env.GEMINI_MODEL||"gemini-3.8-flash",sample:Array.isArray(out)?out[0]:out});
    }catch(e:unknown){
      return Response.json({ok:false,provider:"gemini",error:e instanceof Error?e.message:"Gemini test failed"},{status:502});
    }
  }
  return Response.json({ok:false,error:"No AI Gateway or Gemini credentials are available in this deployment."},{status:503});
}

export async function POST(req:Request){
  try{
    const body=await req.json(),raw=Array.isArray(body?.playerIds)?body.playerIds:[];
    const ids:string[]=[...new Set<string>(raw.map((x:unknown)=>String(x)).filter(Boolean))].slice(0,5);
    if(ids.length<2)return Response.json({error:"Select 2–5 players."},{status:400});
    const db=await ensureTursoSchema(),marks=ids.map(()=>"?").join(",");
    const [playerResult,evalResult,sessionResult]=await Promise.all([
      db.execute({sql:`select id,name,position from players where id in (${marks})`,args:ids}),
      db.execute({sql:`select player_id,category,value,commentary from evaluations where player_id in (${marks}) and category='__COMMENTARY__'`,args:ids}),
      db.execute({sql:`select player_id,game_date,opponent,raw_notes,overall_writeup,created_at from scouting_sessions where player_id in (${marks}) order by player_id,coalesce(game_date,created_at),id`,args:ids}),
    ]);
    const players=rows(playerResult),evals=rows(evalResult),sessions=rows(sessionResult),byPlayer=new Map(players.map((p:any)=>[String(p.id),p]));
    const bundles:NoteBundle[]=ids.map(id=>{
      const p:any=byPlayer.get(id),chunks:string[]=[];
      const legacy=evals.find((e:any)=>String(e.player_id)===id),legacyText=String(legacy?.commentary??legacy?.value??"").trim();
      if(legacyText)chunks.push(`Legacy scouting commentary:\n${legacyText}`);
      const games=sessions.filter((s:any)=>String(s.player_id)===id).filter((s:any)=>String(s.raw_notes??s.overall_writeup??"").trim());
      for(const s of games){const heading=[s.game_date,s.opponent?`vs ${s.opponent}`:""].filter(Boolean).join(" ")||"Scouting session",raw=String(s.raw_notes||"").trim(),writeup=String(s.overall_writeup||"").trim();chunks.push(`${heading}:\n${[raw,writeup].filter(Boolean).join("\n")}`)}
      return {id,name:String(p?.name||`Player ${id}`),position:String(p?.position||""),notes:chunks.join("\n\n"),noteCount:games.length+(legacyText?1:0)};
    });
    const base=Object.fromEntries(bundles.map(b=>[b.id,fallback(b)])) as Record<string,Insight>,withNotes=bundles.filter(b=>b.notes.trim());
    if(withNotes.length){
      let generated:any=null;
      const gatewayToken=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
      if(gatewayToken){try{generated=await generateGateway(withNotes,gatewayToken)}catch(e){console.warn("[COMPARE SUMMARY] AI Gateway failed",e)}}
      if(!Array.isArray(generated)&&process.env.GEMINI_API_KEY){try{generated=await generateGemini(withNotes,process.env.GEMINI_API_KEY)}catch(e){console.warn("[COMPARE SUMMARY] Gemini fallback failed",e)}}
      if(Array.isArray(generated))for(const item of generated){const id=String(item?.playerId||"");if(!base[id])continue;base[id]={playerId:id,summary:String(item?.summary||base[id].summary).trim()||base[id].summary,strengths:Array.isArray(item?.strengths)?item.strengths.map(String).filter(Boolean).slice(0,3):[],concerns:Array.isArray(item?.concerns)?item.concerns.map(String).filter(Boolean).slice(0,3):[],noteCount:base[id].noteCount,source:"ai"}}
    }
    return Response.json({summaries:ids.map(id=>base[id])});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not summarize scouting notes."},{status:500})}
}