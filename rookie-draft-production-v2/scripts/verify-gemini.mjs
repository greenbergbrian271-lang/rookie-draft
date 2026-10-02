const key=process.env.GEMINI_API_KEY;
if(!key)throw new Error("GEMINI_API_KEY is not available to this preview build.");
const notes=[
  "Game 1: Explosive off the line and stacked the corner vertically several times. Created clean separation on an intermediate over route. Had one concentration drop late.",
  "Game 2: Again created separation downfield and tracked the ball well. Physical press caused trouble early, but he adjusted and released cleaner later."
].join("\n\n");
const prompt=`Synthesize these scouting notes into one concise scouting paragraph in fresh language. Identify the recurring strengths and meaningful concern. Do not quote or copy the notes verbatim.\n\n${notes}`;
const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{
  method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{thinkingConfig:{thinkingLevel:"low"}}
  })
});
const raw=await res.text();
if(!res.ok)throw new Error("Gemini generateContent request was rejected.");
const body=JSON.parse(raw);
const parts=Array.isArray(body?.candidates?.[0]?.content?.parts)?body.candidates[0].content.parts:[];
const text=parts.map(p=>String(p?.text||"")).filter(Boolean).join("\n").trim();
if(text.length<60)throw new Error("Gemini returned no substantive synthesis.");
const lower=text.toLowerCase();
for(const copied of [
  "explosive off the line and stacked the corner vertically several times",
  "created clean separation on an intermediate over route",
  "physical press caused trouble early"
]){
  if(lower.includes(copied))throw new Error("Gemini echoed raw notes rather than synthesizing.");
}
console.log("Gemini scouting synthesis verification passed.");
