"use client";

import {Fragment,useEffect,useMemo,useState} from "react";
import PlayerName from "@/components/PlayerName";
import {schoolStyle} from "@/lib/school-colors";
import {useDraftClass} from "@/lib/use-draft-class";

type Pos="QB"|"RB"|"WR"|"TE";
type GradeRow={
  id:string|number;
  name:string;
  position:Pos;
  college?:string;
  draft_class:number;
  scouting_status?:string;
  headshot_url?:string;
  scoutingGrade:number|null;
  preDraftGrade:number|null;
  finalGrade:number|null;
  authoritativeGrade:number|null;
  gradeSource:"Pre-Draft"|"Final";
  draftResult?:string|null;
  draftTeam?:string|null;
};
type RankedRow=GradeRow&{
  sourceYear:number;
  sourceGrade:number|null;
  poolRank:number|null;
  positionRank:number|null;
  classOverallRank:number|null;
  classPositionRank:number|null;
  tier:number|null;
  tierGapBefore:number|null;
};

const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const TIER_GAP=2.5;
const SOURCE_YEARS:Record<number,number[]>={
  2022:[],
  2023:[2022,2023],
  2024:[2022,2023,2024],
  2025:[2022,2023,2024,2025],
  2026:[2022,2023,2024,2025,2026],
  2027:[2022,2023,2024,2025,2026,2027]
};

const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const asNum=(v:any)=>{const n=Number(v);return v==null||v===""||!Number.isFinite(n)?null:n};
const fmt=(v:number|null,digits=2)=>v==null?"—":v.toFixed(digits);
function posClass(position:Pos){return "history-pos history-pos-"+position.toLowerCase()}
function gradeTone(value:number|null){
  if(value==null)return "missing";
  if(value>=85)return "elite";
  if(value>=75)return "plus";
  if(value>=65)return "solid";
  if(value>=55)return "fringe";
  return "concern";
}
function heatColor(ratio:number){
  const r=Math.max(0,Math.min(1,ratio));
  return `hsl(${Math.round(r*120)} 72% 48%)`;
}
function rankRows(rows:(GradeRow&{sourceYear:number;sourceGrade:number|null;classOverallRank:number|null;classPositionRank:number|null})[]):RankedRow[]{
  const positionRanks=new Map<string,number>();
  for(const pos of POSITIONS){
    rows.filter(row=>row.position===pos&&row.sourceGrade!=null)
      .sort((a,b)=>(b.sourceGrade??-Infinity)-(a.sourceGrade??-Infinity)||b.sourceYear-a.sourceYear||a.name.localeCompare(b.name))
      .forEach((row,index)=>positionRanks.set(row.sourceYear+":"+String(row.id),index+1));
  }
  const sorted=[...rows].sort((a,b)=>{
    if(a.sourceGrade==null&&b.sourceGrade==null)return b.sourceYear-a.sourceYear||a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
    if(a.sourceGrade==null)return 1;
    if(b.sourceGrade==null)return -1;
    return b.sourceGrade-a.sourceGrade||b.sourceYear-a.sourceYear||a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
  });
  let rank=0,tier=1,previous:number|null=null;
  return sorted.map(row=>{
    const poolRank=row.sourceGrade==null?null:++rank;
    let rowTier:number|null=null,tierGapBefore:number|null=null;
    if(row.sourceGrade!=null){
      if(previous!=null){
        const gap=previous-row.sourceGrade;
        if(gap>=TIER_GAP){tier++;tierGapBefore=gap}
      }
      rowTier=tier;
      previous=row.sourceGrade;
    }
    return {...row,poolRank,positionRank:positionRanks.get(row.sourceYear+":"+String(row.id))??null,tier:rowTier,tierGapBefore};
  });
}

export default function Page(){
  const draftClass=useDraftClass();
  const sourceYears=SOURCE_YEARS[draftClass]||[];
  const [rows,setRows]=useState<RankedRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [position,setPosition]=useState<"ALL"|Pos>("ALL");
  const [classFilter,setClassFilter]=useState<"ALL"|number>("ALL");
  const [search,setSearch]=useState("");
  const [compactTiers,setCompactTiers]=useState(false);
  const [showGradeDetails,setShowGradeDetails]=useState(false);

  useEffect(()=>{
    setPosition("ALL");
    setClassFilter("ALL");
    setSearch("");
  },[draftClass]);

  useEffect(()=>{
    if(!sourceYears.length){setRows([]);setLoading(false);setError("");return}
    let live=true;
    setLoading(true);
    setError("");
    Promise.all(sourceYears.map(async year=>{
      const [gradesResponse,boardResponse]=await Promise.all([
        fetch("/api/grades?draftClass="+year,{cache:"no-store"}),
        fetch("/api/final-board/live?view=base&draftClass="+year,{cache:"no-store"})
      ]);
      const gradesData=await gradesResponse.json();
      const boardData=await boardResponse.json();
      if(!gradesResponse.ok)throw new Error(gradesData?.error||("Could not load "+year+" grades"));
      if(!boardResponse.ok)throw new Error(boardData?.error||("Could not load "+year+" Final Draft Board"));
      return {year,rows:Array.isArray(gradesData)?gradesData:[],boardRows:Array.isArray(boardData?.rows)?boardData.rows:[]};
    })).then(groups=>{
      if(!live)return;
      const combined:(GradeRow&{sourceYear:number;sourceGrade:number|null;classOverallRank:number|null;classPositionRank:number|null})[]=[];
      for(const group of groups){
        const boardRanks=new Map<string,{overallRank:number|null;positionRank:number|null}>();
        for(const boardRow of group.boardRows){
          boardRanks.set(String(boardRow.id),{
            overallRank:asNum(boardRow.overallRank),
            positionRank:asNum(boardRow.positionRank)
          });
        }
        for(const raw of group.rows){
          if(!POSITIONS.includes(raw.position))continue;
          const row=raw as GradeRow;
          const authoritative=asNum(row.authoritativeGrade);
          const final=asNum(row.finalGrade);
          const pre=asNum(row.preDraftGrade);
          const classRanks=boardRanks.get(String(row.id));
          combined.push({
            ...row,
            sourceYear:group.year,
            sourceGrade:authoritative??final??pre,
            classOverallRank:classRanks?.overallRank??null,
            classPositionRank:classRanks?.positionRank??null
          });
        }
      }
      setRows(rankRows(combined));
    }).catch((e:any)=>{if(live){setRows([]);setError(e?.message||"Could not build Historical Rankings")}})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[draftClass]);

  const visible=useMemo(()=>{
    const q=norm(search);
    return rows.filter(row=>
      (position==="ALL"||row.position===position)&&
      (classFilter==="ALL"||row.sourceYear===classFilter)&&
      (!q||norm(row.name+" "+(row.college||"")+" "+row.sourceYear).includes(q))
    );
  },[rows,position,classFilter,search]);

  const classCounts=useMemo(()=>Object.fromEntries(sourceYears.map(year=>[year,rows.filter(row=>row.sourceYear===year).length])),[rows,draftClass]);
  const top=rows.find(row=>row.sourceGrade!=null);
  const gradedCount=rows.filter(row=>row.sourceGrade!=null).length;

  function exportBoard(){
    const header=["OVR Rank","Class OVR Rank","Class","Pos Rank","Class Pos Rank","Position","Player","College","Grade Source","Pre-Draft Grade","Final Grade","Historical Grade","Draft Result"];
    const csv=[header,...rows.map(row=>[
      row.poolRank??"",row.classOverallRank??"",row.sourceYear,row.positionRank?row.position+" "+row.positionRank:"",row.classPositionRank?row.position+" "+row.classPositionRank:"",row.position,row.name,row.college||"",row.gradeSource||"",
      row.preDraftGrade==null?"":Number(row.preDraftGrade).toFixed(2),row.finalGrade==null?"":Number(row.finalGrade).toFixed(2),
      row.sourceGrade==null?"":row.sourceGrade.toFixed(2),row.draftResult||""
    ])].map(cols=>cols.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="rookie-draft-"+draftClass+"-historical-rankings.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if(draftClass===2022){
    return <div className="historical-rankings-page historical-unavailable">
      <div className="page-head historical-rankings-head">
        <div><div className="ey">2022 Rookie Class</div><h1>Historical Rankings</h1><p className="muted">Cross-class rankings begin once a prior draft class exists in the archive.</p></div>
      </div>
      <div className="historical-unavailable-card">
        <span className="historical-unavailable-icon">↺</span>
        <h2>Historical Rankings not yet available</h2>
        <p>2022 is the first class in the historical dataset, so there is no earlier rookie class to compare it against.</p>
      </div>
      <style jsx global>{historyStyles}</style>
    </div>;
  }

  if(!sourceYears.length){
    return <div className="historical-rankings-page historical-unavailable">
      <div className="page-head historical-rankings-head"><div><div className="ey">{draftClass} Rookie Class</div><h1>Historical Rankings</h1></div></div>
      <div className="historical-unavailable-card"><h2>Historical Rankings not yet available</h2><p>This draft class has not been configured for the historical comparison pool yet.</p></div>
      <style jsx global>{historyStyles}</style>
    </div>;
  }

  return <div className="historical-rankings-page">
    <div className="page-head historical-rankings-head">
      <div>
        <div className="ey">{draftClass} Rookie Class · Cross-Class Board</div>
        <h1>Historical Rankings</h1>
        <p className="muted">A Final Draft Board-style comparison of the selected {draftClass} class against every available class that came before it.</p>
      </div>
      <span className="status cloud">● {sourceYears.length} classes · {gradedCount} graded players</span>
    </div>

    <div className="history-rule-strip">
      <span><b>Comparison pool:</b> {sourceYears[0]}–{sourceYears[sourceYears.length-1]}, including the selected {draftClass} class.</span>
      <span><b>Apples-to-apples ranking:</b> exact Final Grade when available, otherwise Pre-Draft Grade. No league, positional-multiplier, or handcuff adjustments.</span>
    </div>

    <div className="history-summary-grid">
      <div><span>Classes</span><strong>{sourceYears.length}</strong><small>{sourceYears.join(" · ")}</small></div>
      <div><span>Prospects</span><strong>{rows.length}</strong><small>{gradedCount} with a ranking grade</small></div>
      <div><span>{draftClass} Class</span><strong>{classCounts[draftClass]||0}</strong><small>players in the focal class</small></div>
      <div><span>Top Historical Grade</span><strong>{top?fmt(top.sourceGrade):"—"}</strong><small>{top?top.name+" · "+top.sourceYear:"No graded prospects"}</small></div>
    </div>

    <div className="history-class-tabs" role="tablist" aria-label="Draft class filter">
      <button type="button" className={classFilter==="ALL"?"active":""} onClick={()=>setClassFilter("ALL")}>All Classes <span>{rows.length}</span></button>
      {[...sourceYears].reverse().map(year=><button type="button" key={year} className={(classFilter===year?"active ":"")+(year===draftClass?"focal":"")} onClick={()=>setClassFilter(year)}>
        {year}{year===draftClass&&<small>FOCAL</small>}<span>{classCounts[year]||0}</span>
      </button>)}
    </div>

    <div className="history-toolbar">
      <div className="history-search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player, college, or class…"/></div>
      <div className="history-position-filter" aria-label="Position filter">
        {(["ALL",...POSITIONS] as const).map(pos=><button key={pos} type="button" className={(position===pos?"active ":"")+(pos==="ALL"?"":posClass(pos))} onClick={()=>setPosition(pos)}>{pos}</button>)}
      </div>
      <div className="history-toolbar-options">
        <label className={"history-detail-toggle "+(compactTiers?"active":"")} title="Keep tier breaks but collapse them to a thin marker">
          <input type="checkbox" checked={compactTiers} onChange={e=>setCompactTiers(e.target.checked)}/><span>Compact tiers</span>
        </label>
        <label className={"history-detail-toggle "+(showGradeDetails?"active":"")} title="Show the underlying Pre-Draft and Final Draft grades">
          <input type="checkbox" checked={showGradeDetails} onChange={e=>setShowGradeDetails(e.target.checked)}/><span>Show grade details</span>
        </label>
      </div>
      <button type="button" className="ghost history-export" onClick={exportBoard}>Export CSV</button>
    </div>

    {error&&<div className="history-error">{error}</div>}

    <section className="history-board-card">
      <div className="history-board-card-head">
        <div><span className="ey">{classFilter==="ALL"?"All Eligible Classes":classFilter+" Class"}</span><h2>{draftClass} Historical Big Board</h2></div>
        <div className="history-auto-stack"><span>Automatically sorted by historical grade</span><small>Auto tiers · new tier at a {TIER_GAP.toFixed(1)}+ point drop</small></div>
      </div>

      {loading?<div className="history-loading">Building cross-class board…</div>:<div className="history-table-wrap">
        <table className="historical-board-table">
          <thead><tr>
            <th className="rank-col">OVR Rank</th>
            <th className="class-rank-col">Class OVR Rank</th>
            <th>Class</th>
            <th>Pos Rank</th>
            <th className="class-pos-rank-col">Class Pos Rank</th>
            <th>Prospect</th>
            {showGradeDetails&&<><th>Pre-Draft</th><th>Final</th><th>Source</th></>}
            <th className="history-grade-col">Historical Grade</th>
          </tr></thead>
          <tbody>
            {visible.map((row,index)=>{
              const previous=visible[index-1];
              const startsTier=row.tier!=null&&(index===0||previous?.tier!==row.tier);
              const tone=gradeTone(row.sourceGrade);
              return <Fragment key={row.sourceYear+":"+row.id}>
                {startsTier&&<tr className={"history-tier-row "+(compactTiers?"compact":"")}><td colSpan={showGradeDetails?10:7}>
                  <div className={"history-tier-break "+(compactTiers?"compact":"")} title={row.tier===1?"Tier 1 · Top historical grade cluster":"Tier "+row.tier+(row.tierGapBefore!=null?" · "+fmt(row.tierGapBefore)+" point drop":"")}>
                    <strong>{compactTiers?"T"+row.tier:"Tier "+row.tier}</strong>
                    {compactTiers?<i/>:<span>{row.tier===1?"Top historical grade cluster":row.tierGapBefore!=null?fmt(row.tierGapBefore)+" point drop from the previous prospect":"Automatic grade tier"}</span>}
                  </div>
                </td></tr>}
                <tr>
                  <td className="history-overall-rank">{row.poolRank??"—"}</td>
                  <td className="history-class-overall-rank"><span>{row.classOverallRank??"—"}</span></td>
                  <td><span className={"history-year year-"+row.sourceYear+(row.sourceYear===draftClass?" focal":"")}>{row.sourceYear}{row.sourceYear===draftClass&&<small>FOCAL</small>}</span></td>
                  <td><span className={posClass(row.position)}>{row.position}{row.positionRank??"—"}</span></td>
                  <td><span className={"history-class-pos-rank "+posClass(row.position)}>{row.position}{row.classPositionRank??"—"}</span></td>
                  <td>
                    <div className="history-player">
                      <div className="history-player-main"><PlayerName id={row.id} className="history-player-name">{row.name}</PlayerName><span className="history-college" style={schoolStyle(row.college)}>{row.college||"—"}</span></div>
                      {row.draftResult&&<small>{row.draftResult}</small>}
                    </div>
                  </td>
                  {showGradeDetails&&<>
                    <td className="history-detail-grade">{fmt(asNum(row.preDraftGrade))}</td>
                    <td className="history-detail-grade">{fmt(asNum(row.finalGrade))}</td>
                    <td><span className={"history-grade-source "+(row.gradeSource==="Final"?"final":"pre")}>{row.gradeSource==="Final"?"Final Draft":"Pre-Draft"}</span></td>
                  </>}
                  <td>{row.sourceGrade==null?<span className="history-incomplete">—</span>:<div className={"history-grade "+tone}>
                    <strong>{fmt(row.sourceGrade)}</strong>
                    <input className="qb-grade-slider heat history-grade-slider" style={{"--heat":heatColor(row.sourceGrade/100)} as any} type="range" min="0" max="100" step=".25" value={Math.max(0,Math.min(100,row.sourceGrade))} readOnly tabIndex={-1} aria-label={row.name+" historical grade "+fmt(row.sourceGrade)}/>
                  </div>}</td>
                </tr>
              </Fragment>;
            })}
          </tbody>
        </table>
        {!visible.length&&!error&&<div className="history-empty">No prospects match the current filters.</div>}
      </div>}
    </section>
    <style jsx global>{historyStyles}</style>
  </div>;
}

const historyStyles=`
  .historical-rankings-page{max-width:1560px;margin:0 auto}
  .historical-rankings-head{align-items:center;margin-bottom:12px}
  .historical-rankings-head p{max-width:900px;margin:5px 0 0;line-height:1.5}
  .history-rule-strip{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:13px;padding:10px 13px;border:1px solid #20395f;border-radius:10px;background:#0a172a;color:#93a9c7;font-size:11px}
  .history-rule-strip b{color:#dce8f6}
  .history-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:12px}
  .history-summary-grid>div{min-width:0;padding:12px 13px;border:1px solid #20395f;border-radius:11px;background:linear-gradient(180deg,#0d1e35,#09172a)}
  .history-summary-grid span{display:block;color:#8099bb;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
  .history-summary-grid strong{display:block;margin-top:4px;color:#f0f6ff;font-size:23px;font-variant-numeric:tabular-nums}
  .history-summary-grid small{display:block;overflow:hidden;margin-top:3px;color:#7890b0;font-size:9px;white-space:nowrap;text-overflow:ellipsis}
  .history-class-tabs{display:flex;gap:7px;overflow-x:auto;padding:2px 0 11px}
  .history-class-tabs button{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;background:#0c1d35;border:1px solid #29476e;color:#9eb2ce;border-radius:9px;padding:8px 11px;font-size:11px;font-weight:900}
  .history-class-tabs button:hover{background:#132a49;color:#fff}
  .history-class-tabs button.active{background:#173e67;border-color:#20e2dd;color:#fff;box-shadow:inset 0 -2px 0 #20e2dd}
  .history-class-tabs button.focal:not(.active){border-color:#5b567d}
  .history-class-tabs button small{padding:2px 4px;border-radius:999px;background:#704fc1;color:#f0eaff;font-size:7px;letter-spacing:.06em}
  .history-class-tabs button span{min-width:20px;padding:2px 5px;border-radius:999px;background:#08172a;color:#718cac;font-size:9px;font-variant-numeric:tabular-nums}
  .history-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto auto;gap:10px;align-items:center;margin-bottom:12px}
  .history-search-wrap{position:relative}
  .history-search-wrap>span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#6884a9;font-size:18px;pointer-events:none}
  .history-search-wrap input{height:40px;padding-left:36px;background:#08172a}
  .history-position-filter{display:flex;gap:5px}
  .history-position-filter button{min-width:43px;height:38px;padding:0 10px;background:#10213a;border:1px solid #29476e;color:#9eb2ce}
  .history-position-filter button.active{outline:2px solid #dfeaff;outline-offset:-2px;color:#fff}
  .history-position-filter .history-pos{min-width:43px;border-radius:8px}
  .history-toolbar-options{display:flex;gap:6px;align-items:center}
  .history-detail-toggle{display:flex;align-items:center;gap:7px;height:40px;padding:0 11px;border:1px solid #29476e;border-radius:8px;background:#0c1d35;color:#a8bad2;font-size:10px;font-weight:900;white-space:nowrap;cursor:pointer}
  .history-detail-toggle input{width:14px;height:14px;margin:0;padding:0;accent-color:#20e2dd}
  .history-detail-toggle:hover,.history-detail-toggle.active{background:#132a49;color:#fff;border-color:#3f668f}
  .history-export{height:40px;white-space:nowrap}
  .history-error{margin:0 0 12px;padding:10px 12px;border:1px solid #7a3341;border-radius:9px;background:#351a23;color:#ffc0c8;font-weight:800}
  .history-board-card{overflow:hidden;border:1px solid #20395f;border-radius:14px;background:#081426;box-shadow:0 16px 40px rgba(0,0,0,.16)}
  .history-board-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;background:linear-gradient(180deg,#10223d,#0b1a30);border-bottom:1px solid #20395f}
  .history-board-card-head h2{margin:2px 0 0;font-size:20px}
  .history-auto-stack{display:grid;justify-items:end;gap:4px;color:#7f98ba;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.065em}
  .history-auto-stack small{color:#58a7ff;font-size:9px;font-weight:850;text-transform:none;letter-spacing:0}
  .history-table-wrap{overflow:auto;max-height:calc(100vh - 365px)}
  .historical-board-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}
  .historical-board-table th{position:sticky;top:0;z-index:8;background:#10223d;color:#8fa7c8;padding:10px 12px;border-bottom:1px solid #31527f;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.075em}
  .historical-board-table th.rank-col,.historical-board-table td.history-overall-rank{text-align:center;width:72px;white-space:nowrap}
  .historical-board-table th.class-rank-col,.historical-board-table th.class-pos-rank-col{min-width:86px;white-space:nowrap}
  .historical-board-table th.history-grade-col{min-width:175px}
  .historical-board-table td{padding:10px 12px;border-bottom:1px solid #172d4d;background:#09172a;color:#dce7f6;vertical-align:middle}
  .historical-board-table tbody tr:not(.history-tier-row):nth-child(even) td{background:#0b1b31}
  .historical-board-table tbody tr:not(.history-tier-row):hover td{background:#102642}
  .historical-board-table tbody tr:last-child td{border-bottom:0}
  .history-tier-row td{padding:0!important;border-bottom:1px solid #31527f!important;background:#071426!important}
  .history-tier-break{display:flex;align-items:center;gap:10px;padding:8px 12px;background:linear-gradient(90deg,rgba(88,167,255,.16),rgba(32,226,221,.04) 45%,transparent);border-left:3px solid #58a7ff}
  .history-tier-break strong{color:#eaf3ff;font-size:10px;font-weight:950;letter-spacing:.09em;text-transform:uppercase}
  .history-tier-break span{color:#7794ba;font-size:9px;font-weight:800}
  .history-tier-row.compact td{border-bottom:0!important;background:#081426!important}
  .history-tier-break.compact{gap:7px;min-height:12px;padding:2px 11px;background:transparent;border-left:0}
  .history-tier-break.compact strong{display:inline-grid;place-items:center;min-width:24px;height:14px;padding:0 4px;border:1px solid #416b98;border-radius:999px;background:#102743;color:#9ccaff;font-size:7px;letter-spacing:.04em}
  .history-tier-break.compact i{display:block;flex:1;height:1px;background:linear-gradient(90deg,#4d82b9,rgba(32,226,221,.32),rgba(49,82,127,.2));border-radius:999px}
  .history-overall-rank{font-size:20px;font-weight:950;color:#eef5ff!important}
  .history-class-overall-rank{text-align:center}
  .history-class-overall-rank span{display:inline-grid;place-items:center;min-width:31px;height:25px;padding:0 7px;border:1px solid #36587e;border-radius:7px;background:#0e2139;color:#b9cbe0;font-size:11px;font-weight:950}
  .history-pos{display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:5px 8px;border-radius:6px;color:#06101e;font-size:11px;font-weight:950}
  .history-pos-qb{background:#fc2b6d;color:#fff!important}
  .history-pos-rb{background:#20ceb7}
  .history-pos-wr{background:#58a7ff}
  .history-pos-te{background:#fead58}
  .history-class-pos-rank.history-pos{background:transparent!important;border:1px solid currentColor;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
  .history-class-pos-rank.history-pos-qb{color:#ff7ba3!important}.history-class-pos-rank.history-pos-rb{color:#69e6d4!important}.history-class-pos-rank.history-pos-wr{color:#8bc4ff!important}.history-class-pos-rank.history-pos-te{color:#ffc98d!important}
  .history-year{display:inline-flex;align-items:center;gap:5px;min-width:58px;justify-content:center;padding:5px 8px;border:1px solid #345273;border-radius:999px;background:#0e223c;color:#c9d9ed;font-size:10px;font-weight:950}
  .history-year small{padding:2px 4px;border-radius:999px;background:#704fc1;color:#f0eaff;font-size:6px;letter-spacing:.05em}
  .history-year.year-2022{border-color:#516276;background:#172333}.history-year.year-2023{border-color:#55528a;background:#1c1d3c}.history-year.year-2024{border-color:#2e6c86;background:#0c2936}.history-year.year-2025{border-color:#337258;background:#102c25}.history-year.year-2026{border-color:#8a6439;background:#332414}.history-year.year-2027{border-color:#6d4e8e;background:#281a39}
  .history-year.focal{box-shadow:0 0 0 1px rgba(255,255,255,.08) inset}
  .history-player{display:grid;gap:4px;min-width:260px}
  .history-player-main{display:flex;align-items:center;gap:9px;min-width:0}
  .history-player-name{font-size:14px!important;font-weight:950!important;color:#f5f8fc!important;white-space:nowrap}
  .history-college{display:inline-flex;align-items:center;min-height:23px;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:900;white-space:nowrap}
  .history-player small{color:#738dac;font-size:10px}
  .history-detail-grade{font-weight:900;color:#c9d8eb}
  .history-grade-source{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;border:1px solid;white-space:nowrap}
  .history-grade-source.pre{color:#8ff0e9;border-color:#1e817d;background:rgba(32,226,221,.08)}
  .history-grade-source.final{color:#ffe39a;border-color:#876923;background:rgba(255,209,102,.09)}
  .history-grade{display:grid;grid-template-columns:52px minmax(110px,1fr);gap:11px;align-items:center;min-width:185px}
  .history-grade strong{font-size:16px;text-align:right}
  .history-grade-slider{width:100%!important;margin:0!important;pointer-events:none}
  .history-grade.elite strong{color:#62e889}.history-grade.plus strong{color:#8ee8b1}.history-grade.solid strong{color:#dce8f6}.history-grade.fringe strong{color:#ffd166}.history-grade.concern strong{color:#ff8e9d}
  .history-incomplete{color:#667f9f;font-size:11px;font-weight:800}
  .history-loading,.history-empty{padding:34px;text-align:center;color:#8fa7c8}
  .historical-unavailable-card{display:grid;place-items:center;max-width:720px;margin:70px auto 0;padding:48px 28px;border:1px solid #29476e;border-radius:16px;background:linear-gradient(180deg,#0d2038,#081628);text-align:center;box-shadow:0 18px 55px rgba(0,0,0,.18)}
  .historical-unavailable-icon{display:grid;place-items:center;width:52px;height:52px;margin-bottom:12px;border:1px solid #3c638c;border-radius:50%;background:#102743;color:#8ec9ff;font-size:25px;font-weight:900}
  .historical-unavailable-card h2{margin:0;color:#edf5ff;font-size:24px}.historical-unavailable-card p{max-width:520px;margin:9px 0 0;color:#829abc;line-height:1.55}
  @media(max-width:1100px){.history-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.history-toolbar{grid-template-columns:1fr auto auto}.history-position-filter{grid-column:1/-1;overflow:auto}.history-table-wrap{max-height:none}}
  @media(max-width:700px){.historical-rankings-head{display:block}.historical-rankings-head .status{display:inline-flex;margin-top:10px}.history-summary-grid{grid-template-columns:1fr 1fr}.history-toolbar{grid-template-columns:1fr}.history-position-filter{grid-column:auto}.history-toolbar-options{display:grid;width:100%}.history-detail-toggle,.history-export{width:100%}.history-detail-toggle{justify-content:center}.history-board-card-head{display:block}.history-auto-stack{justify-items:start;margin-top:8px}.history-player-main{align-items:flex-start;flex-direction:column;gap:5px}.history-rule-strip{display:grid}.historical-unavailable-card{margin-top:30px}}
`;
