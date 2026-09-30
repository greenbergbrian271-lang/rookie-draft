"use client";
import {useEffect,useMemo,useState} from "react";

export const DRAFT_PROJECTION_OPTIONS=["Top 5","Top 10","First Round","Day 2","Early Day 3","Late Day 3","UDFA"] as const;

export type DraftPick={overall:number;pos:"QB"|"RB"|"WR"|"TE";name:string;team:string;college?:string;teamScore:number;draftCapitalScore:number};
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");

export function useDraftPicks(){
  const [picks,setPicks]=useState<DraftPick[]>([]);
  useEffect(()=>{
    let live=true;
    const load=()=>fetch("/api/nfl-draft-results",{cache:"no-store"}).then(r=>r.json()).then(j=>{if(live&&Array.isArray(j?.picks))setPicks(j.picks)}).catch(()=>{});
    load();const timer=setInterval(load,60000);
    return()=>{live=false;clearInterval(timer)};
  },[]);
  return picks;
}
export function resolveDraftContext(position:"QB"|"RB"|"WR"|"TE",playerName:string,picks:DraftPick[],fallback:{result?:any,teamScore?:any,draftCapitalScore?:any}={}){
  const live=picks.find(x=>x.pos===position&&norm(x.name)===norm(playerName));
  const number=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const storedResult=String(fallback.result??"").trim();
  return {
    result:live?("Pick "+live.overall+", "+live.team):(storedResult||"Pending"),
    team:live?.team||"",
    teamScore:live?.teamScore??number(fallback.teamScore)??5,
    draftCapitalScore:live?.draftCapitalScore??number(fallback.draftCapitalScore)??5,
    automated:Boolean(live)
  };
}

export function DraftAdjustmentPanel({preDraft,finalGrade,draftResult,teamScore,draftCapital,teamAdj,capitalAdj,production=true}:{preDraft:number|null,finalGrade:number|null,draftResult:string,teamScore:number,draftCapital:number,teamAdj:number|null,capitalAdj:number|null,production?:boolean}){
  const fmt=(v:number|null)=>v==null?"—":v.toFixed(2);
  return <div className="qb-tab-content">
    <div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2><p>See exactly how landing spot and draft capital move the pre-draft grade after the NFL Draft.</p></div></div>
    <div className="qb-context-grid"><ReadOnly label="Team Score (10)" value={teamScore.toFixed(2)}/><ReadOnly label="Draft Capital Score (10)" value={draftCapital.toFixed(2)}/><ReadOnly label="Draft Result" value={draftResult}/></div>
    <div className="qb-draft-grid scouting-draft-flow">
      <div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{fmt(preDraft)}</strong><small>{production?"Scouting + production + analytics":"Scouting + analytics"}</small></div>
      <div className="qb-draft-arrow">→</div>
      <div className="qb-draft-card"><span>NFL Draft Result</span><strong>{draftResult}</strong><small>Auto-filled after the NFL Draft</small></div>
      <div className="qb-draft-arrow">→</div>
      <div className="qb-draft-card final"><span>Draft-Adjusted Final</span><strong>{fmt(finalGrade)}</strong><small>{preDraft!=null&&finalGrade!=null?((finalGrade-preDraft)>=0?"+":"")+(finalGrade-preDraft).toFixed(2)+" total adjustment":"Team fit + draft capital"}</small></div>
    </div>
    <div className="qb-draft-detail">
      <div className="qb-draft-card"><span>Team Fit</span><strong>{teamScore.toFixed(2)} / 10</strong><small>{teamAdj==null?"Waiting for pre-draft grade":((teamAdj>=0?"+":"")+teamAdj.toFixed(2)+" grade points")}</small></div>
      <div className="qb-draft-card"><span>Draft Capital</span><strong>{draftCapital.toFixed(2)} / 10</strong><small>{capitalAdj==null?"Waiting for pre-draft grade":((capitalAdj>=0?"+":"")+capitalAdj.toFixed(2)+" grade points")}</small></div>
      <div className="qb-draft-card final"><span>Adjustment Math</span><strong>{preDraft==null||finalGrade==null?"—":(finalGrade-preDraft).toFixed(2)}</strong><small>{teamAdj==null||capitalAdj==null?"Post-draft inputs populate this breakdown":((teamAdj>=0?"+":"")+teamAdj.toFixed(2)+" team fit · "+(capitalAdj>=0?"+":"")+capitalAdj.toFixed(2)+" draft capital")}</small></div>
    </div>
  </div>
}

function splitMulti(value:any){return String(value??"").split(/\s*[|,]\s*/).map(x=>x.trim()).filter(Boolean)}
export function MultiSelectField({label,value,options,onCommit}:{label:string,value:any,options:readonly string[],onCommit:(v:string)=>void|Promise<any>}){
  const [open,setOpen]=useState(false);
  const selected=useMemo(()=>splitMulti(value),[value]);
  const toggle=(option:string)=>{const next=selected.includes(option)?selected.filter(x=>x!==option):[...selected,option];onCommit(next.join(" | "))};
  return <label className="qb-field qb-multi-field"><span>{label}<em>Scout</em></span><div className="qb-multi-select">
    <button type="button" className="qb-multi-trigger" onClick={e=>{e.preventDefault();setOpen(x=>!x)}}>{selected.length?selected.join(", "):"Select…"}<b>▾</b></button>
    {open&&<div className="qb-multi-menu">{options.map(option=><button type="button" key={option} className={selected.includes(option)?"selected":""} onClick={e=>{e.preventDefault();toggle(option)}}><span>{selected.includes(option)?"✓":""}</span>{option}</button>)}</div>}
  </div></label>
}

function mockSlug(name:string){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
export function MockDraftablePanel({playerName,position,data}:{playerName:string,position:"QB"|"RB"|"WR"|"TE",data:any}){
  const measurements=[
    ["Wingspan",data?.Wingspan],
    ["Arm Length",data?.["Arm Length"]],
    ["Hand Size",data?.["Hand Size"]]
  ].filter(([,v])=>v!==null&&v!==undefined&&v!=="");
  const url=String(data?.["MockDraftable URL"]||data?.MockDraftable||"").trim();
  const available=Boolean(url||measurements.length);
  if(!available)return <div className="mockdraftable-unavailable"><span className="ey">MockDraftable</span><strong>MockDraftable data not available yet</strong><p>The spider chart and supplemental measurements will appear automatically once the player has MockDraftable data.</p></div>;
  return <><div className="qb-section-head compact"><div><span className="ey">MockDraftable</span><h2>Spider + Additional Measurements</h2><p>Supplemental measurements and the position-relative spider chart.</p></div></div>
    {measurements.length>0&&<div className="qb-analytics-grid mockdraftable-metrics mockdraftable-unique-metrics">{measurements.map(([label,value])=><div className="qb-metric" key={String(label)}><div className="qb-metric-top"><div><span>{label}</span><small>MockDraftable measurement</small></div><b>{String(value)}</b></div></div>)}</div>}
    <div className="mockdraftable-frame-card mockdraftable-frame-full"><div className="mockdraftable-frame-head"><div><span className="ey">MockDraftable</span><strong>{playerName} · {position}</strong></div><a href={url||("https://www.mockdraftable.com/player/"+mockSlug(playerName))} target="_blank" rel="noreferrer">Open profile ↗</a></div><iframe title={playerName+" MockDraftable spider chart"} src={"https://www.mockdraftable.com/embed/"+mockSlug(playerName)+"?position="+position+"&page=GRAPH"} loading="lazy"/></div>
  </>;
}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
