"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";

type Ctx={openPlayer:(id:string|number)=>void};
const C=createContext<Ctx>({openPlayer:()=>{}});
const fmt=(x:any)=>x==null||!Number.isFinite(Number(x))?"—":Number(x).toFixed(2);

export function usePlayerProfile(){return useContext(C)}

export function PlayerProfileProvider({children}:{children:React.ReactNode}){
  const [id,setId]=useState<string|null>(null),[data,setData]=useState<any>(null),[tab,setTab]=useState("Summary"),[loading,setLoading]=useState(false),playersRef=useRef<{id:string,key:string}[]>([]);
  const openPlayer=(x:string|number)=>{setId(String(x));setTab("Summary")};
  const loadProfile=async(playerId:string,clear=false)=>{
    setLoading(true);
    if(clear)setData(null);
    try{
      const r=await fetch("/api/player-profile?id="+playerId,{cache:"no-store"});
      setData(await r.json());
    }finally{setLoading(false)}
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
  const reload=async()=>{if(id)await loadProfile(id)};
  return <C.Provider value={{openPlayer}}>{children}{id&&<div className="player-profile-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setId(null)}><div className="player-profile-modal"><button className="player-profile-close" onClick={()=>setId(null)}>×</button>{loading&&!data?<div className="empty">Loading player profile…</div>:data?.player?<Profile d={data} tab={tab} setTab={setTab} open={openPlayer} reload={reload}/>:<div className="empty">Could not load player profile.</div>}</div></div>}</C.Provider>
}

function Profile({d,tab,setTab,open,reload}:{d:any,tab:string,setTab:(x:string)=>void,open:(id:any)=>void,reload:()=>Promise<void>}){
  const [transferOpen,setTransferOpen]=useState(false),p=d.player,g=d.grades,img=p.headshot_url,teamLogo=d.teamLogo||"";
  return <><div className="player-profile-hero"><div className="profile-photo-wrap">{img?<img src={img} className="profile-photo" alt="" onError={e=>{const el=e.currentTarget;if(teamLogo){el.src=teamLogo;el.classList.add("player-college-logo")}else el.style.display="none"}}/>:teamLogo?<img src={teamLogo} className="profile-photo player-college-logo" alt=""/>:<div className="profile-photo profile-photo-fallback">{p.name.split(" ").map((x:string)=>x[0]).slice(0,2).join("")}</div>}</div><div><div className="ey">{p.positionRank||p.position} · {p.college}{p.jersey_number?" · #"+p.jersey_number:""}</div><h1>{p.name}</h1><div className="profile-meta-actions"><div className="muted">2027 Prospect</div><button className="profile-transfer-trigger" onClick={()=>setTransferOpen(true)}>↗ Transfer</button></div></div><div className="profile-final"><span>Final Grade</span><strong>{fmt(g.final)}</strong></div></div><div className="profile-tabs">{["Summary","Grades","Stats","Team"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>{tab==="Summary"&&<Summary d={d}/>} {tab==="Grades"&&<Grades d={d}/>} {tab==="Stats"&&<Stats d={d}/>} {tab==="Team"&&<Team d={d} open={open}/>} {transferOpen&&<TransferModal d={d} onClose={()=>setTransferOpen(false)} onSaved={reload}/>}</>
}

function TransferModal({d,onClose,onSaved}:{d:any,onClose:()=>void,onSaved:()=>Promise<void>}){
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
      await onSaved();
    }catch(e:any){setError(e?.message||"Could not save transfer");setSaving(false)}
  };
  const history=Array.isArray(d.transferHistory)?d.transferHistory:[];
  return <div className="profile-transfer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="profile-transfer-modal" onSubmit={save}><div className="profile-transfer-head"><div><small>PLAYER TRANSACTION</small><h2>Transfer {p.name}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="profile-transfer-route"><div><span>From</span><strong>{p.college||"Unknown"}</strong></div><b>→</b><label><span>To</span><input autoFocus value={school} onChange={e=>setSchool(e.target.value)} placeholder="e.g. Auburn"/></label></div><label className="profile-transfer-season"><span>Effective season</span><input type="number" min="2000" max="2100" value={season} onChange={e=>setSeason(e.target.value)}/></label>{history.length>0&&<div className="profile-transfer-recent"><span>Previous transfers</span>{history.slice(0,3).map((x:any)=><div key={x.id}>{x.from_college||"Unknown"} → {x.to_college}{x.effective_season?" · "+x.effective_season:""}</div>)}</div>}{error&&<div className="profile-transfer-error">{error}</div>}<div className="profile-transfer-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save Transfer"}</button></div></form></div>
}

function Summary({d}:{d:any}){const g=d.grades,p=d.player;return <div className="profile-pane"><h2>Grades</h2><div className="profile-grade-grid"><Grade label="Final Grade" value={g.final}/><Grade label="Scouting Grade" value={g.scouting}/>{p.position!=="QB"&&<Grade label="Production Grade" value={g.production}/>}<Grade label="Analytical Grade" value={g.analytical}/></div><div className="profile-two"><section><h2>NFL Draft Result</h2><p>{g.values["Draft Result"]||"Not drafted yet"}</p></section><section><h2>AI Summary of Notes</h2><p>{d.notesSummary}</p></section></div></div>}
function Grade({label,value}:{label:string,value:any}){const n=Number(value),pct=Number.isFinite(n)?Math.max(0,Math.min(100,n)):0;return <div className="profile-grade"><span>{label}</span><strong>{fmt(value)}</strong><div className="grade-track"><i style={{width:pct+"%"}}/></div></div>}
function Grades({d}:{d:any}){const g=d.grades,p=d.player,skip=new Set(["__COMMENTARY__","Draft Result"]);return <div className="profile-pane"><div className="profile-grade-grid"><Grade label="Final Grade" value={g.final}/><Grade label="Scouting Grade" value={g.scouting}/>{p.position!=="QB"&&<Grade label="Production Grade" value={g.production}/>}<Grade label="Analytical Grade" value={g.analytical}/></div><h2>Detailed Grades</h2><div className="detail-grades">{d.evaluations.filter((e:any)=>!skip.has(e.category)&&(e.value!=null||e.commentary)).map((e:any)=><div key={e.category}><span>{e.category}</span><b>{e.value??e.commentary}</b></div>)}</div></div>}
function Stats({d}:{d:any}){const s=d.stats||{},cats=Array.isArray(s.categories)?s.categories:[];return <div className="profile-pane"><div className="stats-head"><div><h2>College Career Stats</h2><p className="muted">Season-by-season statistics from ESPN.</p></div>{s.sourceUrl&&<a className="stats-source-link" href={s.sourceUrl} target="_blank" rel="noreferrer">View on ESPN ↗</a>}</div>{cats.length?cats.map((c:any)=><section className="stats-section" key={c.name}><h3>{c.displayName}</h3><div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>Season</th><th>Team</th>{c.labels.map((x:string,i:number)=><th key={i}>{x}</th>)}</tr></thead><tbody>{c.rows.map((r:any,i:number)=><tr key={(r.year||r.season)+"-"+(r.teamAbbr||r.team)+"-"+i}><td className="stats-season">{r.season||"—"}</td><td><span className="stats-team">{r.teamLogo&&<img src={r.teamLogo} alt=""/>}<b>{r.teamAbbr||r.team||"—"}</b></span></td>{c.labels.map((_:string,j:number)=><td key={j}>{r.stats?.[j]??"—"}</td>)}</tr>)}{Array.isArray(c.totals)&&c.totals.length>0&&<tr className="stats-career"><td>Career</td><td>—</td>{c.labels.map((_:string,j:number)=><td key={j}>{c.totals?.[j]??"—"}</td>)}</tr>}</tbody></table></div></section>):<div className="empty">ESPN career statistics are not available for this player yet.</div>}</div>}
function Team({d,open}:{d:any,open:(id:any)=>void}){const history=Array.isArray(d.transferHistory)?d.transferHistory:[];return <div className="profile-pane"><h2>{d.player.college} · Draft Eligible Players</h2><div className="team-prospects">{d.teamPlayers.map((x:any)=><button className={"team-prospect team-prospect-"+String(x.position).toLowerCase()} key={x.id} onClick={()=>open(x.id)}><b>{x.positionRank||x.position}</b><span>{x.name}</span></button>)}</div>{history.length>0&&<><h2>Transfer History</h2><div className="profile-transfer-history">{history.map((x:any)=><div key={x.id}><span>{x.effective_season||"—"}</span><strong>{x.from_college||"Unknown"} → {x.to_college}</strong></div>)}</div></>}<h2>Team Schedule & Results</h2><div className="profile-schedule">{d.schedule.map((e:any)=><div className="profile-game" key={e.id}><span className="profile-game-date">{new Date(e.date).toLocaleDateString([],{month:"short",day:"numeric"})}</span><div className="profile-game-copy"><div className={e.completed?"profile-game-result completed":"profile-game-result"}>{e.resultLine||e.shortName||e.name}</div>{e.playerStats&&<div className="profile-game-stats">{e.playerStats}</div>}</div></div>)}</div></div>}
