"use client";
import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {setDraftClass,useDraftClass} from "@/lib/use-draft-class";

type Player={id:string|number;name:string;position:string;college?:string;draft_class:number;scouting_status:string};

export default function ReturningPlayerModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone?:()=>void}){
  const draftClass=useDraftClass(),target=draftClass+1;
  const [players,setPlayers]=useState<Player[]>([]),[declared,setDeclared]=useState<Set<string>>(new Set());
  const [selected,setSelected]=useState(""),[search,setSearch]=useState(""),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[result,setResult]=useState<any>(null);

  useEffect(()=>{
    if(!open)return;
    setSelected("");setSearch("");setError("");setResult(null);setBusy(true);
    Promise.all([
      fetch("/api/players",{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/workflow-tags?tag=DECLARES",{cache:"no-store"}).then(r=>r.json()).catch(()=>[])
    ]).then(([ps,tags])=>{
      setPlayers(Array.isArray(ps)?ps:[]);
      setDeclared(new Set((Array.isArray(tags)?tags:[]).map((x:any)=>String(x.playerId))));
    }).catch(()=>setError("Could not load the current draft class.")).finally(()=>setBusy(false));
  },[open,draftClass]);

  const candidates=useMemo(()=>players.filter(p=>p.draft_class===draftClass&&!declared.has(String(p.id))&&(!search.trim()||(p.name+" "+(p.college||"")+" "+p.position).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.position.localeCompare(b.position)||a.name.localeCompare(b.name)),[players,declared,draftClass,search]);
  const player=players.find(p=>String(p.id)===selected);
  const hiddenCount=players.filter(p=>p.draft_class===draftClass&&declared.has(String(p.id))).length;

  async function move(){
    if(!player)return setError("Select a player.");
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/returning-player",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:player.id,fromDraftClass:draftClass})});
      const j=await r.json();
      if(!r.ok)throw new Error(j?.error||j?.detail||"Could not move player.");
      setResult(j);window.dispatchEvent(new Event("rookie-draft:players-changed"));onDone?.();
    }catch(e:any){setError(e?.message||"Could not move player.")}
    finally{setBusy(false)}
  }

  if(!open)return null;
  return <div role="dialog" aria-modal="true" aria-label="Returning Player" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose()} style={{position:"fixed",inset:0,zIndex:1500,display:"grid",placeItems:"center",padding:18,background:"rgba(2,8,18,.78)",backdropFilter:"blur(4px)"}}>
    <div onMouseDown={e=>e.stopPropagation()} style={{width:"min(720px,96vw)",maxHeight:"90vh",overflow:"auto",background:"#071426",border:"1px solid #31527f",borderRadius:16,boxShadow:"0 28px 80px rgba(0,0,0,.58)",padding:24}}>
      <div className="page-head"><div><div className="ey">GM Tools · Draft Class Management</div><h2>Returning Player</h2><p className="muted">Move a prospect forward one draft class without losing the scouting work already attached to him.</p></div><button className="small ghost" disabled={busy} onClick={onClose}>Close</button></div>
      {result?<div>
        <div className="notice" style={{borderColor:"#2b7652",background:"rgba(32,139,91,.1)"}}><b>{result.player?.name} moved to {result.toDraftClass}.</b><br/>{result.hiddenFilmGrades||0} prior film grade{result.hiddenFilmGrades===1?"":"s"} saved behind the prior-year toggle · {result.preservedScoutingNotes||0} scouting note{result.preservedScoutingNotes===1?"":"s"} preserved.</div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,flexWrap:"wrap"}}><button className="ghost" onClick={onClose}>Stay in {draftClass}</button><button className="success" onClick={()=>{setDraftClass(result.toDraftClass);onClose()}}>Switch to {result.toDraftClass}</button></div>
      </div>:<div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:12,padding:14,border:"1px solid #25456f",borderRadius:12,background:"#0a1b31",marginBottom:16}}>
          <div><small className="muted">Current class</small><div style={{fontSize:26,fontWeight:950}}>{draftClass}</div></div><div style={{fontSize:24,color:"#67e8f9"}}>→</div><div style={{textAlign:"right"}}><small className="muted">Returning to school</small><div style={{fontSize:26,fontWeight:950}}>{target}</div></div>
        </div>
        <div className="notice" style={{marginBottom:14}}><b>What moves:</b> the same player profile, ESPN/headshot overrides, scouting commentary, game notes and player identity. Prior film grades are snapshotted, removed from the active grading inputs, and available only behind a read-only toggle in {target}.</div>
        {hiddenCount>0&&<div className="muted" style={{marginBottom:10,fontSize:12}}>{hiddenCount} player{hiddenCount===1?" is":"s are"} already on Declares and hidden from this list.</div>}
        <label>Find player<input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={"Search "+draftClass+" players…"} /></label>
        <label style={{marginTop:12}}>Player<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select player…</option>{candidates.map(p=><option key={p.id} value={p.id}>{p.position} · {p.name} · {p.college||"College TBD"}</option>)}</select></label>
        {player&&<div style={{marginTop:14,padding:14,borderRadius:10,border:"1px solid #2a4b76",...schoolStyle(player.college)}}><div style={{fontSize:11,fontWeight:900,opacity:.8}}>{player.position} · {player.college||"College TBD"}</div><div style={{fontSize:20,fontWeight:950,marginTop:3}}>{player.name}</div><div style={{fontSize:11,fontWeight:800,opacity:.8,marginTop:4}}>{player.scouting_status==="WATCHED"||player.scouting_status==="FINISHED"?"Existing scouting report will move with him.":"Player will be added to the "+target+" scouting pool."}</div></div>}
        {error&&<div className="notice" style={{marginTop:12,borderColor:"#7b3340"}}>{error}</div>}
        <div style={{display:"flex",justifyContent:"space-between",gap:10,marginTop:18,flexWrap:"wrap"}}><button className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="success" disabled={busy||!player} onClick={move}>{busy?"Moving…":player?"Move "+player.name+" to "+target:"Move to "+target}</button></div>
      </div>}
    </div>
  </div>;
}
