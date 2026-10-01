"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";

type Ctx={openPlayer:(id:string|number)=>void};
const C=createContext<Ctx>({openPlayer:()=>{}});
const fmt=(x:any)=>x==null||!Number.isFinite(Number(x))?"—":Number(x).toFixed(2);
const compact=(x:any)=>x==null||!Number.isFinite(Number(x))?"—":String(Number(Number(x).toFixed(2)));
const PROFILE_TRAITS:Record<string,string[]>={QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]};
const AGGREGATE_GRADES=new Set(["Scouting Grade","Production Grade","Analytical Grade","Pre-Draft Grade","Final Grade","__COMMENTARY__","Draft Result"]);

export function usePlayerProfile(){return useContext(C)}

export function PlayerProfileProvider({children}:{children:React.ReactNode}){
  const [id,setId]=useState<string|null>(null),[data,setData]=useState<any>(null),[tab,setTab]=useState("Summary"),[loading,setLoading]=useState(false),[status,setStatus]=useState<{kind:"success"|"warning",text:string}|null>(null),playersRef=useRef<{id:string,key:string}[]>([]);
  const openPlayer=(x:string|number)=>{setId(String(x));setTab("Summary");setStatus(null)};
  const loadProfile=async(playerId:string,clear=false)=>{
    setLoading(true);
    if(clear)setData(null);
    try{
      const r=await fetch("/api/player-profile?id="+playerId,{cache:"no-store"});
      const next=await r.json();
      if(!r.ok||!next?.player)throw new Error(next?.error||"Could not refresh player profile");
      setData(next);
      return true;
    }catch{
      return false;
    }finally{setLoading(false)}
  };
  const applyTransfer=async(result:any)=>{
    setData((prev:any)=>prev?{...prev,player:result.player,transferHistory:[result.transfer,...(Array.isArray(prev.transferHistory)?prev.transferHistory:[])]}:prev);
    window.dispatchEvent(new CustomEvent("rookie-draft:players-changed",{detail:{player:result.player}}));
    const synced=id?await loadProfile(id):false;
    setStatus(synced?{kind:"success",text:`Transfer saved: ${result.transfer.from_college||"Unknown"} → ${result.transfer.to_college}.`}:{kind:"warning",text:"Transfer saved, but the latest team details could not refresh automatically. The saved school change is preserved."});
  };
  useEffect(()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then((ps:any[])=>{if(Array.isArray(ps))playersRef.current=ps.filter(p=>p?.id&&p?.name).map(p=>({id:String(p.id),key:String(p.name).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")})).sort((a,b)=>b.key.length-a.key.length)}).catch(()=>{})},[]);
  useEffect(()=>{
    const norm=(v:string)=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
    const onClick=(e:MouseEvent)=>{
      const target=e.target as HTMLElement|null;if(!target)return;
      const explicit=target.closest<HTMLElement>("[data-player-id]");
      if(explicit?.dataset.playerId&&!target.closest("input,select,textarea,option")){openPlayer(explicit.dataset.playerId);return}
      if(target.closest("button,a,input,select,textarea,option,[role=button]"))return;
      let el:HTMLElement|null=target;
      for(let depth=0;el&&depth<5&&!el.matches("main,body");depth++,el=el.parentElement){
        const t=norm(el.innerText||el.textContent||"");if(!t||t.length>260)continue;
        const padded=" "+t+" ",ids=[...new Set(playersRef.current.filter(p=>p.key&&padded.includes(" "+p.key+" ")).map(p=>p.id))];
        if(ids.length===1){openPlayer(ids[0]);return}
      }
    };
    document.addEventListener("click",onClick);return()=>document.removeEventListener("click",onClick)
  },[]);
  useEffect(()=>{if(id)void loadProfile(id,true)},[id]);
  return <C.Provider value={{openPlayer}}>{children}{id&&<div className="player-profile-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setId(null)}><div className="player-profile-modal"><button className="player-profile-close" onClick={()=>setId(null)}>×</button>{loading&&!data?<div className="empty">Loading player profile…</div>:data?.player?<><Profile d={data} tab={tab} setTab={setTab} open={openPlayer} applyTransfer={applyTransfer} reload={()=>id?loadProfile(id):Promise.resolve(false)} setProfileStatus={setStatus}/>{status&&<div className={"profile-save-status "+status.kind}>{status.text}</div>}</>:<div className="empty">Could not load player profile.</div>}</div></div>}</C.Provider>
}

function Profile({d,tab,setTab,open,applyTransfer,reload,setProfileStatus}:{d:any,tab:string,setTab:(x:string)=>void,open:(id:any)=>void,applyTransfer:(result:any)=>Promise<void>,reload:()=>Promise<boolean>,setProfileStatus:(x:{kind:"success"|"warning",text:string}|null)=>void}){
  const [transferOpen,setTransferOpen]=useState(false),[overrideOpen,setOverrideOpen]=useState(false),p=d.player,g=d.grades,img=p.headshot_url,teamLogo=d.teamLogo||"";
  return <><button className="player-profile-settings" onClick={()=>setOverrideOpen(true)} aria-label="Manual player profile overrides" title="Manual override">⚙</button><div className="player-profile-hero"><div className="profile-photo-wrap">{img?<img src={img} className="profile-photo" alt="" onError={e=>{const el=e.currentTarget;if(teamLogo){el.src=teamLogo;el.classList.add("player-college-logo")}else el.style.display="none"}}/>:teamLogo?<img src={teamLogo} className="profile-photo player-college-logo" alt=""/>:<div className="profile-photo profile-photo-fallback">{p.name.split(" ").map((x:string)=>x[0]).slice(0,2).join("")}</div>}</div><div><div className="ey">{p.positionRank||p.position} · {p.college}{p.jersey_number?" · #"+p.jersey_number:""}</div><h1>{p.name}</h1><div className="profile-meta-actions"><div className="muted">{p.draft_class} Prospect</div><button className="profile-transfer-trigger" onClick={()=>setTransferOpen(true)}>↗ Transfer</button></div></div><div className="profile-final"><span>Final Grade</span><strong>{fmt(g.final)}</strong></div></div><div className="profile-tabs">{["Summary","Grades","Stats","Team"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>{tab==="Summary"&&<Summary d={d}/>} {tab==="Grades"&&<Grades d={d}/>} {tab==="Stats"&&<Stats d={d}/>} {tab==="Team"&&<Team d={d} open={open}/>} {transferOpen&&<TransferModal d={d} onClose={()=>setTransferOpen(false)} onSaved={applyTransfer}/>} {overrideOpen&&<ManualOverrideModal d={d} onClose={()=>setOverrideOpen(false)} onSaved={async()=>{const ok=await reload();setProfileStatus(ok?{kind:"success",text:"Manual player profile overrides saved."}:{kind:"warning",text:"Overrides saved, but the refreshed profile could not be loaded automatically."})}}/>}</>
}

function ManualOverrideModal({d,onClose,onSaved}:{d:any,onClose:()=>void,onSaved:()=>Promise<void>}){
  const p=d.player,initialEspn=p.espn_athlete_id?`https://www.espn.com/college-football/player/_/id/${p.espn_athlete_id}`:"",initialHeadshot=String(p.headshot_url||""),[espn,setEspn]=useState(initialEspn),[headshot,setHeadshot]=useState(initialHeadshot),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const save=async(e:any)=>{e.preventDefault();setError("");const body:any={id:p.id};if(espn.trim()!==initialEspn)body.espnProfileUrl=espn.trim();if(headshot.trim()!==initialHeadshot)body.headshotUrl=headshot.trim();if(Object.keys(body).length===1){onClose();return}setSaving(true);try{const r=await fetch("/api/players",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw new Error(j?.error||j?.detail||"Could not save overrides");onClose();await onSaved()}catch(e:any){setError(e?.message||"Could not save overrides");setSaving(false)}};
  return <div className="profile-override-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="profile-override-modal" onSubmit={save}><div className="profile-override-head"><div><small>MANUAL OVERRIDE</small><h2>{p.name}</h2><p>Use these fields when automatic ESPN matching or headshot lookup misses.</p></div><button type="button" onClick={onClose}>×</button></div><div className="profile-override-field"><div className="profile-override-label"><span>ESPN player profile</span><b className={p.espn_source==="manual"?"manual":""}>{p.espn_source==="manual"?"Manual override":"Automatic match"}</b></div><input value={espn} onChange={e=>setEspn(e.target.value)} placeholder="https://www.espn.com/college-football/player/_/id/4878681/davis-warren"/><small>Paste the ESPN player profile URL or athlete ID. This powers the Stats tab.</small></div><div className="profile-override-field"><div className="profile-override-label"><span>Headshot image</span><b className={p.headshot_source==="manual"?"manual":""}>{p.headshot_source==="manual"?"Manual override":"Automatic match"}</b></div><input value={headshot} onChange={e=>setHeadshot(e.target.value)} placeholder="https://.../player-headshot.jpg"/><small>Paste a direct image URL. A school roster headshot works even when ESPN has no photo.</small>{headshot&&<div className="profile-override-preview"><img src={headshot} alt="" onError={e=>e.currentTarget.style.display="none"}/><span>Headshot preview</span></div>}</div><div className="profile-override-note">Clear either field and save to return that item to automatic matching.</div>{error&&<div className="profile-transfer-error">{error}</div>}<div className="profile-transfer-actions"><button type="button" className="ghost" onClick={()=>{setEspn("");setHeadshot("")}}>Reset both</button><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save Overrides"}</button></div></form></div>
}

function TransferModal({d,onClose,onSaved}:{d:any,onClose:()=>void,onSaved:(result:any)=>Promise<void>}){
  const p=d.player,[school,setSchool]=useState(""),[season,setSeason]=useState(String(new Date().getFullYear())),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const save=async(e:any)=>{
    e.preventDefault();setError("");
    if(!school.trim()){setError("Choose the player's new school.");return}
    setSaving(true);
    try{
      const r=await fetch("/api/players/transfer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:p.id,toCollege:school.trim(),effectiveSeason:Number(season)})});
      const j=await r.json();
      if(!r.ok)throw new Error(j?.error||j?.detail||"Could not save transfer");
      onClose();
      await onSaved(j);
    }catch(e:any){setError(e?.message||"Could not save transfer");setSaving(false)}
  };
  const history=Array.isArray(d.transferHistory)?d.transferHistory:[];
  return <div className="profile-transfer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="profile-transfer-modal" onSubmit={save}><div className="profile-transfer-head"><div><small>PLAYER TRANSACTION</small><h2>Transfer {p.name}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="profile-transfer-route"><div><span>From</span><strong>{p.college||"Unknown"}</strong></div><b>→</b><label><span>To</span><input autoFocus value={school} onChange={e=>setSchool(e.target.value)} placeholder="e.g. Auburn"/></label></div><label className="profile-transfer-season"><span>Effective season</span><input type="number" min="2000" max="2100" value={season} onChange={e=>setSeason(e.target.value)}/></label>{history.length>0&&<div className="profile-transfer-recent"><span>Previous transfers</span>{history.slice(0,3).map((x:any)=><div key={x.id}>{x.from_college||"Unknown"} → {x.to_college}{x.effective_season?" · "+x.effective_season:""}</div>)}</div>}{error&&<div className="profile-transfer-error">{error}</div>}<div className="profile-transfer-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save Transfer"}</button></div></form></div>
}

function gradePct(value:any){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0}
function GradeHighlights({d}:{d:any}){const g=d.grades,p=d.player,items=[{label:"Scouting",value:g.scouting,key:"scouting"},{label:"Production",value:g.production,key:"production",hide:p.position==="QB"},{label:"Analytical",value:g.analytical,key:"analytical"},{label:"Pre-Draft",value:g.pre,key:"predraft"},{label:"Final",value:g.final,key:"final"}].filter(x=>!x.hide);return <div className="profile-grade-showcase">{items.map(x=><div className={"profile-grade-highlight "+x.key} key={x.key}><div><span>{x.label} Grade</span>{x.key==="final"&&<em>Composite</em>}</div><strong>{fmt(x.value)}</strong><div className="profile-grade-meter"><i style={{width:gradePct(x.value)+"%"}}/></div></div>)}</div>}
function Summary({d}:{d:any}){const g=d.grades;return <div className="profile-pane"><h2>Grades</h2><GradeHighlights d={d}/><div className="profile-two"><section><h2>NFL Draft Result</h2><p>{g.values["Draft Result"]||"Not drafted yet"}</p></section><section><h2>AI Summary of Notes</h2><p>{d.notesSummary}</p></section></div></div>}
function FactorRow({entry}:{entry:any}){const raw=entry.value??entry.commentary,n=Number(raw),numeric=raw!==null&&raw!==""&&Number.isFinite(n);return <div className={"profile-factor-row "+(numeric?"numeric":"text")}><span>{entry.category}</span>{numeric?<><div className="profile-factor-track"><i style={{width:gradePct(n)+"%"}}/></div><b>{compact(n)}</b></>:<div className="profile-factor-copy">{String(raw??"—")}</div>}</div>}
function Grades({d}:{d:any}){const p=d.player,traits=PROFILE_TRAITS[p.position]||[],byCategory=new Map(d.evaluations.map((e:any)=>[e.category,e])),traitRows=traits.map(k=>byCategory.get(k)).filter(Boolean),other=d.evaluations.filter((e:any)=>!AGGREGATE_GRADES.has(e.category)&&!traits.includes(e.category)&&(e.value!=null||e.commentary));return <div className="profile-pane profile-grades-pane"><div className="profile-grades-intro"><div><span className="ey">GRADE STACK</span><h2>Prospect Evaluation</h2></div><p>Top-line grades first, then every underlying factor currently stored for this player.</p></div><GradeHighlights d={d}/>{traitRows.length>0&&<><div className="profile-grade-section-head"><div><span>SCOUTING</span><h3>Individual Traits</h3></div><b>{traitRows.length} factors</b></div><div className="profile-factor-list">{traitRows.map((e:any)=><FactorRow key={e.category} entry={e}/>)}</div></>}{other.length>0&&<><div className="profile-grade-section-head secondary"><div><span>MODEL INPUTS</span><h3>Production, Analytics & Context</h3></div><b>{other.length} factors</b></div><div className="profile-factor-list">{other.map((e:any)=><FactorRow key={e.category} entry={e}/>)}</div></>}</div>}

function Stats({d}:{d:any}){const s=d.stats||{},cats=Array.isArray(s.categories)?s.categories:[];return <div className="profile-pane"><div className="stats-head"><div><h2>College Career Stats</h2><p className="muted">Season-by-season statistics from ESPN.</p></div>{s.sourceUrl&&<a className="stats-source-link" href={s.sourceUrl} target="_blank" rel="noreferrer">View on ESPN ↗</a>}</div>{cats.length?cats.map((c:any)=><section className="stats-section" key={c.name}><h3>{c.displayName}</h3><div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>Season</th><th>Team</th>{c.labels.map((x:string,i:number)=><th key={i}>{x}</th>)}</tr></thead><tbody>{c.rows.map((r:any,i:number)=><tr key={(r.year||r.season)+"-"+(r.teamAbbr||r.team)+"-"+i}><td className="stats-season">{r.season||"—"}</td><td><span className="stats-team">{r.teamLogo&&<img src={r.teamLogo} alt=""/>}<b>{r.teamAbbr||r.team||"—"}</b></span></td>{c.labels.map((_:string,j:number)=><td key={j}>{r.stats?.[j]??"—"}</td>)}</tr>)}{Array.isArray(c.totals)&&c.totals.length>0&&<tr className="stats-career"><td>Career</td><td>—</td>{c.labels.map((_:string,j:number)=><td key={j}>{c.totals?.[j]??"—"}</td>)}</tr>}</tbody></table></div></section>):<div className="empty">ESPN career statistics are not available for this player yet.</div>}</div>}
function Team({d,open}:{d:any,open:(id:any)=>void}){const history=Array.isArray(d.transferHistory)?d.transferHistory:[];return <div className="profile-pane"><h2>{d.player.college} · Draft Eligible Players</h2><div className="team-prospects">{d.teamPlayers.map((x:any)=><button className={"team-prospect team-prospect-"+String(x.position).toLowerCase()} key={x.id} onClick={()=>open(x.id)}><b>{x.positionRank||x.position}</b><span>{x.name}</span></button>)}</div>{history.length>0&&<><h2>Transfer History</h2><div className="profile-transfer-history">{history.map((x:any)=><div key={x.id}><span>{x.effective_season||"—"}</span><strong>{x.from_college||"Unknown"} → {x.to_college}</strong></div>)}</div></>}<h2>Team Schedule & Results</h2><div className="profile-schedule">{d.schedule.map((e:any)=><div className="profile-game" key={e.id}><span className="profile-game-date">{new Date(e.date).toLocaleDateString([],{month:"short",day:"numeric"})}</span><div className="profile-game-copy"><div className={e.completed?"profile-game-result completed":"profile-game-result"}>{e.resultLine||e.shortName||e.name}</div>{e.playerStats&&<div className="profile-game-stats">{e.playerStats}</div>}</div></div>)}</div></div>}
