"use client";
import {useEffect,useMemo,useState} from "react";

type Column="A"|"B";
type CustomRow={id:string;scope:string;category:string;value:string;kind:"setting"|"definition";createdAt?:string};
type Payload={rows:any[][],formulaRefs:Record<string,string>,customRows?:CustomRow[],hiddenRows?:number[],updatedAt?:string|null,error?:string};
type Scope={key:string,label:string,start:number,end:number};
type DeleteTarget={kind:"base";rowNumber:number;label:string}|{kind:"custom";id:string;label:string};

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
const DATA_SCOPES=SCOPES.filter(s=>s.key!=="all");

function stringValue(v:any){return v==null?"":String(v)}
function positionTone(label:string,value:string){
  if(value)return "";
  if(label==="QB"||label==="Quarterbacks")return "glossary-qb";
  if(label==="RB / WR")return "glossary-rbwr";
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
function rowScope(rowNumber:number){return DATA_SCOPES.find(s=>rowNumber>=s.start&&rowNumber<=s.end)?.key||"archetypes"}

export default function GlossaryEditor(){
  const [rows,setRows]=useState<any[][]>([]),[formulaRefs,setFormulaRefs]=useState<Record<string,string>>({}),[customRows,setCustomRows]=useState<CustomRow[]>([]),[hiddenRows,setHiddenRows]=useState<number[]>([]);
  const [query,setQuery]=useState(""),[scope,setScope]=useState("all"),[status,setStatus]=useState<"loading"|"saved"|"saving"|"error">("loading"),[error,setError]=useState("");
  const [addOpen,setAddOpen]=useState(false),[addScope,setAddScope]=useState("general"),[addKind,setAddKind]=useState<"setting"|"definition">("setting"),[addCategory,setAddCategory]=useState(""),[addValue,setAddValue]=useState("");
  const [deleteTarget,setDeleteTarget]=useState<DeleteTarget|null>(null),[restoreOpen,setRestoreOpen]=useState(false);

  function applyPayload(j:Payload){setRows(j.rows||[]);setFormulaRefs(j.formulaRefs||{});setCustomRows(j.customRows||[]);setHiddenRows(j.hiddenRows||[])}
  useEffect(()=>{fetch("/api/scouting-glossary",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load glossary");return j as Payload}).then(j=>{applyPayload(j);setStatus("saved")}).catch(e=>{setError(e?.message||"Could not load glossary");setStatus("error")})},[]);

  const activeScope=SCOPES.find(x=>x.key===scope)||SCOPES[0];
  const displayItems=useMemo(()=>{
    const q=query.trim().toLowerCase(),hidden=new Set(hiddenRows),scopes=scope==="all"?DATA_SCOPES:[activeScope],items:any[]=[];
    for(const s of scopes){
      for(let rowNumber=s.start;rowNumber<=Math.min(s.end,rows.length);rowNumber++){
        if(hidden.has(rowNumber))continue;
        const row=rows[rowNumber-1]||[],hay=`${stringValue(row[0])} ${stringValue(row[1])}`.toLowerCase();
        if(!q||hay.includes(q))items.push({kind:"base",row,rowNumber,scope:s.key});
      }
      for(const custom of customRows.filter(r=>r.scope===s.key)){
        const hay=`${custom.category} ${custom.value}`.toLowerCase();
        if(!q||hay.includes(q))items.push({kind:"custom",custom,scope:s.key});
      }
    }
    return items;
  },[rows,customRows,hiddenRows,query,scope,activeScope]);

  async function request(body:any){
    setStatus("saving");setError("");
    try{
      const r=await fetch("/api/scouting-glossary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json() as Payload;
      if(!r.ok)throw new Error(j?.error||"Could not save glossary");
      applyPayload(j);setStatus("saved");return true;
    }catch(e:any){setError(e?.message||"Could not save glossary");setStatus("error");return false}
  }
  function updateLocal(rowNumber:number,column:Column,value:string){setRows(current=>current.map((row,i)=>{if(i!==rowNumber-1)return row;const next=[...row];next[column==="A"?0:1]=value;return next}))}
  async function save(rowNumber:number,column:Column,value:string){await request({action:"saveCell",row:rowNumber,column,value})}
  function updateCustomLocal(id:string,column:Column,value:string){setCustomRows(current=>current.map(row=>row.id===id?{...row,[column==="A"?"category":"value"]:value}:row))}
  async function saveCustom(id:string,column:Column,value:string){await request({action:"updateCustomRow",id,column,value})}

  function openAdd(){
    setAddScope(scope==="all"?"general":scope);setAddKind("setting");setAddCategory("");setAddValue("");setAddOpen(true);
  }
  async function addRow(){
    if(!addCategory.trim()){setError("Category is required");return}
    const ok=await request({action:"addRow",scope:addScope,kind:addKind,category:addCategory,value:addValue});
    if(ok){setAddOpen(false);if(scope!=="all"&&scope!==addScope)setScope(addScope)}
  }
  async function confirmDelete(){
    if(!deleteTarget)return;
    const ok=deleteTarget.kind==="custom"
      ?await request({action:"deleteCustomRow",id:deleteTarget.id})
      :await request({action:"deleteBaseRow",row:deleteTarget.rowNumber});
    if(ok)setDeleteTarget(null);
  }
  async function restoreRow(rowNumber:number){const ok=await request({action:"restoreBaseRow",row:rowNumber});if(ok&&hiddenRows.length<=1)setRestoreOpen(false)}

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
  function customValueEditor(row:CustomRow){
    if(row.kind==="setting")return <input className="glossary-setting-input" aria-label={`Setting for ${row.category}`} value={row.value} onChange={e=>updateCustomLocal(row.id,"B",e.target.value)} onBlur={e=>saveCustom(row.id,"B",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/>;
    return <textarea className="glossary-definition-input" aria-label={`Definition for ${row.category}`} rows={Math.min(5,Math.max(2,Math.ceil(row.value.length/120)))} value={row.value} onChange={e=>updateCustomLocal(row.id,"B",e.target.value)} onBlur={e=>saveCustom(row.id,"B",e.target.value)}/>;
  }

  const editableCount=displayItems.filter(item=>item.kind==="custom"||!structural(item.row,item.rowNumber)).length;
  return <div className="glossary-editor">
    <div className="glossary-controls">
      <div className="glossary-search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search scouting glossary" placeholder="Search categories or definitions…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="glossary-clear" onClick={()=>setQuery("")} aria-label="Clear search">×</button>}</div>
      <div className="glossary-control-actions">
        {hiddenRows.length>0&&<button className="glossary-restore-trigger" onClick={()=>setRestoreOpen(true)}>Deleted <b>{hiddenRows.length}</b></button>}
        <button className="glossary-add-row" onClick={openAdd}><span>＋</span> Add row</button>
        <div className={`glossary-save-state is-${status}`}><i/>{status==="loading"?"Loading":status==="saving"?"Saving changes":status==="error"?"Save error":"All changes saved"}</div>
      </div>
    </div>
    <div className="glossary-scope-tabs" role="tablist" aria-label="Glossary sections">{SCOPES.map(s=><button key={s.key} className={scope===s.key?"active":""} onClick={()=>setScope(s.key)}>{s.label}</button>)}</div>
    {error&&<div className="glossary-error">{error}</div>}
    <div className="glossary-list-head"><div><strong>{activeScope.label==="All"?"Scouting glossary":activeScope.label+" settings"}</strong><span>{query?`${displayItems.length} matching items`:`${editableCount} editable/reference items`}</span></div><div className="glossary-legend"><span><i className="setting"/>Setting</span><span><i className="definition"/>Definition</span><span><i className="calculated"/>Calculated</span></div></div>
    <div className="glossary-table-shell">
      <table className="glossary-table" aria-label="Scouting Glossary">
        <thead><tr><th>Category</th><th>Guidance / Setting</th></tr></thead>
        <tbody>{displayItems.map((item:any)=>{
          if(item.kind==="custom"){
            const custom=item.custom as CustomRow;
            return <tr key={custom.id} className="glossary-data-row glossary-custom-row"><td className="glossary-category-cell"><div className="glossary-field-meta"><span>Custom {custom.kind}</span></div><input className="glossary-category-input" value={custom.category} onChange={e=>updateCustomLocal(custom.id,"A",e.target.value)} onBlur={e=>saveCustom(custom.id,"A",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/><button className="glossary-row-delete" aria-label={`Delete ${custom.category}`} title="Delete row" onClick={()=>setDeleteTarget({kind:"custom",id:custom.id,label:custom.category})}>×</button></td><td className={`glossary-value-cell kind-${custom.kind}`}>{customValueEditor(custom)}</td></tr>;
          }
          const {row,rowNumber}=item,tone=rowTone(row,rowNumber),label=stringValue(row[0]).trim(),value=stringValue(row[1]),isStructure=structural(row,rowNumber),formula=formulaRefs[String(rowNumber)];
          if(isStructure)return <tr key={rowNumber} className={`glossary-section-row ${tone}`}><td colSpan={2}><div><span>{label||"Section"}</span>{tone==="glossary-major"&&<small>Scouting model settings</small>}{!formula&&<button className="glossary-section-delete" aria-label={`Delete ${label}`} title="Delete row" onClick={()=>setDeleteTarget({kind:"base",rowNumber,label})}>×</button>}</div></td></tr>;
          return <tr key={rowNumber} className="glossary-data-row"><td className="glossary-category-cell"><div className="glossary-field-meta"><span>{fieldKind(value,formula)}</span></div>{categoryEditor(row,rowNumber)}{!formula&&<button className="glossary-row-delete" aria-label={`Delete ${label}`} title="Delete row" onClick={()=>setDeleteTarget({kind:"base",rowNumber,label})}>×</button>}</td><td className={`glossary-value-cell kind-${fieldKind(value,formula).toLowerCase()}`}>{valueEditor(row,rowNumber)}</td></tr>;
        })}</tbody>
      </table>
      {status==="loading"&&<div className="empty">Loading Scouting Glossary…</div>}
      {status!=="loading"&&!displayItems.length&&<div className="empty">No glossary items match this view.</div>}
    </div>

    {addOpen&&<div className="glossary-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setAddOpen(false)}}><div className="glossary-modal"><div className="glossary-modal-head"><div><small>Scouting Glossary</small><h2>Add row</h2></div><button onClick={()=>setAddOpen(false)}>×</button></div><div className="glossary-modal-grid"><label>Section<select value={addScope} onChange={e=>setAddScope(e.target.value)}>{DATA_SCOPES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label><label>Row type<select value={addKind} onChange={e=>setAddKind(e.target.value as "setting"|"definition")}><option value="setting">Setting / value</option><option value="definition">Definition / guidance</option></select></label></div><label>Category<input autoFocus value={addCategory} onChange={e=>setAddCategory(e.target.value)} placeholder="e.g. Breakout Age Multiplier"/></label><label>{addKind==="setting"?"Value":"Guidance / definition"}{addKind==="setting"?<input value={addValue} onChange={e=>setAddValue(e.target.value)} placeholder="e.g. 10.00%"/>:<textarea rows={4} value={addValue} onChange={e=>setAddValue(e.target.value)} placeholder="What does this setting mean or what are you looking for?"/>}</label><div className="glossary-modal-actions"><button className="ghost" onClick={()=>setAddOpen(false)}>Cancel</button><button onClick={addRow}>Add row</button></div></div></div>}

    {deleteTarget&&<div className="glossary-modal-backdrop"><div className="glossary-modal glossary-delete-modal"><div className="glossary-modal-head"><div><small>Confirm change</small><h2>Delete row?</h2></div><button onClick={()=>setDeleteTarget(null)}>×</button></div><p><strong>{deleteTarget.label||"This row"}</strong> will be removed from the glossary.</p>{deleteTarget.kind==="base"&&<p className="glossary-delete-note">Its original workbook position stays reserved behind the scenes, so deleting it will not shift any other formula references. You can restore it later from the Deleted button.</p>}<div className="glossary-modal-actions"><button className="ghost" onClick={()=>setDeleteTarget(null)}>Cancel</button><button className="glossary-danger" onClick={confirmDelete}>Delete row</button></div></div></div>}

    {restoreOpen&&<div className="glossary-modal-backdrop"><div className="glossary-modal glossary-restore-modal"><div className="glossary-modal-head"><div><small>Scouting Glossary</small><h2>Deleted rows</h2></div><button onClick={()=>setRestoreOpen(false)}>×</button></div><div className="glossary-restore-list">{hiddenRows.map(rowNumber=><div key={rowNumber}><div><strong>{stringValue(rows[rowNumber-1]?.[0])||`Original row ${rowNumber}`}</strong><span>{DATA_SCOPES.find(s=>s.key===rowScope(rowNumber))?.label}</span></div><button className="ghost" onClick={()=>restoreRow(rowNumber)}>Restore</button></div>)}</div></div></div>}
  </div>;
}
