import {generateText} from "ai";
import {ensureTursoSchema,rows} from "@/lib/turso";

type NoteBundle={id:string;name:string;position:string;notes:string;noteCount:number};
type Insight={playerId:string;summary:string;strengths:string[];concerns:string[];noteCount:number;source:"ai"|"fallback"|"none"};

function unavailable(bundle:NoteBundle):Insight{
  if(!bundle.notes.trim())return {playerId:bundle.id,summary:"No scouting notes have been added yet.",strengths:[],concerns:[],noteCount:0,source:"none"};
  return {playerId:bundle.id,summary:"AI scouting synthesis is temporarily unavailable. Refresh the comparison to retry.",strengths:[],concerns:[],noteCount:bundle.noteCount,source:"fallback"};
}
function parseJson(text:string){
  const clean=text.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  const parsed=JSON.parse(clean);
  return Array.isArray(parsed)?parsed:Array.isArray(parsed?.players)?parsed.players:[];
}
function promptFor(bundles:NoteBundle[]){
  return `You are the scouting analyst inside a private dynasty rookie-draft workspace.

Your job is to SYNTHESIZE the scout's saved game notes, not quote them, not copy their wording, and not simply concatenate observations.

For each player:
- Read every note from every game.
- Identify recurring traits and patterns across games.
- Distinguish one-off observations from repeated evidence.
- Reconcile contradictions or development over time.
- Write a concise 2-3 sentence scouting synthesis in fresh language.
- Provide 1-3 short recurring strength themes and 0-3 short recurring concern themes.
- Stay strictly grounded in the notes. Do not invent stats, traits, rankings, grades, or draft projections.
- Do not quote more than a few words from any note.
- Do not use first-person language even when the scout's notes do.
- Do not mention that you are an AI.

Return ONLY valid JSON as an array, one object per player, in the same order:
[{"playerId":"...","summary":"...","strengths":["..."],"concerns":["..."]}]

${bundles.map((b,i)=>`PLAYER ${i+1}
ID: ${b.id}
NAME: ${b.name}
POSITION: ${b.position}
SAVED NOTE RECORDS: ${b.noteCount}
NOTES:
${b.notes||"[No notes]"}`).join("\n\n---\n\n")}`;
}
async function synthesize(bundles:NoteBundle[]){
  const model=process.env.AI_GATEWAY_MODEL||"google/gemini-3.5-flash-lite";
  const {text}=await generateText({
    model,
    prompt:promptFor(bundles),
    temperature:.15,
    providerOptions:{gateway:{disallowPromptTraining:true}}
  });
  return parseJson(text);
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
      for(const s of games){
        const heading=[s.game_date,s.opponent?`vs ${s.opponent}`:""].filter(Boolean).join(" ")||"Scouting session";
        const rawNote=String(s.raw_notes||"").trim(),writeup=String(s.overall_writeup||"").trim();
        chunks.push(`${heading}:\n${[rawNote,writeup].filter(Boolean).join("\n")}`);
      }
      return {id,name:String(p?.name||`Player ${id}`),position:String(p?.position||""),notes:chunks.join("\n\n"),noteCount:games.length+(legacyText?1:0)};
    });

    const base=Object.fromEntries(bundles.map(b=>[b.id,unavailable(b)])) as Record<string,Insight>;
    const withNotes=bundles.filter(b=>b.notes.trim());
    if(withNotes.length){
      try{
        const generated=await synthesize(withNotes);
        for(const item of generated){
          const id=String(item?.playerId||"");
          if(!base[id])continue;
          base[id]={
            playerId:id,
            summary:String(item?.summary||"").trim()||base[id].summary,
            strengths:Array.isArray(item?.strengths)?item.strengths.map(String).map(x=>x.trim()).filter(Boolean).slice(0,3):[],
            concerns:Array.isArray(item?.concerns)?item.concerns.map(String).map(x=>x.trim()).filter(Boolean).slice(0,3):[],
            noteCount:base[id].noteCount,
            source:"ai"
          };
        }
      }catch(e){
        console.error("[COMPARE SUMMARY] AI synthesis failed",e);
      }
    }
    return Response.json({summaries:ids.map(id=>base[id])});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not summarize scouting notes."},{status:500});
  }
}
