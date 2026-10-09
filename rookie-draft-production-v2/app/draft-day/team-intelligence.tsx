"use client";

import {useEffect,useMemo,useState} from "react";
import type {MockLeagueRoom,MockPosition} from "@/lib/mock-draft";

type StrengthRow={rosterId:number;name:string;positions:Record<MockPosition,{rank:number;need:number;label:string}>};
type AdvisorPick={pickNo:number;round:number;slot:number;label:string;rosterId:number;team:string;isMine:boolean;probability:number;pickValue:number|null};
type Advisor={
  target:{name:string;position:string;rank:number};
  currentPick:AdvisorPick;
  probability:number;
  simulations:number;
  status:string;
  action:"MOVE UP"|"HOLD"|"TRADE DOWN"|"SELECTED";
  recommendedPick?:AdvisorPick;
  valueDelta:number|null;
  valueBasis?:string;
  rationale:string[];
  likelyTakers:{team:string;share:number;averagePick:number|null}[];
  curve:AdvisorPick[];
  market?:{adpRank:number|null;boardRank:number;adpDelta:number|null;ktc7ChangePct:number|null;heat:string};
};

const fmt=new Intl.NumberFormat("en-US");

export default function DraftDayTeamIntelligence({leagueKey,draftClass}:{leagueKey:string;draftClass:number}){
  const [room,setRoom]=useState<MockLeagueRoom|null>(null),[strengths,setStrengths]=useState<StrengthRow[]>([]),[targetId,setTargetId]=useState(""),[advisor,setAdvisor]=useState<Advisor|null>(null),[loading,setLoading]=useState(false),[probLoading,setProbLoading]=useState(false),[error,setError]=useState("");

  useEffect(()=>{
    if(!leagueKey)return;
    let live=true;setLoading(true);setError("");setAdvisor(null);setTargetId("");
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
    setProbLoading(true);setAdvisor(null);setError("");
    try{
      const r=await fetch("/api/mock-draft/target-advisor",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey,draftClass,targetId,simulations:700})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not build target advice");setAdvisor(j);
    }catch(e:any){setError(e?.message||"Could not build target advice")}finally{setProbLoading(false)}
  }

  const actionCopy=advisor?.action==="MOVE UP"?"Move Up":advisor?.action==="TRADE DOWN"?"Trade Down":"Hold";
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
        <h3>Draft Target Advisor</h3>
        <p>Pick a player you want. The model estimates whether he reaches your next pick, then tells you whether to move up, hold, or trade down in this specific league.</p>
        <select value={targetId} onChange={e=>{setTargetId(e.target.value);setAdvisor(null)}}>
          <option value="">Choose a target player…</option>
          {room.candidates.slice(0,80).map(c=><option key={c.id} value={c.id}>#{c.rank} {c.name} · {c.position}</option>)}
        </select>
        <button type="button" onClick={()=>void calculate()} disabled={!targetId||probLoading}>{probLoading?"Running 700 league drafts…":"Analyze Target"}</button>

        {advisor&&advisor.currentPick&&<div className="ddi-advice">
          <div className="ddi-prob">
            <div><strong>{Math.round(advisor.probability*100)}%</strong><span>chance {advisor.target.name} reaches {advisor.currentPick.label}</span></div>
            <b>{advisor.status}</b>
            {advisor.likelyTakers.length>0&&<p>Biggest threats: {advisor.likelyTakers.slice(0,3).map(x=>x.team+" ("+Math.round(x.share*100)+"%)").join(" · ")}</p>}
          </div>

          <div className={"ddi-decision "+advisor.action.toLowerCase().replace(" ","-")}>
            <small>RECOMMENDATION</small>
            <strong>{actionCopy}</strong>
            {advisor.recommendedPick&&<span>{advisor.action==="HOLD"?"Stay at":"Target"} {advisor.recommendedPick.label}{advisor.action!=="HOLD"?" · "+advisor.recommendedPick.team:""}</span>}
            {advisor.valueDelta!=null&&advisor.action!=="HOLD"&&<em>{advisor.action==="MOVE UP"?"Approx. extra cost":"Approx. value to recoup"}: {fmt.format(advisor.valueDelta)} KTC</em>}
          </div>

          <div className="ddi-rationale">{advisor.rationale.map((line,i)=><p key={i}>• {line}</p>)}</div>

          <div className="ddi-curve">
            <small>Availability curve</small>
            <div>{advisor.curve.map(row=><span key={row.pickNo} className={(row.pickNo===advisor.currentPick.pickNo?"current ":"")+(advisor.recommendedPick?.pickNo===row.pickNo?"recommended":"")} title={row.team}>
              <b>{row.label}</b><em>{Math.round(row.probability*100)}%</em>
            </span>)}</div>
          </div>

          <div className="ddi-market">
            <small>Market overlay — secondary context only</small>
            <span>{advisor.market?.adpRank?"Sleeper ADP #"+advisor.market.adpRank:"Sleeper ADP unavailable"} · Your board #{advisor.target.rank}</span>
            <span>{advisor.market?.ktc7ChangePct!=null?"7-day KTC "+(advisor.market.ktc7ChangePct>=0?"+":"")+advisor.market.ktc7ChangePct.toFixed(1)+"%":"7-day KTC history unavailable"} · {advisor.market?.heat||"Neutral"}</span>
          </div>
          <small className="ddi-basis">{advisor.valueBasis}</small>
        </div>}

        {error&&room&&<small className="ddi-error">{error}</small>}
      </div>
    </div>:null}

    <style jsx global>{`
      .ddi-shell{background:linear-gradient(180deg,#0e223d,#09182c);border:1px solid #20395f;border-radius:14px;padding:13px}
      .ddi-title{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:10px}.ddi-title span{display:block;color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.ddi-title h2{font-size:18px;margin:3px 0 0}.ddi-title small{color:#7890b1}
      .ddi-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:10px}.ddi-upcoming,.ddi-target{background:#081629;border:1px solid #20395f;border-radius:10px;padding:10px}.ddi-upcoming h3,.ddi-target h3{font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em}
      .ddi-upcoming article{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:9px;align-items:center;padding:7px;border-bottom:1px solid #18304f}.ddi-upcoming article:last-child{border-bottom:0}.ddi-upcoming article.mine{background:#102d4d;border-radius:7px}.ddi-pick b,.ddi-pick span{display:block}.ddi-pick span{font-size:9px;color:#7890b1}.ddi-team strong,.ddi-team span,.ddi-team small{display:block}.ddi-team span{font-size:10px;color:#a9bdd6}.ddi-team small{font-size:9px;color:#7890b1;margin-top:2px}.ddi-needs{display:flex;gap:4px}.ddi-needs em{font-style:normal;font-size:9px;font-weight:950;padding:4px 6px;border-radius:999px;background:#193d62;color:#b9dcff}
      .ddi-target>p{font-size:10px;color:#7890b1;line-height:1.45}.ddi-target select{width:100%;margin-bottom:7px}.ddi-target>button{width:100%}
      .ddi-advice{display:grid;gap:7px;margin-top:9px}.ddi-prob{padding:9px;background:#10213a;border-radius:8px}.ddi-prob>div{display:flex;align-items:baseline;gap:8px}.ddi-prob strong{font-size:28px;color:#20e2dd}.ddi-prob span{font-size:10px;color:#dce8f6}.ddi-prob>b{display:block;color:#ffd978;font-size:10px}.ddi-prob p{margin:5px 0 0;font-size:10px;color:#8fa7c8}
      .ddi-decision{padding:10px 11px;border-radius:9px;border:1px solid #31527f;background:#10213a}.ddi-decision small,.ddi-decision strong,.ddi-decision span,.ddi-decision em{display:block}.ddi-decision small{font-size:8px;font-weight:950;letter-spacing:.09em;color:#7890b1}.ddi-decision strong{font-size:22px;margin:1px 0;color:#fff}.ddi-decision span{font-size:11px;color:#c7d6e9}.ddi-decision em{font-style:normal;font-size:10px;color:#8fa7c8;margin-top:3px}.ddi-decision.move-up{border-color:#b67857;background:#3a271f}.ddi-decision.move-up strong{color:#ffc09c}.ddi-decision.trade-down{border-color:#287c72;background:#123b38}.ddi-decision.trade-down strong{color:#8df0ca}.ddi-decision.hold{border-color:#416da2;background:#122c4c}.ddi-decision.hold strong{color:#a9d2ff}
      .ddi-rationale{padding:7px 9px;border:1px solid #18304f;border-radius:8px}.ddi-rationale p{margin:3px 0;font-size:10px;line-height:1.4;color:#a9bdd6}
      .ddi-curve small,.ddi-market small{display:block;color:#7890b1;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}.ddi-curve>div{display:flex;gap:4px;overflow:auto;padding-bottom:2px}.ddi-curve span{min-width:48px;padding:5px 6px;border:1px solid #264565;border-radius:7px;background:#0c1c32;text-align:center}.ddi-curve span b,.ddi-curve span em{display:block}.ddi-curve span b{font-size:9px}.ddi-curve span em{font-size:11px;font-style:normal;color:#8fa7c8}.ddi-curve span.current{border-color:#4f8ccf}.ddi-curve span.recommended{box-shadow:0 0 0 1px #20e2dd inset}.ddi-curve span.recommended em{color:#20e2dd}
      .ddi-market{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;padding:7px 9px;background:#0c1c32;border-radius:8px}.ddi-market small{grid-column:1/-1}.ddi-market span{font-size:9px;color:#8fa7c8}.ddi-basis{color:#607b9d;font-size:8px}.ddi-state,.ddi-error{color:#8fa7c8;padding:12px}
      @media(max-width:900px){.ddi-grid{grid-template-columns:1fr}.ddi-title{display:block}.ddi-title small{display:block;margin-top:4px}}
      @media(max-width:560px){.ddi-market{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
