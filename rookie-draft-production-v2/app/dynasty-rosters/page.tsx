"use client";

import {useState} from "react";
import {workbookSecondary as w} from "@/lib/workbook-secondary";

type Row=readonly any[];
type HandcuffItem={slot:string;name:string;team:string};

const LEAGUES:Record<string,readonly Row[]>={
  "One League":w.oneRoster,
  "Last Man Standing":w.lmsRoster,
  "D+R":w.drRoster,
  "Last Minute":w.lmRoster,
};

const SECTION_TITLES=new Set([
  "Starters to Handcuff",
  "Bench Players to Handcuff",
  "Starting Handcuffs",
  "Bench Handcuffs",
]);

function text(value:any){return value==null?"":String(value).trim()}
function posClass(pos:string){
  const key=pos.toLowerCase().replace(/\s+/g,"-");
  return ["qb","rb","wr","te","flex","super","bench"].includes(key)?key:"other";
}
function fmtKtc(value:string){
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat("en-US").format(n):value||"—";
}
function parseRoster(rows:readonly Row[]){
  const players=rows.slice(4).filter(r=>text(r[0])&&["QB","RB","WR","TE"].includes(text(r[1]))).map(r=>({
    name:text(r[0]),position:text(r[1]),team:text(r[2]),age:text(r[3]),ktc:text(r[4]),
  }));

  const sections:Record<string,HandcuffItem[]>={};
  let active="";
  for(let i=3;i<rows.length;i++){
    const g=text(rows[i]?.[6]);
    if(!g)continue;
    if(SECTION_TITLES.has(g)){
      active=g;
      sections[active]??=[];
      continue;
    }
    const h=text(rows[i]?.[7]);
    if(active&&h)sections[active].push({slot:g,name:h,team:text(rows[i]?.[8])});
  }

  const bonus=rows.slice(4).filter(r=>text(r[10])&&text(r[11])).map(r=>({
    slot:text(r[10]),name:text(r[11]),team:"",
  }));

  const totalKtc=players.reduce((sum,p)=>{
    const n=Number(p.ktc);
    return sum+(Number.isFinite(n)?n:0);
  },0);
  const ages=players.map(p=>Number(p.age)).filter(Number.isFinite);
  const avgAge=ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0;

  return {
    league:text(rows[0]?.[1]),
    updated:text(rows[1]?.[1]),
    players,
    totalKtc,
    avgAge,
    starters:sections["Starters to Handcuff"]||[],
    benchPlayers:sections["Bench Players to Handcuff"]||[],
    startingCoverage:sections["Starting Handcuffs"]||[],
    benchCoverage:sections["Bench Handcuffs"]||[],
    bonus,
  };
}

function PositionBadge({position}:{position:string}){
  return <span className={"dynasty-pos "+posClass(position)}>{position}</span>;
}

function HandcuffList({title,items,coverage=false}:{title:string;items:HandcuffItem[];coverage?:boolean}){
  return <section className="dynasty-panel">
    <div className="dynasty-panel-title">{title}<span>{items.length}</span></div>
    {items.length?<div className="dynasty-handcuff-list">
      {items.map((item,i)=><div className="dynasty-handcuff-row" key={title+"-"+i}>
        <PositionBadge position={item.slot}/>
        <div className="dynasty-handcuff-copy">
          <strong>{item.name}</strong>
          {!coverage&&item.team&&<span>{item.team}</span>}
        </div>
      </div>)}
    </div>:<div className="dynasty-empty">No entries on the source sheet.</div>}
  </section>;
}

export default function Page(){
  const [tab,setTab]=useState("One League");
  const roster=parseRoster(LEAGUES[tab]);

  return <div className="dynasty-page">
    <div className="page-head dynasty-page-head">
      <div>
        <div className="ey">Dynasty roster reference</div>
        <h1>Dynasty Rosters</h1>
        <p className="muted">League rosters and handcuff targets, rebuilt from the source workbook instead of the generic reference table.</p>
      </div>
    </div>

    <div className="dynasty-tabs" role="tablist" aria-label="Dynasty leagues">
      {Object.keys(LEAGUES).map(name=><button
        key={name}
        type="button"
        role="tab"
        aria-selected={tab===name}
        className={tab===name?"active":""}
        onClick={()=>setTab(name)}
      >{name}</button>)}
    </div>

    <div className="dynasty-meta-grid">
      <div className="dynasty-meta"><span>League</span><strong>{roster.league||tab}</strong></div>
      <div className="dynasty-meta"><span>Rostered Players</span><strong>{roster.players.length}</strong></div>
      <div className="dynasty-meta"><span>Total KTC Value</span><strong>{new Intl.NumberFormat("en-US").format(roster.totalKtc)}</strong></div>
      <div className="dynasty-meta"><span>Average Age</span><strong>{roster.avgAge?roster.avgAge.toFixed(1):"—"}</strong></div>
      <div className="dynasty-meta updated"><span>Last Updated</span><strong>{roster.updated||"—"}</strong></div>
    </div>

    <div className="dynasty-layout">
      <section className="dynasty-panel dynasty-roster-panel">
        <div className="dynasty-panel-title">
          Roster
          <span>{roster.players.length} players</span>
        </div>
        <div className="dynasty-table-wrap">
          <table className="dynasty-roster-table">
            <thead><tr><th>Player Name</th><th>Position</th><th>Team</th><th>Age</th><th>KTC Value</th></tr></thead>
            <tbody>
              {roster.players.map((p,i)=><tr key={p.name+"-"+i}>
                <td><strong>{p.name}</strong></td>
                <td><PositionBadge position={p.position}/></td>
                <td>{p.team||"—"}</td>
                <td>{p.age||"—"}</td>
                <td className="ktc">{fmtKtc(p.ktc)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="dynasty-side">
        <HandcuffList title="Starters to Handcuff" items={roster.starters}/>
        <HandcuffList title="Bench Players to Handcuff" items={roster.benchPlayers}/>
        <HandcuffList title="Starting Handcuffs" items={roster.startingCoverage} coverage/>
        <HandcuffList title="Bench Handcuffs" items={roster.benchCoverage} coverage/>
        <HandcuffList title="Handcuff Bonus Players" items={roster.bonus} coverage/>
      </aside>
    </div>

    <style jsx global>{`
      .dynasty-page{max-width:1500px;margin:0 auto}
      .dynasty-page-head{margin-bottom:10px}
      .dynasty-page-head p{max-width:760px;margin:4px 0 0}
      .dynasty-tabs{display:flex;gap:8px;overflow:auto;padding:3px 0 12px;margin-bottom:8px}
      .dynasty-tabs button{flex:0 0 auto;background:#10213a;border:1px solid #31527f;color:#b9c9df;border-radius:9px;padding:9px 13px}
      .dynasty-tabs button:hover{background:#142844;color:#fff}
      .dynasty-tabs button.active{background:#4285f4;border-color:#6da3fa;color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset}
      .dynasty-meta-grid{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(130px,.75fr)) minmax(240px,1.25fr);gap:10px;margin-bottom:14px}
      .dynasty-meta{min-width:0;background:linear-gradient(180deg,#10223d,#0b192d);border:1px solid #20395f;border-radius:11px;padding:12px 14px}
      .dynasty-meta span{display:block;color:#8fa7c8;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}
      .dynasty-meta strong{display:block;font-size:18px;line-height:1.2;overflow:hidden;text-overflow:ellipsis}
      .dynasty-meta.updated strong{font-size:13px;color:#dce8f6;white-space:nowrap}
      .dynasty-layout{display:grid;grid-template-columns:minmax(620px,1.55fr) minmax(320px,.8fr);gap:14px;align-items:start}
      .dynasty-panel{overflow:hidden;background:#0c1930;border:1px solid #20395f;border-radius:12px}
      .dynasty-panel-title{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#4285f4;color:#fff;padding:10px 12px;font-size:13px;font-weight:950;letter-spacing:.02em}
      .dynasty-panel-title span{font-size:11px;font-weight:850;color:#e8f1ff}
      .dynasty-roster-panel{position:sticky;top:58px}
      .dynasty-table-wrap{max-height:calc(100vh - 255px);overflow:auto}
      .dynasty-roster-table{width:100%;border-collapse:separate;border-spacing:0;font-family:Calibri,Arial,sans-serif;font-size:13px}
      .dynasty-roster-table th{position:sticky;top:0;z-index:2;background:#132844;color:#b9c9df;text-align:left;padding:9px 11px;border-bottom:1px solid #31527f;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
      .dynasty-roster-table th:nth-child(2),.dynasty-roster-table th:nth-child(4),.dynasty-roster-table th:nth-child(5),
      .dynasty-roster-table td:nth-child(2),.dynasty-roster-table td:nth-child(4),.dynasty-roster-table td:nth-child(5){text-align:center}
      .dynasty-roster-table td{padding:8px 11px;border-bottom:1px solid #18304f;color:#e9f1fb}
      .dynasty-roster-table tbody tr:nth-child(odd) td{background:#0b1a30}
      .dynasty-roster-table tbody tr:nth-child(even) td{background:#0e2039}
      .dynasty-roster-table tbody tr:hover td{background:#142a49}
      .dynasty-roster-table tbody tr:last-child td{border-bottom:0}
      .dynasty-roster-table td:first-child strong{font-size:13px}
      .dynasty-roster-table .ktc{font-weight:950;font-variant-numeric:tabular-nums;color:#fff}
      .dynasty-side{display:grid;gap:12px}
      .dynasty-handcuff-list{display:grid}
      .dynasty-handcuff-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px;align-items:center;min-height:45px;padding:7px 10px;border-bottom:1px solid #18304f}
      .dynasty-handcuff-row:nth-child(even){background:#0e2039}
      .dynasty-handcuff-row:last-child{border-bottom:0}
      .dynasty-handcuff-copy{min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
      .dynasty-handcuff-copy strong{font-size:13px;white-space:normal}
      .dynasty-handcuff-copy span{flex:0 0 auto;color:#8fa7c8;font-size:11px;font-weight:800}
      .dynasty-pos{display:inline-flex;min-width:45px;justify-content:center;align-items:center;border-radius:5px;padding:5px 7px;color:#071426;font-size:11px;font-weight:950;line-height:1}
      .dynasty-pos.qb{background:#fc2b6d;color:#fff}
      .dynasty-pos.rb{background:#20ceb7}
      .dynasty-pos.wr{background:#58a7ff}
      .dynasty-pos.te{background:#fead58}
      .dynasty-pos.flex,.dynasty-pos.super{background:#01ffc5}
      .dynasty-pos.bench{background:#20ceb7}
      .dynasty-pos.other{background:#4595d2;color:#fff}
      .dynasty-empty{padding:16px;color:#8fa7c8;font-size:12px}
      @media(max-width:1180px){
        .dynasty-meta-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
        .dynasty-meta.updated{grid-column:span 2}
        .dynasty-layout{grid-template-columns:1fr}
        .dynasty-roster-panel{position:static}
        .dynasty-table-wrap{max-height:none}
        .dynasty-side{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:700px){
        .dynasty-meta-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .dynasty-meta:first-child,.dynasty-meta.updated{grid-column:1/-1}
        .dynasty-side{grid-template-columns:1fr}
        .dynasty-table-wrap{overflow-x:auto}
        .dynasty-roster-table{min-width:620px}
        .dynasty-handcuff-copy{display:block}
        .dynasty-handcuff-copy span{display:block;margin-top:2px}
      }
    `}</style>
  </div>;
}
