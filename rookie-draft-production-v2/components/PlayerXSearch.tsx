"use client";
import {useEffect,useState} from "react";

// One "𝕏 Search" button: opens an X (Twitter) search in a new tab for the player's
// exact name, or for a custom search the owner saved for that player in settings.
const cache=new Map<string,string>();
const key=(n:string)=>n.trim().toLowerCase().replace(/[^a-z0-9]+/g,"");

export function xSearchUrl(name:string,custom?:string){
  const q=(custom||"").trim()||`"${name.trim()}"`;
  return "https://x.com/search?q="+encodeURIComponent(q)+"&src=typed_query&f=live";
}

export async function saveXQuery(name:string,query:string){
  const r=await fetch("/api/player-x-search",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({name,query})}),j=await r.json();
  if(!r.ok)throw new Error(j?.error||"Could not save X search settings");
  cache.set(key(name),j.query||"");
  return String(j.query||"");
}

export function useXQuery(name?:string|null){
  const n=String(name||"").trim(),[q,setQ]=useState(cache.get(key(n))||"");
  useEffect(()=>{
    if(!n)return;
    const k=key(n);
    if(cache.has(k)){setQ(cache.get(k)||"");return}
    let live=true;
    fetch("/api/player-x-search?name="+encodeURIComponent(n),{cache:"no-store"}).then(r=>r.json()).then(j=>{const v=String(j?.query||"");cache.set(k,v);if(live)setQ(v)}).catch(()=>{});
    return()=>{live=false};
  },[n]);
  return [q,setQ] as const;
}

export function XSearchField({value,onChange,name}:{value:string;onChange:(v:string)=>void;name:string}){
  return <div className="profile-override-field"><div className="profile-override-label"><span>X search</span><b className={value.trim()?"manual":""}>{value.trim()?"Custom search":"Player name only"}</b></div><input value={value} onChange={e=>onChange(e.target.value)} placeholder={`"${name}"`} maxLength={200}/><small>Leave blank to search the player's name only. Add terms (e.g. {name} highlights) or any X search operators for this player.</small></div>;
}

export default function PlayerXSearch({name,settings=false}:{name?:string|null;settings?:boolean}){
  const n=String(name||"").trim(),[q,setQ]=useXQuery(n),[open,setOpen]=useState(false);
  if(!n)return null;
  return <span className="x-search">
    <a className="x-search-btn" href={xSearchUrl(n,q)} target="_blank" rel="noopener noreferrer" title={q?`Search X: ${q}`:`Search X for ${n}`}><b>𝕏</b> Search</a>
    {settings&&<button type="button" className="x-search-gear" onClick={()=>setOpen(true)} aria-label="X search settings" title="X search settings">⚙</button>}
    {open&&<XSearchSettings name={n} initial={q} onClose={()=>setOpen(false)} onSaved={setQ}/>}
  </span>;
}

function XSearchSettings({name,initial,onClose,onSaved}:{name:string;initial:string;onClose:()=>void;onSaved:(v:string)=>void}){
  const [v,setV]=useState(initial),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const save=async(e:any)=>{e.preventDefault();setSaving(true);setError("");try{onSaved(await saveXQuery(name,v));onClose()}catch(err:any){setError(err?.message||"Could not save");setSaving(false)}};
  return <div className="profile-override-backdrop" style={{zIndex:600}} onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="profile-override-modal" onSubmit={save}><div className="profile-override-head"><div><small>X SEARCH</small><h2>{name}</h2></div><button type="button" onClick={onClose}>×</button></div><XSearchField value={v} onChange={setV} name={name}/>{error&&<div className="profile-transfer-error">{error}</div>}<div className="profile-transfer-actions"><button type="button" className="ghost" onClick={()=>setV("")}>Reset</button><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save"}</button></div></form></div>;
}
