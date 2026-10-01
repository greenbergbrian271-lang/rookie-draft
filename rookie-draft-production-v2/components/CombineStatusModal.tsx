"use client";
import {useEffect,useState} from "react";

type ImportState={
  draftClass:number;
  imported?:boolean;
  sourceUrl?:string;
  sourceTitle?:string;
  importedAt?:string;
  totalInvites?:number;
  supportedInvites?:number;
  matchedYes?:number;
  markedNo?:number;
  inviteesNotOnBoard?:number;
  inviteePreview?:Array<{name:string;school:string;position:string}>;
  message?:string;
};

export default function CombineStatusModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const [url,setUrl]=useState(""),[status,setStatus]=useState<ImportState|null>(null),[preview,setPreview]=useState<ImportState|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");

  useEffect(()=>{if(!open)return;setPreview(null);setMsg("");setBusy(true);
    fetch("/api/combine-status?draftClass=2027",{cache:"no-store"})
      .then(r=>r.json())
      .then(j=>{setStatus(j);if(j?.sourceUrl)setUrl(j.sourceUrl)})
      .catch(()=>setMsg("Could not load the current Combine Status registry."))
      .finally(()=>setBusy(false));
  },[open]);

  async function run(apply:boolean){
    if(!url.trim())return setMsg("Paste the NFL.com combine invite article URL first.");
    setBusy(true);setMsg(apply?"Importing combine invites and updating scouting cards…":"Reading NFL article and previewing invite matches…");
    try{
      const r=await fetch("/api/combine-status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:url.trim(),apply})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Combine invite import failed.");
      setPreview(j);
      if(apply){
        setMsg(j.message||"Combine invite registry updated.");
        if(j.draftClass===2027)setStatus({...j,imported:true,sourceUrl:url.trim(),importedAt:j.importedAt});
        window.dispatchEvent(new Event("rookie-draft:players-changed"));
      }else setMsg("");
    }catch(e:any){setMsg(e?.message||"Combine invite import failed.")}
    finally{setBusy(false)}
  }

  if(!open)return null;
  const mismatch=preview&&preview.draftClass!==2027;
  return <div role="dialog" aria-modal="true" aria-label="Combine Status" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()} style={{position:"fixed",inset:0,zIndex:1450,display:"grid",placeItems:"center",padding:18,background:"rgba(2,8,18,.78)",backdropFilter:"blur(3px)"}}>
    <div onMouseDown={e=>e.stopPropagation()} style={{width:"min(760px,96vw)",maxHeight:"90vh",overflow:"auto",background:"#071426",border:"1px solid #31527f",borderRadius:16,boxShadow:"0 28px 80px rgba(0,0,0,.58)",padding:24}}>
      <div className="page-head"><div><div className="ey">GM Tools</div><h2>Combine Status</h2><p className="muted">Paste the NFL article announcing the official combine invite list. Preview it first, then import once to update every current scouting card and save the invite registry in Turso.</p></div><button className="small ghost" disabled={busy} onClick={onClose}>Close</button></div>

      {status?.imported&&<div className="notice" style={{marginBottom:14}}>
        <b>2027 registry loaded.</b> {status.totalInvites||0} total invitees · {status.supportedInvites||0} QB/RB/WR/TE.
        {status.importedAt?<span> Last imported {new Date(status.importedAt).toLocaleString()}.</span>:null}
      </div>}

      <label style={{display:"grid",gap:7,fontWeight:850}}>NFL.com invite article
        <input value={url} onChange={e=>{setUrl(e.target.value);setPreview(null);setMsg("")}} placeholder="https://www.nfl.com/news/nfl-combine-full-list-of-draft-prospects-invited-to-2027-scouting-event"/>
      </label>

      <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
        <button className="ghost" disabled={busy||!url.trim()} onClick={()=>run(false)}>{busy?"Working…":"Preview Article"}</button>
        {preview&&<button className="success" disabled={busy} onClick={()=>run(true)}>Import {preview.draftClass} Invite List</button>}
      </div>

      {preview&&<div style={{marginTop:16,display:"grid",gap:10}}>
        <div className="card" style={{padding:15,margin:0}}>
          <div className="ey">Detected Source</div>
          <h3 style={{margin:"4px 0 8px"}}>{preview.sourceTitle||(String(preview.draftClass)+" NFL Combine")}</h3>
          <div className="muted">{preview.totalInvites} invitees parsed · {preview.supportedInvites} QB/RB/WR/TE</div>
        </div>
        {mismatch&&<div className="notice" style={{borderColor:"#7a5b25",background:"rgba(181,125,36,.10)"}}>
          <b>This is a {preview.draftClass} article.</b> It parses correctly, but it will not change the 2027 scouting cards. Importing it will only store the {preview.draftClass} registry.
        </div>}
        <div className="grid">
          <div className="card" style={{padding:14,margin:0}}><div className="ey">Current Board · Yes</div><div style={{fontSize:26,fontWeight:950}}>{preview.matchedYes||0}</div><div className="muted">Current players found on the invite list</div></div>
          <div className="card" style={{padding:14,margin:0}}><div className="ey">Current Board · No</div><div style={{fontSize:26,fontWeight:950}}>{preview.markedNo||0}</div><div className="muted">Current players not listed; these become No after import</div></div>
        </div>
        {!!preview.inviteesNotOnBoard&&<div className="notice">{preview.inviteesNotOnBoard} invited QB/RB/WR/TE prospect{preview.inviteesNotOnBoard===1?" is":"s are"} not currently in Players to Scout. They will still be stored in Turso, so adding one later will automatically set Combine Invite? to Yes.</div>}
        {!!preview.inviteePreview?.length&&<div className="card" style={{padding:14,margin:0}}>
          <div className="ey" style={{marginBottom:9}}>Sample Parsed Invitees</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{preview.inviteePreview.map((p,i)=><span key={p.name+i} style={{padding:"6px 9px",borderRadius:999,border:"1px solid #29476e",background:"#0b1d35",fontSize:12,fontWeight:800}}>{p.position} · {p.name} · {p.school}</span>)}</div>
        </div>}
      </div>}

      {msg&&<div className="notice" style={{marginTop:14}}>{msg}</div>}
      <div className="muted" style={{fontSize:11,lineHeight:1.55,marginTop:16}}>A player is only treated as “No” after an invite registry has been imported for that draft class. Re-importing an updated NFL article replaces that class’s registry and resyncs the current board.</div>
    </div>
  </div>;
}
