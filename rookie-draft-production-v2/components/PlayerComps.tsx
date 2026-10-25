"use client";
import {useCallback,useEffect,useState} from "react";

type Outcome={status:string;seasons:{season:number;gp:number;pts:number;ppg:number|null;rank:number|null}[];best:{season:number;rank:number;ppg:number|null}|null;top12:number;top24:number;seasonsCount:number;careerGp:number;careerPpg:number|null;nfl:string|null;tier:string|null;earlyCareer:boolean;tierRule:string|null};
type Match={sleeperId?:string|null;teamAbbr?:string|null;key:string;name:string;college:string|null;draftClass:number;position:string;draftResult:string|null;compOnly?:boolean;matchPct:number;coverage:string;shared:string[];difference:{label:string;target:string;comp:string}|null};
type Card=Match&{roles:string[];outcome:Outcome|null};
type Data={target:{name:string;position:string;draftClass:number};confidence:string;note:string|null;poolSize:number;cards:Card[];more:Match[];pinned:string|null;excluded:{key:string;name:string}[]};

const pick=(r:string|null)=>r?r.replace(/^(\d+)\.(\d+),\s*/,"Rd $1, pick $2 · "):"Draft result unavailable";

const initials=(n:string)=>n.split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join("").toUpperCase();
function Headshot({id,name,team,size}:{id?:string|null;name:string;team?:string|null;size:number}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[id]);
  return <span className="comp-photo" style={{width:size,height:size}}>
    {id&&!failed?<img src={`https://sleepercdn.com/content/nfl/players/${id}.jpg`} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<b>{initials(name)}</b>}
    {team&&size>=48&&<img className="comp-photo-team" src={`https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`} alt={team} onError={e=>{e.currentTarget.style.display="none"}}/>}
  </span>;
}
function OutcomeBlock({o,pos}:{o:Outcome|null;pos:string}){
  if(!o)return null;
  if(o.status==="unresolved")return <div className="comp-outcome muted">No NFL stats found for this player.</div>;
  if(o.status!=="ok")return <div className="comp-outcome muted">NFL outcome unavailable right now.</div>;
  const years=o.seasonsCount;
  return <div className="comp-outcome">
    <div className="comp-outcome-head"><span className={"comp-tier "+String(o.tier).toLowerCase()} title={o.tierRule||""}>{o.earlyCareer?"Early career":o.tier}</span>{o.earlyCareer&&o.tier&&<span className="comp-sub">best so far: {o.tier}</span>}<span className="comp-sub">{o.nfl}</span></div>
    <div className="comp-stats">
      <div><b>{o.best?`${pos}${o.best.rank}`:"—"}</b><small>{o.best?`best season (${o.best.season})${o.best.ppg!=null?` · ${o.best.ppg.toFixed(1)} PPG`:""}`:"no ranked season"}</small></div>
      <div><b>{o.top12} / {o.top24}</b><small>top-12 / top-24 finishes in {years} season{years===1?"":"s"}</small></div>
      <div><b>{o.careerPpg!=null?o.careerPpg.toFixed(1):"—"}</b><small>career PPG · {o.careerGp} games</small></div>
    </div>
  </div>;
}

export default function PlayerComps({playerId}:{playerId:string|number}){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{const r=await fetch("/api/player-comps?playerId="+encodeURIComponent(String(playerId))),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load comps");setData(j)}
    catch(e:any){setError(String(e?.message||e));setData(null)}
    finally{setLoading(false)}
  },[playerId]);
  useEffect(()=>{void load()},[load]);
  async function act(action:string,compKey?:string){
    setBusy(true);setError("");
    try{const r=await fetch("/api/player-comps",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:String(playerId),action,compKey})}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not save");setData(j)}
    catch(e:any){setError(String(e?.message||e))}
    finally{setBusy(false)}
  }
  if(loading)return <section className="comp-panel"><h2>Pro Comps</h2><p className="comp-sub">Finding comps…</p></section>;
  if(error&&!data)return <section className="comp-panel"><h2>Pro Comps</h2><p className="comp-sub">{error}</p><button className="ghost small" onClick={()=>void load()}>Try again</button></section>;
  if(!data)return null;
  return <section className="comp-panel">
    <div className="comp-head">
      <div><h2>Pro Comps</h2><p className="comp-sub">Closest earlier scouted players{data.poolSize?` · compared against ${data.poolSize} ${data.target.position}s from earlier classes`:""} · standard PPR outcomes</p></div>
      {data.cards.length>0&&<span className={"comp-conf "+data.confidence.toLowerCase()} title="Based on how strong the best match is and how much data the two players share">Confidence: {data.confidence}</span>}
    </div>
    {error&&<div className="profile-transfer-error">{error}</div>}
    {!data.cards.length&&<p className="comp-sub">{data.note||"No comp available."}</p>}
    <div className="comp-cards">
      {data.cards.map(c=><article className="comp-card" key={c.key}>
        <div className="comp-card-top">
          <div className="comp-roles">{c.roles.map(r=><span key={r} className={"comp-role "+r.toLowerCase().replace(" ","-")}>{r}</span>)}</div>
          <div className="comp-match"><b>{c.matchPct}%</b><small>match</small></div>
        </div>
        <div className="comp-id"><Headshot id={c.sleeperId} name={c.name} team={c.teamAbbr} size={64}/><div><h3>{c.name}</h3>
        <div className="comp-sub">{c.draftClass} · {c.college||"—"} · {pick(c.draftResult)}</div></div></div>
        {c.compOnly&&<div className="comp-flag" title="This player has no scouting profile. The match uses measurables/production/analytics only and does not affect any grade or board.">Analytics-only profile · not scouted</div>}
        {c.shared.length>0&&<div className="comp-chips">{c.shared.map(s=><span key={s}>{s}</span>)}</div>}
        {c.difference&&<div className="comp-diff">Biggest difference: {c.difference.label} — {data.target.name.split(" ").slice(-1)[0]} {c.difference.target} vs {c.difference.comp}</div>}
        <OutcomeBlock o={c.outcome} pos={c.position}/>
        <div className="comp-foot"><small title={c.coverage}>{c.coverage}</small><button className="ghost small" disabled={busy} onClick={()=>void act("exclude",c.key)} title="Never use this player as a comp for this prospect">Exclude</button></div>
      </article>)}
    </div>
    {data.more.length>0&&<details className="comp-more"><summary>More matches</summary>
      <ul>{data.more.map(m=><li key={m.key}><span className="comp-more-id"><Headshot id={m.sleeperId} name={m.name} size={32}/><span><b>{m.name}</b> · {m.draftClass} · {m.college||"—"}{m.compOnly?" · analytics-only":""}</span></span><span>{m.matchPct}%</span><button className="ghost small" disabled={busy} onClick={()=>void act("pin",m.key)}>Pin as comp</button></li>)}</ul>
    </details>}
    {(data.pinned||data.excluded.length>0)&&<div className="comp-overrides"><small>{data.pinned?"A comp is pinned. ":""}{data.excluded.length?`${data.excluded.length} excluded. `:""}</small><button className="ghost small" disabled={busy} onClick={()=>void act("clear")}>Reset overrides</button></div>}
  </section>;
}
