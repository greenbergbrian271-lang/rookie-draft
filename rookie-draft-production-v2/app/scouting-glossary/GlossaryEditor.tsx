"use client";
import {useEffect,useMemo,useState} from "react";

type Column="A"|"B";
type Payload={rows:any[][],formulaRefs:Record<string,string>,updatedAt?:string|null,error?:string};

const MAJOR=new Set(["Post-Draft","Handcuff Boosts","Draft Impact","Team Score Factors","Pre-Draft Grade Multipliers","Analytical Grade Adjustments","All Players","NFL Combine/Pro Day","Archetype Adjustments"]);
const SUBHEAD=new Set(["Positional Multipliers","Data Darling Differential","Category Multipliers","QB Career Thresholds (Column A is beginning of threshold)","Starts","Min Attempts","Min YPG","RB Production Grade Percentiles","RB Production Grade Raw Counting Contributions","RB Career Thresholds (FR + Soph Rush Yards, Single Season Catches, Career Catches)","WR Production Grade Factors","WR FR / Soph Production","Receiving Yards","Touchdowns","Max Yards / Rec Bonuses","Strong Arm","Improviser","Scrambler","Field General","Elusive Back","Power Back","Receiving Back","Deep Threat","Route Runner","Physical","Slot","Blocker","Vertical Threat","Possession"]);

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
  if(rowNumber===1)return "glossary-header-row";
  const label=stringValue(row[0]).trim(),value=stringValue(row[1]).trim(),pos=positionTone(label,value);
  if(pos)return pos;
  if(!value&&MAJOR.has(label))return "glossary-major";
  if(!value&&SUBHEAD.has(label))return "glossary-subhead";
  return "";
}
function structural(row:any[],rowNumber:number){return rowNumber===1||Boolean(rowTone(row,rowNumber))&&stringValue(row[1]).trim()===""}
function compactValue(value:string){return value===""||/^-?[\d,.]+%?$/.test(value.trim())||/^(TRUE|FALSE)$/i.test(value.trim())}

export default function GlossaryEditor(){
  const [rows,setRows]=useState<any[][]>([]),[formulaRefs,setFormulaRefs]=useState<Record<string,string>>({}),[query,setQuery]=useState(""),[status,setStatus]=useState<"loading"|"saved"|"saving"|"error">("loading"),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/scouting-glossary",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load glossary");return j as Payload}).then(j=>{setRows(j.rows||[]);setFormulaRefs(j.formulaRefs||{});setStatus("saved")}).catch(e=>{setError(e?.message||"Could not load glossary");setStatus("error")})},[]);
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();return rows.map((row,i)=>({row,rowNumber:i+1})).filter(x=>!q||`${x.rowNumber} ${stringValue(x.row[0])} ${stringValue(x.row[1])} ${formulaRefs[String(x.rowNumber)]||""}`.toLowerCase().includes(q))},[rows,query,formulaRefs]);
  function updateLocal(rowNumber:number,column:Column,value:string){setRows(current=>current.map((row,i)=>{if(i!==rowNumber-1)return row;const next=[...row];next[column==="A"?0:1]=value;return next}))}
  async function save(rowNumber:number,column:Column,value:string){
    setStatus("saving");setError("");
    try{
      const r=await fetch("/api/scouting-glossary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({row:rowNumber,column,value})}),j=await r.json() as Payload;
      if(!r.ok)throw new Error(j?.error||"Could not save glossary cell");
      setRows(j.rows||[]);setFormulaRefs(j.formulaRefs||{});setStatus("saved");
    }catch(e:any){setError(e?.message||"Could not save glossary cell");setStatus("error")}
  }
  function editableCell(row:any[],rowNumber:number,column:Column){
    const index=column==="A"?0:1,value=stringValue(row[index]),isFormula=column==="B"&&Boolean(formulaRefs[String(rowNumber)]),isStructure=structural(row,rowNumber);
    if(rowNumber===1)return <strong>{value}</strong>;
    if(isFormula)return <div className="glossary-calculated"><b>{value||"—"}</b><small>{formulaRefs[String(rowNumber)]}</small></div>;
    if(isStructure)return <strong>{value}</strong>;
    if(column==="B"&&/^(TRUE|FALSE)$/i.test(value.trim()))return <select value={value.toUpperCase()} onChange={e=>{updateLocal(rowNumber,column,e.target.value);save(rowNumber,column,e.target.value)}}><option>TRUE</option><option>FALSE</option></select>;
    if(column==="B"&&value.length>70)return <textarea rows={Math.min(5,Math.max(2,Math.ceil(value.length/95)))} value={value} onChange={e=>updateLocal(rowNumber,column,e.target.value)} onBlur={e=>save(rowNumber,column,e.target.value)}/>;
    return <input value={value} onChange={e=>updateLocal(rowNumber,column,e.target.value)} onBlur={e=>save(rowNumber,column,e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/>;
  }
  return <>
    <div className="glossary-toolbar">
      <input aria-label="Search scouting glossary" placeholder="Search category, definition, row, or formula…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <span className={`status ${status==="saved"?"cloud":""}`}>{status==="loading"?"Loading…":status==="saving"?"Saving…":status==="error"?"Save error":"● Editable + cloud saved"}</span>
      <span className="glossary-count">{visible.length} of {rows.length} rows</span>
    </div>
    {error&&<div className="glossary-error">{error}</div>}
    <div className="sheet-wrap glossary-wrap"><table className="glossary-table"><thead><tr><th>Row</th><th>Category · Column A</th><th>Definition / Value · Column B</th><th>Reference</th></tr></thead><tbody>{visible.map(({row,rowNumber})=>{const value=stringValue(row[1]),tone=rowTone(row,rowNumber),formula=formulaRefs[String(rowNumber)],isStructure=structural(row,rowNumber);return <tr key={rowNumber} className={tone}><td className="glossary-row-number">{rowNumber}</td><td className="glossary-category">{editableCell(row,rowNumber,"A")}</td><td className={`glossary-value ${compactValue(value)&&!isStructure?"compact":""}`}>{editableCell(row,rowNumber,"B")}</td><td className="glossary-reference"><code>A{rowNumber}</code><code>B{rowNumber}</code>{formula?<span>Calculated</span>:isStructure?<span>Section</span>:<span>Editable</span>}</td></tr>})}</tbody></table>{status==="loading"&&<div className="empty">Loading Scouting Glossary…</div>}</div>
  </>;
}
