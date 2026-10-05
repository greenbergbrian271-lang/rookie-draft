"use client";
import {setDraftClass,useDraftClassState} from "@/lib/use-draft-class";

export default function Brand(){
  const {draftClass,activeDraftClass,lockedDraftClasses}=useDraftClassState();
  const lastYear=Math.max(2029,activeDraftClass+2,draftClass);
  const years=Array.from({length:lastYear-2020+1},(_,i)=>2020+i);
  return <div className="brand">
    Rookie Draft{" "}
    <select className="year-select" value={draftClass} onChange={e=>setDraftClass(Number(e.target.value))}>
      {years.map(year=><option key={year} value={year}>
        {year}{lockedDraftClasses.includes(year)?" · Locked":year===activeDraftClass?" · Active":""}
      </option>)}
    </select>
    <small>Scouting Command Center</small>
  </div>;
}
