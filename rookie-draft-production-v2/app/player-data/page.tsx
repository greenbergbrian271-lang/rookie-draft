"use client";

import {useMemo,useState} from "react";
import {ArrowDown,ArrowUp,ArrowUpDown,Columns3,RotateCcw,Search} from "lucide-react";
import {workbookSecondary as w} from "@/lib/workbook-secondary";

type Cell=string|number|boolean|null|undefined;
type Row=readonly Cell[];
type Position="QB"|"RB"|"WR"|"TE";
type SortState={column:number;direction:"asc"|"desc"}|null;

const sources:Record<Position,readonly Row[]>={
  QB:w.qbData as readonly Row[],
  RB:w.rbData as readonly Row[],
  WR:w.wrData as readonly Row[],
  TE:w.teData as readonly Row[],
};
const positions:Position[]=["QB","RB","WR","TE"];

const text=(value:Cell)=>value==null?"":String(value).trim();
const filled=(row:Row)=>row.some(value=>text(value)!=="");
const toNumber=(value:Cell)=>{
  if(typeof value==="number"&&Number.isFinite(value))return value;
  const raw=text(value);
  if(!raw)return null;
  const normalized=raw.replace(/[%,$]/g,"").replace(/,/g,"");
  if(!/^-?\d*\.?\d+$/.test(normalized))return null;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
};
const compare=(a:Cell,b:Cell)=>{
  const na=toNumber(a),nb=toNumber(b);
  if(na!=null&&nb!=null)return na-nb;
  return text(a).localeCompare(text(b),undefined,{numeric:true,sensitivity:"base"});
};
const kindFor=(label:string,index:number)=>{
  const key=label.toLowerCase();
  if(index===0||/player|name/.test(key))return "identity";
  if(index===1||/college|school|team/.test(key))return "school";
  if(/grade|score|rank|rating|percentile/.test(key))return "grade";
  if(/height|weight|age|class|dash|forty|40|hand|arm|bmi/.test(key))return "bio";
  if(/target|reception|catch|route|snap|rush|attempt|yard|touchdown|\btd\b|pass|pressure|sack|drop|epa|ypa|ypc|share|rate|%/.test(key))return "metric";
  return "default";
};

export default function Page(){
  const [position,setPosition]=useState<Position>("QB");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<SortState>(null);
  const [compact,setCompact]=useState(true);
  const [showEmptyColumns,setShowEmptyColumns]=useState(false);

  const source=sources[position];
  const body=useMemo(()=>source.slice(1).filter(filled),[source]);
  const width=useMemo(()=>Math.max(source[0]?.length||0,...body.map(row=>row.length)),[source,body]);
  const headers=useMemo(()=>Array.from({length:width},(_,i)=>text(source[0]?.[i])||`Metric ${i+1}`),[source,width]);
  const visibleColumns=useMemo(()=>Array.from({length:width},(_,i)=>i).filter(i=>showEmptyColumns||text(source[0]?.[i])!==""||body.some(row=>text(row[i])!=="")),[width,showEmptyColumns,source,body]);
  const normalizedQuery=query.trim().toLowerCase();
  const filtered=useMemo(()=>body.filter(row=>!normalizedQuery||row.some(cell=>text(cell).toLowerCase().includes(normalizedQuery))),[body,normalizedQuery]);
  const rows=useMemo(()=>{
    if(!sort)return filtered;
    const next=[...filtered];
    next.sort((a,b)=>compare(a[sort.column],b[sort.column])*(sort.direction==="asc"?1:-1));
    return next;
  },[filtered,sort]);

  const datasetCounts=useMemo(()=>Object.fromEntries(positions.map(pos=>[pos,sources[pos].slice(1).filter(filled).length])) as Record<Position,number>,[]);
  const sortedHeader=sort?headers[sort.column]:"";
  const hasViewChanges=query!==""||sort!==null||!compact||showEmptyColumns;

  function toggleSort(column:number){
    setSort(current=>{
      if(!current||current.column!==column)return {column,direction:"asc"};
      if(current.direction==="asc")return {column,direction:"desc"};
      return null;
    });
  }
  function resetView(){
    setQuery("");
    setSort(null);
    setCompact(true);
    setShowEmptyColumns(false);
  }
  function selectPosition(next:Position){
    setPosition(next);
    setQuery("");
    setSort(null);
    setShowEmptyColumns(false);
  }

  return <div className="player-data-page" data-position={position}>
    <section className="pd-hero">
      <div className="pd-hero-copy">
        <span className="ey">Scouting Database</span>
        <h1>Player Data</h1>
        <p>One clean workspace for the underlying positional datasets. Search every field, sort any metric, and keep player identity pinned while you scan wide tables.</p>
      </div>
      <div className="pd-summary">
        <div><span>Position</span><strong>{position}</strong></div>
        <div><span>Players</span><strong>{body.length}</strong></div>
        <div><span>Metrics</span><strong>{visibleColumns.length}</strong></div>
      </div>
    </section>

    <nav className="pd-position-tabs" aria-label="Player data position">
      {positions.map(pos=><button key={pos} className={position===pos?"active":""} aria-pressed={position===pos} onClick={()=>selectPosition(pos)}>
        <span className="pd-position-mark">{pos}</span>
        <span className="pd-position-copy"><b>{pos} Data</b><small>{datasetCounts[pos]} players</small></span>
      </button>)}
    </nav>

    <section className="pd-controls" aria-label="Player data controls">
      <label className="pd-search">
        <Search size={17} aria-hidden="true"/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${position} players, schools or metrics…`} aria-label={`Search ${position} player data`}/>
        {query&&<button type="button" onClick={()=>setQuery("")} aria-label="Clear search">×</button>}
      </label>
      <div className="pd-control-group">
        <label className="pd-switch">
          <input type="checkbox" checked={showEmptyColumns} onChange={e=>setShowEmptyColumns(e.target.checked)}/>
          <span aria-hidden="true"/>
          <em><Columns3 size={14}/>Empty columns</em>
        </label>
        <label className="pd-switch">
          <input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/>
          <span aria-hidden="true"/>
          <em>Compact rows</em>
        </label>
        <button className="pd-reset" type="button" onClick={resetView} disabled={!hasViewChanges}><RotateCcw size={14}/>Reset</button>
      </div>
    </section>

    <section className="pd-table-card">
      <header className="pd-table-card-head">
        <div>
          <span className="pd-kicker">{position} dataset</span>
          <h2>{rows.length===body.length?`${body.length} players`:`${rows.length} of ${body.length} players`}</h2>
        </div>
        <div className="pd-table-status">
          {sort?<span>Sorted by <b>{sortedHeader}</b> · {sort.direction==="asc"?"ascending":"descending"}</span>:<span>Click any column header to sort</span>}
          <span>{visibleColumns.length} visible columns</span>
        </div>
      </header>

      <div className={`pd-table-wrap ${compact?"compact":""}`}>
        <table className="pd-table">
          <thead><tr>
            {visibleColumns.map((column,displayIndex)=>{
              const active=sort?.column===column;
              return <th key={column} data-kind={kindFor(headers[column],column)} className={displayIndex<2?`pd-sticky-col pd-sticky-${displayIndex+1}`:""}>
                <button type="button" onClick={()=>toggleSort(column)} className={active?"sorted":""} title={`Sort by ${headers[column]}`}>
                  <span>{headers[column]}</span>
                  {active?(sort?.direction==="asc"?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={12}/>}
                </button>
              </th>;
            })}
          </tr></thead>
          <tbody>
            {rows.length?rows.map((row,rowIndex)=><tr key={`${text(row[0])||"row"}-${rowIndex}`}>
              {visibleColumns.map((column,displayIndex)=>{
                const value=text(row[column]);
                const numeric=toNumber(row[column])!=null&&column>1;
                return <td key={column} data-kind={kindFor(headers[column],column)} data-empty={!value||undefined} className={`${displayIndex<2?`pd-sticky-col pd-sticky-${displayIndex+1}`:""} ${numeric?"numeric":""}`}>
                  {value||<span className="pd-empty-value">—</span>}
                </td>;
              })}
            </tr>):<tr><td className="pd-no-results" colSpan={Math.max(visibleColumns.length,1)}>No players match “{query}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <style jsx global>{`
      .player-data-page{--pd-accent:#fc2b6d;--pd-accent-soft:rgba(252,43,109,.13);display:grid;gap:14px;min-width:0}
      .player-data-page[data-position="RB"]{--pd-accent:#20ceb7;--pd-accent-soft:rgba(32,206,183,.13)}
      .player-data-page[data-position="WR"]{--pd-accent:#58a7ff;--pd-accent-soft:rgba(88,167,255,.13)}
      .player-data-page[data-position="TE"]{--pd-accent:#fead58;--pd-accent-soft:rgba(254,173,88,.14)}
      .pd-hero{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:28px;overflow:hidden;padding:24px 26px;border:1px solid #20395f;border-radius:18px;background:radial-gradient(circle at 100% 0,var(--pd-accent-soft),transparent 42%),linear-gradient(135deg,#0d1d34,#081528 72%);box-shadow:0 18px 48px rgba(0,0,0,.18)}
      .pd-hero:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--pd-accent)}
      .pd-hero-copy{max-width:760px}.pd-hero-copy h1{font-size:34px;line-height:1.05;margin:5px 0 9px;letter-spacing:-.025em}.pd-hero-copy p{margin:0;color:#91a7c5;line-height:1.55;max-width:710px}
      .pd-summary{display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:8px;min-width:330px}
      .pd-summary div{padding:11px 13px;border:1px solid #284467;border-radius:12px;background:rgba(5,15,29,.55);backdrop-filter:blur(8px)}
      .pd-summary span{display:block;color:#7e96b7;text-transform:uppercase;letter-spacing:.08em;font-size:9px;font-weight:950}.pd-summary strong{display:block;margin-top:4px;font-size:21px;font-variant-numeric:tabular-nums}
      .pd-position-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .pd-position-tabs button{position:relative;justify-content:flex-start;gap:10px;min-width:0;padding:11px 13px;background:#0b1a30;border:1px solid #20395f;color:#9db0cb;border-radius:12px;text-align:left;transition:.15s ease}
      .pd-position-tabs button:hover{border-color:#36567e;background:#10243f;color:#eaf2ff}.pd-position-tabs button.active{border-color:color-mix(in srgb,var(--pd-accent) 58%,#31527f);background:var(--pd-accent-soft);color:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-accent) 25%,transparent)}
      .pd-position-mark{display:grid;place-items:center;min-width:37px;height:32px;border-radius:8px;background:#142844;border:1px solid #29476e;font-size:11px;font-weight:950;letter-spacing:.04em}.pd-position-tabs button.active .pd-position-mark{background:var(--pd-accent);border-color:var(--pd-accent);color:#06101e}
      .pd-position-copy{min-width:0}.pd-position-copy b,.pd-position-copy small{display:block}.pd-position-copy b{font-size:12px}.pd-position-copy small{margin-top:2px;color:#718aab;font-size:9px}.pd-position-tabs button.active small{color:#aebfd5}
      .pd-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid #20395f;border-radius:13px;background:#09172b}
      .pd-search{display:grid;grid-template-columns:auto minmax(180px,420px) auto;align-items:center;gap:8px;min-width:min(520px,55vw);padding:0 10px;border:1px solid #29476e;border-radius:10px;background:#071426;color:#6983a6}
      .pd-search:focus-within{border-color:#4b719e;box-shadow:0 0 0 3px rgba(88,167,255,.08)}.pd-search input{height:38px;padding:0;border:0;background:transparent;outline:0}.pd-search button{width:25px;height:25px;padding:0;background:transparent;color:#7189aa;font-size:18px}.pd-search button:hover{color:#fff}
      .pd-control-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.pd-switch{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #20395f;border-radius:9px;background:#0c1d35;cursor:pointer}.pd-switch input{position:absolute;opacity:0;pointer-events:none}.pd-switch>span{position:relative;width:28px;height:16px;border-radius:999px;background:#233b5a;transition:.15s}.pd-switch>span:after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#8398b4;transition:.15s}.pd-switch input:checked+span{background:var(--pd-accent)}.pd-switch input:checked+span:after{transform:translateX(12px);background:#06101e}.pd-switch em{display:flex;align-items:center;gap:5px;color:#a7bad3;font-style:normal;font-size:10px;font-weight:850;white-space:nowrap}
      .pd-reset{gap:6px;padding:8px 10px;background:transparent;border:1px solid #29476e;color:#a7bad3;font-size:10px}.pd-reset:hover:not(:disabled){background:#132741;color:#fff}.pd-reset:disabled{opacity:.38;cursor:default}
      .pd-table-card{min-width:0;border:1px solid #20395f;border-radius:15px;background:#081528;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.14)}
      .pd-table-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:15px 17px;border-bottom:1px solid #20395f;background:linear-gradient(180deg,#0d1e35,#0a192d)}
      .pd-kicker{display:block;color:var(--pd-accent);font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.12em}.pd-table-card-head h2{margin:4px 0 0;font-size:19px}.pd-table-status{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.pd-table-status>span{padding:5px 8px;border:1px solid #284467;border-radius:999px;background:#081426;color:#7f97b7;font-size:9px;font-weight:800}.pd-table-status b{color:#dce8f7}
      .pd-table-wrap{overflow:auto;max-height:calc(100vh - 330px);min-height:360px;scrollbar-color:#29476e #071426;scrollbar-width:thin}
      .pd-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:11px;color:#dbe7f6;font-variant-numeric:tabular-nums}
      .pd-table th,.pd-table td{min-width:112px;max-width:220px;border-right:1px solid #162c49;border-bottom:1px solid #162c49;padding:10px 11px;background:#0a192d;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
      .pd-table th{position:sticky;top:0;z-index:8;padding:0;background:#10233c;border-bottom-color:#29476e}
      .pd-table th button{width:100%;min-height:42px;justify-content:space-between;gap:8px;padding:9px 10px;border:0;border-radius:0;background:transparent;color:#8fa6c6;text-align:left;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.045em}
      .pd-table th button:hover{background:#152d4b;color:#fff}.pd-table th button.sorted{background:var(--pd-accent-soft);color:#fff;box-shadow:inset 0 -2px 0 var(--pd-accent)}
      .pd-table th[data-kind="identity"] button,.pd-table th[data-kind="school"] button{color:#e3edf9}.pd-table th[data-kind="grade"] button{color:#9fe0ff}.pd-table th[data-kind="bio"] button{color:#c6b6ff}
      .pd-table tbody tr:nth-child(even) td{background:#09172a}.pd-table tbody tr:hover td{background:#10243c}.pd-table tbody tr:hover .pd-sticky-col{background:#122945}
      .pd-table td.numeric{text-align:right;color:#c9d9ec}.pd-table td[data-kind="identity"]{font-weight:900;color:#f4f7fb}.pd-table td[data-kind="school"]{color:#aec0d8;font-weight:800}.pd-table td[data-kind="grade"]{color:#a9e2ff;font-weight:900}.pd-table td[data-empty="true"]{color:#4f6787}
      .pd-table .pd-sticky-col{position:sticky;z-index:5}.pd-table .pd-sticky-1{left:0;min-width:190px;max-width:190px}.pd-table .pd-sticky-2{left:190px;min-width:160px;max-width:160px;box-shadow:5px 0 12px rgba(0,0,0,.14)}
      .pd-table th.pd-sticky-col{z-index:12}.pd-table th.pd-sticky-1,.pd-table th.pd-sticky-2{background:#132741}.pd-table tbody .pd-sticky-col{background:#0b1b30}
      .pd-table-wrap.compact .pd-table td{padding-top:6px;padding-bottom:6px}.pd-table-wrap.compact .pd-table th button{min-height:35px;padding-top:7px;padding-bottom:7px}
      .pd-empty-value{color:#405978}.pd-no-results{height:260px!important;text-align:center!important;color:#7891b2!important;background:#081528!important;font-size:12px}
      @media(max-width:1080px){.pd-hero{align-items:flex-start}.pd-summary{min-width:285px}.pd-search{min-width:360px}.pd-control-group{justify-content:flex-start}.pd-controls{align-items:stretch;flex-direction:column}.pd-search{width:100%;min-width:0;grid-template-columns:auto minmax(0,1fr) auto}.pd-control-group{justify-content:flex-end}.pd-table-wrap{max-height:calc(100vh - 360px)}}
      @media(max-width:760px){.pd-hero{display:block;padding:20px}.pd-summary{margin-top:18px;min-width:0}.pd-position-tabs{grid-template-columns:repeat(2,1fr)}.pd-control-group{justify-content:flex-start}.pd-table-card-head{display:block}.pd-table-status{justify-content:flex-start;margin-top:9px}.pd-table-wrap{max-height:none;min-height:420px}.pd-table .pd-sticky-1{min-width:160px;max-width:160px}.pd-table .pd-sticky-2{left:160px;min-width:140px;max-width:140px}}
      @media(max-width:520px){.pd-summary{grid-template-columns:repeat(3,1fr)}.pd-summary div{padding:9px}.pd-summary strong{font-size:18px}.pd-position-tabs{gap:6px}.pd-position-tabs button{padding:9px}.pd-switch em{font-size:9px}.pd-table .pd-sticky-2{position:static;box-shadow:none}.pd-table th.pd-sticky-2{position:sticky;top:0}}
    `}</style>
  </div>;
}
