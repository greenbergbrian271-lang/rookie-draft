"use client";
import Link from "next/link";
import {ChangeEvent,useEffect,useState} from "react";
import {useDraftClass} from "@/lib/use-draft-class";
const PREFIX="rookie-draft.";
type Threshold={position:string;volumeMetric:string;leaderVolume:number;thresholdValue:number;eligibleCount:number;scoutOverrideCount:number;storedCount:number};
export default function Page(){
 const draftClass=useDraftClass(),[msg,setMsg]=useState(""),[err,setErr]=useState(""),[backupMsg,setBackupMsg]=useState(""),[files,setFiles]=useState<File[]>([]),[season,setSeason]=useState(new Date().getFullYear()),[status,setStatus]=useState<any>(null),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const r=await fetch("/api/pff-process",{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load warehouse status");setStatus(j)}catch(e:any){setErr(e?.message||"Could not load warehouse status")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function submit(e:any){e.preventDefault();if(!files.length){setErr("Choose at least one PFF CSV export.");return}setErr("");setMsg("Processing raw PFF exports…");const fd=new FormData();files.forEach(f=>fd.append("files",f));fd.set("season",String(season));fd.set("draftClass",String(draftClass));try{const r=await fetch("/api/pff-process",{method:"POST",body:fd}),j=await r.json();if(!r.ok)throw new Error(j?.error||"PFF import failed");setMsg("Import complete. "+j.summary);setFiles([]);await load()}catch(e:any){setMsg("");setErr(e?.message||"PFF import failed")}}
 function exportBackup(){const data:any={version:1,exportedAt:new Date().toISOString(),items:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(PREFIX))data.items[k]=localStorage.getItem(k)}const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="rookie-draft-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href);setBackupMsg("Backup created with "+Object.keys(data.items).length+" browser-only data sets.")}
 async function importBackup(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data?.version!==1||!data?.items||typeof data.items!=="object")throw 0;let n=0;for(const [k,v] of Object.entries(data.items)){if(k.startsWith(PREFIX)&&typeof v==="string"){localStorage.setItem(k,v);n++}}setBackupMsg("Restored "+n+" browser-only data sets.")}catch{setBackupMsg("That file is not a valid Rookie Draft browser backup. Nothing was changed.")}finally{e.target.value=""}}
 const thresholds=status?.thresholds||{},hasWarehouse=Object.keys(thresholds).length>0;
 return <div style={{display:"grid",gap:14}}>
  <div className="card" style={{background:"linear-gradient(135deg,#0d1d34,#081528)",borderColor:"#29476e"}}>
   <span className="ey">Data Center · PFF warehouse</span><h1 style={{marginBottom:8}}>One import. One source of truth.</h1>
   <p className="muted" style={{maxWidth:900}}>Upload the raw PFF exports once. Data Center stores the full player universe in Turso, automatically calculates the PFF 20% volume cutoffs, preserves unused fields for future analysis, and publishes the correct projection to Player Data.</p>
   <div className="grid" style={{gridTemplateColumns:"repeat(4,minmax(0,1fr))",marginTop:16}}>
    {[["1 · Raw PFF","Every player + every column"],["2 · Turso warehouse","Raw + used + unused data"],["3 · Eligibility engine","20% of positional leader"],["4 · Player Data","Eligible + scout overrides"]].map(x=><div key={x[0]} style={{padding:12,border:"1px solid #29476e",borderRadius:10,background:"#09182c"}}><b>{x[0]}</b><div className="muted" style={{fontSize:11,marginTop:4}}>{x[1]}</div></div>)}
   </div>
  </div>
  <div className="grid" style={{gridTemplateColumns:"minmax(0,1.4fr) minmax(300px,.8fr)"}}>
   <form className="card" onSubmit={submit}>
    <h2>Import PFF Data</h2><p className="muted">The old manual threshold entry and second CSV upload step are gone. Upload the source exports together and Data Center handles the rest.</p>
    <label style={{display:"grid",gap:7,padding:18,border:"1px dashed #3b608b",borderRadius:12,background:"#0b1c33",cursor:"pointer"}}>
     <b>{files.length?String(files.length)+" CSV files selected":"Choose raw PFF CSV exports"}</b><span className="muted" style={{fontSize:10}}>{files.length?files.map(f=>f.name).join(" · "):"passing_summary, rushing_summary, receiving_summary, plus any supplemental PFF exports"}</span>
     <input type="file" accept=".csv,text/csv" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
    </label>
    <div className="grid" style={{gridTemplateColumns:"repeat(3,1fr)",marginTop:12}}>
     <label>Stats season<input type="number" min="2000" max="2100" value={season} onChange={e=>setSeason(Number(e.target.value)||new Date().getFullYear())}/></label>
     <label>Draft class<input value={draftClass} readOnly/></label>
     <label>Threshold<input value="20% · rounded up" readOnly/></label>
    </div>
    <button style={{marginTop:14}} disabled={!files.length}>Import to Data Center</button>
    {msg&&<p style={{color:"#70dfc9"}}>{msg}</p>}{err&&<p style={{color:"#ff9db8"}}>{err}</p>}
   </form>
   <div className="card"><h2>Eligibility rules</h2><p className="muted">QB: Passing Attempts<br/>RB: Rushing Attempts<br/>WR: Targets<br/>TE: Targets</p><div className="notice" style={{marginTop:12}}><b>Percentile protection</b><div style={{marginTop:5}}>Only threshold-eligible players define the percentile pool. A below-threshold Player to Scout is visible and benchmarked against that pool, but never changes it.</div></div></div>
  </div>
  <div className="card">
   <div className="page-head"><div><h2>{hasWarehouse?"Latest threshold population":"PFF warehouse status"}</h2><p className="muted">{hasWarehouse?(String(status?.season||"Current")+" season · Draft Class "+String(status?.draftClass||draftClass)):"Your existing Player Data remains intact until the first warehouse import."}</p></div><button className="ghost" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
   {hasWarehouse?<div className="grid" style={{gridTemplateColumns:"repeat(4,minmax(0,1fr))"}}>{["QB","RB","WR","TE"].map(pos=>{const t=thresholds[pos] as Threshold|undefined;return <div key={pos} style={{padding:13,border:"1px solid #29476e",borderRadius:11,background:"#09182c"}}><b style={{fontSize:16}}>{pos}</b>{t?<><div className="muted" style={{fontSize:10,marginTop:3}}>{t.volumeMetric}</div><div style={{fontSize:25,fontWeight:950,margin:"9px 0"}}>{t.thresholdValue}<span className="muted" style={{fontSize:9,marginLeft:6}}>cutoff · leader {t.leaderVolume}</span></div><div className="muted" style={{fontSize:10}}>{t.eligibleCount} eligible · {t.scoutOverrideCount} scout overrides · {t.storedCount} stored</div></>:<p className="muted">No {pos} primary file in the latest import.</p>}</div>})}</div>:<div className="empty">No v2 warehouse import yet.</div>}
   <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginTop:14,paddingTop:14,borderTop:"1px solid #20395f"}}><div><b>Player Data is the only player-level table now.</b><div className="muted" style={{fontSize:10,marginTop:3}}>The duplicate Player Data table that lived here has been removed.</div></div><Link className="buttonlike" href="/player-data">Open Player Data</Link></div>
  </div>
  <div className="card"><h2>What Data Center retains</h2><div className="grid" style={{gridTemplateColumns:"repeat(4,minmax(0,1fr))"}}>{[["Used metrics","Normalized fields feeding Player Data and scouting."],["Unused metrics","PFF columns not used today remain available later."],["Below threshold","Filtered players stay stored even when hidden from Player Data."],["Historical cutoffs","Each import stores its leader, cutoff and eligible population."]].map(x=><div key={x[0]}><b>{x[0]}</b><p className="muted">{x[1]}</p></div>)}</div></div>
  <div className="card"><h2>Browser backup</h2><p className="muted">This only protects browser-side preferences and ordering. Core players, evaluations and PFF warehouse data live in Turso.</p><div className="row-actions"><button onClick={exportBackup}>Download browser backup</button><label className="buttonlike ghost">Restore browser backup<input style={{display:"none"}} type="file" accept="application/json,.json" onChange={importBackup}/></label></div>{backupMsg&&<p>{backupMsg}</p>}</div>
 </div>;
}
