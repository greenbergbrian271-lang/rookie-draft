"use client";
import {createContext,useContext,useEffect,useState} from "react";
import {nflTeamLogo} from "@/app/scouting/ScoutingShared";
import PlayerImage from "@/components/PlayerImage";

type Ctx={openPlayer:(id:string|number)=>void};
const C=createContext<Ctx>({openPlayer:()=>{}});
const fmt=(x:any)=>x==null||!Number.isFinite(Number(x))?"—":Number(x).toFixed(2);

export function usePlayerProfile(){return useContext(C)}

export function PlayerProfileProvider({children}:{children:React.ReactNode}){
  const [id,setId]=useState<string|null>(null),[data,setData]=useState<any>(null),[tab,setTab]=useState("Summary"),[loading,setLoading]=useState(false),[status,setStatus]=useState<{kind:"success"|"warning",text:string}|null>(null);
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
  useEffect(()=>{if(id)void loadProfile(id,true)},[id]);
  return <C.Provider value={{openPlayer}}>{children}{id&&<div className="player-profile-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setId(null)}><div className="player-profile-modal"><button className="player-profile-close" onClick={()=>setId(null)}>×</button>{loading&&!data?<div className="empty">Loading player profile…</div>:data?.player?<><Profile d={data} tab={tab} setTab={setTab} open={openPlayer} applyTransfer={applyTransfer} reload={()=>id?loadProfile(id):Promise.resolve(false)} setProfileStatus={setStatus}/>{status&&<div className={"profile-save-status "+status.kind}>{status.text}</div>}</>:<div className="empty">Could not load player profile.</div>}</div></div>}</C.Provider>
}

function Profile({d,tab,setTab,open,applyTransfer,reload,setProfileStatus}:{d:any,tab:string,setTab:(x:string)=>void,open:(id:any)=>void,applyTransfer:(result:any)=>Promise<void>,reload:()=>Promise<boolean>,setProfileStatus:(x:{kind:"success"|"warning",text:string}|null)=>void}){
  const [transferOpen,setTransferOpen]=useState(false),[overrideOpen,setOverrideOpen]=useState(false),p=d.player,g=d.grades,img=p.headshot_url,teamLogo=d.teamLogo||"",historical=Number(p.draft_class)<2027;
  return <>{!historical&&<button className="player-profile-settings" onClick={()=>setOverrideOpen(true)} aria-label="Manual player profile overrides" title="Manual override">⚙</button>}<div className="player-profile-hero"><div className="profile-photo-wrap"><PlayerImage player={p} fallbackUrl={teamLogo} className={"profile-photo "+(!img&&teamLogo?"player-college-logo":"")} initialsClassName="profile-photo profile-photo-fallback" alt={p.name}/></div><div><div className="ey">{p.positionRank||p.position} · {p.college}{p.jersey_number?" · #"+p.jersey_number:""}</div><h1>{p.name}</h1><div className="profile-meta-actions"><div className="muted">{p.draft_class} Prospect</div>{!historical&&<button className="profile-transfer-trigger" onClick={()=>setTransferOpen(true)}>↗ Transfer</button>}</div></div><div className="profile-final"><span>Final Grade</span><strong>{fmt(g.final)}</strong></div></div><div className="profile-tabs">{["Summary","Grades","Timeline","Stats","Team","Industry"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>{tab==="Summary"&&<Summary d={d}/>} {tab==="Grades"&&<Grades d={d}/>} {tab==="Timeline"&&<Timeline d={d}/>} {tab==="Stats"&&<Stats d={d}/>} {tab==="Team"&&<Team d={d} open={open}/>} {tab==="Industry"&&<Industry d={d}/>} {!historical&&transferOpen&&<TransferModal d={d} onClose={()=>setTransferOpen(false)} onSaved={applyTransfer}/>} {!historical&&overrideOpen&&<ManualOverrideModal d={d} onClose={()=>setOverrideOpen(false)} onSaved={async()=>{const ok=await reload();setProfileStatus(ok?{kind:"success",text:"Manual player profile overrides saved."}:{kind:"warning",text:"Overrides saved, but the refreshed profile could not be loaded automatically."})}}/>}</>
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
function draftResultParts(result:any,team:any){const raw=String(result??"").trim(),tm=String(team??"").trim();if(!raw||/^(pending|tbd|not drafted yet)$/i.test(raw))return {pending:true,pick:"Not drafted yet",team:""};let pick=raw;const direct=raw.match(/Pick\s+(\d+)/i),legacy=raw.match(/^(\d+)\.(\d+)/);if(direct)pick="Pick "+direct[1];else if(legacy)pick="Pick "+Number(legacy[2]);else if(raw.includes(","))pick=raw.slice(0,raw.lastIndexOf(",")).trim();return {pending:false,pick,team:tm||(raw.includes(",")?raw.slice(raw.lastIndexOf(",")+1).trim():"")}}
function DraftResultSummary({d}:{d:any}){const g=d.grades,parts=draftResultParts(g.draftResult??g.values?.["Draft Result"],g.draftTeam);return parts.pending?<div className="profile-draft-pending">Not drafted yet</div>:<div className="profile-draft-result"><div className="profile-draft-logo"><img src={nflTeamLogo(parts.team)} alt=""/></div><div><span>{parts.pick}</span><strong>{parts.team||"NFL Team"}</strong></div></div>}
function previewIndustryData(d:any){
  const p=d.player||{},g=d.grades||{},values=g.values||{},pos=String(p.position||"").toUpperCase();
  const overallRaw=Number(g.overallRank),posRaw=Number(g.boardPositionRank),posLabel=Number(String(p.positionRank||"").replace(/\D/g,""));
  const yourFantasy=Number.isFinite(overallRaw)?overallRaw:null,yourPos=Number.isFinite(posRaw)?posRaw:(Number.isFinite(posLabel)?posLabel:null);
  const seed=String(p.name||"Preview").split("").reduce((a:number,c:string)=>a+c.charCodeAt(0),0);
  const f1=yourFantasy!=null?Math.max(1,yourFantasy+(seed%7)-3):8+(seed%11),f2=yourFantasy!=null?Math.max(1,yourFantasy+((seed*3)%9)-4):11+(seed%13);
  const p1=yourPos!=null?Math.max(1,yourPos+(seed%5)-2):2+(seed%6),p2=yourPos!=null?Math.max(1,yourPos+((seed*5)%5)-2):3+(seed%7);
  const projection=String(values["Draft Projection"]??values["NFL Draft Projection"]??"").trim()||(({QB:"Round 2",RB:"Round 2",WR:"Round 1–2",TE:"Day 2"} as Record<string,string>)[pos]||"Day 2");
  const archetype=String(values["Archetype"]??"").trim()||(({QB:"Pocket Passer",RB:"Three-Down / Zone",WR:"X / Z",TE:"Move / Receiving"} as Record<string,string>)[pos]||"Role TBD");
  const experts=[
    {name:"Connor Rogers",published:f1+12+(seed%10),fantasy:f1,pos:p1},
    {name:"Trevor Sikkema",published:f2+15+((seed*2)%11),fantasy:f2,pos:p2}
  ];
  const consensusFantasy=Math.round((f1+f2)/2),consensusPos=Math.round((p1+p2)/2);
  return {pos,yourFantasy,yourPos,projection,archetype,experts,consensusFantasy,consensusPos};
}
function rankPhrase(y:number|null,c:number|null,kind:string){
  if(y==null||c==null)return "Your rank will compare here once it is available.";
  const diff=c-y;if(diff===0)return `You are aligned at ${kind} #${y}.`;
  return diff>0?`You are ${diff} ${kind} spot${diff===1?"":"s"} higher.`:`You are ${Math.abs(diff)} ${kind} spot${Math.abs(diff)===1?"":"s"} lower.`;
}
function rankDelta(y:number|null,c:number){
  if(y==null)return {text:"—",tone:""};
  const diff=c-y;if(diff===0)return {text:"Aligned",tone:"aligned"};
  return diff>0?{text:`▲ ${diff} higher`,tone:"higher"}:{text:`▼ ${Math.abs(diff)} lower`,tone:"lower"};
}
function MarketContext({d}:{d:any}){
  const x=previewIndustryData(d);
  return <section className="profile-market-preview"><div className="profile-market-preview-head"><div><span className="ey">DRAFT MARKET</span><h2>External Context</h2></div><b>Preview</b></div><div className="profile-market-preview-grid"><div><span>Draft Projection</span><strong>{x.projection}</strong><small>NFLSE · automated source</small></div><div><span>Archetype</span><strong>{x.archetype}</strong><small>NFLSE · automated source</small></div></div></section>
}
function Industry({d}:{d:any}){
  const x=previewIndustryData(d),fantasyDelta=rankDelta(x.yourFantasy,x.consensusFantasy),posDelta=rankDelta(x.yourPos,x.consensusPos);
  return <div className="profile-pane profile-industry-pane">
    <div className="profile-industry-banner"><div><b>Visual preview</b><span>The layout is live. NFLSE and analyst values are sample data until the source ingestion is wired.</span></div><em>Does not affect grades</em></div>
    <div className="profile-industry-top">
      <article><span>Your Board</span><strong>{x.yourFantasy!=null?`Fantasy #${x.yourFantasy}`:"Fantasy —"}</strong><small>{x.yourPos!=null?`${x.pos}${x.yourPos}`:`${x.pos||"Pos"} —`} · Final Draft Board</small></article>
      <article><span>Fantasy Consensus</span><strong>Fantasy #{x.consensusFantasy}</strong><small>{x.pos}{x.consensusPos} · tracked analysts</small></article>
      <article><span>Draft Projection</span><strong>{x.projection}</strong><small>NFLSE predictive market</small></article>
      <article><span>Archetype</span><strong>{x.archetype}</strong><small>NFLSE role classification</small></article>
    </div>
    <div className="profile-consensus-callout"><div><span>YOU VS. TRACKED CONSENSUS</span><strong>{rankPhrase(x.yourFantasy,x.consensusFantasy,"fantasy")}</strong><small>{rankPhrase(x.yourPos,x.consensusPos,x.pos||"position")}</small></div><div className="profile-consensus-deltas"><b className={fantasyDelta.tone}>{fantasyDelta.text}<small>Fantasy</small></b><b className={posDelta.tone}>{posDelta.text}<small>{x.pos||"Position"}</small></b></div></div>
    <section className="profile-expert-section"><div className="profile-expert-head"><div><span className="ey">EXPERT BOARDS</span><h2>How the people you trust see him</h2><p>Published overall rank is preserved, then each board is filtered to QB, RB, WR and TE for a fair comparison to your fantasy-only board.</p></div><span className="profile-preview-pill">Sample ranks</span></div><div className="profile-expert-table-wrap"><table className="profile-expert-table"><thead><tr><th>Analyst</th><th>Published OVR</th><th>Fantasy Rank</th><th>Pos Rank</th><th>Vs. You</th><th>Updated</th></tr></thead><tbody>{x.experts.map((e:any)=>{const delta=rankDelta(x.yourFantasy,e.fantasy);return <tr key={e.name}><td><div className="profile-expert-source"><strong>{e.name}</strong><span>NFL Stock Exchange</span></div></td><td>#{e.published}</td><td>#{e.fantasy}</td><td>{x.pos}{e.pos}</td><td><b className={"profile-expert-delta "+delta.tone}>{delta.text}</b></td><td><span className="profile-expert-updated">Preview</span></td></tr>})}</tbody></table></div></section>
    <div className="profile-industry-foot"><b>Comparison rule</b><span>Connor, Trevor and future analysts can rank every NFL prospect. Their raw overall rank stays visible, but comparisons to your board use a derived fantasy rank after removing non-QB/RB/WR/TE prospects.</span></div>
  </div>
}

function Summary({d}:{d:any}){
  const initial=typeof d.notesSummaryMeta==="object"&&d.notesSummaryMeta?d.notesSummaryMeta:{text:d.notesSummary,status:"unknown"},[summary,setSummary]=useState<any>(initial),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
  useEffect(()=>{setSummary(typeof d.notesSummaryMeta==="object"&&d.notesSummaryMeta?d.notesSummaryMeta:{text:d.notesSummary,status:"unknown"})},[d.notesSummary,d.notesSummaryMeta]);
  async function refresh(){setRefreshing(true);setError("");try{const r=await fetch("/api/player-profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"refresh-summary",id:d.player.id})}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not refresh summary");setSummary(j.summary)}catch(e:any){setError(e?.message||"Could not refresh summary")}finally{setRefreshing(false)}}
  const status=String(summary?.status||"unknown"),generated=summary?.generatedAt?new Date(summary.generatedAt).toLocaleString():null,historical=Number(d.player.draft_class)<2027;
  return <div className="profile-pane"><h2>Grades</h2><GradeHighlights d={d}/><MarketContext d={d}/><div className="profile-two"><section><h2>NFL Draft Result</h2><DraftResultSummary d={d}/></section><section className="profile-ai-summary"><div className="profile-ai-summary-head"><div><h2>AI Summary of Notes</h2><div className="profile-ai-meta"><span className={"profile-ai-state "+status}>{status==="fresh"?"Fresh":status==="stale"?"Needs refresh":status==="error"?"Unavailable":"No summary"}</span>{summary?.noteCount!=null&&<span>{summary.noteCount} note{summary.noteCount===1?"":"s"}</span>}{generated&&<span>Updated {generated}</span>}</div></div>{!historical&&<button className="ghost small" disabled={refreshing} onClick={()=>void refresh()}>{refreshing?"Refreshing…":"Refresh Summary"}</button>}</div><p>{summary?.text||d.notesSummary}</p>{error&&<div className="profile-transfer-error">{error}</div>}</section></div></div>
}
function Timeline({d}:{d:any}){const events=Array.isArray(d.timeline)?d.timeline:[];return <div className="profile-pane profile-timeline-pane"><div className="profile-grade-detail-intro"><span className="ey">PROSPECT HISTORY</span><h2>Timeline</h2><p>Scouting games, transfers, milestones and workflow changes in chronological context.</p></div>{events.length?<div className="profile-timeline">{events.map((x:any,i:number)=><div className={"profile-timeline-item "+String(x.type||"event").toLowerCase()} key={String(x.id||i)+"-"+String(x.date||"")}><div className="profile-timeline-dot"/><div className="profile-timeline-copy"><div><span>{x.date?new Date(x.date).toLocaleString([],{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Date unavailable"}</span><b>{x.title}</b></div>{x.detail&&<p>{x.detail}</p>}</div></div>)}</div>:<div className="profile-grade-factor-empty">No timeline events are available yet.</div>}</div>}
function factorDisplay(v:any){if(v==null||v==="")return "—";const n=Number(v);return Number.isFinite(n)?Number(n.toFixed(2)).toString():String(v)}
function gradeFactorMeter(item:any,percentiles:boolean){const n=Number(percentiles?item.percentile:item.value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0}
function GradeFactorSection({title,eyebrow,items,percentiles=false}:{title:string,eyebrow:string,items:any[],percentiles?:boolean}){return <section className="profile-grade-factor-section"><div className="profile-grade-factor-head"><div><span>{eyebrow}</span><h3>{title}</h3></div><b>{items.length} factors</b></div>{items.length?<div className="profile-grade-factor-grid">{items.map((item:any)=><div className="profile-grade-factor-card" key={item.label}><div><span>{item.label}</span>{percentiles&&item.percentile!=null&&<small>{item.percentile}th percentile</small>}</div><strong>{factorDisplay(item.value)}</strong><div className="profile-factor-percentile-track"><i style={{width:gradeFactorMeter(item,percentiles)+"%"}}/></div></div>)}</div>:<div className="profile-grade-factor-empty">No factors available for this section.</div>}</section>}
function GradeExplainModal({data,onClose}:{data:any;onClose:()=>void}){
  const steps=Array.isArray(data?.steps)?data.steps:[],film=Array.isArray(data?.film?.inputs)?data.film.inputs:[];
  return <div className="profile-override-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="profile-override-modal grade-explain-modal">
    <div className="profile-override-head"><div><small>GRADE DEPENDENCY TRACE</small><h2>{data?.player?.name||"Explain Grade"}</h2><p>{data?.frozen?data.summary:"Recalculated from the same centralized grade engine used by the board."}</p></div><button type="button" onClick={onClose}>×</button></div>
    {!data?.frozen&&<><div className="grade-explain-chain">{steps.map((s:any)=><div className={"grade-explain-step "+(s.status==="missing"?"missing":"")} key={s.key}><div><span>{s.label}</span><strong>{fmt(s.value)}</strong></div><p>{s.formula}</p><small>Depends on: {(s.dependsOn||[]).join(" · ")}</small></div>)}</div>
    <div className="grade-explain-summary"><div><span>Authoritative</span><strong>{fmt(data.authoritativeGrade)}</strong></div><div><span>Grade source</span><strong>{data.gradeSource||"—"}</strong></div><div><span>Player UID</span><strong>{data?.player?.uid||"—"}</strong></div></div>
    <details className="grade-explain-details"><summary>Film contribution detail</summary><div className="grade-explain-film">{film.map((x:any)=><div key={x.label}><span>{x.label}</span><b>{fmt(x.value)}</b><small>{x.weight!=null?"Weight "+(Number(x.weight)*100).toFixed(1)+"%":"No weight"} · Contribution {fmt(x.weightedContribution)}</small></div>)}</div>{data?.film?.missing?.length?<p className="profile-transfer-error">Missing film inputs: {data.film.missing.join(", ")}</p>:null}</details>
    <details className="grade-explain-details"><summary>Adjustments / draft inputs</summary><pre>{JSON.stringify(data.adjustments||{},null,2)}</pre></details>
    <div className="profile-override-note">Engine: {data.engine} · recalculated {data.recalculatedAt?new Date(data.recalculatedAt).toLocaleString():"now"}</div></>}
    <div className="profile-transfer-actions"><button type="button" onClick={onClose}>Close</button></div>
  </div></div>
}
function Grades({d}:{d:any}){
  const f=d.gradeFactors||{},[explain,setExplain]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  async function openExplain(){setLoading(true);setError("");try{const r=await fetch("/api/grades/explain?playerId="+encodeURIComponent(String(d.player.id)),{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not explain grade");setExplain(j)}catch(e:any){setError(e?.message||"Could not explain grade")}finally{setLoading(false)}}
  return <div className="profile-pane profile-grades-pane profile-grades-data-only">
    <div className="profile-grade-detail-intro"><div className="grade-explain-heading"><div><span className="ey">GRADE INPUTS</span><h2>What builds the grades</h2><p>Only the individual Film, Production and Analytical inputs used for this prospect.</p></div><button className="ghost" onClick={()=>void openExplain()} disabled={loading}>{loading?"Recalculating…":"Explain Grade"}</button></div>{error&&<div className="profile-transfer-error">{error}</div>}</div>
    <GradeFactorSection title="Film" eyebrow="SCOUTED TRAITS" items={Array.isArray(f.film)?f.film:[]}/><GradeFactorSection title="Production" eyebrow="PRODUCTION INPUTS" items={Array.isArray(f.production)?f.production:[]} percentiles/><GradeFactorSection title="Analytics" eyebrow="ANALYTICAL INPUTS" items={Array.isArray(f.analytical)?f.analytical:[]} percentiles/>
    {explain&&<GradeExplainModal data={explain} onClose={()=>setExplain(null)}/>}
  </div>
}

function Stats({d}:{d:any}){
  const s=d.stats||{},cats=Array.isArray(s.categories)?s.categories:[];
  return <div className="profile-pane">
    <div className="stats-head"><div><h2>College Career Stats</h2><p className="muted">Season-by-season statistics from ESPN.</p></div>{s.sourceUrl&&<a className="stats-source-link" href={s.sourceUrl} target="_blank" rel="noreferrer">View on ESPN ↗</a>}</div>
    {cats.length?cats.map((c:any)=><section className="stats-section" key={c.name}><h3>{c.displayName}</h3><div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>Season</th><th>Team</th>{c.labels.map((x:string,i:number)=><th key={i}>{x}</th>)}</tr></thead><tbody>{c.rows.map((r:any,i:number)=><tr key={(r.year||r.season)+"-"+(r.teamAbbr||r.team)+"-"+i}><td className="stats-season">{r.season||"—"}</td><td><span className="stats-team">{r.teamLogo&&<img src={r.teamLogo} alt=""/>}<b>{r.teamAbbr||r.team||"—"}</b></span></td>{c.labels.map((_:string,j:number)=><td key={j}>{r.stats?.[j]??"—"}</td>)}</tr>)}{Array.isArray(c.totals)&&c.totals.length>0&&<tr className="stats-career"><td>Career</td><td>—</td>{c.labels.map((_:string,j:number)=><td key={j}>{c.totals?.[j]??"—"}</td>)}</tr>}</tbody></table></div></section>):<div className="empty">No career statistics were found on ESPN for this player.</div>}
  </div>
}
function Team({d,open}:{d:any,open:(id:any)=>void}){const history=Array.isArray(d.transferHistory)?d.transferHistory:[];return <div className="profile-pane"><h2>{d.player.college} · Draft Eligible Players</h2><div className="team-prospects">{d.teamPlayers.map((x:any)=><button className={"team-prospect team-prospect-"+String(x.position).toLowerCase()} key={x.id} onClick={()=>open(x.id)}><b>{x.positionRank||x.position}</b><span>{x.name}</span></button>)}</div>{history.length>0&&<><h2>Transfer History</h2><div className="profile-transfer-history">{history.map((x:any)=><div key={x.id}><span>{x.effective_season||"—"}</span><strong>{x.from_college||"Unknown"} → {x.to_college}</strong></div>)}</div></>}<h2>{d.scheduleSeason?d.scheduleSeason+" ":""}Team Schedule & Results</h2><div className="profile-schedule">{d.schedule.map((e:any)=><div className="profile-game" key={e.id}><span className="profile-game-date">{new Date(e.date).toLocaleDateString([],{month:"short",day:"numeric"})}</span><div className="profile-game-copy"><div className={e.completed?"profile-game-result completed":"profile-game-result"}>{e.resultLine||e.shortName||e.name}</div>{e.playerStats&&<div className="profile-game-stats">{e.playerStats}</div>}</div></div>)}</div></div>}
