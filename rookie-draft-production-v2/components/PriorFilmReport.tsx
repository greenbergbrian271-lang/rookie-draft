"use client";
import {useEffect,useMemo,useState} from "react";

export default function PriorFilmReport({report}:{report?:any}){
  const [open,setOpen]=useState(false);
  useEffect(()=>setOpen(false),[report?.playerId,report?.fromDraftClass]);

  const grades=Array.isArray(report?.filmGrades)?report.filmGrades:[];
  const notes=Array.isArray(report?.priorNotes)?report.priorNotes:[];
  const legacy=String(report?.priorCommentary??"").trim();
  const legacyLabel=String(report?.priorGameLabel??"").trim();

  const noteBlocks=useMemo(()=>{
    const blocks=notes.map((n:any)=>({
      key:"session-"+String(n.id??Math.random()),
      label:n.opponent||n.gameDate||"Scouting note",
      note:String(n.rawNotes||"").trim(),
      writeup:String(n.overallWriteup||"").trim()
    })).filter((n:any)=>n.note||n.writeup);
    if(legacy&&!blocks.some((n:any)=>n.note===legacy||n.writeup===legacy)){
      blocks.push({key:"legacy",label:legacyLabel||"Prior scouting note",note:legacy,writeup:""});
    }
    return blocks;
  },[notes,legacy,legacyLabel]);

  if(!report||(!grades.length&&!noteBlocks.length))return null;

  return <section
    className="prior-year-lookback"
    data-player-profile-ignore="true"
    onClick={e=>e.stopPropagation()}
    onMouseDown={e=>e.stopPropagation()}
    aria-label={report.fromDraftClass+" prior year scouting lookback"}
  >
    <button
      type="button"
      className="prior-year-lookback-toggle"
      aria-expanded={open}
      onClick={e=>{e.preventDefault();e.stopPropagation();setOpen(v=>!v)}}
    >
      <span><small>PRIOR YEAR LOOKBACK</small><strong>{report.fromDraftClass} scouting report</strong><em>Kept out of view so the new evaluation starts clean.</em></span>
      <b>{open?"Hide prior report ↑":"Show prior report ↓"}</b>
    </button>
    {open&&<div className="prior-year-lookback-body">
      {grades.length>0&&<div className="prior-year-lookback-section">
        <div className="prior-year-lookback-head"><span>Film Grades</span><small>{grades.length} archived trait{grades.length===1?"":"s"}</small></div>
        <div className="prior-year-lookback-grades">{grades.map((g:any)=><div key={g.category}><span>{g.category}</span><strong>{g.value??"—"}</strong></div>)}</div>
      </div>}
      {noteBlocks.length>0&&<div className="prior-year-lookback-section">
        <div className="prior-year-lookback-head"><span>Scouting Notes</span><small>{noteBlocks.length} archived entr{noteBlocks.length===1?"y":"ies"}</small></div>
        <div className="prior-year-lookback-notes">{noteBlocks.map((n:any)=><div key={n.key}><strong>{n.label}</strong>{n.note&&<p>{n.note}</p>}{n.writeup&&<p className="writeup">{n.writeup}</p>}</div>)}</div>
      </div>}
      <p className="prior-year-lookback-foot">Read-only {report.fromDraftClass} context. None of these grades or notes feed the active {report.toDraftClass} evaluation.</p>
    </div>}
  </section>;
}
