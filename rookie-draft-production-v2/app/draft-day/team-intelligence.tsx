"use client";

import {useEffect,useMemo,useState} from "react";
import type {MockLeagueRoom,MockPosition} from "@/lib/mock-draft";

type StrengthRow={rosterId:number;name:string;positions:Record<MockPosition,{rank:number;need:number;label:string}>};
type Probability={target:{name:string;position:string;rank:number};targetPick:{pickNo:number;round:number;slot:number};probability:number;simulations:number;status:string;likelyTakers:{team:string;share:number;averagePick:number|null}[];averageTakenPick:number|null};

export default function DraftDayTeamIntelligence({leagueKey,draftClass}:{leagueKey:string;draftClass:number}){
  const [room,setRoom]=useState<MockLeagueRoom|null>(null),[strengths,setStrengths]=useState<StrengthRow[]>([]),[targetId,setTargetId]=useState(""),[prob,setProb]=useState<Probability|null>(null),[loading,setLoading]=useState(false),[probLoading,setProbLoading]=useState(false),[error,setError]=useState("");

  useEffect(()=>{
    if(!leagueKey)return;
    let live=true;setLoading(true);setError("");setProb(null);setTargetId("");
    Promise.all([
      fetch("/api/mock-draft?leagueKey="+encodeURIComponent(leagueKey)+"&draftClass="+encodeURIComponent(String(draftClass)),{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load team intelligence");return j}),
      fetch("/api/dynasty-rosters/strengths?leagueKey="+encodeURIComponent(leagueKey),{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load strength rankings");return j}),
    ]).then(([r,s])=>{if(!live)return;setRoom(r);setStrengths(s.rows||[])}).catch(e=>{if(live)setError(e?.message||"Could not load draft intelligence")}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[leagueKey,draftClass]);

  const strengthByRoster=useMemo(()=>new Map(strengths.map(x=>[x.rosterId,x])),[strengths]);
  const nextOpen=useMemo(()=>room?.slots.filter(s=>!s.livePlayer).slice(0,6)||[],[room]);

  async function calculate(){
    if(!targetId||!room)return;
    setProbLoading(true);setProb(null);setError("");
    try{
      const r=await fetch("/api/mock-draft/probability",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey,draftClass,targetId,simulations:700})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not simulate availability");setProb(j);
    }catch(e:any){setError(e?.message||"Could not simulate availability")}finally{setProbLoading(false)}
  }

  if(!leagueKey)return null;
  return <section className="ddi-shell">
    <div className="ddi-title"><div><span>Draft Room Intelligence</span><h2>What the teams ahead of you are likely hunting</h2></div><small>KTC league strength + manager draft tendencies</small></div>
    {loading?<div className="ddi-state">Building draft-room intelligence…</div>:error&&!room?<div className="ddi-state">{error}</div>:room?<div className="ddi-grid">
      <div className="ddi-upcoming">
        <h3>Upcoming Open Picks</h3>
        {nextOpen.map(slot=>{
          const team=room.teams.find(t=>t.rosterId===slot.rosterId),strength=strengthByRoster.get(slot.rosterId);
          const needs=(["QB","RB","WR","TE"] as MockPosition[]).map(pos=>({pos,need:team?.needs[pos]?.need??strength?.positions[pos]?.need??0,rank:team?.needs[pos]?.rank??strength?.positions[pos]?.rank??0})).sort((a,b)=>b.need-a.need).slice(0,2);
          const tendency=room.tendencies.find(t=>t.ownerKey===team?.ownerKey);
          return <article key={slot.pickNo} className={slot.isMine?"mine":""}>
            <div className="ddi-pick"><b>{slot.round}.{String(slot.slot).padStart(2,"0")}</b><span>#{slot.pickNo}</span></div>
            <div className="ddi-team"><strong>{slot.team}</strong><span>{needs.map(n=>n.pos+" #"+n.rank).join(" · ")}</span>{tendency&&tendency.sampleSize>=3&&<small>{tendency.sampleSize} historical picks · leans {(["QB","RB","WR","TE"] as MockPosition[]).sort((a,b)=>(tendency.positionShare[b]||0)-(tendency.positionShare[a]||0))[0]}</small>}</div>
            <div className="ddi-needs">{needs.map(n=><em key={n.pos}>{n.pos}</em>)}</div>
          </article>;
        })}
      </div>
      <div className="ddi-target">
        <h3>Will My Target Reach Me?</h3>
        <p>League-specific Monte Carlo using your board, current picks, each team's positional strength and imported manager tendencies.</p>
        <select value={targetId} onChange={e=>{setTargetId(e.target.value);setProb(null)}}>
          <option value="">Choose a target player…</option>
          {room.candidates.slice(0,80).map(c=><option key={c.id} value={c.id}>#{c.rank} {c.name} · {c.position}</option>)}
        </select>
        <button type="button" onClick={()=>void calculate()} disabled={!targetId||probLoading}>{probLoading?"Running 700 draft rooms…":"Calculate Availability"}</button>
        {prob&&<div className="ddi-prob">
          <div><strong>{Math.round(prob.probability*100)}%</strong><span>chance {prob.target.name} reaches {prob.targetPick.round}.{String(prob.targetPick.slot).padStart(2,"0")}</span></div>
          <b>{prob.status}</b>
          {prob.likelyTakers.length>0&&<p>Biggest threats: {prob.likelyTakers.slice(0,3).map(x=>x.team+" ("+Math.round(x.share*100)+"%)").join(" · ")}</p>}
        </div>}
        {error&&room&&<small className="ddi-error">{error}</small>}
      </div>
    </div>:null}
    <style jsx global>{`
      .ddi-shell{background:linear-gradient(180deg,#0e223d,#09182c);border:1px solid #20395f;border-radius:14px;padding:13px}
      .ddi-title{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:10px}.ddi-title span{display:block;color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.ddi-title h2{font-size:18px;margin:3px 0 0}.ddi-title small{color:#7890b1}
      .ddi-grid{display:grid;grid-template-columns:1.35fr .8fr;gap:10px}.ddi-upcoming,.ddi-target{background:#081629;border:1px solid #20395f;border-radius:10px;padding:10px}.ddi-upcoming h3,.ddi-target h3{font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em}
      .ddi-upcoming article{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:9px;align-items:center;padding:7px;border-bottom:1px solid #18304f}.ddi-upcoming article:last-child{border-bottom:0}.ddi-upcoming article.mine{background:#102d4d;border-radius:7px}.ddi-pick b,.ddi-pick span{display:block}.ddi-pick span{font-size:9px;color:#7890b1}.ddi-team strong,.ddi-team span,.ddi-team small{display:block}.ddi-team span{font-size:10px;color:#a9bdd6}.ddi-team small{font-size:9px;color:#7890b1;margin-top:2px}.ddi-needs{display:flex;gap:4px}.ddi-needs em{font-style:normal;font-size:9px;font-weight:950;padding:4px 6px;border-radius:999px;background:#193d62;color:#b9dcff}
      .ddi-target p{font-size:10px;color:#7890b1;line-height:1.45}.ddi-target select{width:100%;margin-bottom:7px}.ddi-target button{width:100%}.ddi-prob{margin-top:9px;padding:9px;background:#10213a;border-radius:8px}.ddi-prob>div{display:flex;align-items:baseline;gap:8px}.ddi-prob strong{font-size:28px;color:#20e2dd}.ddi-prob span{font-size:10px;color:#dce8f6}.ddi-prob>b{display:block;color:#ffd978;font-size:10px}.ddi-prob p{margin:5px 0 0}.ddi-state,.ddi-error{color:#8fa7c8;padding:12px}
      @media(max-width:900px){.ddi-grid{grid-template-columns:1fr}.ddi-title{display:block}.ddi-title small{display:block;margin-top:4px}}
    `}</style>
  </section>;
}
