"use client";

import Image from "next/image";
import {useEffect,useMemo,useState} from "react";
import {workbookReference as w} from "@/lib/workbook-reference";
import {schoolStyle} from "@/lib/school-colors";
import styles from "./colleges.module.css";

type Level="FBS"|"FCS";
type ViewMode="overview"|"workbook";
type SortKey="school"|"prospects"|"total"|"passing"|"rushing";
type RefreshState="idle"|"loading"|"success"|"error";
type OverrideRow={team:string;subdivision:Level;columnIndex:number;value:string;updatedAt?:string};

const norm=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const WORKBOOK_COLUMNS=Array.from({length:28},(_,i)=>i+1);
const GROUPS=[{start:1,count:1},{start:2,count:1},{start:3,count:1},{start:4,count:1},{start:5,count:9},{start:14,count:6},{start:20,count:5},{start:25,count:1},{start:26,count:1},{start:27,count:2}];
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

function fixed(value:number,places=2){return value.toFixed(places)}
function deriveOffense(row:any[]){
  const n=[...row],games=numeric(n[4]),passAttempts=numeric(n[6]),passYards=numeric(n[7]),rushes=numeric(n[14]),rushYards=numeric(n[15]);
  if(games&&passAttempts!=null)n[12]=fixed(passAttempts/games);
  if(games&&passYards!=null)n[13]=fixed(passYards/games);
  if(games&&rushes!=null)n[18]=fixed(rushes/games);
  if(games&&rushYards!=null)n[19]=fixed(rushYards/games);
  if(passYards!=null&&rushYards!=null){
    const totalYards=passYards+rushYards;
    n[20]=totalYards;
    if(games)n[22]=fixed(totalYards/games);
    if(totalYards>0){n[27]=fixed(passYards/totalYards*100)+"%";n[28]=fixed(rushYards/totalYards*100)+"%"}
  }
  if(passAttempts!=null&&rushes!=null){
    const totalPlays=passAttempts+rushes;
    n[21]=totalPlays;
    if(games)n[23]=fixed(totalPlays/games);
    const totalYards=numeric(n[20]);
    if(totalPlays>0&&totalYards!=null)n[24]=fixed(totalYards/totalPlays);
  }
  return n;
}

function Metric({label,value,accent}:{label:string;value:any;accent?:"pass"|"rush"|"total"}){
  return <div className={[styles.metric,accent?styles["metric_"+accent]:""].filter(Boolean).join(" ")}>
    <span>{label}</span><strong>{display(value)}</strong>
  </div>;
}

export default function Page(){
  const [level,setLevel]=useState<Level>("FBS");
  const [cloud,setCloud]=useState<any[]>([]);
  const [overrides,setOverrides]=useState<OverrideRow[]>([]);
  const [logos,setLogos]=useState<Record<string,string>>({});
  const [cloudLoading,setCloudLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [sortKey,setSortKey]=useState<SortKey>("prospects");
  const [view,setView]=useState<ViewMode>("overview");
  const [prospectsOnly,setProspectsOnly]=useState(false);
  const [refreshState,setRefreshState]=useState<RefreshState>("idle");
  const [refreshMessage,setRefreshMessage]=useState("");
  const [savingCell,setSavingCell]=useState("");

  async function loadData(){
    setCloudLoading(true);
    try{
      const [statsResponse,overrideResponse,logoResponse]=await Promise.all([fetch("/api/college-stats",{cache:"no-store"}),fetch("/api/college-stats/overrides",{cache:"no-store"}),fetch("/api/college-logos",{cache:"force-cache"})]);
      const [statsJson,overrideJson,logoJson]=await Promise.all([statsResponse.json(),overrideResponse.json(),logoResponse.json()]);
      if(statsResponse.ok&&Array.isArray(statsJson))setCloud(statsJson);
      if(overrideResponse.ok&&Array.isArray(overrideJson))setOverrides(overrideJson);
      if(logoResponse.ok&&logoJson&&typeof logoJson==="object"&&!Array.isArray(logoJson))setLogos(logoJson);
    }finally{setCloudLoading(false)}
  }

  useEffect(()=>{void loadData()},[]);

  const base:any[][]=level==="FBS"?w.colleges:w.nonFbs;
  const cloudByTeam=useMemo(()=>new Map(cloud.filter(row=>row.subdivision===level).map(row=>[norm(row.team),row])),[cloud,level]);
  const overridesByTeam=useMemo(()=>{
    const map=new Map<string,Map<number,string>>();
    for(const item of overrides){
      if(item.subdivision!==level)continue;
      const key=norm(item.team),teamMap=map.get(key)||new Map<number,string>();
      teamMap.set(Number(item.columnIndex),item.value);
      map.set(key,teamMap);
    }
    return map;
  },[overrides,level]);
  const rows=useMemo(()=>base.map((r:any[],i:number)=>{
    if(i<2)return r;
    let n=[...r];
    const c=cloudByTeam.get(norm(r[1]));
    if(c){
      const map:[number,string][]=[[2,"playersToScout"],[3,"players"],[4,"games"],[5,"completions"],[6,"passAttempts"],[7,"passYards"],[8,"passYardsPerAttempt"],[9,"passYardsPerCompletion"],[10,"passTDs"],[11,"passInterceptions"],[14,"rushes"],[15,"rushYards"],[16,"yardsPerRush"],[17,"rushTDs"],[25,"yac"],[26,"airYards"]];
      for(const [idx,k] of map)if(c[k]!=null)n[idx]=c[k];
    }
    const manual=overridesByTeam.get(norm(r[1]));
    if(manual)for(const [idx,value] of manual)n[idx]=value;
    n=deriveOffense(n);
    if(manual)for(const [idx,value] of manual)n[idx]=value;
    return n;
  }),[base,cloudByTeam,overridesByTeam]);

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
      const teamCompare=String(a[1]||"").localeCompare(String(b[1]||""));
      if(sortKey==="school")return teamCompare;
      const index=sortKey==="prospects"?2:sortKey==="total"?22:sortKey==="passing"?13:19;
      const av=numeric(a[index])??-Infinity,bv=numeric(b[index])??-Infinity;
      return bv-av||teamCompare;
    });
  },[teamRows,query,prospectsOnly,sortKey]);

  const latestUpdate=useMemo(()=>cloud.reduce((latest,row)=>{
    const value=String(row.updatedAt||"");
    return value>latest?value:latest;
  },""),[cloud]);

  async function refreshNcaa(){
    if(level!=="FBS"||refreshState==="loading")return;
    setRefreshState("loading");
    setRefreshMessage("Fetching the current NCAA.com FBS passing and rushing tables…");
    try{
      const response=await fetch("/api/college-stats/refresh",{method:"POST"}),json=await response.json();
      if(!response.ok)throw new Error(json?.error||"NCAA refresh failed");
      await loadData();
      const unmatched=Number(json?.unmatched?.length||0);
      setRefreshState("success");
      setRefreshMessage(`Updated ${json.updated} FBS programs from NCAA.com${unmatched?` · ${unmatched} unmatched`:" · all workbook schools matched"}.`);
    }catch(e:unknown){
      setRefreshState("error");
      setRefreshMessage(e instanceof Error?e.message:"NCAA refresh failed");
    }
  }

  async function saveOverride(team:string,columnIndex:number,value:string){
    const key=`${level}|${team}|${columnIndex}`;
    setSavingCell(key);
    setOverrides(prev=>{
      const next=prev.filter(x=>!(x.team===team&&x.subdivision===level&&Number(x.columnIndex)===columnIndex));
      next.push({team,subdivision:level,columnIndex,value});
      return next;
    });
    try{
      const response=await fetch("/api/college-stats/overrides",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({team,subdivision:level,columnIndex,value})});
      const json=await response.json();
      if(!response.ok)throw new Error(json?.error||"Could not save workbook edit");
      setRefreshMessage(`Saved ${team} workbook edit.`);
      setRefreshState("success");
    }catch(e:unknown){
      setRefreshState("error");
      setRefreshMessage(e instanceof Error?e.message:"Could not save workbook edit");
      await loadData();
    }finally{setSavingCell("")}
  }

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}>College Data Center</div>
        <h1>{level==="FBS"?"Colleges · Players + Stats":"Non-FBS · Players + Stats"}</h1>
        <p>Start with the programs that matter to the 2027 draft pool, then drill into passing, rushing, total offense and usage without living inside a giant spreadsheet.</p>
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
        Has Players to Scout
      </button>

      <label className={styles.sortControl}>Sort
        <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
          <option value="prospects">Players to scout</option>
          <option value="school">School A–Z</option>
          <option value="total">Total offense / game</option>
          <option value="passing">Passing / game</option>
          <option value="rushing">Rushing / game</option>
        </select>
      </label>

      <button className={[styles.refreshButton,refreshState==="loading"?styles.refreshing:""].filter(Boolean).join(" ")} onClick={refreshNcaa} disabled={level!=="FBS"||refreshState==="loading"} title={level!=="FBS"?"The original NCAA refresh script covers FBS teams.":"Refresh all FBS team stats from NCAA.com"}>
        {refreshState==="loading"?"Refreshing…":"Refresh NCAA Stats"}
      </button>

      <div className={styles.segmented} aria-label="View mode">
        <button className={view==="overview"?styles.active:""} onClick={()=>setView("overview")}>Overview</button>
        <button className={view==="workbook"?styles.active:""} onClick={()=>setView("workbook")}>Workbook</button>
      </div>
    </section>

    <div className={styles.resultsMeta}>
      <div><strong>{visibleRows.length}</strong> of {teamRows.length} programs shown{prospectsOnly?" · players-to-scout filter on":""}</div>
      <div className={styles.syncState}><i className={cloud.length?styles.live:cloudLoading?styles.loading:""}/>{cloudLoading?"Checking college stats…":cloud.length?`${cloud.length} cloud team records${latestUpdate?" · synced":""}`:"Workbook reference data"}</div>
    </div>

    {refreshMessage&&<div className={[styles.refreshNotice,refreshState==="error"?styles.refreshError:refreshState==="success"?styles.refreshSuccess:""].filter(Boolean).join(" ")}><span>{refreshMessage}</span>{latestUpdate&&refreshState!=="loading"?<time>{new Date(latestUpdate).toLocaleString()}</time>:null}</div>}

    {view==="overview"?<section className={styles.teamList}>
      {visibleRows.map((r:any[],ri:number)=>{
        const team=String(r[1]),prospects=splitPlayers(r[3]),passShare=numeric(r[27]),logo=logos[team]||"";
        return <article className={styles.teamCard} key={team+"-"+ri}>
          <header className={styles.teamHeader}>
            <div className={styles.teamRibbon} style={schoolStyle(team)}>
              <div className={styles.teamIdentity}>
                {logo?<div className={styles.teamLogo}><Image src={logo} alt="" width={48} height={48} sizes="48px"/></div>:null}
                <div className={styles.teamNameBlock}>
                  <strong>{team}</strong>
                  <span>{display(r[4])} games · {display(r[2])} player{count(r[2])===1?"":"s"} to scout</span>
                </div>
              </div>
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
            <summary><span>Full offense profile</span><b>Workbook detail</b></summary>
            <div className={styles.detailGrid}>
              {DETAIL_GROUPS.map(group=><section key={group.label}>
                <h3>{group.label}</h3>
                <dl>{group.items.map(([label,index])=><div key={label}><dt>{label}</dt><dd>{display(r[index])}</dd></div>)}</dl>
              </section>)}
            </div>
          </details>
        </article>;
      })}
      {!visibleRows.length&&<div className={styles.emptyState}><strong>No programs match these filters.</strong><span>Clear the search or turn off Has Players to Scout.</span></div>}
    </section>:<section className={styles.workbookShell}>
      <div className={styles.workbookNote}>
        <div><strong>Editable workbook view</strong><span>Rank is removed. Click any non-team cell to edit; changes save automatically.</span></div>
        <small>NCAA refresh replaces NCAA-driven offense fields. Manual fields such as YAC, Air Yards, and prospect notes remain yours.</small>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.workbookTable}>
          <thead>
            <tr>{GROUPS.map(g=><th key={g.start} colSpan={g.count} className={[statTone(g.start),g.start===1?styles.stickyTeam:""].filter(Boolean).join(" ")}>{display(rows?.[0]?.[g.start])}</th>)}</tr>
            <tr>{WORKBOOK_COLUMNS.map(ci=><th key={ci} className={[statTone(ci),ci===1?styles.stickyTeam:""].filter(Boolean).join(" ")}>{display(rows?.[1]?.[ci])}</th>)}</tr>
          </thead>
          <tbody>{visibleRows.map((r:any[],ri:number)=>{
            const team=String(r[1]);
            return <tr key={team+"-"+ri}>{WORKBOOK_COLUMNS.map(ci=>{
              const cellKey=`${level}|${team}|${ci}`,isTeam=ci===1;
              return <td key={ci} className={[isTeam?styles.stickyTeam:styles.editableCell,ci===3?styles.playersCell:"",savingCell===cellKey?styles.savingCell:""].filter(Boolean).join(" ")} style={isTeam?schoolStyle(team):undefined} contentEditable={!isTeam} suppressContentEditableWarning onBlur={isTeam?undefined:e=>{const value=e.currentTarget.textContent||"";if(value!==display(r[ci]))void saveOverride(team,ci,value)}} onKeyDown={isTeam?undefined:e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}if(e.key==="Escape"){e.preventDefault();e.currentTarget.textContent=display(r[ci]);e.currentTarget.blur()}}}>{display(r?.[ci])}</td>;
            })}</tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
  </div>;
}
