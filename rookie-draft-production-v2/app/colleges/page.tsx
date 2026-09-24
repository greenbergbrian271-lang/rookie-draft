"use client";
import {useEffect,useState} from "react";
import {workbookReference as w} from "@/lib/workbook-reference";
import ReferenceTable from "../reference-table";
export default function Page(){
 const [level,setLevel]=useState<"FBS"|"FCS">("FBS"),[cloud,setCloud]=useState<any[]>([]);
 useEffect(()=>{fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json()).then(j=>Array.isArray(j)&&setCloud(j)).catch(()=>{})},[]);
 const rows=cloud.filter(r=>r.subdivision===level);
 const table=rows.length?[["Rank","Team","# of Players to Scout","Players","Games","Completions","Passing Attempts","Pass Yards","Pass TDs","Rush Yards","Rush TDs","Total Plays","Team YAC","Team Air Yards"],...rows.map(r=>[r.rank,r.team,r.playersToScout,r.players,r.games,r.completions,r.passAttempts,r.passYards,r.passTDs,r.rushYards,r.rushTDs,r.totalPlays,r.yac,r.airYards])]:level==="FBS"?w.colleges:w.nonFbs;
 return <><div className="page-head"><div><h1>Colleges (Players + Stats)</h1><p className="muted">{rows.length?"Cloud-persisted team statistics used by production formulas.":"Workbook reference snapshot; run Sheet Tools → Refresh NCAA Stats to populate cloud statistics."}</p></div></div><div className="tabs"><button className={level==="FBS"?"success":"ghost"} onClick={()=>setLevel("FBS")}>FBS</button><button className={level==="FCS"?"success":"ghost"} onClick={()=>setLevel("FCS")}>FCS</button></div><ReferenceTable rows={table}/></>;
}
