"use client";
import {useEffect,useState} from "react";

const ROWS:{key:string;label:string;note:string;data:boolean}[]=[
  {key:"meas",label:"Measurables",note:"Height, weight, BMI, 40-yard dash, Speed Score",data:true},
  {key:"prod",label:"Production",note:"Final-season college stats and usage",data:true},
  {key:"anal",label:"Analytics",note:"PFF-style stats (ADOT, drop %, Y/RR, elusive rating, etc.)",data:true},
  {key:"grade",label:"Analytical Grade",note:"The data-driven grade only (Scouting Grade is not used)",data:true},
  {key:"skill",label:"Scouting ratings",note:"Your skill ratings, rescaled to 0-100",data:false},
  {key:"notes",label:"Scouting notes",note:"Text similarity of your notes (needs notes on both players)",data:false},
];

export default function CompWeightsPanel(){
  const [w,setW]=useState<Record<string,number>|null>(null),[defaults,setDefaults]=useState<Record<string,number>>({}),[saved,setSaved]=useState<Record<string,number>|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{fetch("/api/player-comps/weights").then(r=>r.json()).then(j=>{if(j.weights){setW(j.weights);setSaved(j.weights);setDefaults(j.defaults)}else setMsg(j.error||"Could not load weights")}).catch(e=>setMsg(String(e?.message||e)))},[]);
  if(!w)return <section className="cw-panel"><h2>Player Comps weights</h2><p className="cw-note">{msg||"Loading…"}</p></section>;
  const total=ROWS.reduce((a,r)=>a+(Number(w[r.key])||0),0),dataShare=ROWS.filter(r=>r.data).reduce((a,r)=>a+(Number(w[r.key])||0),0);
  const dirty=JSON.stringify(w)!==JSON.stringify(saved);
  async function post(body:unknown){
    setBusy(true);setMsg("");
    try{const r=await fetch("/api/player-comps/weights",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not save");setW(j.weights);setSaved(j.weights);setDefaults(j.defaults);setMsg("Saved. Comps use the new weights immediately.")}
    catch(e:any){setMsg(String(e?.message||e))}
    finally{setBusy(false)}
  }
  return <section className="cw-panel">
    <div className="cw-head"><div><h2>Player Comps weights</h2><p className="cw-note">How much each kind of evidence counts when finding a comp. Groups a player has no data for drop out and the rest are rescaled, so these act as relative importance. Draft capital and archetypes are never used.</p></div>
      <div className={"cw-total "+(total===100?"ok":"bad")}>{total}%<small>{total===100?"total":"must equal 100%"}</small></div></div>
    <div className="cw-rows">{ROWS.map(r=><label key={r.key} className="cw-row">
      <span><b>{r.label}</b><small>{r.note}</small></span>
      <span className="cw-input"><input type="number" min={0} max={100} step={1} value={w[r.key]} onChange={e=>setW({...w,[r.key]:e.target.value===""?0:Math.max(0,Math.min(100,Math.round(Number(e.target.value))))})}/><em>%</em></span>
      <small className="cw-default">default {defaults[r.key]}%</small>
    </label>)}</div>
    <div className="cw-foot"><span className="cw-note">Data-driven {dataShare}% · opinion-based {total-dataShare}%</span>
      <span className="cw-actions"><button className="ghost small" disabled={busy} onClick={()=>void post({reset:true})}>Reset to defaults</button><button className="small" disabled={busy||total!==100||!dirty} onClick={()=>void post({weights:w})}>Save weights</button></span></div>
    {msg&&<p className="cw-note">{msg}</p>}
  </section>;
}
