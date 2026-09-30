"use client";
import {useEffect,useMemo,useState} from "react";

export const DRAFT_PROJECTION_OPTIONS=["Top 5","Top 10","First Round","Day 2","Early Day 3","Late Day 3","UDFA"] as const;

export type DraftPick={overall:number;pos:"QB"|"RB"|"WR"|"TE";name:string;team:string;college?:string;teamScore:number;draftCapitalScore:number};
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");

export function useDraftFeed(){
  const [picks,setPicks]=useState<DraftPick[]>([]);
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;
    const load=()=>fetch("/api/nfl-draft-results",{cache:"no-store"}).then(r=>r.json()).then(j=>{if(!live)return;if(Array.isArray(j?.picks))setPicks(j.picks);setUpdatedAt(String(j?.updatedAt||new Date().toISOString()))}).catch(()=>{});
    load();const timer=setInterval(load,60000);
    return()=>{live=false;clearInterval(timer)};
  },[]);
  return {picks,updatedAt};
}
export function useDraftPicks(){return useDraftFeed().picks}
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

export function DraftAdjustmentPanel({preDraft,finalGrade,draftResult,teamScore,draftCapital,teamAdj,capitalAdj,production=true,updatedAt}:{preDraft:number|null,finalGrade:number|null,draftResult:string,teamScore:number,draftCapital:number,teamAdj:number|null,capitalAdj:number|null,production?:boolean,updatedAt?:string|null}){
  const fmt=(v:number|null)=>v==null?"—":v.toFixed(2);
  return <div className="qb-tab-content">
    <div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2><p>See exactly how landing spot and draft capital move the pre-draft grade after the NFL Draft.</p></div>{updatedAt&&<DataFreshness label="Draft feed" value={updatedAt}/>}</div>
    <div className="qb-draft-grid">
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

export function earlyDeclareStatus(classLabel:any,override:any){
  const value=String(override??"").trim();
  const label=String(classLabel??"").trim();
  if(/^yes$/i.test(value))return {yes:true,source:"override" as const,classLabel:label};
  if(/^no$/i.test(value))return {yes:false,source:"override" as const,classLabel:label};
  const token=label.toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(/(JR|SO|FR)$/.test(token))return {yes:true,source:"auto" as const,classLabel:label};
  if(/SR$/.test(token))return {yes:false,source:"auto" as const,classLabel:label};
  return {yes:false,source:"unknown" as const,classLabel:label};
}
export function EarlyDeclareField({classLabel,value,onCommit}:{classLabel:any,value:any,onCommit:(v:string)=>void|Promise<any>}){
  const status=earlyDeclareStatus(classLabel,value);
  return <label className="qb-field"><span>Early Declare<em>Scout</em></span><div className="rb-early-control"><select value={String(value||"Auto")} onChange={e=>onCommit(e.target.value==="Auto"?"":e.target.value)}><option>Auto</option><option>Yes</option><option>No</option></select><small>{status.source==="auto"?"Auto · "+(status.classLabel||"class")+" → "+(status.yes?"Yes":"No"):status.source==="override"?"Override · "+(status.yes?"Yes":"No"):"Auto · Class unavailable"}</small></div></label>
}
export function DataFreshness({label,value}:{label:string,value:any}){
  const raw=String(value??"").trim();if(!raw)return null;
  const d=new Date(raw),shown=Number.isNaN(d.getTime())?raw:d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  return <span className="scouting-freshness">{label} · {shown}</span>;
}
export function PercentileMetricCard({label,detail,value,percentile,inverse=false}:{label:string,detail?:string,value:any,percentile:number|null,inverse?:boolean}){
  const p=percentile==null?null:Math.max(0,Math.min(1,percentile));
  return <div className="qb-metric"><div className="qb-metric-top"><div><span>{label}</span><small>{detail||(inverse?"Lower raw is better":"Higher raw is better")}</small></div><b>{value??"—"}</b></div><div className="qb-percentile heat"><i style={{left:((p??0)*100)+"%",background:`hsl(${Math.round((p??0)*120)} 72% 48%)`}}/></div><div className="qb-metric-foot"><span>Quality percentile</span><strong>{p==null?"—":Math.round(p*100)}</strong></div></div>
}

function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
