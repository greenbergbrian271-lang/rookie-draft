export const dynamic="force-dynamic";
export async function GET(req:Request){
  const u=new URL(req.url);
  const kind=u.searchParams.get("kind")||"player";
  const slug=u.searchParams.get("slug")||"kyren-williams-rb";
  const url=kind==="picks"?"https://api.tradyr.app/v1/picks?numQbs=2&numTeams=10":"https://api.tradyr.app/v1/players/"+encodeURIComponent(slug);
  const r=await fetch(url,{cache:"no-store"});
  const text=await r.text();
  return new Response(text,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});
}