const key=process.env.GEMINI_API_KEY;
if(!key)throw new Error("GEMINI_API_KEY is not available to this preview build.");
const res=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
  method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({model:"gemini-3.8-flash",input:"Reply with one short sentence summarizing this: The receiver separated deep in two games but had one concentration drop.",generation_config:{thinking_level:"low"}})
});
const raw=await res.text();
if(!res.ok)throw new Error("Gemini API request was rejected.");
const body=JSON.parse(raw);
const text=String(body.output_text||"").trim();
if(!text)throw new Error("Gemini API returned no text.");
console.log("Gemini API connectivity verified.");
