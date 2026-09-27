"use client";

import {useEffect,useMemo,useState} from "react";
import {workbookReference as w} from "@/lib/workbook-reference";
import {schoolStyle} from "@/lib/school-colors";
import styles from "./colleges.module.css";

type Level="FBS"|"FCS";
type ViewMode="overview"|"workbook";
type SortKey="rank"|"prospects"|"total"|"passing"|"rushing";

const norm=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const GROUPS=[{start:0,count:1},{start:1,count:1},{start:2,count:1},{start:3,count:1},{start:4,count:1},{start:5,count:9},{start:14,count:6},{start:20,count:5},{start:25,count:1},{start:26,count:1},{start:27,count:2}];
const DETAIL_GROUPS=[
  {label:"Passing",items:[["Completions",5],["Attempts",6],["Pass Yards",7],["Yards / Attempt",8],["Yards / Completion",9],["Touchdowns",10],["Interceptions",11],["Attempts / Game",12],["Yards / Game",13]]},
  {label:"Rushing",items:[["Rushes",14],["Rush Yards",15],["Yards / Rush",16],["Touchdowns",17],["Rushes / Game",18],["Yards / Game",19]]},
  {label:"Total Offense",items:[["Total Yards",20],["Total Plays",21],["Yards / Game",22],["Plays / Game",23],["Yards / Play",24]]},
  {label:"Ball Movement",items:[["Team YAC",25],["Team Air Yards",26],["Passing Share",27],["Rushing Share",28]]},
] as const;

function numeric(value:any){
  const raw=String(value??"").replace(/,/g,"").replace(/%/g,"").trim();
  if(!raw||raw.startsWith("#"))return null;
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
}
function display(value:any){
  if(value==null||value===""||String(value).startsWith("#"))return "—";
  return String(value);
}
function count(value:any){return numeric(value)??0}
function splitPlayers(value:any){
  const text=String(value||"").trim();
  if(!text||text.toLowerCase()==="none")return [];
  return text.split(",").map(x=>x.trim()).filter(Boolean);
}
function statTone(ci:number){
  if(ci>=5&&ci<=13)return styles.bandPassing;
  if(ci>=14&&ci<=19)return styles.bandRushing;
  if(ci>=20&&ci<=24)return styles.bandTotal;
  if(ci===25)return styles.bandYac;
  if(ci===26)return styles.bandAir;
  if(ci>=27)return styles.bandDistribution;
  return styles.bandInfo;
}

function Metric({label,value,accent}:{label:string;value:any;accent?:"pass"|"rush"|"total"}){
  return <div className={[styles.metric,accent?styles["metric_"+accent]:""].filter(Boolean).join(" ")}>
    <span>{label}</span><strong>{display(value)}</strong>
  </div>;
}

export default function Page(){
  const [level,setLevel]=useState<Level>("FBS");
  const [cloud,setCloud]=useState<any[]>([]);
  const [cloudLoading,setCloudLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [sortKey,setSortKey]=useState<SortKey>("rank");
  const [view,setView]=useState<ViewMode>("overview");
  const [prospectsOnly,setProspectsOnly]=useState(false);

  useEffect(()=>{
    let active=true;
    setCloudLoading(true);
    fetch("/api/college-stats",{cache:"no-store"})
      .then(r=>r.json())
      .then(j=>{if(active&&Array.isArray(j))setCloud(j)})
      .catch(()=>{})
      .finally(()=>{if(active)setCloudLoading(false)});
    return()=>{active=false};
  },[]);

  const base:any[][]=level==="FBS"?w.colleges:w.nonFbs;
  const cloudByTeam=useMemo(()=>new Map(cloud.map(row=>[norm(row.team),row])),[cloud]);
  const rows=useMemo(()=>base.map((r:any[],i:number)=>{
    if(i<2)return r;
    const c=cloudByTeam.get(norm(r[1]));
    if(!c)return r;
    const n=[...r];
    const map:[number,string][]=[[0,"rank"],[2,"playersToScout"],[3,"players"],[4,"games"],[5,"completions"],[6,"passAttempts"],[7,"passYards"],[10,"passTDs"],[15,"rushYards"],[17,"rushTDs"],[21,"totalPlays"],[25,"yac"],[26,"airYards"]];
    for(const [idx,k] of map)if(c[k]!=null)n[idx]=c[k];
    return n;
  }),[base,cloudByTeam]);

  const teamRows=useMemo(()=>rows.slice(2).filter((r:any[])=>String(r?.[1]||"").trim()),[rows]);
  const totalProspects=useMemo(()=>teamRows.reduce((sum,r)=>sum+count(r[2]),0),[teamRows]);
  const programsWithProspects=useMemo(()=>teamRows.filter(r=>count(r[2])>0).length,[teamRows]);
  const statCoverage=useMemo(()=>teamRows.filter(r=>numeric(r[4])!=null).length,[teamRows]);

  const visibleRows=useMemo(()=>{
    const needle=norm(query);
    const filtered=teamRows.filter(r=>{
      if(prospectsOnly&&count(r[2])<=0)return false;
      if(!needle)return true;
      return norm(String(r[1]||"")+" "+String(r[3]||"")).includes(needle);
    });
    return [...filtered].sort((a,b)=>{
      const rankA=numeric(a[0])??9999,rankB=numeric(b[0])??9999;
      if(sortKey==="rank")return rankA-rankB;
      const index=sortKey==="prospects"?2:sortKey==="total"?22:sortKey==="passing"?13:19;
      const av=numeric(a[index])??-Infinity,bv=numeric(b[index])??-Infinity;
      return bv-av||rankA-rankB;
    });
  },[teamRows,query,prospectsOnly,sortKey]);

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}>College Data Center</div>
        <h1>{level==="FBS"?"Colleges · Players + Stats":"Non-FBS · Players + Stats"}</h1>
        <p>Start with the programs that matter to the 2027 draft pool, then drill into passing, rushing, total offense and usage without living inside a 29-column spreadsheet.</p>
      </div>
      <div className={styles.heroStats}>
        <div><span>Programs</span><strong>{teamRows.length}</strong></div>
        <div><span>Prospects</span><strong>{totalProspects}</strong></div>
        <div><span>Draft programs</span><strong>{programsWithProspects}</strong></div>
        <div><span>Stat coverage</span><strong>{statCoverage}</strong></div>
      </div>
    </section>

    <section className={styles.commandBar}>
      <div className={styles.segmented} aria-label="College level">
        <button className={level==="FBS"?styles.active:""} onClick={()=>setLevel("FBS")}>FBS</button>
        <button className={level==="FCS"?styles.active:""} onClick={()=>setLevel("FCS")}>Non-FBS</button>
      </div>

      <label className={styles.searchBox}>
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search school or prospect…"/>
        {query&&<button type="button" onClick={()=>setQuery("")} aria-label="Clear search">×</button>}
      </label>

      <button className={[styles.filterButton,prospectsOnly?styles.filterActive:""].filter(Boolean).join(" ")} onClick={()=>setProspectsOnly(v=>!v)} aria-pressed={prospectsOnly}>
        Prospect programs
      </button>

      <label className={styles.sortControl}>Sort
        <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
          <option value="rank">Workbook rank</option>
          <option value="prospects">Players to scout</option>
          <option value="total">Total offense / game</option>
          <option value="passing">Passing / game</option>
          <option value="rushing">Rushing / game</option>
        </select>
      </label>

      <div className={styles.segmented} aria-label="View mode">
        <button className={view==="overview"?styles.active:""} onClick={()=>setView("overview")}>Overview</button>
        <button className={view==="workbook"?styles.active:""} onClick={()=>setView("workbook")}>Workbook</button>
      </div>
    </section>

    <div className={styles.resultsMeta}>
      <div><strong>{visibleRows.length}</strong> programs shown</div>
      <div className={styles.syncState}><i className={cloud.length?styles.live:cloudLoading?styles.loading:""}/>{cloudLoading?"Checking live college stats…":cloud.length?cloud.length+" live team records merged":"Workbook reference data"}</div>
    </div>

    {view==="overview"?<section className={styles.teamList}>
      {visibleRows.map((r:any[],ri:number)=>{
        const team=String(r[1]),prospects=splitPlayers(r[3]),passShare=numeric(r[27]);
        return <article className={styles.teamCard} key={team+"-"+ri}>
          <header className={styles.teamHeader}>
            <div className={styles.rankBadge}>#{display(r[0])}</div>
            <div className={styles.teamRibbon} style={schoolStyle(team)}>
              <strong>{team}</strong>
              <span>{display(r[4])} games · {display(r[2])} player{count(r[2])===1?"":"s"} to scout</span>
            </div>
            <div className={styles.headlineMetrics}>
              <Metric label="Total Yds / G" value={r[22]} accent="total"/>
              <Metric label="Yards / Play" value={r[24]} accent="total"/>
              <div className={styles.splitMetric}>
                <div><span>Pass</span><strong>{display(r[27])}</strong></div>
                <div className={styles.splitBar} aria-label={"Passing "+display(r[27])+", rushing "+display(r[28])}>
                  <span className={styles.passShare} style={{width:String(passShare==null?50:Math.max(0,Math.min(100,passShare)))+"%"}}/>
                </div>
                <div><strong>{display(r[28])}</strong><span>Rush</span></div>
              </div>
            </div>
          </header>

          <div className={styles.teamBody}>
            <div className={styles.prospectPanel}>
              <div className={styles.panelLabel}>2027 players to scout</div>
              {prospects.length?<div className={styles.prospectChips}>{prospects.map(name=><span key={name}>{name}</span>)}</div>:<div className={styles.noProspects}>No current 2027 prospects attached to this program.</div>}
            </div>
            <div className={styles.offenseSnapshot}>
              <div className={styles.snapshotGroup}>
                <div className={styles.snapshotHeading}><i className={styles.passDot}/>Passing offense</div>
                <div className={styles.snapshotGrid}><Metric label="Yds / G" value={r[13]} accent="pass"/><Metric label="Yds / Att" value={r[8]} accent="pass"/><Metric label="TD" value={r[10]} accent="pass"/></div>
              </div>
              <div className={styles.snapshotGroup}>
                <div className={styles.snapshotHeading}><i className={styles.rushDot}/>Rushing offense</div>
                <div className={styles.snapshotGrid}><Metric label="Yds / G" value={r[19]} accent="rush"/><Metric label="Yds / Rush" value={r[16]} accent="rush"/><Metric label="TD" value={r[17]} accent="rush"/></div>
              </div>
            </div>
          </div>

          <details className={styles.details}>
            <summary><span>Full offense profile</span><b>29 workbook fields</b></summary>
            <div className={styles.detailGrid}>
              {DETAIL_GROUPS.map(group=><section key={group.label}>
                <h3>{group.label}</h3>
                <dl>{group.items.map(([label,index])=><div key={label}><dt>{label}</dt><dd>{display(r[index])}</dd></div>)}</dl>
              </section>)}
            </div>
          </details>
        </article>;
      })}
      {!visibleRows.length&&<div className={styles.emptyState}><strong>No programs match these filters.</strong><span>Clear the search or turn off Prospect programs.</span></div>}
    </section>:<section className={styles.workbookShell}>
      <div className={styles.workbookNote}><strong>Workbook view</strong><span>The original 29-column structure is preserved here for audits and exact sheet parity.</span></div>
      <div className={styles.tableWrap}>
        <table className={styles.workbookTable}>
          <thead>
            <tr>{GROUPS.map(g=><th key={g.start} colSpan={g.count} className={[statTone(g.start),g.start===0?styles.stickyRank:g.start===1?styles.stickyTeam:""].filter(Boolean).join(" ")}>{display(rows?.[0]?.[g.start])}</th>)}</tr>
            <tr>{Array.from({length:29},(_,ci)=><th key={ci} className={[statTone(ci),ci===0?styles.stickyRank:ci===1?styles.stickyTeam:""].filter(Boolean).join(" ")}>{display(rows?.[1]?.[ci])}</th>)}</tr>
          </thead>
          <tbody>{visibleRows.map((r:any[],ri:number)=><tr key={String(r[1])+"-"+ri}>{Array.from({length:29},(_,ci)=><td key={ci} className={ci===0?styles.stickyRank:ci===1?styles.stickyTeam:ci===3?styles.playersCell:""} style={ci===1?schoolStyle(String(r?.[1]||"")):undefined}>{display(r?.[ci])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>}
  </div>;
}
