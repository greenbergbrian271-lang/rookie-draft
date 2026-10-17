"use client";

import {useEffect,useMemo,useState} from "react";

type Player={name:string;position:string;team:string;age:string;ktc:string;status:string;handcuff:"Starter"|"Bench"|""};
type Pick={id:string;name:string;detail:string;value:number|null};
type Item={slot:string;name:string;team:string};
type Team={
  rosterId:number;name:string;players:Player[];picks:Pick[];totalKtc:number;pickValue:number;avgAge:number;
  starters:Item[];benchPlayers:Item[];startingCoverage:Item[];benchCoverage:Item[];bonus:Item[];
};
type Payload={teams:Team[];ktcUpdatedAt?:string;pickNote?:string};
type SortKey="name"|"position"|"team"|"age"|"ktc"|"handcuff";

const num=new Intl.NumberFormat("en-US");
const POS_ORDER:Record<string,number>={QB:1,RB:2,WR:3,TE:4};
const posClass=(p:string)=>["qb","rb","wr","te"].includes(p.toLowerCase())?p.toLowerCase():"other";
const ktcText=(v:string)=>Number.isFinite(Number(v))?num.format(Number(v)):"N/A";

function Slot({slot}:{slot:string}){
  const s=(slot||"Bench").toLowerCase();
  if(s==="flex")return <span className="lr-pos flex" title="WR / RB / TE flex">FLEX</span>;
  if(s==="super")return <span className="lr-pos flex" title="QB / WR / RB / TE superflex">SFLX</span>;
  return <span className={"lr-pos "+posClass(slot)}>{slot||"Bench"}</span>;
}

function HandcuffPanel({title,items,coverage=false,note}:{title:string;items:Item[];coverage?:boolean;note?:string}){
  return <section className="lr-panel">
    <div className="lr-panel-title"><div><b>{title}</b>{note&&<em>{note}</em>}</div><span>{items.length}</span></div>
    {items.length?<div>{items.map((item,i)=><div className="lr-hc-row" key={title+i}>
      <Slot slot={item.slot}/>
      <div className="lr-hc-copy"><strong>{item.name}</strong>{!coverage&&item.team&&<span>{item.team}</span>}</div>
    </div>)}</div>:<div className="lr-empty">No entries.</div>}
  </section>;
}

export default function LeagueRostersView({leagueKey}:{leagueKey:string}){
  const [data,setData]=useState<Payload|null>(null);
  const [rosterId,setRosterId]=useState<number>(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [sort,setSort]=useState<{key:SortKey;dir:"asc"|"desc"}|null>(null);

  useEffect(()=>{
    let live=true;setLoading(true);setError("");setData(null);
    fetch("/api/dynasty-intelligence/league-rosters?leagueKey="+encodeURIComponent(leagueKey),{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load league rosters");return j as Payload})
      .then(j=>{if(!live)return;setData(j);setRosterId(cur=>j.teams.some(t=>t.rosterId===cur)?cur:(j.teams[0]?.rosterId||0))})
      .catch(e=>{if(live)setError(e?.message||"Could not load league rosters")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[leagueKey]);

  const team=data?.teams.find(t=>t.rosterId===rosterId)||data?.teams[0];

  const players=useMemo(()=>{
    if(!team)return [];
    if(!sort)return team.players;
    const f=sort.dir==="asc"?1:-1,list=[...team.players];
    list.sort((a,b)=>{
      if(sort.key==="age"||sort.key==="ktc"){
        const av=Number(a[sort.key]),bv=Number(b[sort.key]),avOk=Number.isFinite(av),bvOk=Number.isFinite(bv);
        if(avOk!==bvOk)return avOk?-1:1;
        return avOk&&bvOk?(av-bv)*f:a.name.localeCompare(b.name);
      }
      if(sort.key==="position"){const av=POS_ORDER[a.position]||99,bv=POS_ORDER[b.position]||99;return av===bv?a.name.localeCompare(b.name):(av-bv)*f}
      return String(a[sort.key]||"").localeCompare(String(b[sort.key]||""),undefined,{numeric:true,sensitivity:"base"})*f;
    });
    return list;
  },[team,sort]);

  const choose=(key:SortKey)=>setSort(c=>c?.key===key?{key,dir:c.dir==="asc"?"desc":"asc"}:{key,dir:"asc"});
  const Head=({label,col,center=false}:{label:string;col:SortKey;center?:boolean})=><th className={center?"center":""}>
    <button type="button" className={"lr-sort "+(sort?.key===col?"active":"")} onClick={()=>choose(col)}>{label} <i>{sort?.key===col?(sort.dir==="asc"?"▲":"▼"):"↕"}</i></button>
  </th>;

  if(loading)return <div className="lr-state">Loading league rosters…<LrStyles/></div>;
  if(error)return <div className="lr-state error">{error}<LrStyles/></div>;
  if(!data||!team)return <div className="lr-state">No other rosters found in this league.<LrStyles/></div>;

  const starterCount=team.players.filter(p=>p.handcuff==="Starter").length,benchCount=team.players.filter(p=>p.handcuff==="Bench").length;

  return <div className="lr-wrap">
    <div className="lr-intro">
      <p>Every other manager's players and picks, mirrored from your Dynasty Rosters view. <b>Handcuff-eligible</b> players are the starters and the bench players valued at 2,500+ KTC; a rookie landing on their NFL team is likely worth more to that manager.</p>
      <span>View only. League Rosters and its handcuff lists never feed Draft Day, the Final Draft Board or any grade.</span>
    </div>

    <div className="lr-tabs" role="tablist" aria-label="League teams">
      {data.teams.map(t=><button key={t.rosterId} type="button" role="tab" aria-selected={t.rosterId===team.rosterId} className={t.rosterId===team.rosterId?"active":""} onClick={()=>{setRosterId(t.rosterId);setSort(null)}}>{t.name}</button>)}
    </div>

    <div className="lr-meta">
      <div className="wide"><span>Team</span><strong>{team.name}</strong></div>
      <div><span>Rostered Players</span><strong>{team.players.length}</strong></div>
      <div><span>Total KTC Value</span><strong>{num.format(team.totalKtc)}</strong></div>
      <div><span>Average Age</span><strong>{team.avgAge?team.avgAge.toFixed(1):"—"}</strong></div>
      <div><span>Picks · KTC Value</span><strong>{team.picks.length} · {num.format(team.pickValue)}</strong></div>
      <div><span>Handcuff Eligible</span><strong>{starterCount} starters · {benchCount} bench</strong></div>
    </div>

    <div className="lr-layout">
      <div className="lr-main">
        <section className="lr-panel">
          <div className="lr-panel-title"><div><b>Roster</b><em>Handcuff column: Starter or Bench (2,500+ KTC) means a rookie on that NFL team gets a boost from this manager</em></div><span>{team.players.length} players · click a column to sort</span></div>
          <div className="lr-table-wrap"><table className="lr-table">
            <thead><tr><Head label="Player Name" col="name"/><Head label="Position" col="position" center/><Head label="Team" col="team"/><Head label="Age" col="age" center/><Head label="KTC Value" col="ktc" center/><Head label="Handcuff" col="handcuff" center/></tr></thead>
            <tbody>{players.map((p,i)=><tr key={p.name+i}>
              <td><strong>{p.name}</strong>{p.status!=="Roster"&&<span className="lr-status">{p.status}</span>}</td>
              <td className="center"><span className={"lr-pos "+posClass(p.position)}>{p.position}</span></td>
              <td>{p.team||"—"}</td><td className="center">{p.age||"—"}</td><td className="center ktc">{ktcText(p.ktc)}</td>
              <td className="center">{p.handcuff?<span className={"lr-tag "+p.handcuff.toLowerCase()}>{p.handcuff}</span>:<span className="lr-dash">—</span>}</td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <section className="lr-panel">
          <div className="lr-panel-title"><div><b>Draft Picks</b></div><span>{team.picks.length} picks · {num.format(team.pickValue)} total KTC value</span></div>
          <div className="lr-table-wrap lr-picks"><table className="lr-table">
            <thead><tr><th>Pick</th><th>Ownership</th><th className="center">KTC Value</th></tr></thead>
            <tbody>{team.picks.length?team.picks.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.detail}</td><td className="center ktc">{p.value==null?"N/A":num.format(p.value)}</td></tr>):<tr><td colSpan={3} className="lr-empty">No valued future picks found.</td></tr>}</tbody>
          </table></div>
        </section>

        <HandcuffPanel title="Handcuff Bonus Players" items={team.bonus} note="Depth players below the 2,500 KTC bench minimum. Reference only: they do not count for handcuff boosts."/>
      </div>

      <aside className="lr-side">
        <HandcuffPanel title="Starters to Handcuff" items={team.starters}/>
        <HandcuffPanel title="Bench Players to Handcuff" items={team.benchPlayers}/>
        <HandcuffPanel title="Starting Handcuffs" items={team.startingCoverage} coverage note="NFL teams covered by their starters"/>
        <HandcuffPanel title="Bench Handcuffs" items={team.benchCoverage} coverage note="NFL teams covered by 2,500+ KTC bench players"/>
      </aside>
    </div>
    {data.pickNote&&<p className="lr-foot">{data.pickNote}</p>}
    <LrStyles/>
  </div>;
}

function LrStyles(){
  return <style jsx global>{`
    .lr-wrap{padding:10px}.lr-state{padding:24px;color:#8fa7c8}.lr-state.error{color:#ffd1b8}
    .lr-intro{display:flex;justify-content:space-between;gap:18px;margin-bottom:10px;padding:8px 10px;border:1px solid #29476e;border-radius:8px;background:#0b2039}.lr-intro p{margin:0;color:#a9bdd6;font-size:10px;line-height:1.45;max-width:900px}.lr-intro span{max-width:380px;color:#7890b1;font-size:9px;line-height:1.45;text-align:right}
    .lr-tabs{display:flex;gap:6px;overflow:auto;padding:2px 0 10px}.lr-tabs button{flex:0 0 auto;background:#10213a;border:1px solid #31527f;color:#b9c9df;border-radius:9px;padding:8px 12px;font-size:11px}.lr-tabs button:hover{background:#142844;color:#fff}.lr-tabs button.active{background:#4285f4;border-color:#6da3fa;color:#fff}
    .lr-meta{display:grid;grid-template-columns:minmax(200px,1.3fr) repeat(5,minmax(120px,1fr));gap:8px;margin-bottom:12px}.lr-meta>div{background:#10213a;border:1px solid #20395f;border-radius:9px;padding:8px 10px}.lr-meta span{display:block;color:#7890b1;font-size:9px;text-transform:uppercase;letter-spacing:.05em}.lr-meta strong{display:block;margin-top:3px;font-size:14px}
    .lr-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start}.lr-main,.lr-side{display:grid;gap:12px;min-width:0}
    .lr-panel{background:#0c1930;border:1px solid #20395f;border-radius:10px;overflow:hidden;min-width:0}.lr-panel-title{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;background:#10213a;border-bottom:1px solid #20395f}.lr-panel-title b{font-size:12px;text-transform:uppercase;letter-spacing:.05em}.lr-panel-title em{display:block;margin-top:2px;color:#7890b1;font-size:9px;font-style:normal;font-weight:600;text-transform:none;letter-spacing:0}.lr-panel-title>span{color:#8fa7c8;font-size:10px;white-space:nowrap}
    .lr-table-wrap{overflow:auto}.lr-picks{max-height:340px}.lr-table{width:100%;border-collapse:collapse;font-size:12px}.lr-table th,.lr-table td{padding:7px 10px;border-bottom:1px solid #18304f;text-align:left;white-space:nowrap}.lr-table th{color:#7890b1;font-size:9px;text-transform:uppercase;position:sticky;top:0;background:#0c1930}.lr-table .center{text-align:center}.lr-table .ktc{font-variant-numeric:tabular-nums}.lr-table tbody tr:nth-child(even){background:#0e2039}
    .lr-sort{background:transparent;border:0;color:inherit;font:inherit;text-transform:inherit;padding:0;cursor:pointer}.lr-sort i{font-style:normal;opacity:.5}.lr-sort.active{color:#20e2dd}.lr-sort.active i{opacity:1}
    .lr-pos{display:inline-block;min-width:34px;text-align:center;padding:3px 6px;border-radius:6px;font-size:10px;font-weight:900;background:#1b2f4d;color:#cfe0f5}.lr-pos.qb{background:#5a2a3d;color:#ffc3d2}.lr-pos.rb{background:#1f4d3d;color:#a8f0d0}.lr-pos.wr{background:#1f3f6b;color:#b7d4ff}.lr-pos.te{background:#5a4620;color:#ffe0a0}.lr-pos.flex{background:#33305a;color:#d4ceff}
    .lr-tag{display:inline-block;padding:3px 8px;border-radius:999px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.lr-tag.starter{background:#173d63;color:#b9dcff;border:1px solid #31577f}.lr-tag.bench{background:#2d3a1c;color:#d6f0a0;border:1px solid #556b2e}.lr-dash{color:#4d6485}
    .lr-status{margin-left:7px;padding:2px 6px;border-radius:999px;background:#33291a;color:#f8dfaa;font-size:8px;font-weight:800;text-transform:uppercase}
    .lr-hc-row{display:grid;grid-template-columns:44px minmax(0,1fr);gap:10px;align-items:center;min-height:42px;padding:6px 12px;border-bottom:1px solid #18304f}.lr-hc-row:nth-child(even){background:#0e2039}.lr-hc-row:last-child{border-bottom:0}.lr-hc-copy{display:flex;justify-content:space-between;gap:10px;min-width:0}.lr-hc-copy strong{font-size:12px;white-space:normal}.lr-hc-copy span{color:#8fa7c8;font-size:11px;font-weight:800;white-space:nowrap}
    .lr-empty{padding:14px;color:#6f89aa;font-size:11px}.lr-foot{margin:10px 2px 0;color:#6f89aa;font-size:10px}
    @media(max-width:1000px){.lr-layout{grid-template-columns:1fr}.lr-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.lr-intro{display:block}.lr-intro span{display:block;max-width:none;text-align:left;margin-top:5px}}
  `}</style>;
}
