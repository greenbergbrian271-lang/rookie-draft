"use client";

import {useEffect,useState} from "react";

type Position="QB"|"RB"|"WR"|"TE";
type Cell={value:number;rank:number;strength:number;need:number;label:string;depth:number;matched:number};
type Row={
  rosterId:number;
  name:string;
  isMine:boolean;
  overall:{value:number;rank:number};
  picks:{value:number;rank:number};
  positions:Record<Position,Cell>;
  matchedPlayers:number;
  unmatchedPlayers:number;
};
type Payload={
  teams:number;
  years:number[];
  ktcUpdatedAt:string;
  rows:Row[];
  note?:string;
};

const POSITIONS:Position[]=["QB","RB","WR","TE"];
const fmt=new Intl.NumberFormat("en-US");

function rankTone(rank:number,teams:number){
  const pct=teams<=1?0:(rank-1)/(teams-1);
  if(pct<=.2)return "elite";
  if(pct<=.4)return "good";
  if(pct<=.6)return "mid";
  if(pct<=.8)return "thin";
  return "weak";
}

function RankCell({rank,value,teams,label}:{rank:number;value:number;teams:number;label:string}){
  return <td>
    <div className={"strength-rank "+rankTone(rank,teams)} title={label+" · KTC value "+fmt.format(Math.round(value))}>
      {rank}
    </div>
  </td>;
}

export default function LeagueStrengthMatrix({leagueKey,refreshToken=0}:{leagueKey:string;refreshToken?:number}){
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!leagueKey){setData(null);return}
    let live=true;
    setLoading(true);setError("");
    fetch("/api/dynasty-rosters/strengths?leagueKey="+encodeURIComponent(leagueKey),{cache:"no-store"})
      .then(async res=>{const body=await res.json();if(!res.ok)throw new Error(body?.error||"Could not load league strengths");return body})
      .then(body=>{if(live)setData(body)})
      .catch(e=>{if(live)setError(e?.message||"Could not load league strengths")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[leagueKey,refreshToken]);

  return <section className="dynasty-panel strength-panel">
    <div className="dynasty-panel-title">
      <div className="dynasty-panel-title-main">
        <span className="dynasty-panel-name">League Strength Matrix</span>
        <span className="trade-pref-legend">KTC value + Sleeper ownership · #1 is strongest</span>
      </div>
      <span>{data?.years?.length?"Picks: "+data.years.join(" · "):"Full team + future picks"}</span>
    </div>

    {loading&&!data?<div className="dynasty-empty">Ranking every roster by current KTC value…</div>:
      error?<div className="dynasty-empty">{error}</div>:
      data?<div className="strength-table-wrap">
        <table className="strength-table">
          <thead><tr>
            <th>Rank</th>
            <th>Team</th>
            <th>QB</th>
            <th>RB</th>
            <th>WR</th>
            <th>TE</th>
            <th>Picks</th>
          </tr></thead>
          <tbody>{data.rows.map(row=><tr key={row.rosterId} className={row.isMine?"mine":""}>
            <RankCell rank={row.overall.rank} value={row.overall.value} teams={data.teams} label="Overall team + picks"/>
            <td className="strength-team">
              <strong>{row.name}</strong>
              {row.isMine&&<span>You</span>}
              {row.unmatchedPlayers>0&&<small title={row.unmatchedPlayers+" roster player(s) did not match KTC"}>{row.unmatchedPlayers} unmatched</small>}
            </td>
            {POSITIONS.map(pos=><RankCell key={pos} rank={row.positions[pos].rank} value={row.positions[pos].value} teams={data.teams} label={pos+" · "+row.positions[pos].label}/>)}
            <RankCell rank={row.picks.rank} value={row.picks.value} teams={data.teams} label="Future draft capital"/>
          </tr>)}</tbody>
        </table>
        <div className="strength-footnote">{data.note||"Position ranks emphasize starting-caliber value and then depth. Overall includes current players and future picks."}</div>
      </div>:<div className="dynasty-empty">No strength data.</div>}

    <style jsx global>{`
      .strength-panel{margin-bottom:14px}
      .strength-table-wrap{overflow:auto}
      .strength-table{width:100%;border-collapse:separate;border-spacing:5px 5px;padding:5px;font-family:Calibri,Arial,sans-serif}
      .strength-table th{color:#8fa7c8;font-size:10px;letter-spacing:.07em;text-transform:uppercase;text-align:center;padding:4px 8px}
      .strength-table th:nth-child(2){text-align:left;min-width:210px}
      .strength-table td{padding:0}
      .strength-team{background:#0e2039;border:1px solid #20395f;border-radius:7px;padding:8px 10px!important;white-space:nowrap}
      .strength-team strong{font-size:13px;color:#eef5ff}
      .strength-team span{margin-left:7px;padding:2px 6px;border-radius:999px;background:#163d69;color:#9ec9ff;font-size:9px;font-weight:900;text-transform:uppercase}
      .strength-team small{display:block;margin-top:2px;color:#a9896d;font-size:9px}
      .strength-table tr.mine .strength-team{box-shadow:0 0 0 1px #4f8ccf inset}
      .strength-rank{min-width:58px;height:38px;display:grid;place-items:center;border-radius:7px;font-size:16px;font-weight:950;color:#fff;border:1px solid rgba(255,255,255,.08);font-variant-numeric:tabular-nums}
      .strength-rank.elite{background:#167aa1}
      .strength-rank.good{background:#4d739b}
      .strength-rank.mid{background:#707c9e}
      .strength-rank.thin{background:#907f9b}
      .strength-rank.weak{background:#b77d91}
      .strength-footnote{padding:6px 10px 11px;color:#8fa7c8;font-size:10px}
      @media(max-width:780px){
        .strength-table{min-width:740px}
      }
    `}</style>
  </section>;
}
