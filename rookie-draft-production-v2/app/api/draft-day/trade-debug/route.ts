export const dynamic="force-dynamic";
export async function GET(req:Request){
  const u=new URL(req.url);
  const source=u.searchParams.get("source")||"tradyr";
  if(source==="dd"){
    const r=await fetch("https://dynasty-daddy.com/api/v1/player/all/today",{cache:"no-store"});
    const data=await r.json();
    const wanted=(Array.isArray(data)?data:[]).filter((x:any)=>{
      const s=String(x.full_name||x.name_id||"").toLowerCase();
      return s.includes("kyren williams")||s.includes("max klare")||s.includes("2027")||s.includes("early 1st")||s.includes("1.01");
    });
    return Response.json({count:Array.isArray(data)?data.length:0,wanted});
  }
  const kind=u.searchParams.get("kind")||"player";
  const slug=u.searchParams.get("slug")||"kyren-williams-rb";
  const url=kind==="picks"?"https://api.tradyr.app/v1/picks?numQbs=2&numTeams=10":"https://api.tradyr.app/v1/players/"+encodeURIComponent(slug);
  const r=await fetch(url,{cache:"no-store"});
  const text=await r.text();
  return new Response(text,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});
}