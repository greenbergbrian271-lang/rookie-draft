"use client";
import {useEffect,useMemo,useState} from "react";

type Column="A"|"B";
type Payload={rows:any[][],formulaRefs:Record<string,string>,updatedAt?:string|null,error?:string};
type Scope={key:string,label:string,start:number,end:number};

const MAJOR=new Set(["Post-Draft","Handcuff Boosts","Draft Impact","Team Score Factors","Pre-Draft Grade Multipliers","Analytical Grade Adjustments","All Players","NFL Combine/Pro Day","Archetype Adjustments"]);
const SUBHEAD=new Set(["Positional Multipliers","Data Darling Differential","Category Multipliers","QB Career Thresholds (Column A is beginning of threshold)","Starts","Min Attempts","Min YPG","RB Production Grade Percentiles","RB Production Grade Raw Counting Contributions","RB Career Thresholds (FR + Soph Rush Yards, Single Season Catches, Career Catches)","WR Production Grade Factors","WR FR / Soph Production","Receiving Yards","Touchdowns","Max Yards / Rec Bonuses","Strong Arm","Improviser","Scrambler","Field General","Elusive Back","Power Back","Receiving Back","Deep Threat","Route Runner","Physical","Slot","Blocker","Vertical Threat","Possession"]);
const SCOPES:Scope[]=[
  {key:"all",label:"All",start:2,end:999},
  {key:"general",label:"General",start:2,end:90},
  {key:"qb",label:"QB",start:91,end:123},
  {key:"rb",label:"RB",start:124,end:165},
  {key:"wr",label:"WR",start:166,end:205},
  {key:"te",label:"TE",start:206,end:236},
  {key:"players",label:"All Players",start:237,end:251},
  {key:"combine",label:"Combine",start:252,end:278},
  {key:"archetypes",label:"Archetypes",start:279,end:999}
];

function stringValue(v:any){return v==null?"":String(v)}
function positionTone(label:string,value:string){
  if(value)return "";
  if(label==="QB"||label==="Quarterbacks")return "glossary-qb";
  if(label==="RB"||label==="Running Backs")return "glossary-rb";
  if(label==="WR"||label==="Wide Receivers")return "glossary-wr";
  if(label==="TE"||label==="Tight Ends")return "glossary-te";
  return "";
}
function rowTone(row:any[],rowNumber:number){
  const label=stringValue(row[0]).trim(),value=stringValue(row[1]).trim(),pos=positionTone(label,value);
  if(pos)return pos;
  if(!value&&MAJOR.has(label))return "glossary-major";
  if(!value&&SUBHEAD.has(label))return "glossary-subhead";
  return "";
}
function structural(row:any[],rowNumber:number){return rowNumber===1||Boolean(rowTone(row,rowNumber))&&stringValue(row[1]).trim()===""}
function isBoolean(value:string){return /^(TRUE|FALSE)$/i.test(value.trim())}
function isCompact(value:string){return value===""||/^-?[\d,.]+%?$/.test(value.trim())||isBoolean(value)}
function fieldKind(value:string,formula?:string){if(formula)return "Calculated";if(isBoolean(value))return "Toggle";if(isCompact(value))return "Setting";return "Definition"}

export default function GlossaryEditor(){
  const [rows,setRows]=useState<any[][]>([]),[formulaRefs,setFormulaRefs]=useState<Record<string,string>>({}),[query,setQuery]=useState(""),[scope,setScope]=useState("all"),[status,setStatus]=useState<"loading"|"saved"|"saving"|"error">("loading"),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/scouting-glossary",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load glossary");return j as Payload}).then(j=>{setRows(j.rows||[]);setFormulaRefs(j.formulaRefs||{});setStatus("saved")}).catch(e=>{setError(e?.message||"Could not load glossary");setStatus("error")})},[]);
  const activeScope=SCOPES.find(x=>x.key===scope)||SCOPES[0];
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return rows.map((row,i)=>({row,rowNumber:i+1})).filter(({row,rowNumber})=>{
      if(rowNumber===1||rowNumber<activeScope.start||rowNumber>activeScope.end)return false;
      if(!q)return true;
      return `${stringValue(row[0])} ${stringValue(row[1])}`.toLowerCase().includes(q);
    });
  },[rows,query,activeScope]);
  function updateLocal(rowNumber:number,column:Column,value:string){setRows(current=>current.map((row,i)=>{if(i!==rowNumber-1)return row;const next=[...row];next[column==="A"?0:1]=value;return next}))}
  async function save(rowNumber:number,column:Column,value:string){
    setStatus("saving");setError("");
    try{
      const r=await fetch("/api/scouting-glossary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({row:rowNumber,column,value})}),j=await r.json() as Payload;
      if(!r.ok)throw new Error(j?.error||"Could not save glossary field");
      setRows(j.rows||[]);setFormulaRefs(j.formulaRefs||{});setStatus("saved");
    }catch(e:any){setError(e?.message||"Could not save glossary field");setStatus("error")}
  }
  function categoryEditor(row:any[],rowNumber:number){
    const value=stringValue(row[0]);
    return <input className="glossary-category-input" aria-label={`Category row ${rowNumber}`} value={value} onChange={e=>updateLocal(rowNumber,"A",e.target.value)} onBlur={e=>save(rowNumber,"A",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/>;
  }
  function valueEditor(row:any[],rowNumber:number){
    const value=stringValue(row[1]),formula=formulaRefs[String(rowNumber)];
    if(formula)return <div className="glossary-derived"><span>{value||"—"}</span><small>Calculated automatically</small></div>;
    if(isBoolean(value))return <select className="glossary-toggle" value={value.toUpperCase()} onChange={e=>{updateLocal(rowNumber,"B",e.target.value);save(rowNumber,"B",e.target.value)}}><option>TRUE</option><option>FALSE</option></select>;
    if(isCompact(value))return <input className="glossary-setting-input" aria-label={`Setting for ${stringValue(row[0])}`} value={value} onChange={e=>updateLocal(rowNumber,"B",e.target.value)} onBlur={e=>save(rowNumber,"B",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/>;
    return <textarea className="glossary-definition-input" aria-label={`Definition for ${stringValue(row[0])}`} rows={Math.min(5,Math.max(2,Math.ceil(value.length/120)))} value={value} onChange={e=>updateLocal(rowNumber,"B",e.target.value)} onBlur={e=>save(rowNumber,"B",e.target.value)}/>;
  }
  return <div className="glossary-editor">
    <div className="glossary-controls">
      <div className="glossary-search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search scouting glossary" placeholder="Search categories or definitions…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="glossary-clear" onClick={()=>setQuery("")} aria-label="Clear search">×</button>}</div>
      <div className={`glossary-save-state is-${status}`}><i/>{status==="loading"?"Loading":status==="saving"?"Saving changes":status==="error"?"Save error":"All changes saved"}</div>
    </div>
    <div className="glossary-scope-tabs" role="tablist" aria-label="Glossary sections">{SCOPES.map(s=><button key={s.key} className={scope===s.key?"active":""} onClick={()=>setScope(s.key)}>{s.label}</button>)}</div>
    {error&&<div className="glossary-error">{error}</div>}
    <div className="glossary-list-head"><div><strong>{activeScope.label==="All"?"Scouting glossary":activeScope.label+" settings"}</strong><span>{query?`${visible.length} matching items`:`${visible.filter(x=>!structural(x.row,x.rowNumber)).length} editable/reference items`}</span></div><div className="glossary-legend"><span><i className="setting"/>Setting</span><span><i className="definition"/>Definition</span><span><i className="calculated"/>Calculated</span></div></div>
    <div className="glossary-table-shell">
      <table className="glossary-table" aria-label="Scouting Glossary">
        <thead><tr><th>Category</th><th>Guidance / Setting</th></tr></thead>
        <tbody>{visible.map(({row,rowNumber})=>{
          const tone=rowTone(row,rowNumber),label=stringValue(row[0]).trim(),value=stringValue(row[1]),isStructure=structural(row,rowNumber),formula=formulaRefs[String(rowNumber)];
          if(isStructure)return <tr key={rowNumber} className={`glossary-section-row ${tone}`}><td colSpan={2}><div><span>{label||"Section"}</span>{tone==="glossary-major"&&<small>Scouting model settings</small>}</div></td></tr>;
          return <tr key={rowNumber} className="glossary-data-row"><td className="glossary-category-cell"><div className="glossary-field-meta"><span>{fieldKind(value,formula)}</span></div>{categoryEditor(row,rowNumber)}</td><td className={`glossary-value-cell kind-${fieldKind(value,formula).toLowerCase()}`}>{valueEditor(row,rowNumber)}</td></tr>;
        })}</tbody>
      </table>
      {status==="loading"&&<div className="empty">Loading Scouting Glossary…</div>}
      {status!=="loading"&&!visible.length&&<div className="empty">No glossary items match this view.</div>}
    </div>
  </div>;
}
