"use client";
import {useEffect,useMemo,useState} from "react";
import {Search,ClipboardList,Users,ArrowLeft,ExternalLink,CheckCircle2} from "lucide-react";
import {useDraftClass} from "@/lib/use-draft-class";
type Player={id:string|number;name:string;position:string;college?:string;draft_class:number;scouting_status:string};
type Mode="home"|"scan"|"manual"|"undecided";
export default function DraftDeclarationsModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone?:()=>void}){
 const draftClass=useDraftClass(); const [mode,setMode]=useState<Mode>("home"),[players,setPlayers]=useState<Player[]>([]),[declared,setDeclared]=useState<Set<string>>(new Set()),[search,setSearch]=useState(""),[playerId,setPlayerId]=useState(""),[decision,setDecision]=useState("Declared"),[source,setSource]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 async function load(){setBusy(true);setError("");try{const [p,t]=await Promise.all([fetch("/api/players",{cache:"no-store"}).then(r=>r.json()),fetch("/api/workflow-tags?tag=DECLARES",{cache:"no-store"}).then(r=>r.json())]);setPlayers(Array.isArray(p)?p:[]);setDeclared(new Set((Array.isArray(t)?t:[]).map((x:any)=>String(x.playerId))))}catch{setError("Could not load players from the cloud database.")}finally{setBusy(false)}}
 useEffect(()=>{if(open){setMode("home");setSearch("");setPlayerId("");setDecision("Declared");setSource("");setSuccess("");void load()}},[open,draftClass]);
 const current=useMemo(()=>players.filter(p=>p.draft_class===draftClass),[players,draftClass]);
 const undecided=useMemo(()=>current.filter(p=>!declared.has(String(p.id))&&(!search.trim()||(p.name+" "+(p.college||"")+" "+p.position).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.position.localeCompare(b.position)||a.name.localeCompare(b.name)),[current,declared,search]);
 const chosen=current.find(p=>String(p.id)===playerId);
 function back(){setMode("home");setError("");setSuccess("")}
 async function apply(p:Player,choice:string,sourceValue=""){
  setBusy(true);setError("");setSuccess("");
  try{
   if(choice==="Declared"){
    const r=await fetch("/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"DECLARES",detail:sourceValue||"Confirmed via Draft Declarations GM"})});
    if(!r.ok)throw new Error("Could not save declaration status.");
   }else{
    const r=await fetch("/api/returning-player",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,fromDraftClass:draftClass})});
    const j=await r.json();if(!r.ok)throw new Error(j.error||"Returning-player transition failed.");
   }
   setSuccess(choice==="Declared"?p.name+" marked Declared.":p.name+" moved to the "+(draftClass+1)+" class with the existing returning-player workflow.");
   window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.();await load();
  }catch(e:any){setError(e?.message||"Could not apply decision.")}finally{setBusy(false)}
 }
 if(!open)return null;
 const shell=(children:React.ReactNode)=><div className="tool-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="tool-modal" role="dialog" aria-modal="true" aria-labelledby="declarations-title"><div className="page-head"><div><div className="ey">GM Tools · {draftClass} class</div><h2 id="declarations-title">Draft Declarations GM</h2></div><button className="small ghost" onClick={onClose}>Close</button></div>{children}</div></div>;
 return shell(<>
 {mode!=="home"&&<button className="small ghost" onClick={back}><ArrowLeft size={14}/> Back to options</button>}
 {mode==="home"&&<><p className="muted">Review draft decisions, apply a manual update, or see everyone whose status is still unknown. Decisions are never applied from a research scan without your approval.</p><div className="grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}><button className="card" style={{textAlign:"left",padding:18}} onClick={()=>setMode("scan")}><Search size={22}/><h3>Scan for draft decisions</h3><p className="muted">Build a research queue with links to trusted-source searches for each undecided player.</p></button><button className="card" style={{textAlign:"left",padding:18}} onClick={()=>setMode("manual")}><ClipboardList size={22}/><h3>Manual Draft Declaration</h3><p className="muted">Choose a player, set their decision, and optionally record a source.</p></button><button className="card" style={{textAlign:"left",padding:18}} onClick={()=>{setSearch("");setMode("undecided")}}><Users size={22}/><h3>View Undecided Players</h3><p className="muted">See players whose decision has not been recorded.</p></button></div></>}
 {(mode==="scan"||mode==="undecided")&&<><h3>{mode==="scan"?"Research queue":"Undecided players"} <span className="muted">· {undecided.length}</span></h3><p className="muted">{mode==="scan"?"Open trusted-source searches, review the actual reporting, then record a decision using the manual workflow. This preview does not claim a decision is verified until evidence has been reviewed.":"Players in the active draft class without a DECLARES tag."}</p><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player, position, or college…"/><div style={{maxHeight:380,overflowY:"auto",marginTop:12}}>{undecided.map(p=><div key={p.id} className="card" style={{padding:12,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><strong>{p.name}</strong><div className="muted">{p.position} · {p.college||"College not set"}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className="small ghost" target="_blank" rel="noreferrer" href={"https://www.google.com/search?q="+encodeURIComponent('"'+p.name+'" NFL draft declare return site:espn.com OR site:cbssports.com OR site:nfl.com')}><ExternalLink size={13}/> Trusted news search</a><button className="small" onClick={()=>{setPlayerId(String(p.id));setMode("manual")}}>Record decision</button></div></div></div>)}{!busy&&!undecided.length&&<p className="muted">No undecided players match this search.</p>}</div></>}
 {mode==="manual"&&<div style={{display:"grid",gap:12,marginTop:12}}><label>Player<select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Select player…</option>{current.filter(p=>!declared.has(String(p.id))||String(p.id)===playerId).sort((a,b)=>a.name.localeCompare(b.name)).map(p=><option key={p.id} value={p.id}>{p.name} · {p.position} · {p.college||"College TBD"}</option>)}</select></label><label>Decision<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="Declared">Declared for NFL Draft</option><option value="Returning">Returning to school</option></select></label><label>Source URL or note (optional)<input value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste article URL or source name…"/></label><div className="notice">Declared updates the player's status only. Returning uses the existing returning-player flow to carry the player and scouting report into {draftClass+1}.</div><button disabled={busy||!chosen} onClick={()=>chosen&&apply(chosen,decision,source)}>{busy?"Applying…":"Apply decision"}</button></div>}
 {busy&&<p className="muted">Loading or applying update…</p>}{error&&<div className="notice" role="alert">{error}</div>}{success&&<div className="notice"><CheckCircle2 size={16}/> {success}</div>}
 </>);
}
