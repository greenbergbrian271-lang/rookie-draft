"use client";

import {useEffect,useMemo,useState} from "react";

type Tab="league"|"managers"|"market"|"process";
const fmt=new Intl.NumberFormat("en-US");
const money=(n:any)=>fmt.format(Math.round(Number(n)||0));
const pct=(n:any)=>Number.isFinite(Number(n))?(Number(n)*100).toFixed(0)+"%":"—";

function Card({title,children,wide=false}:{title:string;children:any;wide?:boolean}){
  return <section className={"di-card "+(wide?"wide":"")}><h3>{title}</h3>{children}</section>;
}

export default function DynastyIntelligencePanel({leagueKey,refreshToken=0}:{leagueKey:string;refreshToken?:number}){
  const [tab,setTab]=useState<Tab>("league");
  const [cache,setCache]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [tradeSearch,setTradeSearch]=useState("");

  useEffect(()=>{setCache({});setTab("league");setError("")},[leagueKey,refreshToken]);

  useEffect(()=>{
    if(!leagueKey||cache[tab])return;
    let live=true;setLoading(true);setError("");
    fetch("/api/dynasty-intelligence?leagueKey="+encodeURIComponent(leagueKey)+"&mode="+tab,{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not load intelligence");return j})
      .then(j=>{if(live)setCache(c=>({...c,[tab]:j}))})
      .catch(e=>{if(live)setError(e?.message||"Could not load intelligence")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[tab,leagueKey,refreshToken,cache]);

  const data=cache[tab];

  const comparable=useMemo(()=>{
    if(tab!=="managers"||!data?.feed)return[];
    const q=tradeSearch.trim().toLowerCase();
    if(!q)return data.feed.slice(0,12);
    return data.feed.filter((trade:any)=>trade.sides?.some((side:any)=>[
      ...(side.playersIn||[]),...(side.playersOut||[])
    ].some((a:any)=>(a.name+" "+a.position).toLowerCase().includes(q)))).slice(0,12);
  },[data,tradeSearch,tab]);

  return <section className="di-shell">
    <div className="di-head">
      <div><span>Dynasty Intelligence</span><h2>League, manager, market & process signals</h2></div>
      <div className="di-tabs">
        {(["league","managers","market","process"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x==="league"?"League":x==="managers"?"Managers":x==="market"?"Market":"Scouting Process"}</button>)}
      </div>
    </div>
    {error&&<div className="di-state error">{error}</div>}
    {loading&&!data?<div className="di-state">Building intelligence…</div>:data?<div className="di-grid">

      {tab==="league"&&<>
        <Card title="League Demand Map" wide>
          <div className="di-demand">{(data.demand||[]).map((d:any)=><div key={d.position}><b>{d.position}</b><span>Best buyers</span>{d.buyers.map((x:any)=><p key={x.rosterId}><strong>#{x.rank}</strong> {x.name}</p>)}<span>Position surplus</span>{d.sellers.map((x:any)=><p key={"s"+x.rosterId}><strong>#{x.rank}</strong> {x.name}</p>)}</div>)}</div>
        </Card>

        <Card title="Team Windows & Construction" wide>
          <div className="di-table-wrap"><table className="di-table"><thead><tr><th>Team</th><th>Type</th><th>Window</th><th>Starters</th><th>Bench</th><th>Avg Age</th><th>Build</th></tr></thead><tbody>
            {(data.teams||[]).sort((a:any,b:any)=>a.powerRank-b.powerRank).map((t:any)=><tr key={t.rosterId} className={t.isMine?"mine":""}>
              <td><strong>#{t.powerRank} {t.name}</strong></td><td>{t.classification}</td><td>{t.windowScore}/100</td><td>#{t.starterRank} · {money(t.starterValue)}</td><td>{money(t.benchValue)}</td><td>{Number(t.avgAge||0).toFixed(1)}</td><td>{t.construction}</td>
            </tr>)}
          </tbody></table></div>
        </Card>

        <Card title="Age Risk by Position">
          {(data.teams||[]).filter((x:any)=>x.isMine).map((t:any)=><div key={t.rosterId} className="di-age-grid">{Object.entries(t.ageByPosition||{}).map(([pos,v]:any)=><div key={pos}><b>{pos}</b><strong>{v.age?Number(v.age).toFixed(1):"—"}</strong><span className={"risk "+String(v.risk).toLowerCase()}>{v.risk}</span></div>)}</div>)}
        </Card>

        <Card title="Draft Pick Wealth">
          {(data.teams||[]).sort((a:any,b:any)=>a.pickRank-b.pickRank).slice(0,6).map((t:any)=><p className="di-line" key={t.rosterId}><strong>#{t.pickRank} {t.name}</strong><span>{money(t.pickValue)}</span></p>)}
        </Card>

        <Card title="Yearly Power Rankings">
          {Object.entries((data.yearlyPower||[]).reduce((m:any,r:any)=>{(m[r.season]??=[]).push(r);return m},{})).slice(0,4).map(([year,rows]:any)=><div key={year} className="di-year"><b>{year}</b>{rows.sort((a:any,b:any)=>a.rank-b.rank).slice(0,5).map((r:any)=><span key={r.rosterId}>#{r.rank} {r.teamName}</span>)}</div>)}
        </Card>

        <Card title="Trade Deadline Mode" wide>
          {(data.deadline||[]).length?<div className="di-opps">{data.deadline.slice(0,8).map((o:any,i:number)=><div key={i}><b>{o.buyer.name}</b><span>needs {o.position} (#{o.buyerRank})</span><em>→ {o.seller.name}: {o.candidates.map((c:any)=>c.name).join(", ")}</em></div>)}</div>:<p className="muted">No clean contender-to-rebuilder matches right now.</p>}
        </Card>
      </>}

      {tab==="managers"&&<>
        <Card title="Dynasty Manager Profiles" wide>
          <div className="di-manager-grid">{(data.profiles||[]).map((p:any)=><article key={p.ownerId}><h4>{p.name}</h4><div className="di-tags">{(p.tags||[]).map((t:string)=><span key={t}>{t}</span>)}</div><p>{p.trades} trades · {p.waivers} waivers · {p.picksIn} picks acquired / {p.picksOut} moved</p><div className="di-bias">{Object.entries(p.positionBias||{}).map(([pos,v]:any)=><span key={pos} className={v.bias>.05?"hot":""}>{pos} {v.bias>=0?"+":""}{pct(v.bias)}</span>)}</div></article>)}</div>
        </Card>

        <Card title="Transaction Feed" wide>
          <div className="di-trades">{(data.feed||[]).slice(0,18).map((t:any)=><div key={t.id}><b>{t.season} · {new Date(t.created).toLocaleDateString()}</b>{t.sides.map((s:any)=><span key={s.ownerId}><strong>{s.name}</strong> in {money(s.valueIn)} / out {money(s.valueOut)}</span>)}</div>)}</div>
        </Card>

        <Card title="Comparable Trades" wide>
          <input className="di-search" value={tradeSearch} onChange={e=>setTradeSearch(e.target.value)} placeholder="Search a player or position, e.g. QB or Caleb Williams"/>
          <div className="di-trades">{comparable.map((t:any)=><div key={"c"+t.id}><b>{new Date(t.created).toLocaleDateString()}</b>{t.sides.map((s:any)=><span key={s.ownerId}><strong>{s.name}</strong> received {[...(s.playersIn||[]),...(s.picksIn||[])].map((a:any)=>a.name).join(" + ")||"—"}</span>)}</div>)}</div>
        </Card>
      </>}

      {tab==="market"&&<>
        <Card title="Historical KTC Tracking">
          <p className="muted">Daily KTC snapshots are now stored automatically.</p>
          <p className="di-line"><strong>7-day baseline</strong><span>{data.movement7?.baselineDate||"Collecting history"}</span></p>
          <p className="di-line"><strong>30-day baseline</strong><span>{data.movement30?.baselineDate||"Collecting history"}</span></p>
        </Card>

        <Card title="Buy Low / Sell High">
          {(data.movement30?.rows||[]).length?<>{data.movement30.rows.filter((x:any)=>x.onMyRoster&&x.changePct>0).slice(0,4).map((x:any)=><p className="di-line" key={"s"+x.name}><strong>Sell high · {x.name}</strong><span>+{Number(x.changePct).toFixed(1)}%</span></p>)}{data.movement30.rows.filter((x:any)=>x.changePct<0).slice(0,4).map((x:any)=><p className="di-line" key={"b"+x.name}><strong>Buy low · {x.name}</strong><span>{Number(x.changePct).toFixed(1)}%</span></p>)}</>:<p className="muted">This activates as daily KTC history accumulates.</p>}
        </Card>

        <Card title="Emerging Player Radar">
          {(data.emerging?.adds||[]).slice(0,8).map((x:any)=><p className="di-line" key={x.id}><strong>{x.name} · {x.position}</strong><span>+{fmt.format(x.count)} adds · {money(x.value)}</span></p>)}
        </Card>

        <Card title="Cross-League Exposure">
          {(data.exposure||[]).filter((x:any)=>x.count>1).slice(0,10).map((x:any)=><p className="di-line" key={x.name}><strong>{x.name} · {x.count} leagues</strong><span>{x.leagues.join(", ")}</span></p>)}
        </Card>

        <Card title="Market vs My Board" wide>
          <div className="di-table-wrap"><table className="di-table"><thead><tr><th>Player</th><th>Pos</th><th>My Rank</th><th>ADP</th><th>Gap</th></tr></thead><tbody>{(data.marketGaps||[]).slice(0,16).map((x:any)=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.position}</td><td>{x.myRank}</td><td>{x.adpRank}</td><td className={x.delta>0?"up":"down"}>{x.delta>0?"+":""}{x.delta}</td></tr>)}</tbody></table></div>
        </Card>
      </>}

      {tab==="process"&&<>
        <Card title="Scouting Alpha by Class" wide>
          <p className="muted">{data.scoutingAlpha?.note}</p>
          <div className="di-alpha-years">{(data.scoutingAlpha?.years||[]).map((y:any)=><div key={y.year}><b>{y.year}</b><span>{y.matched} matched</span><strong className={(y.edge||0)>=0?"up":"down"}>{y.edge==null?"—":(y.edge>0?"+":"")+y.edge.toFixed(2)} vs NFL</strong></div>)}</div>
        </Card>
        <Card title="Process Wins">
          {(data.scoutingAlpha?.wins||[]).slice(0,8).map((x:any)=><p className="di-line" key={x.year+x.name}><strong>{x.year} · {x.name}</strong><span>You #{x.yourRank} · KTC #{x.ktcRank} · NFL #{x.nflRank}</span></p>)}
        </Card>
        <Card title="Process Lessons">
          {(data.scoutingAlpha?.lessons||[]).slice(0,8).map((x:any)=><p className="di-line" key={x.year+x.name}><strong>{x.year} · {x.name}</strong><span>You #{x.yourRank} · KTC #{x.ktcRank} · NFL #{x.nflRank}</span></p>)}
        </Card>
      </>}

    </div>:null}

    <style jsx global>{`
      .di-shell{margin:14px 0;background:#09182c;border:1px solid #20395f;border-radius:14px;overflow:hidden}
      .di-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:linear-gradient(180deg,#102845,#0d2038);border-bottom:1px solid #20395f}
      .di-head>div>span{color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.di-head h2{margin:3px 0 0;font-size:18px}
      .di-tabs{display:flex;gap:5px;flex-wrap:wrap}.di-tabs button{background:#10213a;border:1px solid #31527f;color:#9db2ce;padding:7px 10px;font-size:10px}.di-tabs button.active{background:#4285f4;color:#fff}
      .di-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px}.di-card{background:#0c1930;border:1px solid #20395f;border-radius:10px;padding:11px;min-width:0}.di-card.wide{grid-column:1/-1}.di-card h3{font-size:12px;margin:0 0 9px;color:#dce8f6;text-transform:uppercase;letter-spacing:.05em}
      .di-state{padding:24px;color:#8fa7c8}.di-state.error{color:#ffd1b8}.di-demand{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.di-demand>div{background:#0b2039;border:1px solid #29476e;border-radius:8px;padding:9px}.di-demand b{font-size:15px}.di-demand span{display:block;color:#7890b1;font-size:9px;text-transform:uppercase;margin:6px 0 2px}.di-demand p{margin:2px 0;font-size:11px}.di-demand p strong{color:#20e2dd}
      .di-table-wrap{overflow:auto}.di-table{width:100%;border-collapse:collapse;font-size:11px}.di-table th,.di-table td{padding:7px 8px;border-bottom:1px solid #18304f;text-align:left;white-space:nowrap}.di-table th{color:#7890b1;font-size:9px;text-transform:uppercase}.di-table tr.mine td{background:#102a49}.di-line{display:flex;justify-content:space-between;gap:10px;margin:5px 0;padding:6px 0;border-bottom:1px solid #18304f;font-size:11px}.di-line span{color:#8fa7c8;text-align:right}
      .di-age-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.di-age-grid>div{background:#10213a;border-radius:8px;padding:8px;text-align:center}.di-age-grid b,.di-age-grid strong,.di-age-grid span{display:block}.di-age-grid strong{font-size:18px}.risk{font-size:9px;text-transform:uppercase}.risk.high{color:#ff9cab}.risk.watch{color:#ffd978}.risk.low{color:#8df0ca}
      .di-year{display:grid;grid-template-columns:50px 1fr;gap:3px 8px;margin:6px 0}.di-year b{grid-row:1/6;color:#20e2dd}.di-year span{font-size:10px}.di-opps{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.di-opps>div{background:#10213a;border-radius:8px;padding:8px;display:grid;grid-template-columns:1fr auto;gap:2px 8px}.di-opps b{font-size:11px}.di-opps span{font-size:10px;color:#ffd978}.di-opps em{grid-column:1/-1;color:#8fa7c8;font-size:10px;font-style:normal}
      .di-manager-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.di-manager-grid article{background:#10213a;border-radius:8px;padding:9px}.di-manager-grid h4{margin:0 0 6px}.di-manager-grid p{font-size:10px;color:#8fa7c8}.di-tags,.di-bias{display:flex;gap:4px;flex-wrap:wrap}.di-tags span,.di-bias span{padding:3px 5px;border-radius:999px;background:#152f50;color:#b9c9df;font-size:8px;font-weight:800}.di-bias span.hot{background:#4d2b3b;color:#ffc3ce}
      .di-trades{display:grid;gap:5px}.di-trades>div{display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;padding:7px;background:#10213a;border-radius:7px;font-size:10px}.di-trades span{color:#8fa7c8}.di-trades span strong{color:#dce8f6}.di-search{margin-bottom:8px}
      .di-alpha-years{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.di-alpha-years>div{background:#10213a;border-radius:8px;padding:9px;text-align:center}.di-alpha-years b,.di-alpha-years span,.di-alpha-years strong{display:block}.di-alpha-years span{font-size:9px;color:#8fa7c8}.up{color:#8df0ca!important}.down{color:#ff9cab!important}
      @media(max-width:1000px){.di-grid{grid-template-columns:1fr}.di-card.wide{grid-column:auto}.di-demand{grid-template-columns:repeat(2,1fr)}.di-manager-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:650px){.di-head{display:block}.di-tabs{margin-top:10px}.di-demand,.di-manager-grid,.di-opps,.di-alpha-years{grid-template-columns:1fr}.di-trades>div{grid-template-columns:1fr}.di-age-grid{grid-template-columns:repeat(2,1fr)}}
    `}</style>
  </section>;
}
