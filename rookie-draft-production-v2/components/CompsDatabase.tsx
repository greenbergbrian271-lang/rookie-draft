"use client";
import {useEffect,useMemo,useState} from "react";
import {Headshot} from "@/components/PlayerComps";

type Outcome={status:string;tier:string|null;earlyCareer:boolean;best:{season:number;rank:number;ppg:number|null}|null;top12:number;top24:number;seasonsCount:number;careerGp:number;careerPpg:number|null;sleeperId:string|null;teamAbbr:string|null;nfl:string|null};
type Player={key:string;name:string;college:string|null;draftClass:number;position:string;draftResult:string|null;overall:number|null;compOnly:boolean;hasNotes:boolean;coverage:Record<string,number>;featureCount:number;outcome:Outcome|null};
type Prospect={id:string;name:string;position:string;college:string|null;draftClass:number};
type Match={key:string;matchPct:number;shared:string[];difference:{label:string;target:string;comp:string}|null;coverage:string;compOnly:boolean};
type Matches={target:{name:string;position:string;draftClass:number;key:string|null};confidence:string;note:string|null;poolSize:number;candidates:Match[]};
type Hit={targetKey:string|null;name:string;college:string|null;draftClass:number;position:string;source:"pool"|"prospect";matchPct:number;shared:string[];difference:{label:string;target:string;comp:string}|null;coverage:string;compOnly:boolean};
type Reverse={target:{key:string;name:string;position:string;draftClass:number};floor:number;prospectsIncluded:number;hits:Hit[]};

const pick=(r:string|null)=>r?r.replace(/^(\d+)\.(\d+),\s*/,"Rd $1, pick $2 · "):"Draft result n/a";
const GROUPS:Record<string,string>={meas:"measurables",prod:"production",anal:"analytics",skill:"scouting ratings",grade:"grades"};
const tierOf=(o:Outcome|null)=>!o||o.status!=="ok"?"No NFL stats":o.earlyCareer?"Early career":String(o.tier);
const DEFAULT_MIN=70;

function OutcomeChips({o,pos}:{o:Outcome|null;pos:string}){
  if(!o||o.status!=="ok")return <span className="cdb-muted">{o?.status==="unavailable"?"NFL outcome unavailable":"No NFL stats found"}</span>;
  const label=tierOf(o);
  return <span className="cdb-outcome"><span className={"comp-tier "+label.toLowerCase().replace(" ","-")}>{label}</span>
    {o.best&&<span>{pos}{o.best.rank} best{o.best.ppg!=null?` · ${o.best.ppg.toFixed(1)} PPG`:""}</span>}
    {o.careerPpg!=null&&<span className="cdb-muted">career {o.careerPpg.toFixed(1)} PPG · {o.careerGp} GP</span>}
    {o.nfl&&<span className="cdb-muted">{o.nfl}</span>}</span>;
}

/** Earlier-class players a target could be comped to (ranked). */
function MatchList({data,byKey}:{data:Matches;byKey:Map<string,Player>}){
  const [all,setAll]=useState(false);
  const list=all?data.candidates:data.candidates.slice(0,25);
  return <div className="cdb-matches">
    <div className="cdb-matches-head"><div><b>{data.target.name}</b> <span className="cdb-muted">{data.target.position} · {data.target.draftClass} class</span></div>
      <div className="cdb-muted">{data.candidates.length?`${data.candidates.length} possible comps · confidence ${data.confidence}`:data.note||"No comps available."}</div></div>
    {list.map((m,i)=>{const p=byKey.get(m.key);if(!p)return null;return <div className="cdb-match" key={m.key}>
      <span className="cdb-rank">{i+1}</span>
      <Headshot id={p.outcome?.sleeperId} name={p.name} size={36}/>
      <div className="cdb-match-main">
        <div><b>{p.name}</b> <span className="cdb-muted">{p.position} · {p.draftClass} · {p.college||"—"} · {pick(p.draftResult)}</span>{p.compOnly&&<span className="comp-flag">analytics-only</span>}</div>
        <OutcomeChips o={p.outcome} pos={p.position}/>
        {m.shared.length>0&&<div className="comp-chips">{m.shared.slice(0,3).map(x=><span key={x}>{x}</span>)}</div>}
        <div className="cdb-evidence">{m.coverage}{m.difference?` · biggest gap: ${m.difference.label} (${data.target.name.split(" ").slice(-1)[0]} ${m.difference.target} vs ${p.name.split(" ").slice(-1)[0]} ${m.difference.comp})`:""}</div>
      </div>
      <div className="cdb-pct"><b>{m.matchPct}%</b><small>match</small></div>
    </div>})}
    {data.candidates.length>25&&<button className="ghost small" onClick={()=>setAll(!all)}>{all?"Show top 25 only":`Show all ${data.candidates.length}`}</button>}
  </div>;
}

/** Later-class players (and 2027+ prospects) who remind you of the open player, at or above the chosen minimum match. */
function ReverseList({data,min,setMin,byKey}:{data:Reverse;min:number;setMin:(n:number)=>void;byKey:Map<string,Player>}){
  const [all,setAll]=useState(false);
  const hits=data.hits.filter(h=>h.matchPct>=min),list=all?hits:hits.slice(0,25);
  return <div className="cdb-matches">
    <div className="cdb-thr">
      <label>Minimum match <input type="number" min={50} max={95} step={5} value={min} onChange={e=>setMin(Math.max(50,Math.min(95,Math.round(Number(e.target.value)||DEFAULT_MIN))))}/>%</label>
      <span className="cdb-muted"><b>{hits.length}</b> later-class {hits.length===1?"player reminds":"players remind"} you of {data.target.name}{data.prospectsIncluded?` (includes ${data.prospectsIncluded} prospects from 2027+)`:""}</span>
    </div>
    {!hits.length&&<p className="cdb-muted">{data.target.draftClass>=2026&&!data.prospectsIncluded?"No later classes in the pool yet.":"No one clears that minimum. Try lowering it."}</p>}
    {list.map((h,i)=>{const p=h.targetKey?byKey.get(h.targetKey):undefined;return <div className="cdb-match" key={(h.targetKey||h.name)+i}>
      <span className="cdb-rank">{i+1}</span>
      <Headshot id={p?.outcome?.sleeperId} name={h.name} size={36}/>
      <div className="cdb-match-main">
        <div><b>{h.name}</b> <span className="cdb-muted">{h.position} · {h.draftClass} · {h.college||"—"}{p?` · ${pick(p.draftResult)}`:""}</span>{h.source==="prospect"?<span className="cdb-prospect">prospect</span>:h.compOnly&&<span className="comp-flag">analytics-only</span>}</div>
        {p?<OutcomeChips o={p.outcome} pos={p.position}/>:<span className="cdb-muted">{h.draftClass} class prospect</span>}
        {h.shared.length>0&&<div className="comp-chips">{h.shared.slice(0,3).map(x=><span key={x}>{x}</span>)}</div>}
        <div className="cdb-evidence">{h.coverage}{h.difference?` · biggest gap: ${h.difference.label} (${h.name.split(" ").slice(-1)[0]} ${h.difference.target} vs ${data.target.name.split(" ").slice(-1)[0]} ${h.difference.comp})`:""}</div>
      </div>
      <div className="cdb-pct"><b>{h.matchPct}%</b><small>match</small></div>
    </div>})}
    {hits.length>25&&<button className="ghost small" onClick={()=>setAll(!all)}>{all?"Show top 25 only":`Show all ${hits.length}`}</button>}
  </div>;
}

export default function CompsDatabase(){
  const [db,setDb]=useState<{players:Player[];prospects:Prospect[];classes:number[]}|null>(null),[error,setError]=useState("");
  const [q,setQ]=useState(""),[pos,setPos]=useState("All"),[cls,setCls]=useState("All"),[profile,setProfile]=useState("All"),[tier,setTier]=useState("All"),[sort,setSort]=useState("class"),[shown,setShown]=useState(40);
  const [open,setOpen]=useState<string|null>(null),[mode,setMode]=useState<"reverse"|"forward">("reverse"),[min,setMin]=useState(DEFAULT_MIN);
  const [rev,setRev]=useState<Reverse|null>(null),[fwd,setFwd]=useState<Matches|null>(null),[busy,setBusy]=useState(false),[mError,setMError]=useState("");
  const [pq,setPq]=useState(""),[pMatches,setPMatches]=useState<Matches|null>(null),[pLoading,setPLoading]=useState(false);
  useEffect(()=>{fetch("/api/comps-database").then(r=>r.json()).then(j=>{if(j.error)throw new Error(j.error);setDb(j)}).catch(e=>setError(String(e?.message||e)))},[]);
  const byKey=useMemo(()=>new Map((db?.players||[]).map(p=>[p.key,p] as [string,Player])),[db]);
  const filtered=useMemo(()=>{
    if(!db)return [];
    const needle=q.trim().toLowerCase();
    const rows=db.players.filter(p=>(pos==="All"||p.position===pos)&&(cls==="All"||String(p.draftClass)===cls)&&(profile==="All"||(profile==="Scouted"?!p.compOnly:p.compOnly))&&(tier==="All"||tierOf(p.outcome)===tier)&&(!needle||`${p.name} ${p.college||""}`.toLowerCase().includes(needle)));
    const rank=(p:Player)=>p.outcome?.best?.rank??9999;
    return rows.sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="best"?rank(a)-rank(b)||a.name.localeCompare(b.name):sort==="ppg"?(b.outcome?.careerPpg??-1)-(a.outcome?.careerPpg??-1):b.draftClass-a.draftClass||(a.overall??999)-(b.overall??999)||a.name.localeCompare(b.name));
  },[db,q,pos,cls,profile,tier,sort]);
  useEffect(()=>setShown(40),[q,pos,cls,profile,tier,sort]);
  async function get(url:string){const r=await fetch(url),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load");return j}
  async function load(key:string,m:"reverse"|"forward"){
    setBusy(true);setMError("");
    try{
      if(m==="reverse"){setRev(await get("/api/comps-database/reverse?key="+encodeURIComponent(key)+"&min=50"))}
      else setFwd(await get("/api/comps-database/matches?key="+encodeURIComponent(key)));
    }catch(e:any){setMError(String(e?.message||e))}finally{setBusy(false)}
  }
  function toggle(p:Player){
    if(open===p.key){setOpen(null);return}
    setOpen(p.key);setRev(null);setFwd(null);setMode("reverse");void load(p.key,"reverse");
  }
  function switchMode(key:string,m:"reverse"|"forward"){setMode(m);if(m==="reverse"?!rev:!fwd)void load(key,m)}
  const suggestions=useMemo(()=>{const n=pq.trim().toLowerCase();return n.length<2||!db?[]:db.prospects.filter(p=>p.name.toLowerCase().includes(n)).slice(0,8)},[pq,db]);
  if(error)return <section className="cdb-panel"><p className="cdb-muted">{error}</p></section>;
  if(!db)return <section className="cdb-panel"><p className="cdb-muted">Loading the comp pool and NFL outcomes… (the first load can take a few seconds)</p></section>;
  const counts=`${db.players.length} players · ${db.players.filter(p=>!p.compOnly).length} scouted · ${db.players.filter(p=>p.compOnly).length} analytics-only`;
  return <div className="cdb">
    <section className="cdb-panel">
      <div className="cdb-head"><h2>Comp pool</h2><span className="cdb-muted">{counts}</span></div>
      <p className="cdb-muted">Every player who can be used as a comp. If someone isn&apos;t listed here, he can&apos;t be matched. Open a player to see who reminds you of him from later classes, or who he could be comped to from earlier ones.</p>
      <div className="cdb-filters">
        <input className="cdb-search" placeholder="Search name or school…" value={q} onChange={e=>setQ(e.target.value)}/>
        <select value={pos} onChange={e=>setPos(e.target.value)}><option>All</option>{["QB","RB","WR","TE"].map(x=><option key={x}>{x}</option>)}</select>
        <select value={cls} onChange={e=>setCls(e.target.value)}><option value="All">All classes</option>{db.classes.map(c=><option key={c} value={c}>{c} class</option>)}</select>
        <select value={profile} onChange={e=>setProfile(e.target.value)}><option value="All">All profiles</option><option>Scouted</option><option value="Analytics-only">Analytics-only</option></select>
        <select value={tier} onChange={e=>setTier(e.target.value)}><option value="All">Any outcome</option>{["Elite","Starter","Flex","Miss","Early career","No NFL stats"].map(x=><option key={x}>{x}</option>)}</select>
        <select value={sort} onChange={e=>setSort(e.target.value)}><option value="class">Sort: newest class</option><option value="name">Sort: name</option><option value="best">Sort: best finish</option><option value="ppg">Sort: career PPG</option></select>
      </div>
      <p className="cdb-muted">{filtered.length} shown.</p>
      <div className="cdb-list">
        {filtered.slice(0,shown).map(p=><div className={"cdb-row"+(open===p.key?" open":"")} key={p.key}>
          <button className="cdb-row-main" onClick={()=>toggle(p)} aria-expanded={open===p.key}>
            <Headshot id={p.outcome?.sleeperId} name={p.name} team={p.outcome?.teamAbbr} size={48}/>
            <span className="cdb-row-text">
              <span><b>{p.name}</b>{p.compOnly?<span className="comp-flag">analytics-only</span>:<span className="cdb-scouted">scouted</span>}</span>
              <span className="cdb-muted">{p.position} · {p.draftClass} · {p.college||"—"} · {pick(p.draftResult)}</span>
              <OutcomeChips o={p.outcome} pos={p.position}/>
            </span>
            <span className="cdb-chevron">{open===p.key?"−":"+"}</span>
          </button>
          {open===p.key&&<div className="cdb-detail">
            <div className="comp-chips">{Object.entries(p.coverage).filter(([,n])=>n>0).map(([g,n])=><span key={g}>{n} {GROUPS[g]}</span>)}{p.hasNotes&&<span>scouting notes</span>}</div>
            <p className="cdb-muted">{p.featureCount} data points{p.compOnly?" · no scouting profile (analytics only)":""}</p>
            <div className="cdb-seg" role="tablist">
              <button className={mode==="reverse"?"active":""} onClick={()=>switchMode(p.key,"reverse")}>Reminds me of him<small>later classes</small></button>
              <button className={mode==="forward"?"active":""} onClick={()=>switchMode(p.key,"forward")}>He could be comped to<small>earlier classes</small></button>
            </div>
            {busy&&<p className="cdb-muted">Finding comps…</p>}
            {mError&&<p className="profile-transfer-error">{mError}</p>}
            {mode==="reverse"&&rev&&rev.target.key===p.key&&<ReverseList data={rev} min={min} setMin={setMin} byKey={byKey}/>}
            {mode==="forward"&&fwd&&fwd.target.key===p.key&&(fwd.candidates.length?<MatchList data={fwd} byKey={byKey}/>:<p className="cdb-muted">{fwd.note||"No earlier classes to compare against."}</p>)}
          </div>}
        </div>)}
        {!filtered.length&&<p className="cdb-muted">{q.trim()?`“${q.trim()}” isn’t in the comp pool with those filters. A player needs college data (a scouting profile or PFF stats) to be used as a comp.`:"No players match those filters."}</p>}
      </div>
      {filtered.length>shown&&<button className="ghost small" onClick={()=>setShown(shown+60)}>Show 60 more</button>}
    </section>
    <section className="cdb-panel">
      <h2>Find comps for a prospect</h2>
      <p className="cdb-muted">Search any of the {db.prospects.length} prospects in the 2027+ classes to see every player in the pool he could be comped to, ranked.</p>
      <input className="cdb-search" placeholder="Search a prospect…" value={pq} onChange={e=>setPq(e.target.value)}/>
      {suggestions.length>0&&<div className="cdb-suggest">{suggestions.map(s=><button key={s.id} onClick={()=>{setPq(s.name);setPMatches(null);setPLoading(true);void get("/api/comps-database/matches?playerId="+encodeURIComponent(s.id)).then(setPMatches).catch(e=>setMError(String(e?.message||e))).finally(()=>setPLoading(false))}}><b>{s.name}</b><span className="cdb-muted">{s.position} · {s.college||"—"} · {s.draftClass}</span></button>)}</div>}
      {pLoading&&<p className="cdb-muted">Finding comps…</p>}
      {pMatches&&<MatchList data={pMatches} byKey={byKey}/>}
    </section>
  </div>;
}
