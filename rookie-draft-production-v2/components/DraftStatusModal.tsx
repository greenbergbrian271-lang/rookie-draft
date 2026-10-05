"use client";
import {useEffect,useMemo,useState} from "react";
import {useDraftClass} from "@/lib/use-draft-class";
import {schoolStyle} from "@/lib/school-colors";

type Status="ENTERING_DRAFT"|"RETURNING_TO_SCHOOL"|"TRANSFER_PORTAL";
type Player={playerId:string|number;name:string;position:"QB"|"RB"|"WR"|"TE"|string;college?:string;status?:Status;sourceUrl?:string;sourceTitle?:string};
type Finding={playerId:string;playerName:string;status:Status;sourceUrl:string;sourceTitle:string;sourceType?:string;announcementDate?:string;evidence?:string};
type Data={players:Player[];unannounced:Player[];counts:{total:number;announced:number;unannounced:number}};
type QueuedDecision={playerId:string;status:Status};
const LABEL:Record<Status,string>={ENTERING_DRAFT:"Entering NFL Draft",RETURNING_TO_SCHOOL:"Returning to School",TRANSFER_PORTAL:"Transfer Portal"};
const norm=(s:unknown)=>String(s??"").trim().toLowerCase();

export default function DraftStatusModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone?:()=>void}){
 const draftClass=useDraftClass();
 const [tab,setTab]=useState<"search"|"manual"|"unannounced">("search"),[data,setData]=useState<Data|null>(null),[findings,setFindings]=useState<Finding[]>([]),[verified,setVerified]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[progress,setProgress]=useState("");
 const [position,setPosition]=useState("ALL"),[college,setCollege]=useState(""),[search,setSearch]=useState(""),[selected,setSelected]=useState<string[]>([]),[queue,setQueue]=useState<QueuedDecision[]>([]);
 async function load(){const r=await fetch(`/api/draft-status?draftClass=${draftClass}`,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load draft status.");setData(j)}
 useEffect(()=>{if(!open)return;setBusy(true);setError("");setMessage("");setProgress("");setFindings([]);setVerified(new Set());setTab("search");setPosition("ALL");setCollege("");setSearch("");setSelected([]);setQueue([]);void load().catch(e=>setError(e?.message||"Could not load draft status.")).finally(()=>setBusy(false))},[open,draftClass]);
 const unannounced=data?.unannounced||[],players=data?.players||[];
 const excluded=Math.max(0,(data?.counts.total||0)-unannounced.length);
 const colleges=useMemo(()=>Array.from(new Set(unannounced.map(p=>p.college).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b)),[unannounced]);
 const shown=useMemo(()=>unannounced.filter(p=>(position==="ALL"||p.position===position)&&(!college.trim()||norm(p.college)===norm(college))&&(!search.trim()||norm(p.name+" "+p.position+" "+(p.college||"")).includes(norm(search)))),[unannounced,position,college,search]);
 const queueMap=useMemo(()=>new Map(queue.map(x=>[x.playerId,x.status])),[queue]);
 const byId=(id:string)=>players.find(p=>String(p.playerId)===id);
 async function searchWeb(){setBusy(true);setError("");setMessage("");setFindings([]);setVerified(new Set());try{const found:Finding[]=[];for(let i=0;i<unannounced.length;i+=8){const batch=unannounced.slice(i,i+8);setProgress(`Searching reliable sources… ${Math.min(i+batch.length,unannounced.length)} / ${unannounced.length}`);const r=await fetch("/api/draft-status/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({draftClass,playerIds:batch.map(p=>p.playerId)})}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Search failed.");if(Array.isArray(j?.findings))found.push(...j.findings)}setFindings([...new Map(found.map(f=>[String(f.playerId),f])).values()]);setMessage(found.length?`Found ${found.length} possible announcement${found.length===1?"":"s"}. Verify the source before applying.`:"No qualifying announcements were found from the approved sources.")}catch(e:any){setError(e?.message||"Search failed.")}finally{setProgress("");setBusy(false)}}
 async function apply(payload:any){const r=await fetch("/api/draft-status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not apply status.");return j}
 async function applyVerified(){const picked=findings.filter(f=>verified.has(String(f.playerId)));if(!picked.length)return setError("Verify at least one source first.");setBusy(true);setError("");try{let n=0;for(const f of picked){setProgress(`Applying… ${n+1} / ${picked.length}`);await apply({playerId:f.playerId,draftClass,status:f.status,sourceUrl:f.sourceUrl,sourceTitle:f.sourceTitle,sourceType:f.sourceType,announcementDate:f.announcementDate,note:f.evidence,setMethod:"WEB"});n++}setMessage(`${n} verified decision${n===1?"":"s"} applied.`);setFindings(v=>v.filter(f=>!verified.has(String(f.playerId))));setVerified(new Set());await load();window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.()}catch(e:any){setError(e?.message||"Could not apply decisions.");await load().catch(()=>{})}finally{setProgress("");setBusy(false)}}
 function toggleVerified(id:string){setVerified(v=>{const n=new Set(v);n.has(id)?n.delete(id):n.add(id);return n})}
 function addToQueue(ids:string[],status:Status){setQueue(q=>{const map=new Map(q.map(x=>[x.playerId,x.status]));for(const id of ids)map.set(id,status);return [...map].map(([playerId,nextStatus])=>({playerId,status:nextStatus}))});setSelected([])}
 async function processQueue(){if(!queue.length)return;setBusy(true);setError("");setMessage("");try{let n=0;for(const item of queue){const p=byId(item.playerId);if(!p)continue;setProgress(`Applying manual decisions… ${n+1} / ${queue.length}`);await apply({playerId:item.playerId,draftClass,status:item.status,note:"Manual Draft Status Check",setMethod:"MANUAL"});n++}setMessage(`${n} manual decision${n===1?"":"s"} applied.`);setQueue([]);setSelected([]);await load();window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.()}catch(e:any){setError(e?.message||"Could not process manual decisions.");await load().catch(()=>{})}finally{setProgress("");setBusy(false)}}
 if(!open)return null;
 return <div className="watched-modal-backdrop" role="dialog" aria-modal="true" aria-label="Draft Status Check" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}>
  <div className="watched-modal" style={{width:"min(940px,96vw)"}} onMouseDown={e=>e.stopPropagation()}>
   <div className="watched-modal-head"><div><span className="ey">{draftClass} · GM Tools</span><h2>Draft Status Check</h2><p>Search, verify, and apply NFL Draft decisions. Web findings never change a player until you approve the source.</p></div><button className="small ghost" disabled={busy} onClick={onClose}>Close</button></div>
   <div className="grid" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,margin:"14px 0 12px"}}><div className="notice"><b>{data?.counts.announced??0}/{data?.counts.total??0}</b><br/><span className="muted">decisions recorded</span></div><div className="notice"><b>{data?.counts.unannounced??0}</b><br/><span className="muted">unannounced</span></div><div className="notice"><b>Manual approval</b><br/><span className="muted">required for web results</span></div></div>
   <div className="row-actions" style={{marginBottom:14}}><button className={tab==="search"?"":"ghost"} onClick={()=>setTab("search")}>Web Search</button><button className={tab==="manual"?"":"ghost"} onClick={()=>setTab("manual")}>Manual</button><button className={tab==="unannounced"?"":"ghost"} onClick={()=>setTab("unannounced")}>Unannounced ({unannounced.length})</button></div>

   {tab==="search"&&<div><div className="notice"><b>Reliable-source filter:</b> ESPN, CBS Sports, NBC Sports, player-owned social accounts, or clearly credentialed/verified reporter or official social accounts. Rumors, mock drafts, aggregators and projections are ignored.</div><button disabled={busy||!unannounced.length} onClick={searchWeb}>{busy?"Searching…":`Search ${unannounced.length} Unannounced Players`}</button>{progress&&<p className="muted">{progress}</p>}
    <div style={{display:"grid",gap:10,marginTop:12}}>{findings.map(f=><div className="notice" key={f.playerId}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div className="ey">{LABEL[f.status]}</div><b>{f.playerName}</b>{f.announcementDate&&<span className="muted"> · {f.announcementDate}</span>}</div><a className="historical-source-link" href={f.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a></div>{f.evidence&&<p className="muted">{f.evidence}</p>}<div className="muted" style={{fontSize:11,overflowWrap:"anywhere"}}>{f.sourceTitle||f.sourceUrl}</div><label style={{display:"flex",gap:8,alignItems:"center",marginTop:9}}><input type="checkbox" checked={verified.has(String(f.playerId))} onChange={()=>toggleVerified(String(f.playerId))}/> I verified this source</label></div>)}</div>{findings.length>0&&<button className="success" style={{marginTop:12}} disabled={busy||!verified.size} onClick={applyVerified}>Apply {verified.size} Verified Decision{verified.size===1?"":"s"}</button>}
   </div>}

   {tab==="manual"&&<div>
    <div className="watched-exclusion">📘 Excluding {excluded} player{excluded===1?"":"s"} whose draft decision is already known</div>
    <div className="watched-filter-grid">
      <label>Position<select value={position} onChange={e=>{setPosition(e.target.value);setSelected([])}}><option value="ALL">All Positions</option>{["QB","RB","WR","TE"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>College<input list="draft-status-colleges" value={college} onChange={e=>{setCollege(e.target.value);setSelected([])}} placeholder="All Colleges"/><datalist id="draft-status-colleges">{colleges.map(x=><option key={x} value={x}/>)}</datalist></label>
      <label className="wide">Search<input value={search} onChange={e=>{setSearch(e.target.value);setSelected([])}} placeholder="Type to filter…"/></label>
    </div>
    <div className="watched-showing">Showing {shown.length} unannounced player{shown.length===1?"":"s"}</div>
    <div className="watched-player-list">
      {busy&&!data?<div className="watched-empty">Loading players…</div>:shown.length?shown.map(p=>{const id=String(p.playerId),checked=selected.includes(id),queued=queueMap.get(id);return <label key={id} className={"school-coded "+(queued?"queued":"")} style={schoolStyle(p.college)} onClick={e=>e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>
        <span className="pos">{p.position}</span><span className="name">{p.name}</span><span className="college">{p.college||"College TBD"}</span>{queued&&<b>{queued==="ENTERING_DRAFT"?"Draft":queued==="RETURNING_TO_SCHOOL"?"Return":"Portal"}</b>}
      </label>}):<div className="watched-empty">No matching unannounced players.</div>}
    </div>
    <div className="watched-add-actions" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
      <button disabled={!selected.length} onClick={()=>addToQueue(selected,"ENTERING_DRAFT")}>Selected → NFL Draft</button>
      <button className="purple" disabled={!selected.length} onClick={()=>addToQueue(selected,"RETURNING_TO_SCHOOL")}>Selected → Returning</button>
      <button style={{background:"#8b5a21"}} disabled={!selected.length} onClick={()=>addToQueue(selected,"TRANSFER_PORTAL")}>Selected → Portal</button>
    </div>
    <div className="watched-add-actions">
      <button disabled={!shown.length} onClick={()=>addToQueue(shown.map(p=>String(p.playerId)),"ENTERING_DRAFT")}>All Shown → NFL Draft</button>
      <button className="purple" disabled={!shown.length} onClick={()=>addToQueue(shown.map(p=>String(p.playerId)),"RETURNING_TO_SCHOOL")}>All Shown → Returning to School</button>
    </div>
    <div className="watched-queue-head"><h3>Queued Decisions ({queue.length})</h3>{queue.length>0&&<button className="small ghost" onClick={()=>setQueue([])}>Clear</button>}</div>
    <div className="watched-queue">
      {queue.length?queue.map(item=>{const p=byId(item.playerId);return p?<div key={item.playerId}><span className="player-badge" style={schoolStyle(p.college)}>{p.name}</span><small>{p.position} · {p.college||"College TBD"} · <b>{LABEL[item.status]}</b></small><button onClick={()=>setQueue(q=>q.filter(x=>x.playerId!==item.playerId))}>Remove</button></div>:null}):<div className="watched-empty">No decisions queued yet</div>}
    </div>
    {progress&&<p className="muted">{progress}</p>}
    <div className="watched-footer"><button className="danger" disabled={busy} onClick={()=>{setQueue([]);setSelected([])}}>Clear Manual Queue</button><button className="success" disabled={busy||!queue.length} onClick={processQueue}>{busy?"Processing…":"Process Decisions"}</button></div>
   </div>}

   {tab==="unannounced"&&<div><div className="watched-exclusion">📘 {unannounced.length} player{unannounced.length===1?"":"s"} still need a {draftClass} draft decision</div><div className="watched-filter-grid"><label>Position<select value={position} onChange={e=>setPosition(e.target.value)}><option value="ALL">All Positions</option>{["QB","RB","WR","TE"].map(x=><option key={x}>{x}</option>)}</select></label><label>College<input list="draft-status-colleges-unannounced" value={college} onChange={e=>setCollege(e.target.value)} placeholder="All Colleges"/><datalist id="draft-status-colleges-unannounced">{colleges.map(x=><option key={x} value={x}/>)}</datalist></label><label className="wide">Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type to filter…"/></label></div><div className="watched-showing">Showing {shown.length} player{shown.length===1?"":"s"}</div><div className="watched-player-list">{shown.length?shown.map(p=><div key={p.playerId} className="school-coded" style={{...schoolStyle(p.college),display:"grid",gridTemplateColumns:"42px minmax(160px,1fr) minmax(130px,.8fr) auto",gap:8,alignItems:"center",padding:"8px",borderRadius:7}}><span className="pos">{p.position}</span><span className="name" style={{fontWeight:850}}>{p.name}</span><span className="college">{p.college||"College TBD"}</span><b style={{color:"#d7a849",fontSize:9,textTransform:"uppercase"}}>Unannounced</b></div>):<div className="watched-empty">No matching unannounced players.</div>}</div></div>}

   {error&&<div className="notice" style={{marginTop:12,borderColor:"#7b3340"}}>{error}</div>}{message&&<div className="notice success-note" style={{marginTop:12}}>{message}</div>}
  </div>
 </div>;
}
