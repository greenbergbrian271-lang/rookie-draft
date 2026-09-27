"use client";

import {useEffect,useMemo,useState} from "react";
import styles from "./MaybeScoutModal.module.css";

type Position="QB"|"RB"|"WR"|"TE";
type Mode="to-maybe"|"from-maybe"|null;
type Player={
  id:string|number;
  name:string;
  position:Position;
  college?:string;
  draft_class:number;
  scouting_status:string;
  watch_order?:number|null;
};

const POSITIONS:Position[]=["QB","RB","WR","TE"];

function sortPlayers(a:Player,b:Player){
  const ao=a.watch_order??Number.MAX_SAFE_INTEGER;
  const bo=b.watch_order??Number.MAX_SAFE_INTEGER;
  if(ao!==bo)return ao-bo;
  return Number(a.id)-Number(b.id);
}

export default function MaybeScoutModal({
  open,
  onClose,
  onDone,
}:{
  open:boolean;
  onClose:()=>void;
  onDone?:()=>void;
}){
  const [players,setPlayers]=useState<Player[]>([]);
  const [mode,setMode]=useState<Mode>(null);
  const [confirming,setConfirming]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [positions,setPositions]=useState<Record<string,Position>>({});
  const [filter,setFilter]=useState<"All"|Position>("All");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);
    setError("");
    try{
      const r=await fetch("/api/players",{cache:"no-store"});
      const data=await r.json();
      if(!r.ok||!Array.isArray(data))throw new Error(data?.error||"Could not load players.");
      setPlayers(data);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Could not load players.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    if(!open)return;
    setMode(null);
    setConfirming(false);
    setSelected(new Set());
    setPositions({});
    setFilter("All");
    setSearch("");
    setError("");
    void load();
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!saving)onClose();
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,saving,onClose]);

  const active=useMemo(()=>players
    .filter(p=>p.draft_class===2027&&p.scouting_status!=="MAYBE"&&p.scouting_status!=="FINISHED")
    .sort(sortPlayers),[players]);
  const maybe=useMemo(()=>players
    .filter(p=>p.draft_class===2027&&p.scouting_status==="MAYBE")
    .sort(sortPlayers),[players]);

  const candidates=useMemo(()=>{
    const base=mode==="from-maybe"?maybe:active;
    const needle=search.trim().toLowerCase();
    return base.filter(p=>{
      if(mode==="to-maybe"&&filter!=="All"&&p.position!==filter)return false;
      if(!needle)return true;
      return (p.name+" "+(p.college||"")+" "+p.position).toLowerCase().includes(needle);
    });
  },[mode,maybe,active,filter,search]);

  const selectedPlayers=useMemo(()=>{
    const byId=new Map(players.map(p=>[String(p.id),p]));
    return [...selected].map(id=>byId.get(id)).filter((p):p is Player=>Boolean(p)).sort(sortPlayers);
  },[players,selected]);

  function chooseMode(next:Exclude<Mode,null>){
    setMode(next);
    setConfirming(false);
    setSelected(new Set());
    setPositions({});
    setFilter("All");
    setSearch("");
    setError("");
  }

  function toggle(id:string){
    setSelected(prev=>{
      const next=new Set(prev);
      if(next.has(id))next.delete(id);else next.add(id);
      return next;
    });
    setError("");
  }

  function selectVisible(){
    setSelected(prev=>{
      const next=new Set(prev);
      const ids=candidates.map(p=>String(p.id));
      const allSelected=ids.length>0&&ids.every(id=>next.has(id));
      ids.forEach(id=>allSelected?next.delete(id):next.add(id));
      return next;
    });
  }

  function beginConfirm(){
    if(selected.size===0){setError("Select at least one player.");return}
    const next:Record<string,Position>={};
    selectedPlayers.forEach(p=>{next[String(p.id)]=p.position});
    setPositions(next);
    setConfirming(true);
    setError("");
  }

  async function save(){
    if(!mode||selected.size===0){setError("Select at least one player.");return}
    setSaving(true);
    setError("");
    try{
      const body=mode==="to-maybe"
        ?{action:"to-maybe",playerIds:selectedPlayers.map(p=>p.id)}
        :{action:"from-maybe",moves:selectedPlayers.map(p=>({id:p.id,position:positions[String(p.id)]||p.position}))};
      const r=await fetch("/api/players/maybe",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify(body),
      });
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Could not move players.");
      window.dispatchEvent(new Event("rookie-draft:players-changed"));
      onDone?.();
      onClose();
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Could not move players.");
    }finally{
      setSaving(false);
    }
  }

  if(!open)return null;

  return <div className={styles.backdrop} onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="maybe-scout-title">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Scouting Tools</div>
          <h2 id="maybe-scout-title">Maybe Scout Player</h2>
          <p>Move prospects into the Maybe queue or return them to a position list.</p>
        </div>
        <button className={styles.close} type="button" onClick={onClose} disabled={saving} aria-label="Close">×</button>
      </header>

      {mode===null?<div className={styles.directionGrid}>
        <button type="button" className={styles.directionCard} onClick={()=>chooseMode("to-maybe")}>
          <span className={styles.directionIcon}>↓</span>
          <span><strong>Move Players to Maybe</strong><small>Choose from QB, RB, WR, or TE. Their position is preserved.</small></span>
          <b>{active.length}</b>
        </button>
        <button type="button" className={styles.directionCard} onClick={()=>chooseMode("from-maybe")}>
          <span className={styles.directionIcon}>↗</span>
          <span><strong>Move From Maybe to Position</strong><small>Confirm the saved position or change it before moving back.</small></span>
          <b>{maybe.length}</b>
        </button>
      </div>:<>
        <div className={styles.workflowHead}>
          <button type="button" className={styles.back} onClick={()=>confirming?setConfirming(false):setMode(null)} disabled={saving}>← Back</button>
          <div>
            <strong>{mode==="to-maybe"?"Move Players to Maybe":confirming?"Confirm Positions":"Select Maybe Players"}</strong>
            <span>{selected.size} selected</span>
          </div>
        </div>

        {!confirming&&<>
          <div className={styles.filters}>
            {mode==="to-maybe"&&<select value={filter} onChange={e=>setFilter(e.target.value as "All"|Position)} aria-label="Filter by position">
              <option value="All">All positions</option>
              {POSITIONS.map(pos=><option value={pos} key={pos}>{pos}</option>)}
            </select>}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search players…" autoFocus/>
            <button type="button" className={styles.selectVisible} onClick={selectVisible} disabled={candidates.length===0}>Select visible</button>
          </div>

          <div className={styles.list}>
            {loading?<div className={styles.empty}>Loading players…</div>:
            candidates.length===0?<div className={styles.empty}>{mode==="from-maybe"?"No players are currently in Maybe.":"No eligible players match these filters."}</div>:
            candidates.map(p=>{
              const id=String(p.id),checked=selected.has(id);
              return <label className={[styles.playerRow,checked?styles.checked:""].filter(Boolean).join(" ")} key={id}>
                <input type="checkbox" checked={checked} onChange={()=>toggle(id)} disabled={saving}/>
                <span className={styles.position}>{p.position}</span>
                <span className={styles.playerCopy}><strong>{p.name}</strong><small>{p.college||"College not set"}</small></span>
                {mode==="from-maybe"&&<span className={styles.saved}>Saved position</span>}
              </label>;
            })}
          </div>
        </>}

        {confirming&&<div className={styles.confirmList}>
          <div className={styles.confirmNote}>Each player is prefilled with the position stored while they were in Maybe. Change any player whose position has changed, then confirm.</div>
          {selectedPlayers.map(p=><div className={styles.confirmRow} key={String(p.id)}>
            <div><strong>{p.name}</strong><small>{p.college||"College not set"} · saved as {p.position}</small></div>
            <select value={positions[String(p.id)]||p.position} onChange={e=>setPositions(prev=>({...prev,[String(p.id)]:e.target.value as Position}))}>
              {POSITIONS.map(pos=><option key={pos} value={pos}>{pos}</option>)}
            </select>
          </div>)}
        </div>}
      </>}

      {error&&<div className={styles.error}>{error}</div>}

      <footer className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={saving}>Cancel</button>
        {mode==="to-maybe"&&<button type="button" className={styles.primary} onClick={save} disabled={saving||loading||selected.size===0}>{saving?"Moving…":`Move ${selected.size||""} to Maybe`}</button>}
        {mode==="from-maybe"&&!confirming&&<button type="button" className={styles.primary} onClick={beginConfirm} disabled={saving||loading||selected.size===0}>Confirm Positions →</button>}
        {mode==="from-maybe"&&confirming&&<button type="button" className={styles.primary} onClick={save} disabled={saving||selected.size===0}>{saving?"Moving…":`Move ${selected.size} to Position`}</button>}
      </footer>
    </section>
  </div>;
}
