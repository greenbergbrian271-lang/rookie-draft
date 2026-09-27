"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import styles from "./ReorderPlayersModal.module.css";

type Position="QB"|"RB"|"WR"|"TE"|"Maybe";
type Player={
  id:string|number;
  name:string;
  position:"QB"|"RB"|"WR"|"TE";
  college?:string;
  draft_class:number;
  scouting_status:string;
  watch_order?:number|null;
};

const POSITIONS:Position[]=["QB","RB","WR","TE","Maybe"];

function blankDirty():Record<Position,boolean>{
  return {QB:false,RB:false,WR:false,TE:false,Maybe:false};
}

function emptyOrders():Record<Position,Player[]>{
  return {QB:[],RB:[],WR:[],TE:[],Maybe:[]};
}

function sortPlayers(a:Player,b:Player){
  const ao=a.watch_order??Number.MAX_SAFE_INTEGER;
  const bo=b.watch_order??Number.MAX_SAFE_INTEGER;
  if(ao!==bo)return ao-bo;
  return Number(a.id)-Number(b.id);
}

export default function ReorderPlayersModal({
  open,
  onClose,
}:{
  open:boolean;
  onClose:()=>void;
}){
  const [orders,setOrders]=useState<Record<Position,Player[]>>(emptyOrders);
  const [dirty,setDirty]=useState<Record<Position,boolean>>(blankDirty);
  const [currentPos,setCurrentPos]=useState<Position>("QB");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState<{text:string,type:""|"success"|"error"}>({text:"",type:""});
  const dragIndex=useRef<number|null>(null);
  const [dragOverIndex,setDragOverIndex]=useState<number|null>(null);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    setLoading(true);
    setStatus({text:"",type:""});
    fetch("/api/players",{cache:"no-store"})
      .then(async r=>{
        const data=await r.json();
        if(!r.ok)throw new Error(data?.error||"Could not load players.");
        if(!Array.isArray(data))throw new Error("Invalid player response.");
        return data as Player[];
      })
      .then(players=>{
        if(cancelled)return;
        const active=players.filter(p=>p.draft_class===2027&&p.scouting_status!=="FINISHED");
        const next=emptyOrders();
        for(const pos of ["QB","RB","WR","TE"] as const){
          next[pos]=active
            .filter(p=>p.position===pos&&p.scouting_status!=="MAYBE")
            .sort(sortPlayers);
        }
        next.Maybe=active.filter(p=>p.scouting_status==="MAYBE").sort(sortPlayers);
        setOrders(next);
        setDirty(blankDirty());
        const first=POSITIONS.find(pos=>next[pos].length>0)??"QB";
        setCurrentPos(first);
      })
      .catch((error:unknown)=>{
        if(cancelled)return;
        setStatus({text:error instanceof Error?error.message:"Could not load players.",type:"error"});
      })
      .finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!saving)onClose();
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,saving,onClose]);

  const visiblePositions=useMemo(()=>POSITIONS.filter(pos=>orders[pos].length>0),[orders]);
  const currentOrder=orders[currentPos]||[];

  function markDirty(pos:Position){
    setDirty(prev=>({...prev,[pos]:true}));
  }

  function movePlayer(from:number,to:number){
    if(from===to||from<0||to<0||from>=currentOrder.length||to>=currentOrder.length)return;
    setOrders(prev=>{
      const next=[...prev[currentPos]];
      const [moved]=next.splice(from,1);
      next.splice(to,0,moved);
      return {...prev,[currentPos]:next};
    });
    markDirty(currentPos);
    setStatus({text:"",type:""});
  }

  function commitRank(from:number,raw:string){
    const rank=Number.parseInt(raw,10);
    if(Number.isNaN(rank))return;
    const to=Math.min(Math.max(rank-1,0),Math.max(currentOrder.length-1,0));
    movePlayer(from,to);
  }

  async function savePositions(positions:Position[],closeAfter=false){
    if(saving)return;
    const changed=positions.filter(pos=>dirty[pos]);
    if(changed.length===0){
      setStatus({text:closeAfter?"No unsaved changes.":"No changes in "+currentPos+".",type:""});
      return;
    }
    setSaving(true);
    setStatus({text:changed.length===1?"Saving "+changed[0]+"…":"Saving "+changed.length+" columns…",type:""});
    const payload:Record<string,Array<{id:string|number;status:string}>>={};
    for(const pos of changed){
      payload[pos]=orders[pos].map(player=>({id:player.id,status:player.scouting_status}));
    }
    try{
      const r=await fetch("/api/players/reorder",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify(payload),
      });
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Could not save player order.");
      setDirty(prev=>{
        const next={...prev};
        changed.forEach(pos=>{next[pos]=false});
        return next;
      });
      window.dispatchEvent(new Event("rookie-draft:players-changed"));
      if(closeAfter){
        onClose();
      }else{
        setStatus({text:changed[0]+" saved ✓",type:"success"});
      }
    }catch(error:unknown){
      setStatus({text:error instanceof Error?error.message:"Could not save player order.",type:"error"});
    }finally{
      setSaving(false);
    }
  }

  if(!open)return null;

  return <div className={styles.backdrop} onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="reorder-players-title">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Scouting Tools</div>
          <h2 id="reorder-players-title">Reorder Players</h2>
        </div>
        <button className={styles.close} type="button" onClick={onClose} disabled={saving} aria-label="Close">×</button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Player positions">
        {visiblePositions.map(pos=>{
          const isActive=pos===currentPos;
          const isDirty=dirty[pos];
          return <button
            key={pos}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={[
              styles.tab,
              isActive?styles.active:"",
              isDirty?styles.dirty:"",
              isActive&&isDirty?styles.activeDirty:"",
            ].filter(Boolean).join(" ")}
            onClick={()=>{setCurrentPos(pos);setStatus({text:"",type:""})}}
          >
            {pos} ({orders[pos].length}){isDirty&&<span className={styles.dirtyDot}/>}
          </button>;
        })}
      </div>

      <p className={styles.instructions}>Drag rows, type a rank, or use ↑ ↓. Orange tabs have unsaved changes.</p>

      <div className={styles.list}>
        {loading?<div className={styles.empty}>Loading players…</div>:
        currentOrder.length===0?<div className={styles.empty}>No players in this column.</div>:
        currentOrder.map((player,idx)=><div
          className={[styles.playerRow,dragOverIndex===idx?styles.dragOver:""].filter(Boolean).join(" ")}
          key={String(player.id)}
          draggable={!saving}
          onDragStart={e=>{
            dragIndex.current=idx;
            e.dataTransfer.effectAllowed="move";
            e.currentTarget.classList.add(styles.dragging);
          }}
          onDragEnd={e=>{
            e.currentTarget.classList.remove(styles.dragging);
            dragIndex.current=null;
            setDragOverIndex(null);
          }}
          onDragOver={e=>{
            e.preventDefault();
            e.dataTransfer.dropEffect="move";
            setDragOverIndex(idx);
          }}
          onDragLeave={()=>setDragOverIndex(current=>current===idx?null:current)}
          onDrop={e=>{
            e.preventDefault();
            const from=dragIndex.current;
            setDragOverIndex(null);
            if(from!==null)movePlayer(from,idx);
          }}
        >
          <span className={styles.handle} aria-hidden="true">⋮⋮</span>
          <input
            key={String(player.id)+"-"+idx}
            className={styles.rank}
            type="number"
            min={1}
            max={currentOrder.length}
            defaultValue={idx+1}
            disabled={saving}
            aria-label={"Rank for "+player.name}
            title="Type a position and press Enter"
            onMouseDown={e=>e.stopPropagation()}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}}}
            onBlur={e=>commitRank(idx,e.currentTarget.value)}
          />
          <div className={styles.playerCopy}>
            <span className={styles.playerName}>{player.name}</span>
            <span className={styles.college}>{player.college||"College not set"}</span>
          </div>
          <div className={styles.moveButtons}>
            <button type="button" onClick={()=>movePlayer(idx,idx-1)} disabled={saving||idx===0} aria-label={"Move "+player.name+" up"}>↑</button>
            <button type="button" onClick={()=>movePlayer(idx,idx+1)} disabled={saving||idx===currentOrder.length-1} aria-label={"Move "+player.name+" down"}>↓</button>
          </div>
        </div>)}
      </div>

      <div className={[styles.status,status.type?styles[status.type]:""].filter(Boolean).join(" ")} aria-live="polite">{status.text}</div>

      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className={styles.saveColumn} onClick={()=>savePositions([currentPos])} disabled={saving||loading}>Save Column</button>
        <button type="button" className={styles.saveAll} onClick={()=>savePositions(POSITIONS,true)} disabled={saving||loading}>Save All &amp; Close</button>
      </div>
    </section>
  </div>;
}
