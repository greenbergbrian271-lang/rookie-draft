"use client";

import {useEffect,useState} from "react";
import type {IntegrationsConfig,SleeperLeagueIntegration} from "@/lib/integrations";

const emptyLeague=():SleeperLeagueIntegration=>({
  key:"league-"+Date.now(),
  name:"",
  leagueId:"",
  teamIdentity:"",
  tePremium:false,
  enabled:true,
});

export default function IntegrationsPage(){
  const [config,setConfig]=useState<IntegrationsConfig|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{void load()},[]);
  async function load(){
    try{
      const res=await fetch("/api/integrations",{cache:"no-store"});
      const data=await res.json();
      if(!res.ok)throw new Error(data?.error||"Could not load integrations");
      setConfig(data);
    }catch(e:any){setMessage(e?.message||"Could not load integrations")}
  }
  function updateLeague(index:number,patch:Partial<SleeperLeagueIntegration>){
    setConfig(current=>current?{
      ...current,
      sleeper:{...current.sleeper,leagues:current.sleeper.leagues.map((league,i)=>i===index?{...league,...patch}:league)}
    }:current);
  }
  function addLeague(){
    setConfig(current=>current?{...current,sleeper:{...current.sleeper,leagues:[...current.sleeper.leagues,emptyLeague()]}}:current);
  }
  function removeLeague(index:number){
    setConfig(current=>current?{...current,sleeper:{...current.sleeper,leagues:current.sleeper.leagues.filter((_,i)=>i!==index)}}:current);
  }
  async function save(){
    if(!config)return;
    setSaving(true);setMessage("");
    try{
      const res=await fetch("/api/integrations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(config)});
      const data=await res.json();
      if(!res.ok)throw new Error(data?.error||"Could not save integrations");
      setConfig(data.config);
      setMessage("Integrations saved.");
    }catch(e:any){setMessage(e?.message||"Could not save integrations")}
    finally{setSaving(false)}
  }

  return <div className="integrations-page">
    <div className="page-head integrations-head">
      <div>
        <div className="ey">External connections</div>
        <h1>Integrations</h1>
        <p className="muted">Manage the external IDs and connection settings the Rookie Draft app uses.</p>
      </div>
      <button className="integrations-save" disabled={!config||saving} onClick={save}>{saving?"Saving…":"Save Integrations"}</button>
    </div>

    <section className="integration-card">
      <div className="integration-card-head">
        <div><div className="integration-kicker">Sleeper</div><h2>Sleeper League IDs</h2></div>
        <button className="ghost" type="button" onClick={addLeague} disabled={!config}>+ Add League</button>
      </div>
      <p className="muted integration-note">These IDs drive Dynasty Rosters and future Sleeper-powered draft features. Changes take effect after saving.</p>

      {!config?<div className="integration-loading">Loading integrations…</div>:<div className="league-settings">
        {config.sleeper.leagues.map((league,index)=><div className="league-setting" key={league.key}>
          <div className="league-setting-main">
            <label>League Name<input value={league.name} onChange={e=>updateLeague(index,{name:e.target.value})} placeholder="League name"/></label>
            <label>Sleeper League ID<input inputMode="numeric" value={league.leagueId} onChange={e=>updateLeague(index,{leagueId:e.target.value.replace(/\D/g,"")})} placeholder="Sleeper league ID"/></label>
            <label className="enabled-toggle"><span>Enabled</span><input type="checkbox" checked={league.enabled!==false} onChange={e=>updateLeague(index,{enabled:e.target.checked})}/></label>
          </div>
          <details>
            <summary>Advanced roster matching</summary>
            <div className="league-advanced">
              <label>My Team / Sleeper Username<input value={league.teamIdentity||""} onChange={e=>updateLeague(index,{teamIdentity:e.target.value})} placeholder="Roster ID, username, or owner ID"/></label>
              <label className="enabled-toggle"><span>TE Premium</span><input type="checkbox" checked={Boolean(league.tePremium)} onChange={e=>updateLeague(index,{tePremium:e.target.checked})}/></label>
              <button className="danger-ghost" type="button" onClick={()=>removeLeague(index)}>Remove League</button>
            </div>
          </details>
        </div>)}
      </div>}
    </section>

    <section className="integration-card future-integrations">
      <div className="integration-card-head"><div><div className="integration-kicker">Expandable</div><h2>Additional Integrations</h2></div></div>
      <p className="muted">This area is reserved for additional providers and API configuration as the app grows. Sensitive API secrets will use secure server-side storage rather than being exposed in the browser.</p>
    </section>

    {message&&<div className={"integration-message "+(message.includes("saved")?"ok":"error")}>{message}</div>}

    <style jsx>{`
      .integrations-page{max-width:1180px;margin:0 auto}
      .integrations-head{align-items:center}
      .integrations-head p{margin:4px 0 0}
      .integrations-save{background:#18794e;min-width:150px}
      .integration-card{background:#0c1930;border:1px solid #20395f;border-radius:13px;padding:16px;margin-bottom:14px}
      .integration-card-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px}
      .integration-card-head h2{margin:2px 0 0;font-size:20px}
      .integration-kicker{color:#58a7ff;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
      .integration-note{margin:0 0 14px}
      .league-settings{display:grid;gap:10px}
      .league-setting{background:#0a172a;border:1px solid #1d3558;border-radius:10px;padding:12px}
      .league-setting-main{display:grid;grid-template-columns:minmax(220px,1.25fr) minmax(240px,1fr) 100px;gap:12px;align-items:end}
      .league-setting label,.league-advanced label{display:grid;gap:5px;color:#93a9c7;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
      .league-setting input{font-size:13px}
      .enabled-toggle{align-content:end;justify-items:start}
      .enabled-toggle input{width:auto;transform:scale(1.15);margin:8px 0 10px}
      details{margin-top:10px;border-top:1px solid #18304f;padding-top:8px}
      summary{cursor:pointer;color:#8fa7c8;font-size:11px;font-weight:850}
      .league-advanced{display:grid;grid-template-columns:minmax(240px,1fr) 120px auto;gap:12px;align-items:end;margin-top:10px}
      .danger-ghost{background:#351721!important;border:1px solid #7d3345!important;color:#ffb7c4}
      .future-integrations{min-height:130px}
      .integration-loading{padding:24px;color:#8fa7c8;text-align:center}
      .integration-message{position:sticky;bottom:16px;padding:11px 14px;border-radius:9px;font-weight:850}
      .integration-message.ok{background:#123b2c;border:1px solid #247a55;color:#bff4d7}
      .integration-message.error{background:#3c1720;border:1px solid #8b354b;color:#ffd1da}
      @media(max-width:780px){
        .integrations-head{display:block}
        .integrations-save{margin-top:12px}
        .league-setting-main,.league-advanced{grid-template-columns:1fr}
        .enabled-toggle{display:flex!important;align-items:center;gap:10px}
      }
    `}</style>
  </div>;
}
