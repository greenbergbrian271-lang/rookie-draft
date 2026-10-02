"use client";

import {useEffect,useMemo,useState,type CSSProperties,type MouseEvent,type ChangeEvent} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {useDraftClass} from "@/lib/use-draft-class";
import {usePlayerProfile} from "@/components/PlayerProfile";
import styles from "./ComparePlayersModal.module.css";

type Position="QB"|"RB"|"WR"|"TE";
type Format="SF"|"TEP";
type Player={
  id:string|number;
  name:string;
  position:Position;
  college?:string|null;
  draft_class:number;
  scouting_status?:string|null;
  headshot_url?:string|null;
};
type GradeRow=Player&{
  gamesWatched?:number|null;
  scoutingGrade?:number|null;
  productionGrade?:number|null;
  analyticalGrade?:number|null;
  preDraftGrade?:number|null;
  finalGrade?:number|null;
  authoritativeGrade?:number|null;
  boardGrade?:number|null;
  overallRank?:number|null;
  positionRank?:number|null;
  tier?:number|null;
  draftResult?:string|null;
  gradeSource?:string|null;
};
type Profile={
  player:Player&{positionRank?:string|null};
  grades?:{values?:Record<string,unknown>;scouting?:number|null;production?:number|null;analytical?:number|null;pre?:number|null;final?:number|null};
  evaluations?:Array<{category:string;value?:unknown;commentary?:unknown}>;
  notesSummary?:string;
};
type Insight={
  playerId:string;
  summary:string;
  strengths:string[];
  concerns:string[];
  noteCount:number;
  source:"ai"|"fallback"|"none";
};

type Metric={label:string;field:keyof GradeRow;kind:"grade"|"rank"|"count"|"text";help?:string};

const POSITIONS:Position[]=["QB","RB","WR","TE"];
const FILM:Record<Position,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"],
};
const GRADE_METRICS:Metric[]=[
  {label:"Board Grade",field:"boardGrade",kind:"grade",help:"The active Final Draft Board grade for this format."},
  {label:"Final Draft Grade",field:"finalGrade",kind:"grade"},
  {label:"Pre-Draft Grade",field:"preDraftGrade",kind:"grade"},
  {label:"Scouting Grade",field:"scoutingGrade",kind:"grade"},
  {label:"Production Grade",field:"productionGrade",kind:"grade"},
  {label:"Analytical Grade",field:"analyticalGrade",kind:"grade"},
];
const RANK_METRICS:Metric[]=[
  {label:"Overall Rank",field:"overallRank",kind:"rank"},
  {label:"Position Rank",field:"positionRank",kind:"rank"},
  {label:"Tier",field:"tier",kind:"rank"},
  {label:"Games Watched",field:"gamesWatched",kind:"count"},
  {label:"Draft Result",field:"draftResult",kind:"text"},
];

const norm=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const fmtGrade=(v:unknown)=>{const n=num(v);return n==null?"—":n.toFixed(2)};
const compact=(v:unknown)=>{const s=String(v??"").trim();return s||"—"};
function tone(v:unknown){const n=num(v);if(n==null)return "missing";if(n>=85)return "elite";if(n>=75)return "plus";if(n>=65)return "solid";if(n>=55)return "fringe";return "concern"}
function bestIndex(rows:GradeRow[],field:keyof GradeRow,lower=false){
  const values=rows.map(r=>num(r[field]));
  const valid=values.map((v,i)=>v==null?null:{v,i}).filter((x):x is {v:number;i:number}=>x!==null);
  if(valid.length<2)return -1;
  const first=valid[0].v;if(valid.every(x=>x.v===first))return -1;
  valid.sort((a,b)=>lower?a.v-b.v:b.v-a.v);return valid[0].i;
}
function valueFrom(profile:Profile|undefined,keys:string[]){
  const values=profile?.grades?.values||{};
  for(const key of keys){const v=values[key];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}
  return null;
}
function traitValue(profile:Profile|undefined,key:string){return num(profile?.grades?.values?.[key])}
function fallbackInsight(profile:Profile|undefined,id:string):Insight{
  const summary=String(profile?.notesSummary||"No scouting notes have been added yet.");
  return {playerId:id,summary,strengths:[],concerns:[],noteCount:summary.startsWith("No scouting")?0:1,source:summary.startsWith("No scouting")?"none":"fallback"};
}

export default function ComparePlayersModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const draftClass=useDraftClass();
  const {openPlayer}=usePlayerProfile();
  const [players,setPlayers]=useState<Player[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [comparisonIds,setComparisonIds]=useState<string[]>([]);
  const [profiles,setProfiles]=useState<Record<string,Profile>>({});
  const [rows,setRows]=useState<GradeRow[]>([]);
  const [insights,setInsights]=useState<Record<string,Insight>>({});
  const [format,setFormat]=useState<Format>("SF");
  const [position,setPosition]=useState<"ALL"|Position>("ALL");
  const [search,setSearch]=useState("");
  const [pickerOpen,setPickerOpen]=useState(true);
  const [loadingPlayers,setLoadingPlayers]=useState(false);
  const [loadingCompare,setLoadingCompare]=useState(false);
  const [loadingBoard,setLoadingBoard]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!open)return;
    setSelected([]);setComparisonIds([]);setProfiles({});setRows([]);setInsights({});setFormat("SF");setPosition("ALL");setSearch("");setPickerOpen(true);setError("");
    setLoadingPlayers(true);
    fetch("/api/players",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok||!Array.isArray(j))throw new Error(j?.error||"Could not load players.");setPlayers(j)}).catch(e=>setError(e?.message||"Could not load players.")).finally(()=>setLoadingPlayers(false));
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!loadingCompare)onClose()};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[open,loadingCompare,onClose]);

  const eligible=useMemo(()=>players.filter(p=>p.draft_class===draftClass&&POSITIONS.includes(p.position)&&p.scouting_status!=="ARCHIVED").sort((a,b)=>a.position.localeCompare(b.position)||a.name.localeCompare(b.name)),[players,draftClass]);
  const candidates=useMemo(()=>{const q=norm(search);return eligible.filter(p=>!selected.includes(String(p.id))&&(position==="ALL"||p.position===position)&&(!q||norm(`${p.name} ${p.college||""}`).includes(q)))},[eligible,selected,position,search]);
  const selectedPlayers=useMemo(()=>selected.map(id=>eligible.find(p=>String(p.id)===id)).filter((p):p is Player=>Boolean(p)),[selected,eligible]);
  const comparisonPlayers=useMemo(()=>comparisonIds.map(id=>eligible.find(p=>String(p.id)===id)||profiles[id]?.player).filter((p):p is Player=>Boolean(p)),[comparisonIds,eligible,profiles]);
  const byRow=useMemo(()=>new Map(rows.map(r=>[String(r.id),r])),[rows]);
  const comparisonRows=useMemo(()=>comparisonIds.map(id=>byRow.get(id)||({...(profiles[id]?.player||{}),id,name:profiles[id]?.player?.name||"Player",position:(profiles[id]?.player?.position||"QB") as Position,draft_class:draftClass,scoutingGrade:profiles[id]?.grades?.scouting??null,productionGrade:profiles[id]?.grades?.production??null,analyticalGrade:profiles[id]?.grades?.analytical??null,preDraftGrade:profiles[id]?.grades?.pre??null,finalGrade:profiles[id]?.grades?.final??null} as GradeRow)),[comparisonIds,byRow,profiles,draftClass]);
  const samePosition=comparisonPlayers.length>1&&comparisonPlayers.every(p=>p.position===comparisonPlayers[0].position)?comparisonPlayers[0].position:null;

  function addPlayer(id:string){if(selected.length>=5||selected.includes(id))return;setSelected(prev=>[...prev,id]);setSearch("");if(selected.length>=4)setPickerOpen(false)}
  function removePlayer(id:string){setSelected(prev=>prev.filter(x=>x!==id));if(comparisonIds.includes(id)){setComparisonIds([]);setRows([]);setProfiles({});setInsights({})}}
  function moveSelected(id:string,delta:number){setSelected(prev=>{const from=prev.indexOf(id),to=from+delta;if(from<0||to<0||to>=prev.length)return prev;const next=[...prev];[next[from],next[to]]=[next[to],next[from]];return next})}
  function openProfile(id:string|number){onClose();setTimeout(()=>openPlayer(id),0)}

  async function fetchBoard(ids:string[],nextFormat:Format){
    setLoadingBoard(true);
    try{
      const r=await fetch(`/api/final-board/live?view=${nextFormat==="TEP"?"tep":"base"}&draftClass=${draftClass}`,{cache:"no-store"});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load board rankings.");
      const wanted=new Set(ids);setRows((Array.isArray(j?.rows)?j.rows:[]).filter((row:any)=>wanted.has(String(row.id))));
    }finally{setLoadingBoard(false)}
  }

  async function runCompare(){
    if(selected.length<2){setError("Select at least two players.");return}
    setLoadingCompare(true);setError("");setPickerOpen(false);
    const ids=[...selected];setComparisonIds(ids);
    try{
      const profileRequests=ids.map(id=>fetch(`/api/player-profile?id=${encodeURIComponent(id)}`,{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load player profile.");return [id,j] as const}));
      const summaryRequest=fetch("/api/compare-summary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerIds:ids})}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not summarize scouting notes.");return j}).catch(()=>null);
      const [profilePairs,summaryData]=await Promise.all([Promise.all(profileRequests),summaryRequest,fetchBoard(ids,format).then(()=>null)]);
      const nextProfiles=Object.fromEntries(profilePairs) as Record<string,Profile>;setProfiles(nextProfiles);
      const returned=Array.isArray(summaryData?.summaries)?summaryData.summaries:[];
      const map:Record<string,Insight>={};
      for(const id of ids){const hit=returned.find((x:any)=>String(x.playerId)===id);map[id]=hit?{playerId:id,summary:String(hit.summary||""),strengths:Array.isArray(hit.strengths)?hit.strengths.slice(0,3).map(String):[],concerns:Array.isArray(hit.concerns)?hit.concerns.slice(0,3).map(String):[],noteCount:Number(hit.noteCount)||0,source:hit.source==="ai"?"ai":hit.source==="none"?"none":"fallback"}:fallbackInsight(nextProfiles[id],id)}
      setInsights(map);
    }catch(e:unknown){setError(e instanceof Error?e.message:"Could not build comparison.")}
    finally{setLoadingCompare(false)}
  }

  async function changeFormat(next:Format){setFormat(next);if(comparisonIds.length){setError("");try{await fetchBoard(comparisonIds,next)}catch(e:unknown){setError(e instanceof Error?e.message:"Could not refresh rankings.")}}}

  function renderMetric(metric:Metric,row:GradeRow){
    const value=row[metric.field];
    if(metric.kind==="grade")return <span className={`${styles.grade} ${styles[tone(value)]}`}>{fmtGrade(value)}</span>;
    if(metric.kind==="rank")return <strong className={styles.rankValue}>{value==null?"—":metric.field==="positionRank"?`${row.position}${value}`:String(value)}</strong>;
    return <span>{compact(value)}</span>;
  }

  if(!open)return null;
  return <div className={styles.backdrop} onMouseDown={(e:MouseEvent<HTMLDivElement>)=>e.target===e.currentTarget&&!loadingCompare&&onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="compare-title">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>GM Tools · Scouting Lab</div>
          <h2 id="compare-title">Compare Players</h2>
          <p>Build a 2–5 prospect stack, compare the live board and grade model, then scan a consolidated scouting-notes readout.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.formatToggle} aria-label="Draft board format">
            <button type="button" className={format==="SF"?styles.active:""} onClick={()=>void changeFormat("SF")}><b>SF</b><small>Base board</small></button>
            <button type="button" className={format==="TEP"?styles.active:""} onClick={()=>void changeFormat("TEP")}><b>TEP</b><small>TE premium</small></button>
          </div>
          <button className={styles.close} type="button" onClick={onClose} disabled={loadingCompare} aria-label="Close">×</button>
        </div>
      </header>

      <div className={styles.selectionDock}>
        <div className={styles.slotRail}>
          {[0,1,2,3,4].map(index=>{const p=selectedPlayers[index];if(!p)return <button key={index} type="button" className={styles.emptySlot} onClick={()=>setPickerOpen(true)}><span>+</span><small>{index<2?`Player ${index+1}`:"Optional"}</small></button>;const school=schoolStyle(p.college||undefined);return <div key={String(p.id)} className={styles.selectedCard} style={{"--school":school.background,"--schoolText":school.color} as CSSProperties}>
            <div className={styles.selectedAccent}/>
            {p.headshot_url?<img src={p.headshot_url} alt=""/>:<div className={styles.avatarFallback}>{p.position}</div>}
            <div className={styles.selectedCopy}><strong>{p.name}</strong><small>{p.position} · {p.college||"College not set"}</small></div>
            <div className={styles.slotButtons}><button type="button" onClick={()=>moveSelected(String(p.id),-1)} disabled={index===0} aria-label={`Move ${p.name} left`}>‹</button><button type="button" onClick={()=>moveSelected(String(p.id),1)} disabled={index===selectedPlayers.length-1} aria-label={`Move ${p.name} right`}>›</button><button type="button" onClick={()=>removePlayer(String(p.id))} aria-label={`Remove ${p.name}`}>×</button></div>
          </div>})}
        </div>
        <div className={styles.dockActions}>
          <button type="button" className={styles.secondary} onClick={()=>setPickerOpen(x=>!x)} disabled={selected.length>=5}>{pickerOpen?"Hide picker":"+ Add prospect"}</button>
          <button type="button" className={styles.primary} onClick={()=>void runCompare()} disabled={selected.length<2||loadingCompare}>{loadingCompare?"Building comparison…":comparisonIds.length?"Refresh comparison":"Compare selected"}</button>
        </div>
      </div>

      {pickerOpen&&<div className={styles.picker}>
        <div className={styles.pickerTop}>
          <div className={styles.searchWrap}><span>⌕</span><input value={search} onChange={(e:ChangeEvent<HTMLInputElement>)=>setSearch(e.target.value)} placeholder="Search player or college…" autoFocus/></div>
          <div className={styles.positionFilter}>{(["ALL",...POSITIONS] as const).map(pos=><button type="button" key={pos} className={position===pos?styles.active:""} onClick={()=>setPosition(pos)}>{pos}</button>)}</div>
          <span className={styles.selectionCount}>{selected.length}/5 selected</span>
        </div>
        <div className={styles.candidateList}>
          {loadingPlayers?<div className={styles.emptyState}>Loading prospects…</div>:candidates.length===0?<div className={styles.emptyState}>No available prospects match this search.</div>:candidates.slice(0,60).map(p=>{const school=schoolStyle(p.college||undefined);return <button type="button" className={styles.candidate} key={String(p.id)} onClick={()=>addPlayer(String(p.id))} disabled={selected.length>=5}>
            <span className={styles.posBadge}>{p.position}</span><span className={styles.candidateCopy}><strong>{p.name}</strong><small>{p.college||"College not set"}</small></span><span className={styles.schoolChip} style={school}>{p.college||"—"}</span><b>+</b>
          </button>})}
        </div>
      </div>}

      <main className={styles.content}>
        {error&&<div className={styles.error}>{error}</div>}
        {!comparisonIds.length?<div className={styles.heroEmpty}><div className={styles.heroMark}>VS</div><h3>Build your comparison board</h3><p>Select two to five prospects above. The result uses the same grade and ranking sources as the live scouting workspace and Final Draft Board.</p><div className={styles.heroHints}><span>Live SF / TEP rank</span><span>Primary grade stack</span><span>Film traits</span><span>AI notes synthesis</span></div></div>:
        <>
          <section className={styles.playerHeaderGrid} style={{"--cols":comparisonPlayers.length} as CSSProperties}>
            <div className={styles.metricHeader}><span>{format==="TEP"?"TE Premium":"Base / SF"}</span><strong>{draftClass} comparison</strong>{(loadingCompare||loadingBoard)&&<small>Refreshing live data…</small>}</div>
            {comparisonPlayers.map(p=>{const school=schoolStyle(p.college||undefined),row=byRow.get(String(p.id)),profile=profiles[String(p.id)];return <article className={styles.playerHeader} key={String(p.id)} style={{"--school":school.background,"--schoolText":school.color} as CSSProperties}>
              <div className={styles.schoolBar}/>
              <div className={styles.playerHero}>
                {p.headshot_url?<img src={p.headshot_url} alt=""/>:<div className={styles.heroAvatar}>{p.position}</div>}
                <div><span className={styles.heroPos}>{p.position}</span><h3>{p.name}</h3><span className={styles.collegePill} style={school}>{p.college||"—"}</span></div>
              </div>
              <div className={styles.quickRanks}><div><small>Overall</small><strong>{row?.overallRank??"—"}</strong></div><div><small>Pos</small><strong>{row?.positionRank?`${p.position}${row.positionRank}`:(profile?.player?.positionRank||"—")}</strong></div><div><small>Games</small><strong>{row?.gamesWatched??"—"}</strong></div></div>
              <button type="button" className={styles.profileLink} onClick={()=>openProfile(p.id)}>Open full player card ↗</button>
            </article>})}
          </section>

          <section className={styles.matrix}>
            <div className={styles.sectionTitle}><div><span>01</span><div><h3>Board + Grade Stack</h3><p>Primary grades first, with the current format’s rank context.</p></div></div><small>Green outline = strongest numeric result in the row</small></div>
            <div className={styles.matrixScroll}><table><tbody>
              <tr className={styles.groupRow}><th>Grades</th>{comparisonPlayers.map(p=><td key={String(p.id)}>{p.name}</td>)}</tr>
              {GRADE_METRICS.map(metric=>{const best=bestIndex(comparisonRows,metric.field);return <tr key={metric.label}><th><span>{metric.label}</span>{metric.help&&<small>{metric.help}</small>}</th>{comparisonRows.map((row,index)=><td className={best===index?styles.best:""} key={String(row.id)}>{renderMetric(metric,row)}</td>)}</tr>})}
              <tr className={styles.groupRow}><th>Board Context</th>{comparisonPlayers.map(p=><td key={String(p.id)}>{format}</td>)}</tr>
              {RANK_METRICS.map(metric=>{const best=metric.field==="overallRank"?bestIndex(comparisonRows,metric.field,true):-1;return <tr key={metric.label}><th>{metric.label}</th>{comparisonRows.map((row,index)=><td className={best===index?styles.best:""} key={String(row.id)}>{renderMetric(metric,row)}</td>)}</tr>})}
            </tbody></table></div>
          </section>

          <section className={styles.contextSection}>
            <div className={styles.sectionTitle}><div><span>02</span><div><h3>Prospect Context</h3><p>The stuff that changes how the grade should be interpreted.</p></div></div></div>
            <div className={styles.contextGrid} style={{"--cols":comparisonPlayers.length} as CSSProperties}>
              {comparisonPlayers.map(p=>{const profile=profiles[String(p.id)],context=[
                ["Class",valueFrom(profile,["Class","Draft Class"])||draftClass],
                ["Expected Role",valueFrom(profile,["Expected Role","Role"])],
                ["Draft Projection",valueFrom(profile,["Draft Projection","Projected Draft Capital"])],
                ["All-Star",valueFrom(profile,["All Star Game?","All-Star Game","All Star Game"])],
                ["Combine",valueFrom(profile,["Combine Invite?","Combine Invite","Combine Status"])],
                ["Injury",valueFrom(profile,["Injury Concerns","Injury Concern","Injuries"])],
              ];return <article key={String(p.id)} className={styles.contextCard}><h4>{p.name}</h4>{context.map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{compact(value)}</strong></div>)}</article>})}
            </div>
          </section>

          <section className={styles.matrix}>
            <div className={styles.sectionTitle}><div><span>03</span><div><h3>Film Trait Lens</h3><p>{samePosition?`Direct ${samePosition}-to-${samePosition} trait comparison from your scouting grades.`:"Trait scales differ by position, so mixed-position comparisons show each prospect’s strongest and weakest traits instead of a fake apples-to-oranges winner."}</p></div></div></div>
            {samePosition?<div className={styles.matrixScroll}><table><tbody>
              <tr className={styles.groupRow}><th>{samePosition} Film Traits</th>{comparisonPlayers.map(p=><td key={String(p.id)}>{p.name}</td>)}</tr>
              {FILM[samePosition].map(trait=>{const values=comparisonIds.map(id=>traitValue(profiles[id],trait)),valid=values.map((v,i)=>v==null?null:{v,i}).filter((x):x is {v:number;i:number}=>x!==null),best=valid.length>=2&&!valid.every(x=>x.v===valid[0].v)?[...valid].sort((a,b)=>b.v-a.v)[0].i:-1;return <tr key={trait}><th>{trait}</th>{values.map((value,index)=><td className={best===index?styles.best:""} key={comparisonIds[index]}><span className={`${styles.traitScore} ${value==null?styles.missing:""}`}>{value==null?"—":value.toFixed(1)}</span></td>)}</tr>})}
            </tbody></table></div>:<div className={styles.traitCards} style={{"--cols":comparisonPlayers.length} as CSSProperties}>{comparisonPlayers.map(p=>{const id=String(p.id),traits=FILM[p.position].map(label=>({label,value:traitValue(profiles[id],label)})).filter((x):x is {label:string;value:number}=>x.value!=null).sort((a,b)=>b.value-a.value),strengths=traits.slice(0,3),concerns=[...traits].reverse().slice(0,2);return <article key={id}><h4>{p.name}<span>{p.position}</span></h4><small>Highest traits</small><div className={styles.traitList}>{strengths.length?strengths.map(x=><span key={x.label}><b>{x.value.toFixed(1)}</b>{x.label}</span>):<em>No film traits graded yet.</em>}</div><small>Lowest traits</small><div className={styles.traitList}>{concerns.length?concerns.map(x=><span key={x.label}><b>{x.value.toFixed(1)}</b>{x.label}</span>):<em>—</em>}</div></article>})}</div>}
          </section>

          <section className={styles.insightSection}>
            <div className={styles.sectionTitle}><div><span>04</span><div><h3>Scouting Intelligence</h3><p>One synthesis across the saved game notes for each prospect, with strengths and concerns separated for fast scanning.</p></div></div><small>Summaries never change your grades</small></div>
            <div className={styles.insightGrid} style={{"--cols":comparisonPlayers.length} as CSSProperties}>
              {comparisonPlayers.map(p=>{const id=String(p.id),insight=insights[id]||fallbackInsight(profiles[id],id);return <article key={id} className={styles.insightCard}>
                <div className={styles.insightHead}><div><span className={styles.aiBadge}>{insight.source==="ai"?"AI SUMMARY":insight.source==="none"?"NO NOTES":"NOTES DIGEST"}</span><h4>{p.name}</h4></div><small>{insight.noteCount} note{insight.noteCount===1?"":"s"}</small></div>
                <p>{insight.summary||"No scouting notes have been added yet."}</p>
                {(insight.strengths.length>0||insight.concerns.length>0)&&<div className={styles.signalGrid}><div><small>Strength signals</small>{insight.strengths.length?insight.strengths.map(x=><span className={styles.positive} key={x}>+ {x}</span>):<em>None called out</em>}</div><div><small>Concern signals</small>{insight.concerns.length?insight.concerns.map(x=><span className={styles.negative} key={x}>− {x}</span>):<em>None called out</em>}</div></div>}
              </article>})}
            </div>
          </section>
        </>}
      </main>
    </section>
  </div>;
}