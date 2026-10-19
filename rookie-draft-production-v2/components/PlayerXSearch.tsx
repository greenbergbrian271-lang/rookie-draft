"use client";

// Two small links that open an X (Twitter) search for a player in a new tab:
// "Highlights" (video posts, newest first) and "News" (newest posts).
// `context` (college or NFL team) is added to the query to disambiguate common names.
export default function PlayerXSearch({name,context}:{name?:string|null;context?:string|null}){
  const n=String(name||"").trim();
  if(!n)return null;
  const ctx=String(context||"").trim();
  const base=`"${n}"${ctx?` ${ctx}`:""}`;
  const url=(q:string)=>"https://x.com/search?q="+encodeURIComponent(q)+"&src=typed_query&f=live";
  const highlights=url(`${base} (highlights OR film OR clips) filter:videos`);
  const news=url(`${base} football -filter:replies`);
  return <span className="x-search" role="group" aria-label={`Search X for ${n}`}>
    <a className="x-search-btn" href={highlights} target="_blank" rel="noopener noreferrer" title={`Search X for ${n} highlight videos`}><b>𝕏</b> Highlights</a>
    <a className="x-search-btn" href={news} target="_blank" rel="noopener noreferrer" title={`Search X for ${n} news`}><b>𝕏</b> News</a>
  </span>;
}
