const key=process.env.GEMINI_API_KEY;
if(!key)throw new Error("GEMINI_API_KEY is not available to this preview build.");
const notes=[
  "Game 1: Explosive off the line and stacked the corner vertically several times. Created clean separation on an intermediate over route. Had one concentration drop late.",
  "Game 2: Again created separation downfield and tracked the ball well. Physical press caused trouble early, but he adjusted and released cleaner later."
].join("\n\n");
const prompt=`You are a scouting analyst. Synthesize ALL notes below in fresh language. Do not quote or copy the notes. Identify recurring patterns across games. Return ONLY valid JSON with keys summary, strengths, concerns. summary must be 2-3 sentences; strengths and concerns must be arrays of short themes.\n\n${notes}`;
const res=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
  method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({model:"gemini-3.8-flash",input:prompt,generation_config:{temperature:.15,thinking_level:"low"}})
});
const raw=await res.text();
if(!res.ok)throw new Error("Gemini verification failed: "+res.status+" "+raw.slice(0,500));
const body=JSON.parse(raw);
let text=String(body.output_text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
const parsed=JSON.parse(text);
if(typeof parsed.summary!=="string"||parsed.summary.trim().length<40)throw new Error("Gemini verification did not return a substantive summary.");
if(!Array.isArray(parsed.strengths))throw new Error("Gemini verification did not return a strengths array.");
if(!Array.isArray(parsed.concerns))throw new Error("Gemini verification did not return a concerns array.");
const normalized=parsed.summary.toLowerCase();
for(const copied of ["explosive off the line and stacked the corner vertically several times","physical press caused trouble early"]){
  if(normalized.includes(copied))throw new Error("Gemini verification echoed raw notes instead of synthesizing.");
}
console.log("Gemini scouting synthesis verification passed.");
