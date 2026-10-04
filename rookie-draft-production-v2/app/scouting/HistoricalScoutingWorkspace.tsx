"use client";

import {useEffect,useMemo,useState} from "react";
import QBScoutingWorkspace from "./QBScoutingWorkspace";
import RBScoutingWorkspace from "./RBScoutingWorkspace";
import WRScoutingWorkspace from "./WRScoutingWorkspace";
import TEScoutingWorkspace from "./TEScoutingWorkspace";
import {schoolStyle} from "@/lib/school-colors";

type Pos="QB"|"RB"|"WR"|"TE";
type SnapshotField={group:string;label:string;value:any};
type Snapshot={name:string;college:string|null;grades:Record<string,any>;fields:SnapshotField[];commentary?:string|null;gameLabel?:string|null};
type HistoricalRow={player:any;snapshot:Snapshot;priorReport?:any};
const POSITIONS:Pos[]=["QB","RB","WR","TE"];

function asNumber(v:any){const n=Number(v);return v==null||v===""||!Number.isFinite(n)?null:n}
function gradeMap(snapshot:Snapshot){
  const g=snapshot.grades||{},out:Record<string,number|null>={};
  const put=(key:string,label:string)=>{if(Object.prototype.hasOwnProperty.call(g,label))out[key]=asNumber(g[label])};
  put("scouting","Scouting Grade");put("production","Production Grade");put("analytical","Analytical Grade");put("pre","Pre-Draft Grade");put("final","Draft Adjusted Final Grade");
  if(Object.prototype.hasOwnProperty.call(g,"Combine/Pro Day Grade"))out.combine=asNumber(g["Combine/Pro Day Grade"]);
  else if(Object.prototype.hasOwnProperty.call(g,"Combine/Pro Day Score"))out.combine=asNumber(g["Combine/Pro Day Score"]);
  return out;
}
function normalizeLabel(raw:string){
  const label=String(raw||"").trim();
  const aliases:Record<string,string>={
    "Weightd Dom Rtg":"Weighted Dom Rtg",
    "Yards/target":"Yards/Tgt",
    "Yards / Target":"Yards/Tgt",
    "1st/target":"1st Downs / Tgt",
    "40-YD":"40 Yard Dash",
    "Bench Press":"Bench Reps"
  };
  return aliases[label]||label;
}
function normalizeField(pos:Pos,field:SnapshotField,seen:Record<string,number>){
  let label=normalizeLabel(field.label),value=field.value;
  const weighted=field.group==="Scouting"?label.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\)$/):null;
  if(weighted){
    label=weighted[1].trim();
    const max=Number(weighted[2]),n=Number(value);
    if(Number.isFinite(max)&&max>0&&Number.isFinite(n))value=n/max*100;
  }
  if(label==="Team Score (5)"){label="Team Score (10)";const n=Number(value);if(Number.isFinite(n))value=n*2}
  if(label==="Draft Capital Score (5)"){label="Draft Capital Score (10)";const n=Number(value);if(Number.isFinite(n))value=n*2}
  const k=label;seen[k]=(seen[k]||0)+1;
  if(pos==="QB"&&/Stats$/i.test(field.group)){
    if(label==="Yards"&&seen[k]>1)label="Rush Yards";
    if(label==="Yards/Attempt"&&seen[k]>1)label="Rush Yards/Attempt";
    if(label==="Touchdowns"&&seen[k]>1)label="Rush Touchdowns";
  }
  if(pos==="RB"&&/Stats$/i.test(field.group)&&field.group!=="Team Stats"){
    if(label==="Touchdowns")label=seen[k]===1?"Rush Touchdowns":"Rec Touchdowns";
    if(label==="Yards")label="Rec Yards";
  }
  return {label,value,group:field.group};
}
function historicalGameSessions(snapshot:Snapshot,playerId:string|number){
  const commentary=String(snapshot.commentary||"").replace(/\r\n/g,"\n").trim();
  if(!commentary)return [];
  const blocks=commentary.split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean);
  const sessions:any[]=[];
  for(const block of blocks){
    const match=block.match(/^([^:\n]{1,100}):\s*([\s\S]*)$/);
    if(match){
      const label=match[1].trim().replace(/^Post\s+/i,"");
      sessions.push({id:"historical-"+playerId+"-"+sessions.length,opponent:label||"Scouting note",raw_notes:match[2].trim(),legacy:true});
    }else if(sessions.length){
      sessions[sessions.length-1].raw_notes=(sessions[sessions.length-1].raw_notes+"\n\n"+block).trim();
    }else{
      sessions.push({id:"historical-"+playerId+"-0",opponent:String(snapshot.gameLabel||"Legacy scouting note").trim()||"Legacy scouting note",raw_notes:block,legacy:true});
    }
  }
  return sessions;
}
function adaptRows(pos:Pos,rows:HistoricalRow[]){
  const vals:Record<string,any>={},imports:any[]=[],grades:Record<string,any>={};
  const players=rows.map((row,index)=>{
    const p={...row.player,watch_order:index+1},imp:any={Player:p.name,"Player, College":p.name+(p.college?", "+p.college:""),College:p.college||row.snapshot.college||""},seen:Record<string,number>={},team:any={};
    for(const field of row.snapshot.fields||[]){
      const f=normalizeField(pos,field,seen);
      if(!f.label)continue;
      imp[f.label]=f.value;
      const key=String(p.id)+"|"+f.label;
      if(vals[key]===undefined)vals[key]=f.value;
      if(f.group==="Team Stats"){
        const n=asNumber(f.value);
        if(n!=null){
          if(f.label==="Pass Attempts")team.passAttempts=n;
          else if(f.label==="Pass Yards"||f.label==="Rec Yards")team.passYards=n;
          else if(f.label==="Pass TDs"||f.label==="Rec TDs")team.passTDs=n;
          else if(f.label==="Rush Yards")team.rushYards=n;
          else if(f.label==="Rush TDs")team.rushTDs=n;
          else if(f.label==="Completions")team.completions=n;
          else if(f.label==="Plays"||f.label==="Total Plays")team.totalPlays=n;
        }
      }
    }
    if(Object.keys(team).length)imp["Team Context"]=team;
    if(row.snapshot.commentary)vals[String(p.id)+"|__COMMENTARY__"]=row.snapshot.commentary;
    if(row.snapshot.gameLabel)vals[String(p.id)+"|__GAME_LABEL__"]=row.snapshot.gameLabel;
    vals[String(p.id)+"|__HISTORICAL_SESSIONS__"]=historicalGameSessions(row.snapshot,p.id);
    grades[String(p.id)]=gradeMap(row.snapshot);
    imports.push(imp);
    return p;
  });
  return {players,vals,imports,grades};
}

function EarlyArchive({draftClass}:{draftClass:number}){
  const [players,setPlayers]=useState<any[]>([]),[loading,setLoading]=useState(true);
  useEffect(()=>{let live=true;setLoading(true);fetch("/api/players",{cache:"no-store"}).then(r=>r.json()).then(j=>{if(!live)return;const rows=Array.isArray(j)?j.filter((p:any)=>Number(p.draft_class)===draftClass):[];rows.sort((a:any,b:any)=>(Number(a.watch_order)||9999)-(Number(b.watch_order)||9999)||Number(a.id)-Number(b.id));setPlayers(rows)}).catch(()=>live&&setPlayers([])).finally(()=>live&&setLoading(false));return()=>{live=false}},[draftClass]);
  return <div className="historical-early">
    <div className="page-head"><div><span className="ey">{draftClass} · Historical Draft Class</span><h1>{draftClass} Rookie Rankings</h1><p className="muted">This class predates the graded scouting-card format, so the original player order is preserved without adding grades that did not exist.</p></div><span className="status">● Read-only snapshot</span></div>
    {loading?<div className="card historical-early-empty">Loading {draftClass} class…</div>:<div className="historical-early-list">{players.map((p:any,i:number)=><div className="card historical-early-row" key={p.id} style={schoolStyle(p.college)}><strong>{i+1}</strong><div><b>{p.name}</b><span>{p.position}{p.college?" · "+p.college:""}</span></div></div>)}</div>}
    <style jsx global>{`.historical-early{max-width:1180px;margin:0 auto}.historical-early-list{display:grid;gap:7px}.historical-early-row{display:grid;grid-template-columns:54px 1fr;align-items:center;padding:13px 16px}.historical-early-row>strong{font-size:22px}.historical-early-row b,.historical-early-row span{display:block}.historical-early-row span{margin-top:3px;font-size:11px;color:#9db0ca}.historical-early-empty{padding:24px}`}</style>
  </div>
}

export default function HistoricalScoutingWorkspace({draftClass}:{draftClass:number}){
  const [pos,setPos]=useState<Pos>("QB"),[rows,setRows]=useState<HistoricalRow[]>([]),[vals,setVals]=useState<Record<string,any>>({}),[imports,setImports]=useState<any[]>([]),[grades,setGrades]=useState<Record<string,any>>({}),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{const q=new URLSearchParams(window.location.search).get("pos") as Pos|null;if(q&&POSITIONS.includes(q))setPos(q)},[]);
  useEffect(()=>{
    if(draftClass<=2021)return;
    let live=true;setLoading(true);setError("");
    fetch("/api/historical-scouting?draftClass="+draftClass+"&position="+pos,{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load historical scouting data");if(!live)return;const next=Array.isArray(j.rows)?j.rows:[];setRows(next);const adapted=adaptRows(pos,next);setVals(adapted.vals);setImports(adapted.imports);setGrades(adapted.grades)}).catch(e=>{if(live){setRows([]);setVals({});setImports([]);setGrades({});setError(e?.message||"Could not load historical scouting data")}}).finally(()=>live&&setLoading(false));
    return()=>{live=false};
  },[draftClass,pos]);
  const players=useMemo(()=>adaptRows(pos,rows).players,[rows,pos]);
  const priorReports=useMemo(()=>Object.fromEntries(rows.filter(r=>r.priorReport&&r.player?.id).map(r=>[String(r.player.id),r.priorReport])),[rows]);
  if(draftClass<=2021)return <EarlyArchive draftClass={draftClass}/>;
  const props={players,vals,setVals,imports,glossary:[] as any[][],draftClass,priorReports,archiveMode:true,gradeOverrides:grades,onSave:async()=>null,onAdd:()=>{}};
  return <div className="historical-parity">
    <div className="page-head"><div><span className="ey">{draftClass} Scouting Workspace</span><h1>{pos} Scouting</h1><p className="muted">2027 scouting-card parity using only values preserved in the {draftClass} workbook. Metrics that did not exist yet remain unavailable.</p></div><span className="status">● Historical · read-only</span></div>
    <div className="tabs scouting-position-tabs">{POSITIONS.map(x=><button key={x} className={`scouting-position-tab pos-${x.toLowerCase()} ${x===pos?"active":"ghost"}`} onClick={()=>setPos(x)}>{x} Scouting</button>)}</div>
    {error&&<div className="notice">{error}</div>}
    {loading?<div className="card historical-parity-loading">Loading {draftClass} {pos} scouting cards…</div>:pos==="QB"?<QBScoutingWorkspace {...props}/>:pos==="RB"?<RBScoutingWorkspace {...props}/>:pos==="WR"?<WRScoutingWorkspace {...props}/>:<TEScoutingWorkspace {...props}/>}
    <style jsx global>{`
      .historical-parity-loading{padding:24px}
      .historical-parity input,.historical-parity textarea,.historical-parity select{pointer-events:none}
      .historical-parity .qb-game-log .ghost,.historical-parity .qb-game-note.new{display:none!important}
      .historical-parity .qb-save-state{min-width:142px}
    `}</style>
  </div>
}
