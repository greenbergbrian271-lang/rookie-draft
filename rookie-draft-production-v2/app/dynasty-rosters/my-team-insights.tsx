"use client";

import {useEffect,useMemo,useState} from "react";

type Exposure={name:string;count:number;leagues:string[]};
type Position="QB"|"RB"|"WR"|"TE";
const POSITIONS:Position[]=["QB","RB","WR","TE"];
const fmt=new Intl.NumberFormat("en-US");

export default function MyTeamInsights({leagueKey,refreshToken=0,exposure=[]}:{leagueKey:string;refreshToken?:number;exposure?:Exposure[]}){
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!leagueKey){setData(null);return}
    let live=true;setLoading(true);setError("");
    fetch("/api/dynasty-intelligence?leagueKey="+encodeURIComponent(leagueKey)+"&mode=league",{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load roster intelligence");return j})
      .then(j=>{if(live)setData(j)})
      .catch(e=>{if(live)setError(e?.message||"Could not load roster intelligence")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[leagueKey,refreshToken]);

  const mine=useMemo(()=>data?.teams?.find((x:any)=>x.isMine)||null,[data]);
  const myStrength=useMemo(()=>data?.strengths?.rows?.find((x:any)=>x.isMine)||null,[data]);
  const teams=Number(data?.strengths?.teams||0);

  if(loading&&!data)return <section className="my-team-intel"><div className="my-team-intel-state">Building your team snapshot…</div></section>;
  if(error&&!data)return <section className="my-team-intel"><div className="my-team-intel-state">{error}</div></section>;
  if(!mine||!myStrength)return null;

  return <section className="my-team-intel">
    <div className="my-team-intel-head"><div><span>My Team Snapshot</span><h2>Where this roster stands in the league</h2></div><small>League-relative KTC rankings · #1 is strongest</small></div>

    <div className="my-team-ranks">
      <div className="primary"><span>Power</span><strong>#{mine.powerRank}</strong><em>of {teams}</em></div>
      {POSITIONS.map(pos=><div key={pos} className={"rank-"+String(myStrength.positions[pos]?.label||"").toLowerCase()}><span>{pos}</span><strong>#{myStrength.positions[pos]?.rank||"—"}</strong><em>{myStrength.positions[pos]?.label||"—"}</em></div>)}
      <div><span>Picks</span><strong>#{mine.pickRank}</strong><em>of {teams}</em></div>
    </div>

    <div className="my-team-intel-grid">
      <article>
        <h3>Roster Construction</h3>
        <div className="my-team-stat-row"><span>Team Type</span><strong>{mine.classification}</strong></div>
        <div className="my-team-stat-row"><span>Win-Now Score</span><strong>{mine.windowScore}/100</strong></div>
        <div className="my-team-stat-row"><span>Roster Strategy</span><strong>{mine.construction}</strong></div>
        <div className="my-team-value-split"><div><span>Starters</span><strong>{fmt.format(Math.round(mine.starterValue||0))}</strong><em>#{mine.starterRank}</em></div><div><span>Bench</span><strong>{fmt.format(Math.round(mine.benchValue||0))}</strong><em>#{mine.benchRank||"—"}</em></div></div>
      </article>

      <article>
        <h3>Age Risk by Position</h3>
        <div className="my-team-age-grid">{POSITIONS.map(pos=>{const v=mine.ageByPosition?.[pos]||{};return <div key={pos}><span>{pos}</span><strong>{v.age?Number(v.age).toFixed(1):"—"}</strong><em className={"risk-"+String(v.risk||"unknown").toLowerCase()}>{v.risk||"Unknown"}</em></div>})}</div>
      </article>

      <article>
        <h3>Cross-League Exposure</h3>
        {exposure.length?<div className="my-team-exposure">{exposure.slice(0,8).map(x=><div key={x.name}><strong>{x.name}</strong><span>{x.count} leagues</span><em>{x.leagues.join(" · ")}</em></div>)}</div>:<p className="my-team-empty">No players on this roster are duplicated across your other connected leagues.</p>}
      </article>
    </div>

    <style jsx global>{`
      .my-team-intel{margin:14px 0;background:#09182c;border:1px solid #20395f;border-radius:14px;overflow:hidden}
      .my-team-intel-head{display:flex;justify-content:space-between;gap:16px;align-items:end;padding:12px 14px;background:linear-gradient(180deg,#102845,#0d2038);border-bottom:1px solid #20395f}
      .my-team-intel-head span{color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.my-team-intel-head h2{margin:3px 0 0;font-size:17px}.my-team-intel-head small{color:#7890b1}
      .my-team-ranks{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding:10px 10px 0}.my-team-ranks>div{padding:8px 9px;background:#0d2039;border:1px solid #29476e;border-radius:9px;text-align:center}.my-team-ranks span,.my-team-ranks strong,.my-team-ranks em{display:block}.my-team-ranks span{font-size:9px;color:#8fa7c8;font-weight:900}.my-team-ranks strong{font-size:20px;line-height:1.1;margin:2px 0;color:#f1f6ff}.my-team-ranks em{font-size:8px;color:#7890b1;font-style:normal}.my-team-ranks .primary{border-color:#4f8ccf;background:#102b4a}.my-team-ranks .rank-priority{border-color:#86465a;background:#351d2b}.my-team-ranks .rank-need{border-color:#8a6c25;background:#342c1a}.my-team-ranks .rank-depth{border-color:#526786}.my-team-ranks .rank-strength{border-color:#287c72;background:#123b38}
      .my-team-intel-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;padding:10px}.my-team-intel-grid article{padding:10px;background:#0c1930;border:1px solid #20395f;border-radius:10px}.my-team-intel-grid h3{margin:0 0 8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#dce8f6}
      .my-team-stat-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #18304f;font-size:10px}.my-team-stat-row span{color:#8199b8}.my-team-value-split{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.my-team-value-split>div{padding:7px;background:#10213a;border-radius:7px}.my-team-value-split span,.my-team-value-split strong,.my-team-value-split em{display:block}.my-team-value-split span{font-size:8px;color:#7890b1}.my-team-value-split strong{font-size:13px}.my-team-value-split em{font-size:8px;color:#20e2dd;font-style:normal}
      .my-team-age-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.my-team-age-grid>div{padding:8px 5px;background:#10213a;border-radius:7px;text-align:center}.my-team-age-grid span,.my-team-age-grid strong,.my-team-age-grid em{display:block}.my-team-age-grid span{font-size:9px;font-weight:900}.my-team-age-grid strong{font-size:16px;margin:2px 0}.my-team-age-grid em{font-size:8px;font-style:normal;text-transform:uppercase}.risk-high{color:#ff9cab}.risk-watch{color:#ffd978}.risk-low{color:#8df0ca}.risk-unknown{color:#7890b1}
      .my-team-exposure{display:grid;gap:4px}.my-team-exposure>div{display:grid;grid-template-columns:1fr auto;gap:1px 8px;padding:5px 0;border-bottom:1px solid #18304f}.my-team-exposure strong{font-size:10px}.my-team-exposure span{font-size:9px;color:#20e2dd}.my-team-exposure em{grid-column:1/-1;font-size:8px;color:#7890b1;font-style:normal}.my-team-empty,.my-team-intel-state{color:#7890b1;font-size:10px}.my-team-intel-state{padding:18px}
      @media(max-width:1050px){.my-team-ranks{grid-template-columns:repeat(3,1fr)}.my-team-intel-grid{grid-template-columns:1fr 1fr}.my-team-intel-grid article:last-child{grid-column:1/-1}}
      @media(max-width:650px){.my-team-intel-head{display:block}.my-team-intel-head small{display:block;margin-top:4px}.my-team-ranks{grid-template-columns:repeat(2,1fr)}.my-team-intel-grid{grid-template-columns:1fr}.my-team-intel-grid article:last-child{grid-column:auto}}
    `}</style>
  </section>;
}
