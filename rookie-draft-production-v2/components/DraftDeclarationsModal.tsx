"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Search,ClipboardList,Users,ArrowLeft,ExternalLink,CheckCircle2,AlertTriangle,Plus,X} from "lucide-react";
import {useDraftClass} from "@/lib/use-draft-class";
import {schoolStyle} from "@/lib/school-colors";

type Player={id:string|number;name:string;position:string;college?:string;draft_class:number;scouting_status:string};
type Mode="home"|"scan"|"manual"|"undecided";
type Call="DECLARED"|"RETURNING"|"SKIP";
type Evidence={outlet:string;url:string;headline:string;date:string;claim:string;kind:string;grounded:boolean};
type Row={playerId:number;name:string;position:string;college:string;assessment:"DECLARED"|"RETURNING"|"UNDECIDED";confidence:string;summary:string;evidence:Evidence[];call:Call;source?:string;state?:"ok"|"error";message?:string};
const LABEL:Record<string,string>={DECLARED:"Declared",RETURNING:"Returning",UNDECIDED:"No decision found",SKIP:"Skip"};
const COLOR:Record<string,string>={DECLARED:"#34d399",RETURNING:"#fbbf24",UNDECIDED:"#8aa4c8",SKIP:"#8aa4c8"};
const BATCH=5,CONCURRENCY=2;
const isUrl=(s:string)=>/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.trim());
const norm=(s:string)=>(s||"").toLowerCase();

function PlayerPicker({options,value,onChange}:{options:Player[];value:string;onChange:(id:string)=>void}){
 const [q,setQ]=useState(""),[open,setOpen]=useState(false);
 const chosen=options.find(p=>String(p.id)===value);
 const label=chosen?chosen.name+" · "+chosen.position+" · "+(chosen.college||"College TBD"):"";
 const list=options.filter(p=>!q.trim()||norm(p.name+" "+p.position+" "+(p.college||"")).includes(norm(q))).slice(0,60);
 return <div style={{position:"relative"}}>
  <input value={open?q:label} placeholder="Search player, position, or college…" onFocus={()=>{setQ("");setOpen(true)}} onChange={e=>{setQ(e.target.value);setOpen(true)}} onBlur={()=>setTimeout(()=>setOpen(false),120)} onKeyDown={e=>{if(e.key==="Enter"&&list[0]){e.preventDefault();onChange(String(list[0].id));setOpen(false);(e.target as HTMLInputElement).blur()}if(e.key==="Escape"){setOpen(false);(e.target as HTMLInputElement).blur()}}}/>
  {open&&<div style={{position:"absolute",zIndex:30,left:0,right:0,top:"calc(100% + 4px)",maxHeight:260,overflowY:"auto",background:"#0a1b31",border:"1px solid #31527f",borderRadius:10,boxShadow:"0 16px 40px rgba(0,0,0,.5)"}}>
   {list.map(p=><div key={p.id} onMouseDown={e=>{e.preventDefault();onChange(String(p.id));setOpen(false)}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #162c4a"}}><strong>{p.name}</strong><span className="muted" style={{fontSize:12}}> · {p.position} · {p.college||"College TBD"}</span></div>)}
   {!list.length&&<div className="muted" style={{padding:12}}>No matching undecided players.</div>}
  </div>}
 </div>;
}
export default function DraftDeclarationsModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone?:()=>void}){
 const draftClass=useDraftClass();
 const [mode,setMode]=useState<Mode>("home"),[players,setPlayers]=useState<Player[]>([]),[declared,setDeclared]=useState<Set<string>>(new Set()),[search,setSearch]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [scope,setScope]=useState("ALL"),[phase,setPhase]=useState<"intro"|"running"|"review">("intro"),[progress,setProgress]=useState({done:0,total:0}),[scanNotes,setScanNotes]=useState<string[]>([]);
 const [rows,setRows]=useState<Row[]>([]),[showUndecided,setShowUndecided]=useState(false),[applying,setApplying]=useState(false),[reviewKind,setReviewKind]=useState<"scan"|"manual">("scan");
 const [entries,setEntries]=useState<{playerId:string;decision:"DECLARED"|"RETURNING";source:string}[]>([{playerId:"",decision:"DECLARED",source:""}]);
 const cancel=useRef(false),[startedAt,setStartedAt]=useState(0);

 async function load(){setBusy(true);setError("");try{const [p,t,a]=await Promise.all([fetch("/api/players",{cache:"no-store"}).then(r=>r.json()),fetch("/api/workflow-tags?tag=DECLARES",{cache:"no-store"}).then(r=>r.json()),fetch("/api/workflow-tags?tag=ALL_STAR",{cache:"no-store"}).then(r=>r.json()).catch(()=>[])]);setPlayers(Array.isArray(p)?p:[]);/* an accepted all-star invite counts as declared */setDeclared(new Set([...(Array.isArray(t)?t:[]),...(Array.isArray(a)?a:[])].map((x:any)=>String(x.playerId))))}catch{setError("Could not load players from the cloud database.")}finally{setBusy(false)}}
 useEffect(()=>{if(open){cancel.current=true;setMode("home");setSearch("");setScope("ALL");setPhase("intro");setRows([]);setScanNotes([]);setShowUndecided(false);setEntries([{playerId:"",decision:"DECLARED",source:""}]);setError("");void load()}else cancel.current=true},[open,draftClass]);

 const current=useMemo(()=>players.filter(p=>p.draft_class===draftClass),[players,draftClass]);
 const undecidedAll=useMemo(()=>current.filter(p=>!declared.has(String(p.id))).sort((a,b)=>a.position.localeCompare(b.position)||a.name.localeCompare(b.name)),[current,declared]);
 const undecided=useMemo(()=>undecidedAll.filter(p=>!search.trim()||norm(p.name+" "+(p.college||"")+" "+p.position).includes(norm(search))),[undecidedAll,search]);
 const positions=useMemo(()=>Array.from(new Set(undecidedAll.map(p=>p.position))).sort(),[undecidedAll]);
 const scanTargets=useMemo(()=>undecidedAll.filter(p=>scope==="ALL"||p.position===scope),[undecidedAll,scope]);

 function toRow(p:Player,extra:Partial<Row>):Row{return {playerId:Number(p.id),name:p.name,position:p.position,college:p.college||"",assessment:"UNDECIDED",confidence:"None",summary:"",evidence:[],call:"SKIP",...extra}}

 async function runScan(){
  const targets=scanTargets;if(!targets.length)return;
  cancel.current=false;setError("");setScanNotes([]);setRows([]);setPhase("running");setStartedAt(Date.now());setProgress({done:0,total:targets.length});
  const batches:Player[][]=[];for(let i=0;i<targets.length;i+=BATCH)batches.push(targets.slice(i,i+BATCH));
  const out=new Map<number,any>(),notes:string[]=[];let next=0,fatal="";
  async function worker(){
   while(!cancel.current&&!fatal){
    const mine=next++;if(mine>=batches.length)return;const b=batches[mine];
    try{
     const r=await fetch("/api/draft-declarations/scan",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerIds:b.map(p=>p.id)})});
     const j=await r.json();
     if(r.status===503){fatal=j.error||"Scanning is not configured.";return}
     if(!r.ok)notes.push(b.map(p=>p.name).join(", ")+": "+(j.error||"scan failed")+" — not scanned, try again.");
     else for(const x of j.results||[])out.set(Number(x.playerId),x);
    }catch{notes.push(b.map(p=>p.name).join(", ")+": network error — not scanned.")}
    setProgress(pr=>({...pr,done:Math.min(pr.total,pr.done+b.length)}));
   }
  }
  await Promise.all(Array.from({length:CONCURRENCY},worker));
  if(cancel.current)return;
  if(fatal){setError(fatal);setPhase("intro");return}
  const built:Row[]=targets.filter(p=>out.has(Number(p.id))).map(p=>{const x=out.get(Number(p.id));const sure=x.decision!=="UNDECIDED"&&(x.confidence==="High"||x.confidence==="Medium");return toRow(p,{assessment:x.decision,confidence:x.confidence,summary:x.summary||"",evidence:x.evidence||[],call:sure?x.decision:"SKIP"})});
  const missed=targets.length-built.length;
  if(missed>0&&!notes.length)notes.push(missed+" player(s) came back without a result.");
  setScanNotes(notes);setRows(built);setReviewKind("scan");setPhase("review");
 }

 function buildManualReview(){
  const list:Row[]=[];
  for(const e of entries){
   const p=current.find(x=>String(x.id)===e.playerId);if(!p||list.some(r=>r.playerId===Number(p.id)))continue;
   const s=e.source.trim();
   list.push(toRow(p,{assessment:e.decision,confidence:"Manual",summary:"Entered by you.",call:e.decision,source:s,evidence:s?[{outlet:isUrl(s)?"Your source":"Your note",url:isUrl(s)?(/^https?:/i.test(s)?s:"https://"+s):"",headline:isUrl(s)?"":s,date:"",claim:"",kind:"manual",grounded:true}]:[]}));
  }
  if(!list.length){setError("Choose at least one player.");return}
  setError("");setRows(list);setReviewKind("manual");setMode("manual");setPhase("review");
 }

 function setCall(id:number,call:Call){setRows(rs=>rs.map(r=>r.playerId===id?{...r,call,state:undefined,message:undefined}:r))}
 const pending=rows.filter(r=>r.call!=="SKIP"&&r.state!=="ok");
 const nDecl=pending.filter(r=>r.call==="DECLARED").length,nRet=pending.filter(r=>r.call==="RETURNING").length;

 async function applyAll(){
  setApplying(true);setError("");let any=false;
  for(const r of rows){
   if(r.call==="SKIP"||r.state==="ok")continue;
   try{
    if(r.call==="DECLARED"){
     const src=r.evidence.map(e=>e.outlet).filter((v,i,a)=>a.indexOf(v)===i).join(", ")||r.source||"";
     const res=await fetch("/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:r.playerId,tag:"DECLARES",detail:("Yes"+(src?" · "+src:"")+" · "+new Date().toISOString().slice(0,10)).slice(0,300)})});
     if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||"Could not save status");
     setRows(rs=>rs.map(x=>x.playerId===r.playerId?{...x,state:"ok",message:"Saved as Declared"}:x));
    }else{
     const res=await fetch("/api/returning-player",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:r.playerId,fromDraftClass:draftClass})});
     const j=await res.json();if(!res.ok)throw new Error(j.error||j.detail||"Returning-player move failed");
     setRows(rs=>rs.map(x=>x.playerId===r.playerId?{...x,state:"ok",message:`Moved to ${j.toDraftClass} · ${j.preservedScoutingNotes||0} scouting note(s) kept`}:x));
    }
    any=true;
   }catch(e:any){setRows(rs=>rs.map(x=>x.playerId===r.playerId?{...x,state:"error",message:e?.message||"Failed"}:x))}
  }
  // Teach the scanner: remember hosts of sources you supplied manually.
  const urls=rows.filter(r=>r.state!=="error"&&r.call!=="SKIP").flatMap(r=>r.evidence.filter(e=>e.kind==="manual"&&e.url).map(e=>e.url));
  if(urls.length)fetch("/api/draft-declarations/sources",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({urls})}).catch(()=>{});
  if(any){window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.();await load()}
  setApplying(false);
 }

 function home(){setMode("home");setPhase("intro");setRows([]);setError("");cancel.current=true}
 if(!open)return null;
 const visibleRows=rows.filter(r=>showUndecided||r.assessment!=="UNDECIDED"||r.state||r.call!=="SKIP");
 const hiddenCount=rows.length-visibleRows.length;
 const closeAll=()=>{if(!applying){cancel.current=true;onClose()}};

 return <div role="dialog" aria-modal="true" aria-labelledby="declarations-title" onMouseDown={e=>e.target===e.currentTarget&&closeAll()} style={{position:"fixed",inset:0,zIndex:1500,display:"grid",placeItems:"center",padding:18,background:"rgba(2,8,18,.78)",backdropFilter:"blur(4px)"}}><div onMouseDown={e=>e.stopPropagation()} style={{width:"min(1120px,96vw)",maxHeight:"90vh",overflow:"auto",background:"#071426",border:"1px solid #31527f",borderRadius:16,boxShadow:"0 28px 80px rgba(0,0,0,.58)",padding:24}}>
  <div className="page-head"><div><div className="ey">GM Tools · {draftClass} class</div><h2 id="declarations-title">Draft Declarations</h2></div><button className="small ghost" disabled={applying} onClick={closeAll}>Close</button></div>
  {mode!=="home"&&!applying&&<button className="small ghost" onClick={home} style={{marginBottom:12}}><ArrowLeft size={14}/> Back to options</button>}

  {mode==="home"&&<><p className="muted">Nothing here changes a player until you approve it. Declared saves the status only; Returning runs the returning-player flow and moves the player and his scouting report to {draftClass+1}.</p>
   <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
    <button className="card" style={{textAlign:"left",padding:18,display:"block",width:"100%",cursor:"pointer"}} onClick={()=>setMode("scan")}><Search size={22}/><h3>Scan for draft decisions</h3><p className="muted">Searches trusted sources for each undecided player, then shows what it found for your review.</p></button>
    <button className="card" style={{textAlign:"left",padding:18,display:"block",width:"100%",cursor:"pointer"}} onClick={()=>setMode("manual")}><ClipboardList size={22}/><h3>Manual Draft Declaration</h3><p className="muted">Tell it the players and their status. A source is optional and teaches future scans where to look.</p></button>
    <button className="card" style={{textAlign:"left",padding:18,display:"block",width:"100%",cursor:"pointer"}} onClick={()=>{setSearch("");setMode("undecided")}}><Users size={22}/><h3>View Undecided Players</h3><p className="muted">{busy?"Loading…":`${undecidedAll.length} undecided · ${declared.size?current.length-undecidedAll.length:0} declared`}</p></button>
   </div></>}

  {mode==="undecided"&&<><h3>Undecided players <span className="muted">· {undecided.length}</span></h3><p className="muted">{draftClass} players with no recorded decision.</p>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player, position, or college…"/>
   <div style={{maxHeight:420,overflowY:"auto",marginTop:12}}>{undecided.map(p=><div key={p.id} className="card" style={{padding:10,marginBottom:6,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><strong>{p.name}</strong><div className="muted" style={{fontSize:12}}>{p.position} · {p.college||"College not set"}</div></div><button className="small" onClick={()=>{setEntries([{playerId:String(p.id),decision:"DECLARED",source:""}]);setMode("manual");setPhase("intro")}}>Record decision</button></div>)}{!busy&&!undecided.length&&<p className="muted">No undecided players match.</p>}</div></>}

  {mode==="scan"&&phase==="intro"&&<div>
   <p className="muted">Scans NFL.com, ESPN, CBS Sports and the other trusted outlets, plus school sites and player social accounts, and any sources you've taught it. Speculation and mock drafts don't count. Early in the cycle most players will correctly come back as no decision.</p>
   <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",margin:"12px 0"}}><label style={{display:"flex",gap:8,alignItems:"center"}}>Position<select value={scope} onChange={e=>setScope(e.target.value)}><option value="ALL">All ({undecidedAll.length})</option>{positions.map(p=><option key={p} value={p}>{p} ({undecidedAll.filter(x=>x.position===p).length})</option>)}</select></label><button disabled={busy||!scanTargets.length} onClick={runScan}>Scan {scanTargets.length} player{scanTargets.length===1?"":"s"}</button></div>
   <p className="muted" style={{fontSize:12}}>Rough estimate, based on the number of players selected: about {Math.max(1,Math.ceil(scanTargets.length/BATCH/CONCURRENCY*0.4))}–{Math.max(2,Math.ceil(scanTargets.length/BATCH/CONCURRENCY*0.8))} minutes. Keep this window open.</p></div>}

  {mode==="scan"&&phase==="running"&&<div><h3>Scanning…</h3><div style={{height:10,borderRadius:6,background:"#0a1b31",border:"1px solid #25456f",overflow:"hidden",margin:"10px 0"}}><div style={{height:"100%",width:`${progress.total?progress.done/progress.total*100:0}%`,background:"#67e8f9",transition:"width .3s"}}/></div><p className="muted">{progress.done} of {progress.total} players checked{progress.done>=BATCH&&startedAt?` · about ${Math.max(1,Math.ceil((Date.now()-startedAt)/progress.done*(progress.total-progress.done)/60000))} min left`:""}</p><p className="muted" style={{fontSize:12}}>Keep this popup open; closing it cancels the scan. You can use other browser tabs meanwhile.</p><button className="ghost small" onClick={()=>{cancel.current=true;setPhase("intro")}}>Cancel</button></div>}

  {mode==="manual"&&phase!=="review"&&<div style={{display:"grid",gap:10}}>
   <p className="muted">Add each player and his status. Source is optional; a link's site is remembered so future scans check it too.</p>
   {entries.map((e,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"minmax(200px,2fr) minmax(140px,1fr) minmax(200px,2fr) auto",gap:8,alignItems:"center"}}>
    <PlayerPicker value={e.playerId} onChange={id=>setEntries(es=>es.map((x,j)=>j===i?{...x,playerId:id}:x))} options={undecidedAll.filter(p=>String(p.id)===e.playerId||!entries.some((x,j)=>j!==i&&x.playerId===String(p.id)))}/>
    <select value={e.decision} onChange={ev=>setEntries(es=>es.map((x,j)=>j===i?{...x,decision:ev.target.value as any}:x))}><option value="DECLARED">Declared</option><option value="RETURNING">Returning</option></select>
    <input value={e.source} onChange={ev=>setEntries(es=>es.map((x,j)=>j===i?{...x,source:ev.target.value}:x))} placeholder="Source URL or note (optional)"/>
    <button className="small ghost" aria-label="Remove row" disabled={entries.length===1} onClick={()=>setEntries(es=>es.filter((_,j)=>j!==i))}><X size={14}/></button></div>)}
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="ghost small" onClick={()=>setEntries(es=>[...es,{playerId:"",decision:"DECLARED",source:""}])}><Plus size={14}/> Add another player</button><button onClick={buildManualReview}>Review before applying</button></div></div>}

  {phase==="review"&&mode!=="home"&&mode!=="undecided"&&<div>
   <h3>Review {reviewKind==="scan"?"scan results":"your entries"} <span className="muted">· {rows.filter(r=>r.assessment!=="UNDECIDED").length} with a decision{reviewKind==="scan"?` of ${rows.length} scanned`:""}</span></h3>
   <p className="muted">Check each player and source, change the final call if you disagree, then apply. Rows set to Skip are left untouched.</p>
   {scanNotes.map((n,i)=><div key={i} className="notice" style={{marginBottom:8}}><AlertTriangle size={14}/> {n}</div>)}
   <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
    <thead><tr style={{textAlign:"left"}}><th style={{padding:8}}>Player</th><th style={{padding:8}}>Assessment</th><th style={{padding:8,minWidth:300}}>Sources</th><th style={{padding:8}}>Your call</th></tr></thead>
    <tbody>{visibleRows.map(r=><tr key={r.playerId} style={{borderTop:"1px solid #25456f",verticalAlign:"top",opacity:r.state==="ok"?.6:1}}>
     <td style={{padding:8}}><span className="player-badge" style={schoolStyle(r.college)}>{r.name}</span><div className="muted" style={{fontSize:12,marginTop:4}}>{r.position} · {r.college||"College TBD"}</div></td>
     <td style={{padding:8}}><strong style={{color:COLOR[r.assessment]}}>{LABEL[r.assessment]}</strong>{r.confidence!=="None"&&<div className="muted" style={{fontSize:12}}>{r.confidence==="Manual"?"Entered by you":r.confidence+" confidence"}</div>}{r.summary&&r.assessment!=="UNDECIDED"&&reviewKind==="scan"&&<div className="muted" style={{fontSize:12,marginTop:4}}>{r.summary}</div>}</td>
     <td style={{padding:8}}>{r.evidence.length?r.evidence.map((e,i)=><div key={i} style={{marginBottom:6}}>{e.url?<a href={e.url} target="_blank" rel="noreferrer" style={{display:"inline-flex",gap:4,alignItems:"center"}}><strong>{e.outlet}</strong><ExternalLink size={12}/></a>:<strong>{e.outlet}</strong>}{e.date&&<span className="muted"> · {e.date}</span>}{e.kind==="social"&&<span className="muted"> · confirm it's his own account</span>}{e.kind!=="manual"&&!e.grounded&&<span style={{color:"#fbbf24"}}> · not confirmed by search</span>}{(e.headline||e.claim)&&<div className="muted" style={{fontSize:12}}>{e.headline||e.claim}</div>}</div>):<span className="muted">{reviewKind==="scan"?"No qualifying source":"No source given"}</span>}</td>
     <td style={{padding:8,minWidth:150}}><select value={r.call} disabled={applying||r.state==="ok"} onChange={e=>setCall(r.playerId,e.target.value as Call)}><option value="DECLARED">Declared</option><option value="RETURNING">Returning → {draftClass+1}</option><option value="SKIP">Skip</option></select>{r.state==="ok"&&<div style={{color:"#34d399",fontSize:12,marginTop:4}}><CheckCircle2 size={12}/> {r.message}</div>}{r.state==="error"&&<div style={{color:"#f87171",fontSize:12,marginTop:4}}>{r.message}</div>}</td></tr>)}</tbody></table></div>
   {!visibleRows.length&&<p className="muted" style={{marginTop:12}}>{reviewKind==="scan"?"No decisions were found in trusted sources for this group yet.":""}</p>}
   {hiddenCount>0&&<button className="small ghost" style={{marginTop:10}} onClick={()=>setShowUndecided(true)}>Show {hiddenCount} player{hiddenCount===1?"":"s"} with no decision found</button>}
   {showUndecided&&rows.some(r=>r.assessment==="UNDECIDED")&&<button className="small ghost" style={{marginTop:10}} onClick={()=>setShowUndecided(false)}>Hide players with no decision</button>}
   {nRet>0&&<div className="notice" style={{marginTop:14}}><AlertTriangle size={14}/> {nRet} player{nRet===1?"":"s"} will move to the {draftClass+1} class with scouting report and notes. Prior film grades are archived behind the prior-year toggle.</div>}
   <div style={{display:"flex",justifyContent:"space-between",gap:10,marginTop:16,flexWrap:"wrap",alignItems:"center"}}><span className="muted">{nDecl} to mark Declared · {nRet} to move to {draftClass+1}</span><button className="success" disabled={applying||!pending.length} onClick={applyAll}>{applying?"Applying…":pending.length?`Apply ${pending.length} decision${pending.length===1?"":"s"}`:"Nothing to apply"}</button></div>
  </div>}

  {busy&&mode!=="scan"&&<p className="muted">Loading…</p>}
  {error&&<div className="notice" role="alert" style={{marginTop:12}}>{error}</div>}
 </div></div>;
}
