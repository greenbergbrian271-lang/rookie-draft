const key=process.env.GEMINI_API_KEY;
if(!key)throw new Error("GEMINI_API_KEY is not available to this preview build.");
const notes=[
  "Game 1: Explosive off the line and stacked the corner vertically several times. Created clean separation on an intermediate over route. Had one concentration drop late.",
  "Game 2: Again created separation downfield and tracked the ball well. Physical press caused trouble early, but he adjusted and released cleaner later."
].join("\n\n");
const prompt=`Synthesize these scouting notes into one concise scouting paragraph in fresh language. Identify the recurring strengths and the meaningful concern. Do not quote or copy the notes verbatim.\n\n${notes}`;
const res=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
  method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({model:"gemini-3.8-flash",input:prompt,generation_config:{temperature:.15,thinking_level:"low"}})
});
const raw=await res.text();
if(!res.ok)throw new Error("Gemini verification failed: "+res.status+" "+raw.slice(0,500));
const body=JSON.parse(raw);
const text=String(body.output_text||"").trim();
if(text.length<80)throw new Error("Gemini verification returned an insubstantial synthesis.");
const lower=text.toLowerCase();
for(const copied of [
  "explosive off the line and stacked the corner vertically several times",
  "created clean separation on an intermediate over route",
  "physical press caused trouble early"
]){
  if(lower.includes(copied))throw new Error("Gemini verification echoed raw notes instead of synthesizing.");
}
console.log("Gemini scouting synthesis verification passed.");
