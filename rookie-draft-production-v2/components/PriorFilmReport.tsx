"use client";
import {useEffect,useState} from "react";

export default function PriorFilmReport({report}:{report?:any}){
  const [open,setOpen]=useState(false);
  useEffect(()=>setOpen(false),[report?.playerId,report?.fromDraftClass]);
  const grades=Array.isArray(report?.filmGrades)?report.filmGrades:[];
  if(!report||!grades.length)return null;
  return <div style={{margin:"0 0 14px",border:"1px solid #2c4b73",borderRadius:12,background:"linear-gradient(135deg,rgba(19,42,72,.92),rgba(8,23,42,.96))",overflow:"hidden"}}>
    <button type="button" onClick={()=>setOpen(v=>!v)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,padding:"12px 14px",background:"transparent",border:0,color:"#dce8f8",textAlign:"left"}}>
      <span style={{display:"grid",gap:2}}><small style={{color:"#67e8f9",fontWeight:950,letterSpacing:".09em"}}>PRIOR YEAR FILM</small><strong>{report.fromDraftClass} grades are hidden for a fresh evaluation</strong></span>
      <span style={{whiteSpace:"nowrap",fontWeight:900,color:"#9fb9da"}}>{open?"Hide grades ↑":"Show grades ↓"}</span>
    </button>
    {open&&<div style={{borderTop:"1px solid #28466d",padding:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9}}>
        {grades.map((g:any)=><div key={g.category} style={{padding:"10px 11px",borderRadius:9,background:"#0a1b31",border:"1px solid #203b61"}}><span style={{display:"block",fontSize:11,color:"#91a9c8",fontWeight:800,marginBottom:4}}>{g.category}</span><strong style={{fontSize:19,color:"#f4f8ff"}}>{g.value??"—"}</strong></div>)}
      </div>
      <p style={{margin:"10px 0 0",color:"#7892b4",fontSize:11,lineHeight:1.45}}>Read-only snapshot from the {report.fromDraftClass} scouting cycle. New grades entered above remain separate.</p>
    </div>}
  </div>;
}
