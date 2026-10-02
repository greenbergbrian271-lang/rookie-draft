import {gameDefinition,safeHttpsUrl} from "@/lib/all-star-games";

export const dynamic="force-dynamic";
const attr=(tag:string,name:string)=>{
  const m=tag.match(new RegExp("(?:^|\\s)"+name+"\\s*=\\s*[\"']([^\"']+)[\"']","i"));
  return m?.[1]||"";
};
function resolveAsset(raw:string,base:string){
  try{
    const value=raw.trim().split(/\\s+/)[0];
    if(!value||value.startsWith("data:"))return null;
    const url=new URL(value,base).toString();
    return safeHttpsUrl(url);
  }catch{return null}
}
function candidates(html:string,base:string,gameName:string){
  const out:{url:string;score:number}[]=[],seen=new Set<string>(),words=gameName.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\\s+/).filter(x=>x.length>3&&!["panini","childrens"].includes(x));
  const add=(raw:string,score:number)=>{
    const url=resolveAsset(raw,base);if(!url||seen.has(url))return;seen.add(url);out.push({url,score});
  };
  for(const tag of html.match(/<img\\b[^>]*>/gi)||[]){
    const src=attr(tag,"src")||attr(tag,"data-src")||attr(tag,"data-image")||attr(tag,"data-lazy-src");
    if(!src)continue;
    const hay=(src+" "+attr(tag,"alt")+" "+attr(tag,"class")+" "+attr(tag,"id")).toLowerCase();
    let score=0;
    if(/logo|brand/.test(hay))score+=35;
    if(/header|nav|site-logo/.test(hay))score+=12;
    score+=words.filter(w=>hay.includes(w)).length*6;
    if(/sponsor|partner|team[-_ ]?logo|school|player|ticket|hero|background|yellowline|footer/.test(hay))score-=22;
    add(src,score);
  }
  for(const tag of html.match(/<link\\b[^>]*>/gi)||[]){
    const rel=attr(tag,"rel").toLowerCase(),href=attr(tag,"href");
    if(href&&/icon/.test(rel))add(href,4);
  }
  for(const tag of html.match(/<meta\\b[^>]*>/gi)||[]){
    const prop=(attr(tag,"property")||attr(tag,"name")).toLowerCase(),content=attr(tag,"content");
    if(content&&prop==="og:image")add(content,2);
  }
  return out.sort((a,b)=>b.score-a.score);
}
export async function GET(req:Request){
  const key=new URL(req.url).searchParams.get("gameKey")||"",game=gameDefinition(key);
  if(!game)return new Response("Unknown game",{status:404});
  const fallback="https://www.google.com/s2/favicons?domain_url="+encodeURIComponent(game.websiteUrl)+"&sz=256";
  try{
    const page=await fetch(game.websiteUrl,{cache:"no-store",signal:AbortSignal.timeout(10000),headers:{"user-agent":"rookie-draft-all-star-logo/1.0","accept":"text/html,application/xhtml+xml"}});
    if(!page.ok)return Response.redirect(fallback,307);
    const html=(await page.text()).slice(0,1_500_000);
    for(const item of candidates(html,game.websiteUrl,game.name).slice(0,12)){
      try{
        const image=await fetch(item.url,{cache:"force-cache",signal:AbortSignal.timeout(8000),headers:{"user-agent":"Mozilla/5.0","accept":"image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8"}});
        const type=image.headers.get("content-type")||"";
        if(!image.ok||!type.toLowerCase().startsWith("image/"))continue;
        const bytes=await image.arrayBuffer();
        if(!bytes.byteLength||bytes.byteLength>5_000_000)continue;
        return new Response(bytes,{headers:{"content-type":type,"cache-control":"public, s-maxage=86400, stale-while-revalidate=604800"}});
      }catch{}
    }
  }catch{}
  return Response.redirect(fallback,307);
}
