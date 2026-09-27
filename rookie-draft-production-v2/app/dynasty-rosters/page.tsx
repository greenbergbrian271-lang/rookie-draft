"use client";

import {useEffect,useMemo,useState} from "react";

type Player={name:string;position:string;team:string;age:string;ktc:string};
type HandcuffItem={slot:string;name:string;team:string};
type RosterView={
  key:string;label:string;league:string;leagueId:string;updated:string;source:string;
  players:Player[];totalKtc:number;avgAge:number;
  starters:HandcuffItem[];benchPlayers:HandcuffItem[];startingCoverage:HandcuffItem[];
  benchCoverage:HandcuffItem[];bonus:HandcuffItem[];
};
type SortKey="name"|"position"|"team"|"age"|"ktc";
type SortState={key:SortKey;dir:"asc"|"desc"}|null;

const POS_ORDER:Record<string,number>={QB:1,RB:2,WR:3,TE:4};

function posClass(pos:string){
  const key=pos.toLowerCase().replace(/\s+/g,"-");
  return ["qb","rb","wr","te","flex","super","bench"].includes(key)?key:"other";
}
function fmtKtc(value:string){
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat("en-US").format(n):value||"—";
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
    </div>:<div className="dynasty-empty">No entries.</div>}
  </section>;
}

export default function Page(){
  const [rosters,setRosters]=useState<RosterView[]>([]);
  const [tab,setTab]=useState("");
  const [sort,setSort]=useState<SortState>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{void load()},[]);

  async function load(){
    setLoading(true);
    try{
      const res=await fetch("/api/dynasty-rosters",{cache:"no-store"});
      const data=await res.json();
      if(!res.ok)throw new Error(data?.error||"Could not load rosters");
      const next=(data?.rosters||[]) as RosterView[];
      setRosters(next);
      setTab(current=>next.some(r=>r.key===current)?current:(next[0]?.key||""));
      if(data?.errors?.length)setMessage(data.errors.join(" • "));
    }catch(e:any){setMessage(e?.message||"Could not load rosters")}
    finally{setLoading(false)}
  }

  async function refresh(){
    setRefreshing(true);setMessage("");
    try{
      const res=await fetch("/api/dynasty-rosters",{method:"POST"});
      const data=await res.json();
      if(!res.ok&&!(data?.rosters?.length))throw new Error(data?.error||data?.detail||"Could not refresh rosters");
      const next=(data?.rosters||[]) as RosterView[];
      setRosters(next);
      setTab(current=>next.some(r=>r.key===current)?current:(next[0]?.key||""));
      setMessage(data?.errors?.length?"Refresh completed with warnings: "+data.errors.join(" • "):"All Sleeper rosters refreshed.");
    }catch(e:any){setMessage(e?.message||"Could not refresh rosters")}
    finally{setRefreshing(false)}
  }

  function chooseSort(key:SortKey){
    setSort(current=>current?.key===key?{key,dir:current.dir==="asc"?"desc":"asc"}:{key,dir:"asc"});
  }

  const roster=rosters.find(r=>r.key===tab)||rosters[0];
  const sortedPlayers=useMemo(()=>{
    if(!roster)return [];
    if(!sort)return roster.players;
    const list=[...roster.players];
    const factor=sort.dir==="asc"?1:-1;
    list.sort((a,b)=>{
      if(sort.key==="age"||sort.key==="ktc"){
        const av=Number(a[sort.key]),bv=Number(b[sort.key]);
        const aValid=Number.isFinite(av),bValid=Number.isFinite(bv);
        if(aValid!==bValid)return aValid?-1:1;
        if(aValid&&bValid)return (av-bv)*factor;
        return a.name.localeCompare(b.name);
      }
      if(sort.key==="position"){
        const av=POS_ORDER[a.position]||99,bv=POS_ORDER[b.position]||99;
        return av===bv?a.name.localeCompare(b.name):(av-bv)*factor;
      }
      return String(a[sort.key]||"").localeCompare(String(b[sort.key]||""),undefined,{numeric:true,sensitivity:"base"})*factor;
    });
    return list;
  },[roster,sort]);

  const SortHeader=({label,col,center=false}:{label:string;col:SortKey;center?:boolean})=><th className={center?"center":""}>
    <button className={"sort-header "+(sort?.key===col?"active":"")} onClick={()=>chooseSort(col)} type="button">
      <span>{label}</span><span className="sort-arrow">{sort?.key===col?(sort.dir==="asc"?"▲":"▼"):"↕"}</span>
    </button>
  </th>;

  return <div className="dynasty-page">
    <div className="page-head dynasty-page-head">
      <div>
        <div className="ey">Dynasty roster reference</div>
        <h1>Dynasty Rosters</h1>
        <p className="muted">Live Sleeper rosters with sortable values and roster-construction handcuff targets.</p>
      </div>
      <button className="refresh-rosters" type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"Refreshing all leagues…":"↻ Refresh Rosters"}
      </button>
    </div>

    {message&&<div className={"dynasty-message "+(message.startsWith("All Sleeper")?"ok":"warn")}>{message}</div>}

    {loading&&!roster?<div className="dynasty-loading">Loading roster data…</div>:<>
      <div className="dynasty-tabs" role="tablist" aria-label="Dynasty leagues">
        {rosters.map(item=><button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={tab===item.key}
          className={tab===item.key?"active":""}
          onClick={()=>{setTab(item.key);setSort(null)}}
        >{item.label}</button>)}
      </div>

      {roster&&<>
        <div className="dynasty-meta-grid">
          <div className="dynasty-meta"><span>League</span><strong>{roster.league||roster.label}</strong></div>
          <div className="dynasty-meta"><span>Rostered Players</span><strong>{roster.players.length}</strong></div>
          <div className="dynasty-meta"><span>Total KTC Value</span><strong>{new Intl.NumberFormat("en-US").format(roster.totalKtc)}</strong></div>
          <div className="dynasty-meta"><span>Average Age</span><strong>{roster.avgAge?roster.avgAge.toFixed(1):"—"}</strong></div>
          <div className="dynasty-meta updated"><span>Last Updated · {roster.source}</span><strong>{roster.updated||"—"}</strong></div>
        </div>

        <div className="dynasty-layout">
          <section className="dynasty-panel dynasty-roster-panel">
            <div className="dynasty-panel-title">
              Roster
              <span>{roster.players.length} players · click any column to sort</span>
            </div>
            <div className="dynasty-table-wrap">
              <table className="dynasty-roster-table">
                <thead><tr>
                  <SortHeader label="Player Name" col="name"/>
                  <SortHeader label="Position" col="position" center/>
                  <SortHeader label="Team" col="team"/>
                  <SortHeader label="Age" col="age" center/>
                  <SortHeader label="KTC Value" col="ktc" center/>
                </tr></thead>
                <tbody>
                  {sortedPlayers.map((p,i)=><tr key={p.name+"-"+i}>
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
      </>}
    </>}

    <style jsx global>{`
      .dynasty-page{max-width:1500px;margin:0 auto}
      .dynasty-page-head{margin-bottom:10px;align-items:center}
      .dynasty-page-head p{max-width:760px;margin:4px 0 0}
      .refresh-rosters{background:#18794e;min-width:168px;white-space:nowrap}
      .refresh-rosters:disabled{opacity:.65;cursor:wait}
      .dynasty-message{margin:0 0 12px;padding:9px 12px;border-radius:8px;font-size:12px;font-weight:800}
      .dynasty-message.ok{background:#123b2c;border:1px solid #247a55;color:#bff4d7}
      .dynasty-message.warn{background:#33291a;border:1px solid #725b2d;color:#f8dfaa}
      .dynasty-loading{padding:34px;text-align:center;color:#8fa7c8;background:#0c1930;border:1px solid #20395f;border-radius:12px}
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
      .dynasty-roster-table th{position:sticky;top:0;z-index:2;background:#132844;color:#b9c9df;text-align:left;padding:0;border-bottom:1px solid #31527f;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
      .dynasty-roster-table th.center .sort-header{justify-content:center}
      .sort-header{width:100%;display:flex;align-items:center;justify-content:flex-start;gap:6px;background:transparent!important;border:0!important;border-radius:0!important;color:#b9c9df!important;padding:9px 11px;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
      .sort-header:hover,.sort-header.active{color:#fff!important;background:#193457!important}
      .sort-arrow{font-size:9px;opacity:.8}
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
        .dynasty-page-head{display:block}
        .refresh-rosters{margin-top:12px}
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
