import {ensureTursoSchema,rows} from "@/lib/turso";

type NoteBundle={id:string;name:string;position:string;notes:string;noteCount:number};
type Insight={playerId:string;summary:string;strengths:string[];concerns:string[];noteCount:number;source:"ai"|"fallback"|"none"};

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function sentences(text:string){return text.replace(/\s+/g," ").split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean)}
function fallback(bundle:NoteBundle):Insight{
  if(!bundle.notes.trim())return {playerId:bundle.id,summary:"No scouting notes have been added yet.",strengths:[],concerns:[],noteCount:0,source:"none"};
  const parts=sentences(bundle.notes),summary=parts.slice(0,3).join(" ")||bundle.notes.trim().slice(0,500);
  return {playerId:bundle.id,summary,strengths:[],concerns:[],noteCount:bundle.noteCount,source:"fallback"};
}
function parseJson(text:string){const clean=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");return JSON.parse(clean)}
function promptFor(bundles:NoteBundle[]){
  return `You are the scouting analyst inside a private dynasty rookie-draft workspace. Read ALL saved scouting notes supplied for each player and synthesize them without inventing facts. Return strict JSON only, as an array with one object per player in the same order. Each object must use exactly these keys: playerId, summary, strengths, concerns. summary should be 2-3 punchy sentences that reconcile repeated observations across games and mention important context or uncertainty. strengths should contain 1-3 short evidence-based themes. concerns should contain 0-3 short evidence-based themes. Do not mention fantasy rankings, draft grades, or information that is not in the notes.\n\n${bundles.map((b,i)=>`PLAYER ${i+1}\nID: ${b.id}\nNAME: ${b.name}\nPOSITION: ${b.position}\nSAVED NOTES (${b.noteCount} note records):\n${b.notes||"[No notes]"}`).join("\n\n---\n\n")}`;
}
async function generateGateway(bundles:NoteBundle[],token:string){
  const model=process.env.AI_GATEWAY_MODEL||"google/gemini-2.5-flash",prompt=promptFor(bundles);
  let last="";
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep(700*Math.pow(2,attempt-1));
    const r=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:prompt}],temperature:.2}),cache:"no-store"});
    last=await r.text();
    if(r.ok){const json=JSON.parse(last),text=String(json?.choices?.[0]?.message?.content||"");return parseJson(text)}
    if(r.status!==429&&r.status<500)break;
  }
  throw new Error(`AI Gateway summary request failed${last?": "+last.slice(0,180):""}`);
}
async function generateGemini(bundles:NoteBundle[],apiKey:string){
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash",prompt=promptFor(bundles);
  const body={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.2,responseMimeType:"application/json"}};
  let last="";
  for(let attempt=0;attempt<3;attempt++){
    if(attempt)await sleep(700*Math.pow(2,attempt-1));
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
    last=await r.text();
    if(r.ok){const json=JSON.parse(last),text=String(json?.candidates?.[0]?.content?.parts?.[0]?.text||"");return parseJson(text)}
    if(r.status!==429&&r.status<500)break;
  }
  throw new Error(`Gemini summary request failed${last?": "+last.slice(0,180):""}`);
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