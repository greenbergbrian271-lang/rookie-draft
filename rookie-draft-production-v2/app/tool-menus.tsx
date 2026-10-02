"use client";
import {useEffect,useState} from "react";\nimport {Briefcase,Search,Wrench} from "lucide-react";
import {schoolStyle} from "@/lib/school-colors";
import AddPlayersModal from "@/components/AddPlayersModal";
import NewPlayerWatchedModal from "@/components/NewPlayerWatchedModal";
import ReorderPlayersModal from "@/components/ReorderPlayersModal";
import MaybeScoutModal from "@/components/MaybeScoutModal";
import ArchivePlayerModal from "@/components/ArchivePlayerModal";
import CombineStatusModal from "@/components/CombineStatusModal";
import ReturningPlayerModal from "@/components/ReturningPlayerModal";
import {useDraftClass} from "@/lib/use-draft-class";
type Item={label:string,id:string};
const groups=[{label:"GM Tools",items:[["Returning Player","returning-player"],["Draft Declarations","declarations"],["Combine Status","combine-status"],["Compare Players","compare"],["Mock Draft Simulator","mock-draft"]]},{label:"Scouting Tools",items:[["Add Player","add-player"],["New Player Watched","new-player-watched"],["Reorder Players","reorder"],["Maybe Scout Player","maybe"],["Archive Player","archive"],["Finished Scouting Player","finished"]]},{label:"Sheet Tools",items:[["Refresh NCAA Stats","ncaa-stats"],["Refresh Combine Data","combine-refresh"],["Add Team + Production Stats","production"]]}].map(g=>({...g,items:g.items.map(([label,id])=>({label,id}))}));
const playerActions:Record<string,{status?:string,draftClass?:number}>={finished:{status:"FINISHED"}};
export default function ToolMenus(){const draftClass=useDraftClass();const [open,setOpen]=useState<string|null>(null),[tool,setTool]=useState<Item|null>(null),[addOpen,setAddOpen]=useState(false),[watchedOpen,setWatchedOpen]=useState(false),[players,setPlayers]=useState<any[]>([]),[playerId,setPlayerId]=useState(""),[msg,setMsg]=useState(""),[choice,setChoice]=useState(""),[playerId2,setPlayerId2]=useState(""),[gradeRows,setGradeRows]=useState<any[]>([]);const [reorderOpen,setReorderOpen]=useState(false),[maybeOpen,setMaybeOpen]=useState(false),[archiveOpen,setArchiveOpen]=useState(false),[returningOpen,setReturningOpen]=useState(false),[combineOpen,setCombineOpen]=useState(false),[combineStatus,setCombineStatus]=useState<any>(null);
useEffect(()=>{if(tool){fetch(`/api/grades?draftClass=${draftClass}`,{cache:"no-store"}).then(r=>r.json()).then(x=>Array.isArray(x)&&setGradeRows(x)).catch(()=>{});fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>Array.isArray(x)&&setPlayers(x)).catch(()=>{});if(tool.id==="combine-refresh")fetch("/api/combine-refresh",{cache:"no-store"}).then(r=>r.json()).then(setCombineStatus).catch(()=>{})}},[tool,draftClass]);
function close(){setTool(null);setMsg("");setPlayerId("");setChoice("");setPlayerId2("")}
async function playerRun(){const p=players.find(x=>String(x.id)===playerId);if(!p)return setMsg("Select a player.");const a=playerActions[tool!.id];const r=await fetch("/api/players",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:p.id,status:a.status,draftClass:a.draftClass})});setMsg(r.ok?`${p.name} updated successfully.`:"The player update failed.")}
async function evalRun(category:string){const p=players.find(x=>String(x.id)===playerId);if(!p)return setMsg("Select a player.");if(!choice)return setMsg("Select a value.");const r=await fetch("/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,category,value:null,commentary:choice})});if(r.ok&&category==="Early Declare"){if(choice==="Yes")await fetch("/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"DECLARES",detail:"Yes"})});else await fetch("/api/workflow-tags",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"DECLARES"})});}if(r.ok&&category==="Combine Invite?")await fetch("/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"COMBINE",detail:choice})});if(r.ok&&category==="All Star Game?"){if(choice!=="None")await fetch("/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"ALL_STAR",detail:choice})});else await fetch("/api/workflow-tags",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,tag:"ALL_STAR"})});}setMsg(r.ok?`${p.name}: ${category} updated to ${choice}.`:"Update failed.")}
async function collegeRun(){setMsg(tool?.id==="ncaa-stats"?"Fetching current NCAA passing and rushing statistics…":"Loading workbook college statistics…");const endpoint=tool?.id==="ncaa-stats"?"/api/college-stats/refresh":"/api/college-stats/seed";const r=await fetch(endpoint,{method:"POST"});const j=await r.json();setMsg(r.ok?(tool?.id==="ncaa-stats"?`Updated ${j.updated} FBS colleges from NCAA.com. ${j.unmatched?.length||0} unmatched.`:`Loaded ${j.count} FBS/FCS college rows into the cloud stats table.`):(j.error||"College stats refresh failed."))}
async function combineRefreshRun(){setMsg(`Refreshing ${draftClass} NFL Combine data…`);const r=await fetch("/api/combine-refresh",{method:"POST"}),j=await r.json();if(!r.ok)return setMsg(j.error||"Combine refresh failed.");setCombineStatus(j);if(!j.updated)return setMsg(j.message||`No ${draftClass} combine data is available yet.`);setMsg(`Updated combine data for ${j.updated} players. ${j.unmatchedCount??j.unmatched?.length??0} source names were unmatched.`)}
async function auditRun(){setMsg("Checking player colleges against workbook school formatting…");const r=await fetch("/api/format-audit",{cache:"no-store"}),j=await r.json();setMsg(r.ok?(j.unknown?.length?`${j.unknown.length} college name(s) need review: ${j.unknown.join(", ")}`:"All player colleges resolve to workbook school formatting."):(j.error||"Formatting audit failed."))}
async function moveRun(direction:"up"|"down"){if(!playerId)return setMsg("Select a player.");const r=await fetch("/api/players/move",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:Number(playerId),direction})}),j=await r.json();if(r.ok){setMsg(`${j.player} moved ${direction}.`);fetch("/api/players",{cache:"no-store"}).then(x=>x.json()).then(x=>Array.isArray(x)&&setPlayers(x))}else setMsg(j.error||"Move failed.")}
async function simpleRun(endpoint:string,label:string){setMsg(label+"…");const r=await fetch(endpoint,{method:"POST"}),j=await r.json();setMsg(r.ok?`${label}: ${j.updated??j.count??"complete"}.`:(j.error||`${label} failed.`))}
async function productionRun(){setMsg("Applying team-stat and production formulas to the latest imported player data…");const [pr,cr]=await Promise.all([fetch("/api/player-data",{cache:"no-store"}),fetch("/api/college-stats",{cache:"no-store"})]);const pj=await pr.json(),cj=await cr.json();if(!pr.ok||!cr.ok)return setMsg("Could not load player or college data.");let count=0;for(const position of ["QB","RB","WR","TE"]){const block=pj?.result?.[position]||{};const rows=[...(block?.above?.primary||[]),...(block?.below?.primary||[])];if(!rows.length)continue;const r=await fetch("/api/production-metrics/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({position,rows,colleges:cj})});if(r.ok){const out=await r.json();count+=out.length}}setMsg(`Calculated workbook team/production metrics for ${count} imported player rows.`)}
return <><div className="tool-menubar" onMouseLeave={()=>setOpen(null)} style={{gap:7,padding:"8px 18px"}}>
{groups.map((g,groupIndex)=><div className="tool-menu" key={g.label}>
  <button
    aria-expanded={open===g.label}
    aria-haspopup="menu"
    className={open===g.label?"tool-menu-button open":"tool-menu-button"}
    style={{
      background:open===g.label?"#142844":"#10213a",
      border:"1px solid "+(open===g.label?"#3a608e":"#29476e"),
      padding:"7px 11px",
      minWidth:groupIndex===1?126:112,
      justifyContent:"space-between",
      boxShadow:"0 1px 0 rgba(255,255,255,.03) inset"
    }}
    onClick={()=>setOpen(open===g.label?null:g.label)}
    onMouseEnter={()=>open&&setOpen(g.label)}
  >
    <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
      <span aria-hidden="true" style={{
        display:"inline-grid",
        placeItems:"center",
        width:24,
        height:20,
        borderRadius:6,
        background:"#142844",
        border:"1px solid #31527f",
        color:"#9fb9da",
        fontSize:8,
        fontWeight:950,
        letterSpacing:".04em"
      }}>{groupIndex===0?<Briefcase size={13}/>:groupIndex===1?<Search size={13}/>:<Wrench size={13}/>}</span>
      <strong style={{fontSize:12}}>{g.label}</strong>
    </span>
    <span style={{marginLeft:8}}>▾</span>
  </button>
  {open===g.label&&<div className="tool-dropdown" role="menu" style={{
    minWidth:265,
    padding:7,
    borderRadius:12,
    background:"#09172b",
    border:"1px solid #31527f",
    boxShadow:"0 20px 55px rgba(0,0,0,.48)"
  }}>
    <div style={{padding:"6px 9px 8px",marginBottom:4,borderBottom:"1px solid #20395f"}}>
      <div className="ey">{g.label}</div>
      <span className="muted" style={{fontSize:10,fontWeight:750}}>Quick actions</span>
    </div>
    <div style={{display:"grid",gap:2}}>{g.items.map(i=><button key={i.id} role="menuitem" className="tool-dropdown-action" style={{
      display:"flex",
      alignItems:"center",
      justifyContent:"space-between",
      gap:12,
      width:"100%",
      background:"transparent",
      border:0,
      padding:"8px 9px",
      borderRadius:7,
      color:"#c9d8ec",
      fontSize:12,
      textAlign:"left"
    }} onClick={()=>{
      if(i.id==="add-player"){setAddOpen(true);setTool(null)}
      else if(i.id==="new-player-watched"){setWatchedOpen(true);setTool(null)}
      else if(i.id==="reorder"){setReorderOpen(true);setTool(null)}
      else if(i.id==="maybe"){setMaybeOpen(true);setTool(null)}
      else if(i.id==="archive"){setArchiveOpen(true);setTool(null)}
      else if(i.id==="returning-player"){setReturningOpen(true);setTool(null)}
      else if(i.id==="combine-status"){setCombineOpen(true);setTool(null)}
      else setTool(i);
      setOpen(null)
    }}><span>{i.label}</span><span aria-hidden="true" style={{color:"#5f789a",fontSize:15}}>›</span></button>)}</div>
  </div>}
</div>)}
</div>
<AddPlayersModal open={addOpen} onClose={()=>setAddOpen(false)} onDone={()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(Array.isArray(x))setPlayers(x)}).catch(()=>{})}}/>
<NewPlayerWatchedModal open={watchedOpen} draftClass={draftClass} onClose={()=>setWatchedOpen(false)} onDone={()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(Array.isArray(x))setPlayers(x)}).catch(()=>{})}}/>
<ReorderPlayersModal open={reorderOpen} onClose={()=>setReorderOpen(false)}/>
<MaybeScoutModal open={maybeOpen} onClose={()=>setMaybeOpen(false)} onDone={()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(Array.isArray(x))setPlayers(x)}).catch(()=>{})}}/>
<ArchivePlayerModal open={archiveOpen} onClose={()=>setArchiveOpen(false)} onDone={()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(Array.isArray(x))setPlayers(x)}).catch(()=>{})}}/>
<ReturningPlayerModal open={returningOpen} onClose={()=>setReturningOpen(false)} onDone={()=>{fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(x=>{if(Array.isArray(x))setPlayers(x)}).catch(()=>{})}}/>
<CombineStatusModal open={combineOpen} onClose={()=>setCombineOpen(false)}/>
{tool&&<div className="tool-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="tool-modal"><div className="page-head"><div><div className="ey">Workbook Tool</div><h2>{tool.label}</h2></div><button className="small ghost" onClick={close}>Close</button></div>
{playerActions[tool.id]?<div><select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Select player…</option>{players.filter(p=>p.draft_class===draftClass).map(p=><option key={p.id} value={p.id}>{p.position} · {p.name} · {p.college}</option>)}</select><button style={{marginTop:12}} onClick={playerRun}>Apply</button></div>:tool.id==="compare"?<div><div className="grid"><select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Player 1…</option>{players.filter(p=>p.draft_class===draftClass).map(p=><option key={p.id} value={p.id}>{p.position} · {p.name} · {p.college}</option>)}</select><select value={playerId2} onChange={e=>setPlayerId2(e.target.value)}><option value="">Player 2…</option>{players.filter(p=>p.draft_class===draftClass&&String(p.id)!==playerId).map(p=><option key={p.id} value={p.id}>{p.position} · {p.name} · {p.college}</option>)}</select></div>{playerId&&playerId2&&<table style={{marginTop:16,width:"100%"}}><thead><tr><th>Player</th><th>Pos</th><th>College</th><th>Scouting</th><th>Pre-Draft</th></tr></thead><tbody>{[playerId,playerId2].map(id=>{const p=players.find(x=>String(x.id)===id),g=gradeRows.find(x=>String(x.id)===id);return p?<tr key={id}><td><span className="player-badge" style={schoolStyle(p.college)}>{p.name}</span></td><td>{p.position}</td><td>{p.college}</td><td>{g?.scoutingGrade==null?"—":Number(g.scoutingGrade).toFixed(2)}</td><td>{g?.preDraftGrade==null?"—":Number(g.preDraftGrade).toFixed(2)}</td></tr>:null})}</tbody></table>}</div>:tool.id==="reorder"?<div><p className="muted">Move a player within the workbook-equivalent position / Maybe queue.</p><select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Select player…</option>{players.filter(p=>p.draft_class===draftClass&&p.scouting_status!=="FINISHED").sort((a,b)=>(a.watch_order||0)-(b.watch_order||0)).map(p=><option key={p.id} value={p.id}>{p.scouting_status==="MAYBE"?"Maybe":p.position} · {p.name}</option>)}</select><div className="row-actions" style={{marginTop:12}}><button onClick={()=>moveRun("up")}>Move Up</button><button className="ghost" onClick={()=>moveRun("down")}>Move Down</button></div></div>:tool.id==="combine-refresh"?<div><p className="muted">Refreshes {draftClass} NFL Combine measurements for QB, RB, WR and TE profiles. Run this manually after combine testing is published; matching players update across every scouting Combine tab.</p>{combineStatus?.refreshedAt&&<div className="notice">Last refresh: {new Date(combineStatus.refreshedAt).toLocaleString()} · {combineStatus.updated||0} matched · {combineStatus.unmatched??combineStatus.unmatchedCount??0} unmatched.</div>}<button onClick={combineRefreshRun}>Refresh Combine Data</button></div>:["fix-formatting","transfer-portal"].includes(tool.id)?<div><p className="muted">The web app derives player colors from current college data, so this checks for college names that cannot resolve to the workbook color map instead of rewriting cell formatting.</p><button onClick={auditRun}>Run Check</button></div>:tool.id==="sort-scouting"?<div><p className="muted">Sorts each position by the workbook grade order while preserving the player/commentary record as one unit.</p><button onClick={()=>simpleRun("/api/scouting-sort","Scouting sort")}>Run</button></div>:["declarations","combine-status","all-star"].includes(tool.id)?<div><select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Select player…</option>{players.filter(p=>p.draft_class===draftClass).map(p=><option key={p.id} value={p.id}>{p.position} · {p.name} · {p.college}</option>)}</select><select style={{marginTop:12}} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Select value…</option>{(tool.id==="all-star"?["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]:["Yes","No"]).map(x=><option key={x}>{x}</option>)}</select><button style={{marginTop:12}} onClick={()=>evalRun(tool.id==="declarations"?"Early Declare":tool.id==="combine-status"?"Combine Invite?":"All Star Game?")}>Apply</button></div>:["ncaa-stats","production"].includes(tool.id)?<div><p className="muted">{tool.id==="ncaa-stats"?"Fetches the live NCAA.com FBS passing and rushing tables using the same pages, team-name normalization and stat mapping as the Apps Script.":"Applies the workbook team-stat lookups and position-specific production calculations to the latest imported player data."}</p><button onClick={tool.id==="production"?productionRun:collegeRun}>Run</button></div>:<div className="notice">This command is being translated from its Apps Script workflow. It is intentionally not redirected to another page; the final version will execute here as a popup or automated task.</div>}
{msg&&<div className="notice">{msg}</div>}</div></div>}</>}