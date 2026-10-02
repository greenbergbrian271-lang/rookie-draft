"use client";
import {ChangeEvent,useCallback,useEffect,useState} from "react";
import {Archive,CheckCircle2,Database,FileUp,ShieldCheck} from "lucide-react";

const PREFIX="rookie-draft.";
const POSITIONS=["QB","RB","WR","TE"] as const;

export default function Page(){
  const [warehouse,setWarehouse]=useState<any>({latest:null,history:[]});
  const [loading,setLoading]=useState(true);
  const [importing,setImporting]=useState(false);
  const [msg,setMsg]=useState("");
  const [backupMsg,setBackupMsg]=useState("");
  const [season,setSeason]=useState(2026);
  const [draftClass,setDraftClass]=useState(2027);

  const loadWarehouse=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/pff-process",{cache:"no-store"}),j=await r.json();
      if(r.ok)setWarehouse(j);
      else setMsg(j.error||"Could not load PFF warehouse.");
    }catch{setMsg("Could not load PFF warehouse.")}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void loadWarehouse()},[loadWarehouse]);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setImporting(true);setMsg("Reading PFF exports, merging files, and calculating thresholds…");
    try{
      const fd=new FormData(e.currentTarget);fd.set("season",String(season));fd.set("draftClass",String(draftClass));
      const r=await fetch("/api/pff-process",{method:"POST",body:fd}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"PFF import failed");
      const summary=POSITIONS.map(p=>`${p} ${j.summary?.[p]?.eligible??0} eligible + ${j.summary?.[p]?.scoutingOverrides??0} scouting override`).join(" · ");
      setMsg(`Dataset #${j.datasetId} imported. ${summary}`);
      (e.currentTarget.elements.namedItem("files") as HTMLInputElement).value="";
      await loadWarehouse();
    }catch(e:unknown){setMsg(e instanceof Error?e.message:"PFF import failed")}finally{setImporting(false)}
  }

  function exportBackup(){
    const data:any={version:1,exportedAt:new Date().toISOString(),items:{}};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(PREFIX))data.items[k]=localStorage.getItem(k)}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=`rookie-draft-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
    setBackupMsg(`Backup created with ${Object.keys(data.items).length} browser data sets.`);
  }
  async function importBackup(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    try{
      const data=JSON.parse(await file.text());if(data?.version!==1||!data?.items||typeof data.items!=="object")throw new Error();
      let n=0;for(const [k,v] of Object.entries(data.items)){if(k.startsWith(PREFIX)&&typeof v==="string"){localStorage.setItem(k,v);n++}}
      setBackupMsg(`Restored ${n} browser data sets.`);
    }catch{setBackupMsg("That file is not a valid Rookie Draft backup. Nothing changed.")}finally{e.target.value=""}
  }

  const latest=warehouse.latest;
  return <div className="dc-page">
    <section className="dc-hero">
      <div><span className="ey">Data Operations</span><h1>Data Center</h1><p>One ingestion layer for PFF and app data. Raw exports are retained in Turso; Player Data is the only player-facing presentation layer.</p></div>
      <div className="dc-hero-badges"><span><Database size={15}/>Turso warehouse</span><span><ShieldCheck size={15}/>20% eligibility engine</span></div>
    </section>

    <section className="dc-grid">
      <form className="dc-card dc-import" onSubmit={submit}>
        <div className="dc-card-head"><div><span className="dc-kicker">Primary workflow</span><h2>Import PFF Data</h2></div><FileUp size={25}/></div>
        <p className="muted">Upload the raw PFF exports together. The importer merges files by player, stores every field, calculates positional usage thresholds automatically, and updates Player Data.</p>
        <label className="dc-drop">
          <FileUp size={24}/><strong>Choose PFF CSV exports</strong><span>Passing, rushing, receiving and supplemental exports can be uploaded together.</span>
          <input name="files" type="file" accept=".csv,text/csv" multiple required/>
        </label>
        <div className="dc-inputs">
          <label>College season<input type="number" value={season} onChange={e=>setSeason(Number(e.target.value)||2026)}/></label>
          <label>Draft class<input type="number" value={draftClass} onChange={e=>setDraftClass(Number(e.target.value)||2027)}/></label>
        </div>
        <div className="dc-rule"><CheckCircle2 size={17}/><div><strong>No threshold entry required</strong><span>QB = 20% of passing-attempt leader · RB = 20% of rushing-attempt leader · WR/TE = 20% of target leader · rounded up.</span></div></div>
        <button className="dc-primary" disabled={importing}>{importing?"Building dataset…":"Import + Rebuild Player Data"}</button>
        {msg&&<div className="dc-message">{msg}</div>}
      </form>

      <section className="dc-card">
        <div className="dc-card-head"><div><span className="dc-kicker">Current snapshot</span><h2>Eligibility + storage</h2></div><Database size={24}/></div>
        {loading?<div className="dc-empty">Loading warehouse…</div>:latest?<div className="dc-status">
          <div className="dc-snapshot-meta"><strong>Dataset #{latest.id}</strong><span>{latest.season} season · {latest.draft_class} draft class</span><time>{new Date(latest.created_at).toLocaleString()}</time></div>
          <div className="dc-position-grid">{POSITIONS.map(pos=>{const s=latest.summary?.[pos]||{},leader=latest.leaders?.[pos],threshold=latest.thresholds?.[pos];return <article key={pos}>
            <header><b>{pos}</b><span>{leader?.metric||"Usage"}</span></header>
            <div className="dc-threshold"><small>Leader</small><strong>{leader?.value??"—"}</strong><small>Threshold</small><strong>{threshold??"—"}</strong></div>
            <footer><span>{s.eligible??0} percentile pool</span><span>{s.scoutingOverrides??0} overrides</span><span>{s.stored??0} stored</span></footer>
          </article>})}</div>
          <div className="dc-storage-note"><Archive size={17}/><span>Below-threshold non-scouted players stay archived in Turso instead of disappearing. Unused PFF fields are retained with the same dataset snapshot.</span></div>
        </div>:<div className="dc-empty">No warehouse snapshot yet. Your current canonical Player Data remains available until the first import.</div>}
      </section>
    </section>

    <section className="dc-card">
      <div className="dc-card-head"><div><span className="dc-kicker">Audit trail</span><h2>Import history</h2></div><Archive size={22}/></div>
      {warehouse.history?.length?<div className="dc-history">{warehouse.history.map((h:any)=><div key={h.id}><strong>#{h.id}</strong><span>{h.season} season</span><span>{h.draft_class} class</span><span>{POSITIONS.map(p=>`${p} ${h.thresholds?.[p]??"—"}`).join(" · ")}</span><time>{new Date(h.created_at).toLocaleString()}</time></div>)}</div>:<div className="dc-empty">Import history will appear here.</div>}
    </section>

    <section className="dc-card dc-backup">
      <div><span className="dc-kicker">Browser-only settings</span><h2>Local backup</h2><p className="muted">Core players, evaluations, PFF datasets and raw PFF rows are already cloud-persisted. This only protects browser-local preferences.</p></div>
      <div className="row-actions"><button type="button" className="ghost" onClick={exportBackup}>Download backup</button><label className="buttonlike ghost">Restore backup<input hidden type="file" accept=".json,application/json" onChange={importBackup}/></label></div>
      {backupMsg&&<span className="muted">{backupMsg}</span>}
    </section>

    <style jsx global>{`
      .dc-page{display:grid;gap:14px}.dc-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:25px 27px;border:1px solid #20395f;border-radius:18px;background:radial-gradient(circle at 90% 0,rgba(65,190,255,.13),transparent 40%),linear-gradient(135deg,#0d1d34,#081528 72%)}.dc-hero h1{font-size:34px;margin:5px 0 8px}.dc-hero p{max-width:760px;color:#91a7c5;margin:0;line-height:1.55}.dc-hero-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.dc-hero-badges span{display:flex;gap:6px;align-items:center;padding:7px 10px;border:1px solid #29476e;border-radius:999px;background:#09172b;color:#a9bdd7;font-size:10px;font-weight:850;white-space:nowrap}
      .dc-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:14px}.dc-card{border:1px solid #20395f;border-radius:15px;background:#09172b;padding:18px;box-shadow:0 16px 40px rgba(0,0,0,.13)}.dc-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.dc-card h2{margin:3px 0 0;font-size:20px}.dc-kicker{color:#58a7ff;text-transform:uppercase;letter-spacing:.11em;font-size:9px;font-weight:950}.dc-drop{margin:16px 0;display:grid;place-items:center;text-align:center;gap:6px;padding:25px;border:1px dashed #3a608e;border-radius:13px;background:#0c1d35;cursor:pointer}.dc-drop:hover{border-color:#58a7ff;background:#10243f}.dc-drop span{font-size:10px;color:#8098b8;max-width:470px}.dc-drop input{margin-top:7px;max-width:100%}.dc-inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dc-inputs label{font-size:10px;font-weight:850;color:#9eb2ce}.dc-inputs input{margin-top:5px}.dc-rule{display:flex;gap:10px;align-items:flex-start;margin:13px 0;padding:11px;border:1px solid #255947;border-radius:10px;background:rgba(40,188,133,.08);color:#bdebd7}.dc-rule strong,.dc-rule span{display:block}.dc-rule span{margin-top:3px;font-size:10px;color:#83bca5;line-height:1.45}.dc-primary{width:100%;justify-content:center;background:#58a7ff;color:#06101e;font-weight:950}.dc-message{margin-top:10px;padding:10px;border:1px solid #29476e;border-radius:9px;background:#071426;color:#a9bdd7;font-size:11px}
      .dc-snapshot-meta{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;margin:14px 0;padding:10px 12px;border:1px solid #29476e;border-radius:10px;background:#071426}.dc-snapshot-meta strong{color:#fff}.dc-snapshot-meta span,.dc-snapshot-meta time{color:#7891b2;font-size:10px}.dc-position-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dc-position-grid article{border:1px solid #20395f;border-radius:11px;background:#0b1a30;overflow:hidden}.dc-position-grid header{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-bottom:1px solid #20395f}.dc-position-grid header b{font-size:14px}.dc-position-grid header span{font-size:9px;color:#7891b2}.dc-threshold{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:end;gap:5px;padding:10px}.dc-threshold small{font-size:8px;color:#6f89ab;text-transform:uppercase}.dc-threshold strong{font-size:17px;text-align:right}.dc-position-grid footer{display:flex;gap:5px;flex-wrap:wrap;padding:8px 10px;background:#071426}.dc-position-grid footer span{font-size:8px;color:#8fa6c6}.dc-storage-note{display:flex;gap:9px;margin-top:10px;padding:10px;color:#89a0bf;font-size:10px;line-height:1.45}.dc-empty{padding:28px 10px;color:#7891b2;text-align:center}.dc-history{display:grid;gap:5px;margin-top:12px}.dc-history>div{display:grid;grid-template-columns:55px 90px 90px 1fr auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid #1c3454;border-radius:9px;background:#081528;font-size:10px;color:#8ea5c5}.dc-history strong{color:#e9f2ff}.dc-history time{color:#647e9f}.dc-backup{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.dc-backup p{margin-bottom:0}
      @media(max-width:900px){.dc-grid{grid-template-columns:1fr}.dc-hero{display:block}.dc-hero-badges{justify-content:flex-start;margin-top:15px}.dc-history>div{grid-template-columns:45px 1fr 1fr}.dc-history>div span:nth-of-type(3),.dc-history time{grid-column:1/-1}.dc-backup{grid-template-columns:1fr}}@media(max-width:560px){.dc-inputs,.dc-position-grid{grid-template-columns:1fr}.dc-snapshot-meta{grid-template-columns:1fr}.dc-hero{padding:20px}}
    `}</style>
  </div>;
}
