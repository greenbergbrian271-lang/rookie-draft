"use client";
import {useEffect,useMemo,useState} from "react";

type Pick={round:number,pickNo:number,slot:number,team:string,playerId:string|null,player:string|null,position:string|null,proTeam:string|null};
type LeagueResult={league:string,slug:string,draftId?:string|null,total:number,status:string,picks:Pick[],error?:string};
type AdpPlayer={name:string,position:string,team:string,college:string,adp:number,playerId:string,adjustedADP:number};
type AdpLeague={league:string,slug:string,top75:AdpPlayer[]};
type LeagueMeta={slug:string,name:string,rounds:number,teams:number};

const posClass=(p?:string|null)=>p?"pos-"+p.toLowerCase():"";

export default function DraftDayPage(){
  const [leagues,setLeagues]=useState<LeagueMeta[]>([]);
  const [results,setResults]=useState<LeagueResult[]>([]);
  const [adpLists,setAdpLists]=useState<AdpLeague[]>([]);
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const [slug,setSlug]=useState("");
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState<""|"picks"|"adp">("");
  const [error,setError]=useState("");

  async function loadMeta(){
    const r=await fetch("/api/draft-day",{cache:"no-store"});
    const j=await r.json();
    setLeagues(j.leagues||[]);
    if(!slug&&j.leagues?.length)setSlug(j.leagues[0].slug);
  }
  async function loadStatus(){
    setError("");
    try{
      const r=await fetch("/api/draft-day/status",{cache:"no-store"});
      if(!r.ok)throw new Error("Status endpoint returned "+r.status);
      const j=await r.json();
      setResults(j.draft_day_status?.results||[]);
      setAdpLists(j.sleeper_adp?.lists||[]);
      setUpdatedAt(j.draft_day_status?.updatedAt||j.sleeper_adp?.updatedAt||null);
    }catch(e:any){setError(e?.message||"Could not load draft status")}
    finally{setLoading(false)}
  }
  useEffect(()=>{loadMeta();loadStatus()},[]);

  async function sync(kind:"picks"|"adp"){
    setSyncing(kind);setError("");
    try{
      const r=await fetch("/api/draft-day",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:kind==="adp"?"adp":"sync"})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Sync failed");
      await loadStatus();
    }catch(e:any){setError(e?.message||"Sync failed")}
    finally{setSyncing("")}
  }

  const active=results.find(x=>x.slug===slug);
  const activeAdp=adpLists.find(x=>x.slug===slug);
  const q=query.trim().toLowerCase();
  const matches=useMemo(()=>{
    if(!active||!q)return new Set<number>();
    const out=new Set<number>();
    active.picks.forEach(p=>{if((p.team+" "+(p.player||"")).toLowerCase().includes(q))out.add(p.pickNo)});
    return out;
  },[active,q]);

  const bestAvailable=useMemo(()=>{
    if(!activeAdp)return{} as Record<string,AdpPlayer[]>;
    const drafted=new Set((active?.picks||[]).map(p=>p.playerId).filter(Boolean));
    const remaining=activeAdp.top75.filter(p=>!drafted.has(p.playerId));
    const grouped:Record<string,AdpPlayer[]>={};
    for(const p of remaining){(grouped[p.position]||(grouped[p.position]=[])).push(p)}
    for(const k of Object.keys(grouped))grouped[k]=grouped[k].slice(0,5);
    return grouped;
  },[activeAdp,active]);

  const byTeam=useMemo(()=>{
    if(!active)return[] as {team:string,picks:Pick[]}[];
    const map=new Map<string,Pick[]>();
    for(const p of active.picks){if(!p.player)continue;const list=map.get(p.team)||[];list.push(p);map.set(p.team,list)}
    return[...map.entries()].map(([team,picks])=>({team,picks})).sort((a,b)=>b.picks.length-a.picks.length);
  },[active]);

  const madeCount=active?.picks.filter(p=>p.player).length||0;

  return <>
    <div className="page-head">
      <div>
        <div className="ey">Draft Day Tools · Draft Day</div>
        <h1>Draft Day</h1>
        <p className="muted">Live picks, best-available-on-board and picks-by-team, synced straight from Sleeper for each league.</p>
      </div>
      <span className={"status "+(error?"":loading?"":"cloud")}>{loading?"Connecting…":error?"● Sync error":updatedAt?"● Synced "+new Date(updatedAt).toLocaleString():"● Not synced yet"}</span>
    </div>
    {error&&<div className="notice"><b>Data status:</b> {error} <button className="small ghost" onClick={loadStatus}>Retry</button></div>}

    <div className="tabs">{leagues.map(l=><button key={l.slug} className={slug===l.slug?"success":"ghost"} onClick={()=>{setSlug(l.slug);setQuery("")}}>{l.name}</button>)}</div>

    <div className="toolbar">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search team or player…"/>
      <span className="muted">{active?`${madeCount} of ${active.total} picks made`:""}</span>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("picks")}>{syncing==="picks"?"Syncing picks…":"Sync picks"}</button>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("adp")}>{syncing==="adp"?"Syncing ADP…":"Sync ADP"}</button>
    </div>

    {active?.error&&<div className="notice"><b>{active.league}:</b> {active.error}</div>}

    <div className="sheet-wrap draft-workbook">
      <table className="sheet">
        <thead><tr><th>Pick</th><th>Team</th><th>Player</th><th>Pos</th></tr></thead>
        <tbody>
          {active?.picks.map(p=><tr key={p.pickNo} className={matches.has(p.pickNo)?"draft-search-hit":""}>
            <td className="draft-pick">{p.round}.{String(p.slot).padStart(2,"0")}</td>
            <td className="draft-team">{p.team}</td>
            <td>{p.player||"—"}</td>
            <td className={posClass(p.position)}>{p.position||""}</td>
          </tr>)}
          {!active?.picks.length&&<tr><td colSpan={4} className="empty">No draft found for this league yet — try Sync picks once Sleeper has a draft created.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="grid">
      <div className="card">
        <h3>Best available on board</h3>
        {Object.keys(bestAvailable).length?Object.entries(bestAvailable).map(([pos,list])=>
          <div key={pos} style={{marginBottom:10}}>
            <div className={"player-badge "+posClass(pos)} style={{marginBottom:6}}>{pos}</div>
            {list.map(p=><div key={p.playerId} className="muted">{p.name} <span className="muted">· {p.college}</span></div>)}
          </div>
        ):<div className="empty">Sync ADP to see best-available rankings.</div>}
      </div>
      <div className="card">
        <h3>Picks by team</h3>
        {byTeam.length?byTeam.map(({team,picks})=>
          <details key={team} style={{marginBottom:6}}>
            <summary><b>{team}</b> <span className="muted">— {picks.length} pick{picks.length===1?"":"s"}</span></summary>
            {picks.map(p=><div key={p.pickNo} className="muted">{p.round}.{String(p.slot).padStart(2,"0")} — {p.player} ({p.position})</div>)}
          </details>
        ):<div className="empty">No picks recorded yet for this league.</div>}
      </div>
    </div>
  </>;
}
