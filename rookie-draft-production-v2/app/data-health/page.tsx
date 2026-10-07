"use client";
import {useEffect,useState} from "react";
import {useDraftClass} from "@/lib/use-draft-class";

const tone=(s:string)=>s==="error"?"#ff8291":s==="warning"?"#ffd166":"#70dfc9";
const fmt=(v:any)=>v==null?"—":String(v);

export default function Page(){
  const draftClass=useDraftClass(),[health,setHealth]=useState<any>(null),[audit,setAudit]=useState<any[]>([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState(""),[season,setSeason]=useState("");
  async function load(deep=false){
    setLoading(true);setMsg("");
    try{
      const [h,a]=await Promise.all([fetch("/api/data-health?draftClass="+draftClass+(deep?"&deep=1":""),{cache:"no-store"}),fetch("/api/audit?limit=80",{cache:"no-store"})]);
      const hj=await h.json(),aj=await a.json();if(!h.ok)throw new Error(hj?.error||"Health scan failed");if(!a.ok)throw new Error(aj?.error||"Audit log failed");
      setHealth(hj);setAudit(Array.isArray(aj.entries)?aj.entries:[]);setSeason(hj.analysisSeason==null?"":String(hj.analysisSeason));
    }catch(e:any){setMsg(e?.message||"Could not load data health")}finally{setLoading(false)}
  }
  useEffect(()=>{void load(false)},[draftClass]);
  async function saveSeason(){
    setMsg("Saving class/season mapping…");
    const r=await fetch("/api/draft-class/context",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({draftClass,analysisSeason:season===""?null:Number(season)})}),j=await r.json();
    if(!r.ok){setMsg(j?.error||"Could not save mapping");return}setMsg("Analysis season updated.");await load(false);
  }
  async function undo(id:number){
    if(!confirm("Undo this recorded change?"))return;
    const r=await fetch("/api/audit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"undo",id})}),j=await r.json();
    if(!r.ok){setMsg(j?.error||"Could not undo change");return}setMsg("Change undone.");window.dispatchEvent(new Event("rookie-draft:players-changed"));await load(false);
  }
  const issues=health?.issues||[],counts=health?.counts||{};
  return <div style={{display:"grid",gap:14}}>
    <div className="card" style={{background:"linear-gradient(135deg,#0d1d34,#081528)",borderColor:"#29476e"}}>
      <span className="ey">Data Health · Draft Class {draftClass}</span><h1 style={{marginBottom:8}}>Integrity, identity and change control</h1>
      <p className="muted" style={{maxWidth:900}}>One place to catch silent data drift before it reaches scouting cards, grades or the draft board. This scan checks canonical player identity, active Player Data, grade dependencies, class/season mapping and conflicting workflow status.</p>
      <div className="grid" style={{gridTemplateColumns:"repeat(5,minmax(0,1fr))",marginTop:16}}>
        {[["Status",health?.status?.toUpperCase()||"—"],["Errors",counts.errors??"—"],["Warnings",counts.warnings??"—"],["Identity",health?health.identityCoverage+"%":"—"],["Watched",health?.watchedCount??"—"]].map(([k,v])=><div key={k} style={{padding:12,border:"1px solid #29476e",borderRadius:10,background:"#09182c"}}><span className="muted" style={{fontSize:9,textTransform:"uppercase"}}>{k}</span><strong style={{display:"block",fontSize:24,marginTop:5}}>{v}</strong></div>)}
      </div>
      <div className="row-actions" style={{marginTop:14}}><button onClick={()=>void load(false)} disabled={loading}>{loading?"Scanning…":"Run Scan"}</button><button className="ghost" onClick={()=>void load(true)} disabled={loading}>Deep Scan · includes headshots</button></div>
    </div>

    <div className="grid" style={{gridTemplateColumns:"minmax(0,1.15fr) minmax(300px,.85fr)"}}>
      <div className="card"><div className="page-head"><div><h2>Issues</h2><p className="muted">{issues.length?issues.length+" item"+(issues.length===1?"":"s")+" need attention":"No integrity issues found."}</p></div></div>
        <div style={{display:"grid",gap:8}}>
          {issues.length?issues.map((x:any,i:number)=><div key={x.code+"-"+(x.playerId||i)} style={{padding:12,border:"1px solid #29476e",borderLeft:"4px solid "+tone(x.severity),borderRadius:9,background:"#09182c"}}><div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}><b>{x.title}</b><span style={{color:tone(x.severity),fontSize:9,fontWeight:950,textTransform:"uppercase"}}>{x.severity}</span></div><div className="muted" style={{fontSize:11,marginTop:5}}>{x.detail}</div>{x.playerName&&<div style={{fontSize:10,marginTop:6,color:"#9fc4ee"}}>{x.position} · {x.playerName} · ID {x.playerId}</div>}</div>):<div className="notice" style={{color:"#70dfc9"}}>✓ All scanned integrity checks passed.</div>}
        </div>
      </div>
      <div className="card"><span className="ey">CLASS CONTEXT</span><h2>Draft Class vs Stat Season</h2><p className="muted">These are separate backend concepts. Scouting for a class uses the explicitly assigned completed analysis season.</p>
        <label style={{display:"grid",gap:7,marginTop:14}}>Draft Class<input value={draftClass} readOnly/></label>
        <label style={{display:"grid",gap:7,marginTop:10}}>Analysis Stat Season<input type="number" min="2000" max="2100" value={season} onChange={e=>setSeason(e.target.value)} placeholder="Unassigned"/></label>
        <button style={{marginTop:12}} onClick={saveSeason}>Save Mapping</button>
        <div className="notice" style={{marginTop:14}}><b>Active PFF seasons</b><div style={{marginTop:5}}>{health?.activeSeasons?.length?health.activeSeasons.join(", "):"No active PFF dataset"}</div></div>
      </div>
    </div>

    <div className="card"><div className="page-head"><div><span className="ey">AUDIT LOG</span><h2>Recent changes + Undo</h2><p className="muted">Critical writes record before/after state. Undo is only offered when the reversal is safe and supported.</p></div></div>
      <div style={{display:"grid",gap:7}}>
        {audit.length?audit.map((a:any)=><div key={a.id} style={{display:"grid",gridTemplateColumns:"110px minmax(220px,1fr) 170px auto",gap:10,alignItems:"center",padding:10,border:"1px solid #29476e",borderRadius:9,background:"#09182c",opacity:a.undoneAt?.7:1}}><b style={{fontSize:10}}>{a.action}</b><div><strong style={{fontSize:12}}>{a.summary}</strong><div className="muted" style={{fontSize:9,marginTop:3}}>{a.entityType}{a.entityId?" · "+a.entityId:""}</div></div><span className="muted" style={{fontSize:9}}>{new Date(a.createdAt).toLocaleString()}</span><div>{a.undoneAt?<span style={{fontSize:9,color:"#70dfc9"}}>Undone</span>:a.undoable?<button className="small ghost" onClick={()=>void undo(Number(a.id))}>Undo</button>:<span className="muted" style={{fontSize:9}}>Recorded</span>}</div></div>):<div className="empty">No audited changes yet. New changes will appear here.</div>}
      </div>
    </div>
    {msg&&<div className="notice">{msg}</div>}
    <div className="muted" style={{fontSize:9}}>Last scan: {health?.scannedAt?new Date(health.scannedAt).toLocaleString():"—"} · Analysis season: {fmt(health?.analysisSeason)}</div>
  </div>
}
