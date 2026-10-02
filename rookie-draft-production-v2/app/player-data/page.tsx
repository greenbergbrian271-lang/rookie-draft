"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowDown,ArrowUp,ArrowUpDown,Database,Filter,RotateCcw,Search,ShieldCheck} from "lucide-react";

type Position="QB"|"RB"|"WR"|"TE";
type SortState={column:string;direction:"asc"|"desc"}|null;
type DataRow=Record<string,any>;
const positions:Position[]=["QB","RB","WR","TE"];
const HIDDEN=new Set(["Team Context","_Threshold Eligible","_Scouting Override","_Usage Volume","_Usage Threshold","_Dataset ID"]);

const text=(value:any)=>value==null?"":typeof value==="object"?"":String(value).trim();
const toNumber=(value:any)=>{
  if(typeof value==="number"&&Number.isFinite(value))return value;
  const raw=text(value);if(!raw)return null;
  const normalized=raw.replace(/[%,$]/g,"").replace(/,/g,"");
  if(!/^-?\d*\.?\d+$/.test(normalized))return null;
  const parsed=Number(normalized);return Number.isFinite(parsed)?parsed:null;
};
const compare=(a:any,b:any)=>{
  const na=toNumber(a),nb=toNumber(b);if(na!=null&&nb!=null)return na-nb;
  return text(a).localeCompare(text(b),undefined,{numeric:true,sensitivity:"base"});
};
const kindFor=(label:string)=>{
  const key=label.toLowerCase();
  if(/player|name/.test(key))return "identity";
  if(/college|school|team/.test(key))return "school";
  if(/grade|score|rank|rating|percentile/.test(key))return "grade";
  if(/height|weight|age|class|dash|forty|40|hand|arm|bmi/.test(key))return "bio";
  if(/target|reception|catch|route|snap|rush|attempt|yard|touchdown|\btd\b|pass|pressure|sack|drop|epa|ypa|ypc|share|rate|%/.test(key))return "metric";
  return "default";
};

export default function Page(){
  const [position,setPosition]=useState<Position>("QB");
  const [payload,setPayload]=useState<any>({rows:[],warehouse:null});
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<SortState>(null);
  const [compact,setCompact]=useState(true);
  const [overridesOnly,setOverridesOnly]=useState(false);

  useEffect(()=>{
    let alive=true;setLoading(true);
    fetch("/api/player-data?position="+position,{cache:"no-store"}).then(r=>r.json()).then(j=>{if(alive)setPayload(j)}).catch(()=>{if(alive)setPayload({rows:[],warehouse:null})}).finally(()=>{if(alive)setLoading(false)});
    return()=>{alive=false};
  },[position]);

  const body=(Array.isArray(payload.rows)?payload.rows:[]) as DataRow[];
  const columns=useMemo(()=>{
    const out:string[]=[];
    for(const row of body)for(const key of Object.keys(row))if(!HIDDEN.has(key)&&typeof row[key]!=="object"&&!out.includes(key))out.push(key);
    const preferred=["Player","College"];
    return [...preferred.filter(k=>out.includes(k)),...out.filter(k=>!preferred.includes(k))];
  },[body]);
  const normalizedQuery=query.trim().toLowerCase();
  const filtered=useMemo(()=>body.filter(row=>{
    if(overridesOnly&&!row["_Scouting Override"])return false;
    if(!normalizedQuery)return true;
    return columns.some(k=>text(row[k]).toLowerCase().includes(normalizedQuery));
  }),[body,normalizedQuery,columns,overridesOnly]);
  const rows=useMemo(()=>{
    if(!sort)return filtered;
    return [...filtered].sort((a,b)=>compare(a[sort.column],b[sort.column])*(sort.direction==="asc"?1:-1));
  },[filtered,sort]);

  const warehouse=payload.warehouse,summary=warehouse?.summary||{};
  const threshold=warehouse?.threshold,leader=warehouse?.leader;
  const imported=Boolean(warehouse&&payload.importedAt);
  const visibleCount=body.length,eligible=summary.eligible??body.filter(r=>r["_Threshold Eligible"]!==false).length,overrides=summary.scoutingOverrides??body.filter(r=>r["_Scouting Override"]).length;

  function toggleSort(column:string){setSort(current=>!current||current.column!==column?{column,direction:"asc"}:current.direction==="asc"?{column,direction:"desc"}:null)}
  function selectPosition(next:Position){setPosition(next);setQuery("");setSort(null);setOverridesOnly(false)}
  function resetView(){setQuery("");setSort(null);setCompact(true);setOverridesOnly(false)}

  return <div className="player-data-page" data-position={position}>
    <section className="pd-hero">
      <div className="pd-hero-copy">
        <span className="ey">Scouting Database</span>
        <h1>Player Data</h1>
        <p>The canonical player-facing dataset. PFF imports are filtered here by the automatic usage threshold, while below-threshold Players to Scout remain visible without entering the percentile population.</p>
        <div className="pd-source-line"><Database size={14}/><span>{imported?`PFF warehouse dataset #${warehouse.datasetId} · ${warehouse.season} season`:payload.referenceSource||"Canonical reference data"}</span></div>
      </div>
      <div className="pd-summary">
        <div><span>Visible</span><strong>{loading?"—":visibleCount}</strong></div>
        <div><span>Percentile pool</span><strong>{loading?"—":eligible}</strong></div>
        <div><span>Scout overrides</span><strong>{loading?"—":overrides}</strong></div>
        <div className="threshold"><span>{leader?.metric||"Usage threshold"}</span><strong>{threshold??"—"}</strong><small>{leader?.value!=null?`20% of leader ${leader.value}`:"Awaiting import"}</small></div>
      </div>
    </section>

    <nav className="pd-position-tabs" aria-label="Player data position">
      {positions.map(pos=><button key={pos} className={position===pos?"active":""} aria-pressed={position===pos} onClick={()=>selectPosition(pos)}>
        <span className="pd-position-mark">{pos}</span><span><b>{pos} Data</b><small>{position===pos&&imported?"Warehouse active":"Canonical view"}</small></span>
      </button>)}
    </nav>

    <section className="pd-controls">
      <label className="pd-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${position} players, schools or metrics…`}/>{query&&<button onClick={()=>setQuery("")}>×</button>}</label>
      <div className="pd-control-group">
        <button className={overridesOnly?"pd-filter active":"pd-filter"} onClick={()=>setOverridesOnly(v=>!v)}><Filter size={14}/>Scout overrides</button>
        <label className="pd-switch"><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/><span/><em>Compact rows</em></label>
        <button className="pd-reset" onClick={resetView}><RotateCcw size={14}/>Reset</button>
      </div>
    </section>

    {imported&&<section className="pd-rulebar"><ShieldCheck size={17}/><div><strong>Eligibility engine active</strong><span>{eligible} {position}s define percentile distributions. {overrides} below-threshold scouting player{overrides===1?" is":"s are"} included for evaluation but excluded from the benchmark population. {summary.hiddenBelowThreshold??0} other below-threshold players remain stored in Turso.</span></div></section>}

    <section className="pd-table-card">
      <header className="pd-table-card-head"><div><span className="pd-kicker">{position} dataset</span><h2>{loading?"Loading…":rows.length===body.length?`${body.length} players`:`${rows.length} of ${body.length} players`}</h2></div><div className="pd-table-status">{sort?<span>Sorted by <b>{sort.column}</b> · {sort.direction}</span>:<span>Click any column to sort</span>}<span>{columns.length} metrics</span></div></header>
      <div className={`pd-table-wrap ${compact?"compact":""}`}>
        <table className="pd-table">
          <thead><tr><th className="pd-sticky-col pd-sticky-status"><span>Status</span></th>{columns.map((column,index)=><th key={column} data-kind={kindFor(column)} className={index<2?`pd-sticky-col pd-sticky-${index+1}`:""}><button onClick={()=>toggleSort(column)} className={sort?.column===column?"sorted":""}><span>{column}</span>{sort?.column===column?(sort.direction==="asc"?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={12}/>}</button></th>)}</tr></thead>
          <tbody>{rows.length?rows.map((row,rowIndex)=><tr key={`${text(row.Player)||"row"}-${rowIndex}`}>
            <td className="pd-sticky-col pd-sticky-status">{row["_Scouting Override"]?<span className="pd-badge override">Below threshold · scout</span>:row["_Threshold Eligible"]===false?<span className="pd-badge below">Below threshold</span>:<span className="pd-badge eligible">Eligible</span>}</td>
            {columns.map((column,index)=>{const value=text(row[column]),numeric=toNumber(row[column])!=null&&index>1;return <td key={column} data-kind={kindFor(column)} data-empty={!value||undefined} className={`${index<2?`pd-sticky-col pd-sticky-${index+1}`:""} ${numeric?"numeric":""}`}>{value||<span className="pd-empty-value">—</span>}</td>})}
          </tr>):<tr><td className="pd-no-results" colSpan={Math.max(columns.length+1,1)}>{loading?"Loading Player Data…":query?"No players match this search.":"No player rows are available."}</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <style jsx global>{`
      .player-data-page{--pd-accent:#fc2b6d;--pd-accent-soft:rgba(252,43,109,.13);display:grid;gap:14px;min-width:0}.player-data-page[data-position="RB"]{--pd-accent:#20ceb7;--pd-accent-soft:rgba(32,206,183,.13)}.player-data-page[data-position="WR"]{--pd-accent:#58a7ff;--pd-accent-soft:rgba(88,167,255,.13)}.player-data-page[data-position="TE"]{--pd-accent:#fead58;--pd-accent-soft:rgba(254,173,88,.14)}
      .pd-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:25px;padding:24px 26px;border:1px solid #20395f;border-radius:18px;background:radial-gradient(circle at 100% 0,var(--pd-accent-soft),transparent 42%),linear-gradient(135deg,#0d1d34,#081528 72%)}.pd-hero-copy{max-width:710px}.pd-hero h1{font-size:34px;margin:5px 0 9px}.pd-hero p{margin:0;color:#91a7c5;line-height:1.55}.pd-source-line{display:flex;align-items:center;gap:6px;margin-top:12px;color:#7893b6;font-size:10px;font-weight:800}.pd-summary{display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:8px;min-width:360px}.pd-summary>div{padding:11px 13px;border:1px solid #284467;border-radius:12px;background:rgba(5,15,29,.55)}.pd-summary span{display:block;color:#7e96b7;text-transform:uppercase;letter-spacing:.08em;font-size:8px;font-weight:950}.pd-summary strong{display:block;margin-top:4px;font-size:21px}.pd-summary .threshold{border-color:color-mix(in srgb,var(--pd-accent) 42%,#284467)}.pd-summary small{display:block;margin-top:2px;color:#657f9f;font-size:8px}
      .pd-position-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.pd-position-tabs button{justify-content:flex-start;gap:10px;padding:11px 13px;background:#0b1a30;border:1px solid #20395f;color:#9db0cb;border-radius:12px;text-align:left}.pd-position-tabs button.active{border-color:color-mix(in srgb,var(--pd-accent) 58%,#31527f);background:var(--pd-accent-soft);color:#fff}.pd-position-mark{display:grid;place-items:center;min-width:37px;height:32px;border-radius:8px;background:#142844;border:1px solid #29476e;font-size:11px;font-weight:950}.pd-position-tabs button.active .pd-position-mark{background:var(--pd-accent);border-color:var(--pd-accent);color:#06101e}.pd-position-tabs b,.pd-position-tabs small{display:block}.pd-position-tabs b{font-size:12px}.pd-position-tabs small{margin-top:2px;color:#718aab;font-size:9px}
      .pd-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid #20395f;border-radius:13px;background:#09172b}.pd-search{display:grid;grid-template-columns:auto minmax(180px,420px) auto;align-items:center;gap:8px;min-width:min(520px,55vw);padding:0 10px;border:1px solid #29476e;border-radius:10px;background:#071426;color:#6983a6}.pd-search input{height:38px;padding:0;border:0;background:transparent;outline:0}.pd-search button{width:25px;height:25px;padding:0;background:transparent;color:#7189aa;font-size:18px}.pd-control-group{display:flex;align-items:center;gap:8px}.pd-filter,.pd-reset{gap:6px;padding:8px 10px;background:#0c1d35;border:1px solid #29476e;color:#a7bad3;font-size:10px}.pd-filter.active{border-color:var(--pd-accent);background:var(--pd-accent-soft);color:#fff}.pd-switch{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #20395f;border-radius:9px;background:#0c1d35;cursor:pointer}.pd-switch input{position:absolute;opacity:0}.pd-switch>span{position:relative;width:28px;height:16px;border-radius:999px;background:#233b5a}.pd-switch>span:after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#8398b4;transition:.15s}.pd-switch input:checked+span{background:var(--pd-accent)}.pd-switch input:checked+span:after{transform:translateX(12px);background:#06101e}.pd-switch em{font-style:normal;font-size:10px;font-weight:850;color:#a7bad3}.pd-rulebar{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border:1px solid #255947;border-radius:11px;background:rgba(40,188,133,.07);color:#bdebd7}.pd-rulebar strong,.pd-rulebar span{display:block}.pd-rulebar span{margin-top:3px;color:#7fae9b;font-size:10px;line-height:1.45}
      .pd-table-card{min-width:0;border:1px solid #20395f;border-radius:15px;background:#081528;overflow:hidden}.pd-table-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:15px 17px;border-bottom:1px solid #20395f;background:linear-gradient(180deg,#0d1e35,#0a192d)}.pd-kicker{display:block;color:var(--pd-accent);font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.12em}.pd-table-card-head h2{margin:4px 0 0;font-size:19px}.pd-table-status{display:flex;gap:7px}.pd-table-status span{padding:5px 8px;border:1px solid #284467;border-radius:999px;color:#7f97b7;font-size:9px}.pd-table-wrap{overflow:auto;max-height:calc(100vh - 365px);min-height:360px;scrollbar-color:#29476e #071426}.pd-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;font-size:11px;color:#dbe7f6}.pd-table th,.pd-table td{min-width:112px;max-width:220px;border-right:1px solid #162c49;border-bottom:1px solid #162c49;padding:10px 11px;background:#0a192d;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.pd-table th{position:sticky;top:0;z-index:8;padding:0;background:#10233c}.pd-table th button{width:100%;min-height:42px;justify-content:space-between;padding:9px 10px;border:0;border-radius:0;background:transparent;color:#8fa6c6;font-size:9px;font-weight:950;text-transform:uppercase}.pd-table th button.sorted{background:var(--pd-accent-soft);color:#fff;box-shadow:inset 0 -2px 0 var(--pd-accent)}.pd-table td.numeric{text-align:right;color:#c9d9ec}.pd-table td[data-kind="identity"]{font-weight:900;color:#f4f7fb}.pd-table td[data-kind="school"]{color:#aec0d8;font-weight:800}.pd-table tbody tr:nth-child(even) td{background:#09172a}.pd-table tbody tr:hover td{background:#10243c}.pd-sticky-col{position:sticky!important;z-index:5}.pd-sticky-status{left:0!important;min-width:145px!important;max-width:145px!important;background:#0c1d35!important}.pd-table th.pd-sticky-status{z-index:13!important;padding:0 10px!important;color:#8fa6c6;text-transform:uppercase;font-size:9px;vertical-align:middle}.pd-sticky-1{left:145px!important;min-width:190px!important;max-width:190px!important}.pd-sticky-2{left:335px!important;min-width:160px!important;max-width:160px!important;box-shadow:5px 0 12px rgba(0,0,0,.14)}.pd-table th.pd-sticky-col{z-index:12}.pd-badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:950}.pd-badge.eligible{background:rgba(40,188,133,.12);color:#72d7b0;border:1px solid rgba(40,188,133,.35)}.pd-badge.override{background:rgba(254,173,88,.12);color:#ffc37f;border:1px solid rgba(254,173,88,.36)}.pd-badge.below{background:rgba(252,43,109,.1);color:#ff91b4;border:1px solid rgba(252,43,109,.3)}.pd-table-wrap.compact td{padding-top:6px;padding-bottom:6px}.pd-empty-value{color:#405978}.pd-no-results{height:260px!important;text-align:center!important;color:#7891b2!important;background:#081528!important}
      @media(max-width:980px){.pd-hero{display:block}.pd-summary{margin-top:18px;min-width:0}.pd-controls{align-items:stretch;flex-direction:column}.pd-search{width:100%;min-width:0}.pd-control-group{justify-content:flex-start}.pd-table-wrap{max-height:none}}@media(max-width:650px){.pd-summary{grid-template-columns:1fr 1fr}.pd-position-tabs{grid-template-columns:1fr 1fr}.pd-sticky-2{position:static!important;box-shadow:none}.pd-table-card-head{display:block}.pd-table-status{margin-top:8px}}
    `}</style>
  </div>;
}
