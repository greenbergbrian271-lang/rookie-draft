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
  const [processSearch,setProcessSearch]=useState("");
  const [processSaving,setProcessSaving]=useState("");
  const [historyImporting,setHistoryImporting]=useState(false);
  const [historyMessage,setHistoryMessage]=useState("");

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

  const processPlayers=useMemo(()=>{
    if(tab!=="process"||!data?.scoutingAlpha?.players)return[];
    const q=processSearch.trim().toLowerCase();
    const rows=[...data.scoutingAlpha.players];
    if(!q)return rows.filter((x:any)=>x.excluded).slice(0,12);
    return rows.filter((x:any)=>(x.name+" "+x.position+" "+x.year).toLowerCase().includes(q)).slice(0,20);
  },[data,processSearch,tab]);

  async function updateProcessExclusion(action:"exclude"|"restore",player:any){
    const key=player.year+"|"+player.name;
    setProcessSaving(key);setError("");
    try{
      const r=await fetch("/api/dynasty-intelligence/scouting-exclusions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,year:player.year,name:player.name})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not update scouting sample");
      setCache(current=>{const next={...current};delete next.process;return next});
    }catch(e:any){setError(e?.message||"Could not update scouting sample")}finally{setProcessSaving("")}
  }

  async function importKtcHistory(){
    setHistoryImporting(true);setHistoryMessage("");setError("");
    try{
      const r=await fetch("/api/dynasty-intelligence/ktc-history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey,limit:6})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not import KTC history");
      setHistoryMessage(j.imported?.length?("Imported "+j.imported.length+" player histories. "+j.remaining+" remaining."):(j.remaining?"No new histories imported in this batch.":"League history import complete."));
      setCache(current=>{const next={...current};delete next.market;return next});
    }catch(e:any){setError(e?.message||"Could not import KTC history")}finally{setHistoryImporting(false)}
  }

  return <section className="di-shell">
    <div className="di-head">
      <div><span>Intelligence Views</span><h2>League, manager, market & process signals</h2></div>
      <div className="di-tabs">
        {(["league","managers","market","process"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x==="league"?"League Overview":x==="managers"?"Manager Tendencies":x==="market"?"Market":"Scouting Process"}</button>)}
      </div>
    </div>
    {error&&<div className="di-state error">{error}</div>}
    {loading&&!data?<div className="di-state">Building intelligence…</div>:data?<div className="di-grid">

      {tab==="league"&&<>
        <Card title="League Demand Map" wide>
          <div className="di-demand">{(data.demand||[]).map((d:any)=><div key={d.position}><b>{d.position}</b><span>Best buyers</span>{d.buyers.map((x:any)=><p key={x.rosterId}><strong>#{x.rank}</strong> {x.name}</p>)}<span>Position surplus</span>{d.sellers.map((x:any)=><p key={"s"+x.rosterId}><strong>#{x.rank}</strong> {x.name}</p>)}</div>)}</div>
        </Card>

        <Card title="Team Windows & Strategy" wide>
          <div className="di-table-wrap"><table className="di-table"><thead><tr><th>Team</th><th>Type</th><th>Win-Now</th><th>Starters</th><th>Bench</th><th>Avg Age</th><th>Roster Strategy</th></tr></thead><tbody>
            {(data.teams||[]).sort((a:any,b:any)=>a.powerRank-b.powerRank).map((t:any)=><tr key={t.rosterId} className={t.isMine?"mine":""}>
              <td><strong>#{t.powerRank} {t.name}</strong></td><td>{t.classification}</td><td>{t.windowScore}/100</td><td>#{t.starterRank} · {money(t.starterValue)}</td><td>{money(t.benchValue)}</td><td>{Number(t.avgAge||0).toFixed(1)}</td><td>{t.construction}</td>
            </tr>)}
          </tbody></table></div>
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
          <div className="di-manager-intro">
            <p>Built from Sleeper trade, waiver and add/drop history across {(data.seasons||[]).join(", ")||"available seasons"}. Position bias compares each manager's acquisition mix with the league average; a positive number means they buy that position more often than the league.</p>
            <span>Pay Index &gt; 1.00 means the manager has historically surrendered more current KTC value in trades where that position came back.</span>
          </div>
          <div className="di-manager-grid">{(data.profiles||[]).map((p:any)=>{
            const pickNet=(Number(p.picksIn)||0)-(Number(p.picksOut)||0);
            const pickStyle=pickNet>=3?"Pick Collector":pickNet<=-3?"Pick Seller":"Balanced Picks";
            return <article key={p.ownerId} className={"di-manager-card "+(p.isMine?"mine":"")}>
              <div className="di-manager-card-head"><div><h4>{p.name}{p.isMine&&<span className="di-you">You</span>}</h4><small>{p.trades} trades · {p.waivers} waivers · {p.freeAgentAdds||0} FA adds</small></div><strong>{pickStyle}</strong></div>
              <div className="di-tags">{(p.tags||[]).map((t:string)=><span key={t}>{t}</span>)}</div>
              <div className="di-manager-pickline">
                <span>Picks acquired <b>{p.picksIn}</b></span><span>Picks moved <b>{p.picksOut}</b></span><span>Net <b className={pickNet>0?"up":pickNet<0?"down":""}>{pickNet>0?"+":""}{pickNet}</b></span>
              </div>
              <div className="di-position-tendencies">
                {Object.entries(p.positionBias||{}).map(([pos,v]:any)=><div key={pos} className={v.bias>.05?"hot":v.bias<-.05?"cold":""}>
                  <b>{pos}</b>
                  <span>Acq. bias {v.bias>=0?"+":""}{pct(v.bias)}</span>
                  <em>Pay index {Number(v.payRatio||1).toFixed(2)}</em>
                </div>)}
              </div>
            </article>
          })}</div>
        </Card>

        <Card title="Pick Tendencies" wide>
          <div className="di-table-wrap"><table className="di-table"><thead><tr><th>Manager</th><th>Trades</th><th>Picks Acquired</th><th>Picks Moved</th><th>Net Picks</th><th>Trade Value Style</th></tr></thead><tbody>
            {(data.profiles||[]).map((p:any)=>{
              const net=(Number(p.picksIn)||0)-(Number(p.picksOut)||0);
              const style=Number(p.valueRatio||1)<.94?"Pays Up":Number(p.valueRatio||1)>1.06?"Value Seeker":"Near Market";
              return <tr key={"pick-"+p.ownerId} className={p.isMine?"mine":""}><td><strong>{p.name}{p.isMine?" · You":""}</strong></td><td>{p.trades}</td><td>{p.picksIn}</td><td>{p.picksOut}</td><td className={net>0?"up":net<0?"down":""}>{net>0?"+":""}{net}</td><td>{style}</td></tr>
            })}
          </tbody></table></div>
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
          <p className="muted">Imports the all-time Superflex value series already published on KTC player pages, then keeps the database current with our daily snapshots.</p>
          <div className="di-history-progress">
            <div><strong>{data.historyStatus?.completed||0}</strong><span>of {data.historyStatus?.total||0} league-rostered players imported</span></div>
            <button type="button" disabled={historyImporting||!(data.historyStatus?.remaining)} onClick={()=>void importKtcHistory()}>{historyImporting?"Importing 6 histories…":data.historyStatus?.remaining?"Import Next 6":"History Complete"}</button>
          </div>
          {historyMessage&&<p className="di-history-message">{historyMessage}</p>}
          {data.historyStatus?.oldestDate&&<p className="di-line"><strong>Oldest imported KTC point</strong><span>{data.historyStatus.oldestDate}</span></p>}
          <p className="di-line"><strong>7-day baseline</strong><span>{(data.movement7?.rows||[]).length?data.movement7.baselineDate:"Import history to activate"}</span></p>
          <p className="di-line"><strong>30-day baseline</strong><span>{(data.movement30?.rows||[]).length?data.movement30.baselineDate:"Import history to activate"}</span></p>
          <p className="di-line"><strong>90-day baseline</strong><span>{(data.movement90?.rows||[]).length?data.movement90.baselineDate:"Import history to activate"}</span></p>
        </Card>

        <Card title="Buy Low / Sell High">
          {(data.movement30?.rows||[]).length?<>{data.movement30.rows.filter((x:any)=>x.onMyRoster&&x.changePct>0).slice(0,4).map((x:any)=><p className="di-line" key={"s"+x.name}><strong>Sell high · {x.name}</strong><span>+{Number(x.changePct).toFixed(1)}%</span></p>)}{data.movement30.rows.filter((x:any)=>x.changePct<0).slice(0,4).map((x:any)=><p className="di-line" key={"b"+x.name}><strong>Buy low · {x.name}</strong><span>{Number(x.changePct).toFixed(1)}%</span></p>)}</>:<p className="muted">Import KTC player histories to activate the 30-day market signals immediately.</p>}
        </Card>

        <Card title="Emerging Player Radar">
          {(data.emerging?.adds||[]).slice(0,8).map((x:any)=><p className="di-line" key={x.id}><strong>{x.name} · {x.position}</strong><span>+{fmt.format(x.count)} adds · {money(x.value)}</span></p>)}
        </Card>


        <Card title="Market vs My Board" wide>
          <div className="di-table-wrap"><table className="di-table"><thead><tr><th>Player</th><th>Pos</th><th>My Rank</th><th>ADP</th><th>Gap</th></tr></thead><tbody>{(data.marketGaps||[]).slice(0,16).map((x:any)=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.position}</td><td>{x.myRank}</td><td>{x.adpRank}</td><td className={x.delta>0?"up":"down"}>{x.delta>0?"+":""}{x.delta}</td></tr>)}</tbody></table></div>
        </Card>
      </>}

      {tab==="process"&&<>
        <Card title="Scouting Alpha by Class" wide>
          <p className="muted">{data.scoutingAlpha?.note}</p>
          <div className="di-alpha-years">{(data.scoutingAlpha?.years||[]).map((y:any)=><div key={y.year}><b>{y.year}</b><span>{y.sample} board sample{y.excluded?" · "+y.excluded+" excluded":""}</span><em>{y.comparable} comparable vs NFL · {y.nflDrafted} drafted · {y.ktcProfiles} KTC</em><strong className={(y.edge||0)>=0?"up":"down"}>{y.edge==null?"—":(y.edge>0?"+":"")+y.edge.toFixed(2)} vs NFL</strong></div>)}</div>
        </Card>

        <Card title="Manage Scouting Sample" wide>
          <p className="muted">Exclude players you never properly evaluated. Excluded players are removed from class scoring and from Process Wins/Lessons, but their historical board data is left untouched.</p>
          <input className="di-search" value={processSearch} onChange={e=>setProcessSearch(e.target.value)} placeholder="Search any historical player to exclude or restore…"/>
          {!processSearch.trim()&&!(data.scoutingAlpha?.exclusions||[]).length?<p className="muted">No players are currently excluded. Search for a player to manage the scoring sample.</p>:null}
          <div className="di-process-manage">{processPlayers.map((x:any)=><div key={x.year+"|"+x.name}>
            <div><strong>{x.year} · {x.name}</strong><span>{x.position} · Board #{x.yourRank}{x.comparable?" · comparable vs NFL":" · not in vs-NFL cohort"}</span></div>
            <button type="button" disabled={processSaving===x.year+"|"+x.name} onClick={()=>void updateProcessExclusion(x.excluded?"restore":"exclude",x)}>{processSaving===x.year+"|"+x.name?"Saving…":x.excluded?"Restore":"Exclude"}</button>
          </div>)}</div>
        </Card>

        <Card title="Process Wins">
          {(data.scoutingAlpha?.wins||[]).slice(0,8).map((x:any)=><div className="di-process-line" key={x.year+x.name}><div><strong>{x.year} · {x.name}</strong><span>Board #{x.yourRank} · Comparable #{x.yourComparisonRank} · KTC #{x.ktcRank} · NFL #{x.nflRank}</span></div><button onClick={()=>void updateProcessExclusion("exclude",x)}>Exclude</button></div>)}
        </Card>
        <Card title="Process Lessons">
          {(data.scoutingAlpha?.lessons||[]).slice(0,8).map((x:any)=><div className="di-process-line" key={x.year+x.name}><div><strong>{x.year} · {x.name}</strong><span>Board #{x.yourRank} · Comparable #{x.yourComparisonRank} · KTC #{x.ktcRank} · NFL #{x.nflRank}</span></div><button onClick={()=>void updateProcessExclusion("exclude",x)}>Exclude</button></div>)}
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
      .di-manager-intro{display:flex;justify-content:space-between;gap:18px;margin-bottom:10px;padding:8px 10px;border:1px solid #29476e;border-radius:8px;background:#0b2039}.di-manager-intro p{margin:0;color:#a9bdd6;font-size:10px;line-height:1.45;max-width:920px}.di-manager-intro span{max-width:420px;color:#7890b1;font-size:9px;line-height:1.45;text-align:right}
      .di-manager-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.di-manager-card{background:#10213a;border:1px solid #20395f;border-radius:9px;padding:10px}.di-manager-card.mine{border-color:#4f8ccf;box-shadow:0 0 0 1px rgba(79,140,207,.28) inset}.di-manager-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.di-manager-card-head h4{margin:0}.di-you{display:inline-block;margin-left:6px;padding:2px 5px;border-radius:999px;background:#1c4d7d;color:#b9dcff;font-size:7px;vertical-align:middle;text-transform:uppercase;letter-spacing:.06em}.di-manager-card-head small{display:block;margin-top:2px;color:#7890b1;font-size:8px}.di-manager-card-head>strong{padding:4px 6px;border-radius:999px;background:#142f50;color:#b9d7ff;font-size:8px;white-space:nowrap}.di-tags,.di-bias{display:flex;gap:4px;flex-wrap:wrap}.di-tags{margin-top:7px}.di-tags span,.di-bias span{padding:3px 5px;border-radius:999px;background:#152f50;color:#b9c9df;font-size:8px;font-weight:800}.di-bias span.hot{background:#4d2b3b;color:#ffc3ce}
      .di-manager-pickline{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px}.di-manager-pickline span{padding:5px 6px;background:#0c1c32;border-radius:6px;color:#7890b1;font-size:8px}.di-manager-pickline b{display:block;margin-top:1px;color:#dce8f6;font-size:11px}.di-position-tendencies{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:8px}.di-position-tendencies>div{padding:6px;background:#0c1c32;border:1px solid #1c3658;border-radius:6px;text-align:center}.di-position-tendencies b,.di-position-tendencies span,.di-position-tendencies em{display:block}.di-position-tendencies b{font-size:10px}.di-position-tendencies span{font-size:8px;color:#9bb0cc;margin-top:2px}.di-position-tendencies em{font-size:7px;color:#6f89aa;font-style:normal;margin-top:2px}.di-position-tendencies>div.hot{border-color:#865064;background:#351f2d}.di-position-tendencies>div.hot span{color:#ffc3ce}.di-position-tendencies>div.cold{opacity:.72}
      .di-trades{display:grid;gap:5px}.di-trades>div{display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;padding:7px;background:#10213a;border-radius:7px;font-size:10px}.di-trades span{color:#8fa7c8}.di-trades span strong{color:#dce8f6}.di-search{margin-bottom:8px}
      .di-history-progress{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;margin:8px 0;background:#10213a;border:1px solid #29476e;border-radius:8px}.di-history-progress>div{display:flex;align-items:baseline;gap:6px}.di-history-progress strong{font-size:20px;color:#20e2dd}.di-history-progress span{font-size:9px;color:#8fa7c8}.di-history-progress button{padding:6px 9px;background:#183f69;border:1px solid #3972ac;color:#dcecff;border-radius:7px;font-size:9px;font-weight:900}.di-history-progress button:disabled{opacity:.55}.di-history-message{margin:4px 0;color:#8df0ca;font-size:9px}
      .di-alpha-years{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.di-alpha-years>div{background:#10213a;border-radius:8px;padding:9px;text-align:center}.di-alpha-years b,.di-alpha-years span,.di-alpha-years em,.di-alpha-years strong{display:block}.di-alpha-years span{font-size:9px;color:#8fa7c8}.di-alpha-years em{font-size:8px;color:#607b9d;font-style:normal;margin:1px 0 2px}.di-process-manage{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.di-process-manage>div,.di-process-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border:1px solid #18304f;border-radius:7px;background:#10213a}.di-process-manage strong,.di-process-manage span,.di-process-line strong,.di-process-line span{display:block}.di-process-manage span,.di-process-line span{font-size:9px;color:#8fa7c8;margin-top:2px}.di-process-manage button,.di-process-line button{padding:4px 7px;background:#152f50;border:1px solid #31527f;color:#b9d7ff;border-radius:6px;font-size:8px;white-space:nowrap}.di-process-manage button:hover,.di-process-line button:hover{background:#1d426d;color:#fff}.up{color:#8df0ca!important}.down{color:#ff9cab!important}
      @media(max-width:1000px){.di-grid{grid-template-columns:1fr}.di-card.wide{grid-column:auto}.di-demand{grid-template-columns:repeat(2,1fr)}.di-manager-grid{grid-template-columns:1fr}.di-manager-intro{display:block}.di-manager-intro span{display:block;max-width:none;text-align:left;margin-top:5px}}
      @media(max-width:650px){.di-head{display:block}.di-tabs{margin-top:10px}.di-tabs button{flex:1 1 145px}.di-demand,.di-manager-grid,.di-opps,.di-alpha-years,.di-process-manage{grid-template-columns:1fr}.di-position-tendencies{grid-template-columns:repeat(2,1fr)}.di-trades>div{grid-template-columns:1fr}.di-age-grid{grid-template-columns:repeat(2,1fr)}}
    `}</style>
  </section>;
}
