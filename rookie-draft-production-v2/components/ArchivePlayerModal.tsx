"use client";

import {useEffect,useMemo,useState} from "react";
import styles from "./ArchivePlayerModal.module.css";

type Player={
  id:string|number;
  name:string;
  position:"QB"|"RB"|"WR"|"TE";
  college?:string;
  draft_class:number;
  scouting_status:string;
};

type ArchivedPlayer={
  original_player_id:string|number;
  player_name:string;
  draft_class:number;
  position?:string|null;
  college?:string|null;
  reason?:string|null;
  archived_at?:string|null;
};

const REASONS=["Test player","Added by mistake","Retired / left football","No longer scouting","Other"];

function sortPlayers(a:Player,b:Player){
  if(a.draft_class!==b.draft_class)return b.draft_class-a.draft_class;
  return a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
}

export default function ArchivePlayerModal({
  open,
  onClose,
  onDone,
}:{
  open:boolean;
  onClose:()=>void;
  onDone?:()=>void;
}){
  const [players,setPlayers]=useState<Player[]>([]);
  const [archived,setArchived]=useState<ArchivedPlayer[]>([]);
  const [playerId,setPlayerId]=useState("");
  const [reason,setReason]=useState("");
  const [search,setSearch]=useState("");
  const [showArchived,setShowArchived]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);
    setError("");
    try{
      const [activeRes,archivedRes]=await Promise.all([
        fetch("/api/players",{cache:"no-store"}),
        fetch("/api/players/archive",{cache:"no-store"}),
      ]);
      const [activeData,archivedData]=await Promise.all([activeRes.json(),archivedRes.json()]);
      if(!activeRes.ok||!Array.isArray(activeData))throw new Error(activeData?.error||"Could not load active players.");
      if(!archivedRes.ok||!Array.isArray(archivedData))throw new Error(archivedData?.error||"Could not load archived players.");
      setPlayers(activeData.sort(sortPlayers));
      setArchived(archivedData);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Could not load players.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    if(!open)return;
    setPlayerId("");
    setReason("");
    setSearch("");
    setShowArchived(false);
    setMessage("");
    setError("");
    void load();
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!saving)onClose()};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,saving,onClose]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return players;
    return players.filter(p=>(p.name+" "+(p.college||"")+" "+p.position+" "+p.draft_class).toLowerCase().includes(q));
  },[players,search]);

  const selected=players.find(p=>String(p.id)===playerId);

  function clearLocalCopy(id:string|number){
    try{
      const key="rookie-draft.players.v1";
      const rows=JSON.parse(localStorage.getItem(key)||"[]");
      if(Array.isArray(rows))localStorage.setItem(key,JSON.stringify(rows.filter((p:any)=>String(p.id)!==String(id))));
    }catch{}
  }

  async function run(action:"archive"|"restore",id:string|number){
    setSaving(true);
    setMessage("");
    setError("");
    try{
      const r=await fetch("/api/players/archive",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action,playerId:id,reason:action==="archive"?reason||null:undefined}),
      });
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Archive update failed.");
      if(action==="archive")clearLocalCopy(id);
      setMessage(action==="archive"
        ?data.name+" removed from the active player database."
        :data.name+" restored with their saved scouting data.");
      setPlayerId("");
      setReason("");
      await load();
      window.dispatchEvent(new Event("rookie-draft:players-changed"));
      window.dispatchEvent(new Event("rookie-draft:archives-changed"));
      onDone?.();
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Archive update failed.");
    }finally{
      setSaving(false);
    }
  }

  if(!open)return null;

  return <div className={styles.backdrop} onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="archive-player-title">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Scouting Tools</div>
          <h2 id="archive-player-title">Archive Player</h2>
          <p>Remove a player from the active player database while keeping a restorable snapshot off to the side.</p>
        </div>
        <button className={styles.close} type="button" onClick={onClose} disabled={saving} aria-label="Close">×</button>
      </header>

      <div className={styles.notice}>
        This removes the player from Players to Scout, Scouting, Final Draft Board and other active player-pool views. Their active database row and linked scouting records are deleted after a separate restore snapshot is saved.
      </div>

      <div className={styles.form}>
        <label>
          <span>Find player</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, college or position…" disabled={loading||saving}/>
        </label>
        <label>
          <span>Player to archive</span>
          <select value={playerId} onChange={e=>setPlayerId(e.target.value)} disabled={loading||saving}>
            <option value="">{loading?"Loading players…":"Select player…"}</option>
            {filtered.map(p=><option key={String(p.id)} value={String(p.id)}>{p.draft_class+" · "+p.position+" · "+p.name+" · "+(p.college||"College not set")}</option>)}
          </select>
        </label>
        <label>
          <span>Reason <small>optional</small></span>
          <select value={reason} onChange={e=>setReason(e.target.value)} disabled={saving}>
            <option value="">No reason</option>
            {REASONS.map(x=><option key={x} value={x}>{x}</option>)}
          </select>
        </label>

        {selected&&<div className={styles.selected}>
          <strong>{selected.name}</strong>
          <span>{selected.position+" · "+(selected.college||"College not set")+" · "+selected.scouting_status}</span>
        </div>}

        <button className={styles.archiveButton} type="button" disabled={!selected||saving||loading} onClick={()=>selected&&run("archive",selected.id)}>
          {saving?"Removing…":"Archive & Remove Player"}
        </button>
      </div>

      <button className={styles.archivedToggle} type="button" onClick={()=>setShowArchived(v=>!v)} disabled={loading||saving}>
        <span>{showArchived?"Hide previously archived players":"View previously archived players"}</span>
        <b>{archived.length}</b>
      </button>

      {showArchived&&<div className={styles.archivedPanel}>
        {archived.length===0?<div className={styles.empty}>No players have been archived.</div>:
        archived.map(p=><div className={styles.archivedRow} key={String(p.original_player_id)}>
          <div>
            <strong>{p.player_name}</strong>
            <span>{[p.position,p.college,p.draft_class].filter(Boolean).join(" · ")}</span>
            <small>{p.reason||"No reason saved"}{p.archived_at?" · "+new Date(p.archived_at).toLocaleDateString():""}</small>
          </div>
          <button type="button" onClick={()=>run("restore",p.original_player_id)} disabled={saving}>Restore</button>
        </div>)}
      </div>}

      {message&&<div className={styles.success}>{message}</div>}
      {error&&<div className={styles.error}>{error}</div>}

      <footer className={styles.footer}>
        <button type="button" onClick={onClose} disabled={saving}>Close</button>
      </footer>
    </section>
  </div>;
}
