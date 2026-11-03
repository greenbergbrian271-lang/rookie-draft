"use client";
import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";

type Player={id:string|number;name:string;position:"QB"|"RB"|"WR"|"TE";college?:string;draft_class:number;scouting_status:string};
type GamePlayer={name:string;position:string;college?:string};
const norm=(s:any)=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");

export default function NewPlayerWatchedModal({open,onClose,onDone,draftClass=2027,seedPlayers}:{open:boolean;onClose:()=>void;onDone?:()=>void;draftClass?:number;seedPlayers?:GamePlayer[]}){
  const seeded=seedPlayers!==undefined;
  const seedPlayerKeys=useMemo(()=>new Set((seedPlayers||[]).map(p=>norm(p.name)+"|"+String(p.position).toUpperCase())),[seedPlayers]);
  const [players,setPlayers]=useState<Player[]>([]),[position,setPosition]=useState("ALL"),[college,setCollege]=useState(""),[search,setSearch]=useState("");
  const [selected,setSelected]=useState<string[]>([]),[queue,setQueue]=useState<string[]>([]),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[complete,setComplete]=useState(false),[sheetIds,setSheetIds]=useState<string[]>([]);

  useEffect(()=>{
    if(!open)return;
    setPosition("ALL");setCollege("");setSearch("");setSelected([]);setQueue([]);setMsg("");setComplete(false);setBusy(true);setPlayers([]);
    let savedIds:string[]=[];
    try{
      const saved=JSON.parse(sessionStorage.getItem("rookie-draft:scouting-sheet-player-ids")||"[]");
      savedIds=Array.isArray(saved)?saved.map(String):[];
    }catch{}
    setSheetIds(savedIds);
    let cancelled=false;
    fetch("/api/players",{cache:"no-store"})
      .then(r=>{if(!r.ok)throw new Error("Could not load players.");return r.json()})
      .then(j=>{
        if(cancelled)return;
        if(!Array.isArray(j))throw new Error("Invalid player response.");
        setPlayers(j);
        if(seedPlayers!==undefined){
          const playerKey=(p:any)=>norm(p.name)+"|"+String(p.position).toUpperCase();
          const requested=new Set(seedPlayers.map(playerKey));
          const matched=j.filter((p:any)=>p.draft_class===draftClass&&requested.has(playerKey(p)));
          const eligible=matched.filter((p:any)=>!["WATCHED","FINISHED","MAYBE"].includes(p.scouting_status)&&!savedIds.includes(String(p.id)));
          const matchedKeys=new Set(matched.map(playerKey));
          const missing=seedPlayers.filter(p=>!matchedKeys.has(playerKey(p)));
          const unavailable=matched.length-eligible.length;
          setQueue(eligible.map((p:any)=>String(p.id)));
          const details:string[]=[];
          if(missing.length)details.push(missing.length+" not found in Players to Scout");
          if(unavailable)details.push(unavailable+" already watched, finished, marked maybe, or on a scouting sheet");
          setMsg(eligible.length+" eligible player"+(eligible.length===1?"":"s")+" from this game pre-queued."+(details.length?" "+details.join("; ")+".":""));
        }
      })
      .catch((e:any)=>{if(!cancelled)setMsg(e?.message||"Could not load players.")})
      .finally(()=>{if(!cancelled)setBusy(false)});
    return()=>{cancelled=true};
  },[open,draftClass,seedPlayers]);

  const classPlayers=useMemo(()=>players.filter(p=>p.draft_class===draftClass),[players,draftClass]);
  const candidates=useMemo(()=>classPlayers.filter(p=>!["WATCHED","FINISHED","MAYBE"].includes(p.scouting_status)&&!sheetIds.includes(String(p.id))&&(!seeded||seedPlayerKeys.has(norm(p.name)+"|"+String(p.position).toUpperCase()))),[classPlayers,sheetIds,seeded,seedPlayerKeys]);
  const excluded=classPlayers.length-candidates.length;
  const colleges=useMemo(()=>Array.from(new Set(candidates.map(p=>p.college).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b)),[candidates]);
  const shown=useMemo(()=>candidates.filter(p=>(position==="ALL"||p.position===position)&&(!college.trim()||norm(p.college)===norm(college))&&(!search.trim()||norm(p.name+" "+(p.college||"")+" "+p.position).includes(norm(search)))),[candidates,position,college,search]);
  const byId=(id:string)=>players.find(p=>String(p.id)===id);

  function add(ids:string[]){setQueue(q=>Array.from(new Set([...q,...ids])));setSelected([])}
  async function process(){
    if(!queue.length)return;
    setBusy(true);setMsg("");
    try{
      const picked=queue.map(byId).filter((p):p is Player=>Boolean(p));
      for(const p of picked){
        const r=await fetch("/api/players",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:p.id,status:"WATCHED"})});
        if(!r.ok)throw new Error("Could not add "+p.name+" to scouting.");
        const defaults=p.position==="QB"
          ?{"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None"}
          :p.position==="TE"
            ?{"Special Teams":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None"}
            :{"Special Teams?":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None"};
        await Promise.all(Object.entries(defaults).map(([category,commentary])=>fetch("/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,category,value:null,commentary})})));
      }
      setMsg(`${picked.length} player${picked.length===1?"":"s"} added to the appropriate scouting page${picked.length===1?"":"s"}.`);setComplete(true);setQueue([]);setSelected([]);window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.();
    }catch(e:any){setMsg(e?.message||"Could not process queue.")}finally{setBusy(false)}
  }
  if(!open)return null;
  return <div className="watched-modal-backdrop" role="dialog" aria-modal="true" aria-label="New Players Watched" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()}>
    <div className="watched-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="watched-modal-head"><div><span className="ey">{draftClass} · Scouting Tools</span><h2>New Players Watched</h2><p>{seeded?"Review the players identified in this game note. Eligible players are pre-queued to be marked watched.":`Add existing ${draftClass} Players to Scout to their position scouting pages.`}</p></div><button className="small ghost" disabled={busy} onClick={onClose}>Close</button></div>
      {seeded?<div className="watched-exclusion">Only players identified in this game note are shown. Eligible players are pre-queued for review.</div>:<div className="watched-exclusion">📘 Excluding {excluded} player{excluded===1?"":"s"} already on scouting sheets</div>}
      <div className="watched-filter-grid">
        <label>Position<select value={position} onChange={e=>{setPosition(e.target.value);setSelected([])}}><option value="ALL">All Positions</option>{["QB","RB","WR","TE"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>College<input list="watched-colleges" value={college} onChange={e=>{setCollege(e.target.value);setSelected([])}} placeholder="All Colleges"/><datalist id="watched-colleges">{colleges.map(x=><option key={x} value={x}/>)}</datalist></label>
        <label className="wide">Search<input value={search} onChange={e=>{setSearch(e.target.value);setSelected([])}} placeholder="Type to filter…"/></label>
      </div>
      <div className="watched-showing">Showing {shown.length} player{shown.length===1?"":"s"}</div>
      <div className="watched-player-list">
        {busy&&!players.length?<div className="watched-empty">Loading players…</div>:shown.length?shown.map(p=>{const id=String(p.id),checked=selected.includes(id),queued=queue.includes(id),style=schoolStyle(p.college);return <label key={p.id} className={"school-coded "+(queued?"queued":"")} style={style} onClick={e=>e.stopPropagation()}>
          <input type="checkbox" disabled={queued} checked={checked} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>
          <span className="pos">{p.position}</span><span className="name">{p.name}</span><span className="college">{p.college||"College TBD"}</span>{queued&&<b>Queued</b>}
        </label>}):<div className="watched-empty">{seeded?"No eligible players from this game were found. They may already be watched, finished, marked maybe, or missing from Players to Scout.":"No matching players."}</div>}
      </div>
      <div className="watched-add-actions">
        <button disabled={!selected.length} onClick={()=>add(selected)}>+ Add Selected to Queue</button>
        <button className="purple" disabled={!shown.some(p=>!queue.includes(String(p.id)))} onClick={()=>add(shown.map(p=>String(p.id)))}>+ Add All Shown to Queue</button>
      </div>
      <div className="watched-queue-head"><h3>{seeded?"Queued to Mark Watched":"Queued to Add"} ({queue.length})</h3>{queue.length>0&&<button className="small ghost" onClick={()=>setQueue([])}>Clear</button>}</div>
      <div className="watched-queue">
        {queue.length?queue.map(id=>{const p=byId(id);return p?<div key={id}><span className="player-badge" style={schoolStyle(p.college)}>{p.name}</span><small>{p.position} · {p.college}</small><button onClick={()=>setQueue(q=>q.filter(x=>x!==id))}>Remove</button></div>:null}):<div className="watched-empty">No players queued yet</div>}
      </div>
      {msg&&<div className={"notice "+(complete?"success-note":"")}>{msg}</div>}
      <div className="watched-footer"><button className="danger" disabled={busy} onClick={onClose}>{complete?"Done":"Cancel"}</button>{!complete&&<button className="success" disabled={busy||!queue.length} onClick={process}>{busy?"Processing…":"Process Queue"}</button>}</div>
    </div>
  </div>
}
