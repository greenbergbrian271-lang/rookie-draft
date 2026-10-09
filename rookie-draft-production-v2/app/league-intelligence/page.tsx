"use client";

import {useEffect,useState} from "react";
import LeagueStrengthMatrix from "../dynasty-rosters/league-strength-matrix";
import DynastyIntelligencePanel from "../dynasty-rosters/dynasty-intelligence-panel";

type League={key:string;label:string;league:string};

export default function LeagueIntelligencePage(){
  const [leagues,setLeagues]=useState<League[]>([]);
  const [leagueKey,setLeagueKey]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let live=true;
    fetch("/api/dynasty-rosters",{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load dynasty leagues");return j})
      .then(j=>{
        if(!live)return;
        const next=(j?.rosters||[]) as League[];
        setLeagues(next);
        setLeagueKey(current=>next.some(x=>x.key===current)?current:(next[0]?.key||""));
      })
      .catch(e=>{if(live)setError(e?.message||"Could not load dynasty leagues")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[]);

  return <div className="li-page">
    <div className="page-head li-head">
      <div>
        <div className="ey">League-wide dynasty analysis</div>
        <h1>League Intelligence</h1>
        <p className="muted">Understand your opponents, positional markets, manager tendencies and how every roster compares. Use <b>Manager Tendencies</b> below for positional biases, trade style, pick behavior, transaction history and comparable trades.</p>
      </div>
    </div>

    {error&&<div className="notice">{error}</div>}
    {loading&&!leagues.length?<div className="li-loading">Loading connected dynasty leagues…</div>:<>
      <div className="li-tabs" role="tablist" aria-label="League Intelligence leagues">
        {leagues.map(item=><button key={item.key} type="button" role="tab" aria-selected={leagueKey===item.key} className={leagueKey===item.key?"active":""} onClick={()=>setLeagueKey(item.key)}>{item.label}</button>)}
      </div>
      {leagueKey&&<>
        <LeagueStrengthMatrix leagueKey={leagueKey}/>
        <DynastyIntelligencePanel leagueKey={leagueKey}/>
      </>}
    </>}

    <style jsx global>{`
      .li-page{max-width:1720px;margin:0 auto;padding-bottom:30px}.li-head{margin-bottom:12px}.li-head h1{margin-bottom:4px}
      .li-tabs{display:flex;gap:7px;overflow:auto;padding:5px;margin-bottom:12px;background:#081426;border:1px solid #20395f;border-radius:12px;width:max-content;max-width:100%}
      .li-tabs button{background:transparent;border:1px solid transparent;color:#91a7c4;padding:8px 12px;white-space:nowrap;font-size:12px}.li-tabs button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.12)}
      .li-loading{padding:24px;border:1px solid #20395f;border-radius:12px;background:#09182c;color:#7890b1}
    `}</style>
  </div>;
}
