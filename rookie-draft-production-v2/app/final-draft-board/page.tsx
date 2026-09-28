"use client";

import {useEffect,useMemo,useState} from "react";
import {ChevronDown,ChevronUp,Cloud,Download,HardDrive,RotateCcw,Search} from "lucide-react";
import {schoolStyle} from "@/lib/school-colors";

type Position="QB"|"RB"|"WR"|"TE";
type Player={
  id:string|number;
  name:string;
  position:Position;
  college?:string;
  draft_class:number;
  scouting_status?:string;
};
type GradeRecord={pre:number|null;final:number|null};

const PLAYER_KEY="rookie-draft.players.v1";
const ORDER_KEY="rookie-draft.final-board-order.v1";
const TIER_KEY="rookie-draft.final-board-tiers.v1";
const LEAGUES=["Base","One League","D+R","Last Man Standing","Last Minute"];
const POSITIONS:Position[]=["QB","RB","WR","TE"];
const TIERS=["Tier 1","Tier 2","Tier 3","Tier 4","Tier 5","Watch"];

function read<T>(key:string,fallback:T):T{
  try{return JSON.parse(localStorage.getItem(key)||"") as T}catch{return fallback}
}

function tierKey(value:string){
  return value?value.toLowerCase().replace(/\s+/g,"-"):"unassigned";
}

export default function Page(){
  const [rows,setRows]=useState<Player[]>([]);
  const [storage,setStorage]=useState<"loading"|"cloud"|"local">("loading");
  const [order,setOrder]=useState<string[]>([]);
  const [tiers,setTiers]=useState<Record<string,string>>({});
  const [pos,setPos]=useState<"ALL"|Position>("ALL");
  const [q,setQ]=useState("");
  const [league,setLeague]=useState("Base");
  const [grades,setGrades]=useState<Record<string,GradeRecord>>({});

  useEffect(()=>{(async()=>{
    try{
      const [r,b]=await Promise.all([
        fetch("/api/players",{cache:"no-store"}),
        fetch("/api/final-board",{cache:"no-store"})
      ]);
      if(!r.ok||!b.ok)throw 0;
      setRows(await r.json());
      const board=await b.json();
      setOrder(Array.isArray(board.order)?board.order.map(String):[]);
      setTiers(board.tiers&&typeof board.tiers==="object"?board.tiers:{});
      setStorage("cloud");
      fetch("/api/grades?draftClass=2027",{cache:"no-store"})
        .then(r=>r.json())
        .then(g=>Array.isArray(g)&&setGrades(Object.fromEntries(g.map((x:any)=>[
          String(x.id),
          {pre:x.preDraftGrade,final:x.finalGrade}
        ]))))
        .catch(()=>{});
    }catch{
      setRows(read<Player[]>(PLAYER_KEY,[]));
      setOrder(read<string[]>(ORDER_KEY,[]));
      setTiers(read<Record<string,string>>(TIER_KEY,{}));
      setStorage("local");
    }
  })()},[]);

  const eligible=useMemo(
    ()=>rows.filter(x=>x.draft_class===2027&&(x.scouting_status==="WATCHED"||x.scouting_status==="FINISHED")),
    [rows]
  );

  const ranked=useMemo(()=>{
    const key=(p:Player)=>String(p.id);
    return [...eligible].sort((a,b)=>{
      const ai=order.indexOf(key(a)),bi=order.indexOf(key(b));
      if(ai<0&&bi<0)return a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
      if(ai<0)return 1;
      if(bi<0)return-1;
      return ai-bi;
    });
  },[eligible,order]);

  const normalizedQuery=q.trim().toLowerCase();
  const visible=useMemo(
    ()=>ranked.filter(x=>
      (pos==="ALL"||x.position===pos)&&
      (!normalizedQuery||`${x.name} ${x.college||""} ${x.position}`.toLowerCase().includes(normalizedQuery))
    ),
    [ranked,pos,normalizedQuery]
  );

  const positionCounts=useMemo(
    ()=>Object.fromEntries(POSITIONS.map(position=>[
      position,
      eligible.filter(player=>player.position===position).length
    ])) as Record<Position,number>,
    [eligible]
  );

  const gradedCount=useMemo(
    ()=>eligible.filter(player=>grades[String(player.id)]?.pre!=null).length,
    [eligible,grades]
  );

  const tieredCount=useMemo(
    ()=>eligible.filter(player=>Boolean(tiers[String(player.id)])).length,
    [eligible,tiers]
  );

  function persistBoard(nextOrder:string[],nextTiers:Record<string,string>){
    setOrder(nextOrder);
    setTiers(nextTiers);
    try{
      localStorage.setItem(ORDER_KEY,JSON.stringify(nextOrder));
      localStorage.setItem(TIER_KEY,JSON.stringify(nextTiers));
    }catch{}
    if(storage==="cloud"){
      fetch("/api/final-board",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({order:nextOrder,tiers:nextTiers})
      }).catch(()=>{});
    }
  }

  function persistOrder(ids:string[]){persistBoard(ids,tiers)}

  function move(p:Player,delta:number){
    const ids=ranked.map(x=>String(x.id));
    const id=String(p.id),i=ids.indexOf(id);
    const j=Math.max(0,Math.min(ids.length-1,i+delta));
    if(i===j)return;
    ids.splice(i,1);
    ids.splice(j,0,id);
    persistOrder(ids);
  }

  function setTier(id:string,tier:string){
    const next={...tiers,[id]:tier};
    if(!tier)delete next[id];
    persistBoard(order,next);
  }

  function resetOrder(){
    if(!confirm("Reset manual board order? Tier labels will be kept."))return;
    persistOrder([]);
  }

  function exportBoard(){
    const payload={
      version:1,
      exportedAt:new Date().toISOString(),
      draftClass:2027,
      order,
      tiers
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`rookie-draft-2027-board-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return <div className="final-board-page">
    <section className="fb-hero">
      <div className="fb-hero-copy">
        <span className="fb-eyebrow">2027 Rookie Class · Big Board</span>
        <h1>Final Draft Board</h1>
        <p>One ranked view of every watched prospect, with planning tiers and workbook-derived grades kept front and center.</p>
      </div>

      <div className={`fb-sync fb-sync-${storage}`}>
        {storage==="cloud"?<Cloud size={15}/>:storage==="local"?<HardDrive size={15}/>:<span className="fb-sync-dot"/>}
        <span>{storage==="cloud"?"Cloud synced":storage==="local"?"Device fallback":"Connecting…"}</span>
      </div>

      <div className="fb-summary">
        <div className="fb-summary-card">
          <span>Board Size</span>
          <strong>{eligible.length}</strong>
          <small>watched prospects</small>
        </div>
        <div className="fb-summary-card">
          <span>Graded</span>
          <strong>{gradedCount}</strong>
          <small>{eligible.length?Math.round(gradedCount/eligible.length*100):0}% complete</small>
        </div>
        <div className="fb-summary-card">
          <span>Tiered</span>
          <strong>{tieredCount}</strong>
          <small>{eligible.length-tieredCount} unassigned</small>
        </div>
        <div className="fb-position-summary" aria-label="Position counts">
          {POSITIONS.map(position=><div key={position}>
            <b>{position}</b>
            <strong>{positionCounts[position]}</strong>
          </div>)}
        </div>
      </div>
    </section>

    <section className="fb-viewbar">
      <div className="fb-viewbar-label">
        <span>League Board</span>
        <small>Switch planning view</small>
      </div>
      <div className="fb-league-tabs" role="tablist" aria-label="League board">
        {LEAGUES.map(x=><button
          key={x}
          type="button"
          role="tab"
          aria-selected={x===league}
          className={x===league?"active":""}
          onClick={()=>setLeague(x)}
        >{x}</button>)}
      </div>
    </section>

    <section className="fb-toolbar" aria-label="Final draft board controls">
      <label className="fb-search">
        <Search size={17} aria-hidden="true"/>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Search player or college…"
          aria-label="Search final draft board"
        />
        {q&&<button type="button" onClick={()=>setQ("")} aria-label="Clear search">×</button>}
      </label>

      <div className="fb-position-filter" aria-label="Filter by position">
        <button type="button" className={pos==="ALL"?"active":""} onClick={()=>setPos("ALL")}>All <span>{eligible.length}</span></button>
        {POSITIONS.map(position=><button
          key={position}
          type="button"
          className={pos===position?"active":""}
          onClick={()=>setPos(position)}
        >{position} <span>{positionCounts[position]}</span></button>)}
      </div>

      <div className="fb-actions">
        <button type="button" className="fb-action" onClick={exportBoard}><Download size={14}/>Export</button>
        <button type="button" className="fb-action" onClick={resetOrder}><RotateCcw size={14}/>Reset Order</button>
      </div>
    </section>

    <section className="fb-board-card">
      <header className="fb-board-head">
        <div>
          <span className="fb-board-kicker">{league}</span>
          <h2>Ranked Board</h2>
        </div>
        <div className="fb-board-meta">
          <span>{visible.length===ranked.length?`${ranked.length} prospects`:`${visible.length} of ${ranked.length} prospects`}</span>
          <span>Manual order saves automatically</span>
        </div>
      </header>

      <div className="fb-table-wrap">
        <table className="fb-table">
          <thead>
            <tr>
              <th className="fb-rank-col">Rank</th>
              <th>Player</th>
              <th>Pos</th>
              <th>College</th>
              <th>Planning Tier</th>
              <th>Authoritative Grade</th>
              <th className="fb-order-col">Order</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r=>{
              const globalRank=ranked.findIndex(x=>String(x.id)===String(r.id))+1;
              const grade=grades[String(r.id)];
              const gradeValue=grade?.final??grade?.pre;
              const tier=tiers[String(r.id)]||"";
              return <tr key={r.id}>
                <td className="fb-rank">
                  <span>#</span><strong>{String(globalRank).padStart(2,"0")}</strong>
                </td>
                <td className="fb-player-cell">
                  <span className="fb-player-badge player-badge" data-player-id={r.id} style={schoolStyle(r.college)}>
                    {r.name}
                  </span>
                </td>
                <td><span className={`fb-pos fb-pos-${r.position.toLowerCase()}`}>{r.position}</span></td>
                <td className="fb-college">{r.college||"—"}</td>
                <td>
                  <select
                    className="fb-tier-select"
                    data-tier={tierKey(tier)}
                    value={tier}
                    onChange={e=>setTier(String(r.id),e.target.value)}
                    aria-label={`Planning tier for ${r.name}`}
                  >
                    <option value="">Unassigned</option>
                    {TIERS.map(t=><option key={t}>{t}</option>)}
                  </select>
                </td>
                <td>
                  {gradeValue==null
                    ?<div className="fb-grade fb-grade-empty"><strong>—</strong><span>Incomplete scouting</span></div>
                    :<div className={`fb-grade ${grade?.final!=null?"final":""}`}>
                      <strong>{Number(gradeValue).toFixed(2)}</strong>
                      <span>{grade?.final!=null?"Final grade":"Pre-draft grade"}</span>
                    </div>
                  }
                </td>
                <td>
                  <div className="fb-order-actions">
                    <button
                      type="button"
                      onClick={()=>move(r,-1)}
                      disabled={globalRank<=1}
                      aria-label={`Move ${r.name} up`}
                      title="Move up"
                    ><ChevronUp size={15}/></button>
                    <button
                      type="button"
                      onClick={()=>move(r,1)}
                      disabled={globalRank>=ranked.length}
                      aria-label={`Move ${r.name} down`}
                      title="Move down"
                    ><ChevronDown size={15}/></button>
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>

        {!visible.length&&<div className="fb-empty">
          <strong>{eligible.length?"No prospects match this view.":"No watched 2027 players yet."}</strong>
          <span>{eligible.length?"Clear the search or choose another position.":"Use New Player Watched from Scouting Tools and they will appear here."}</span>
        </div>}
      </div>

      <footer className="fb-board-note">
        <span>Grade logic</span>
        <p>Authoritative Grade uses the workbook-derived Final Grade when Team Score and Draft Capital are available; otherwise it falls back to the workbook-derived Pre-Draft Grade. Order and planning tiers remain manual planning tools.</p>
      </footer>
    </section>

    <style jsx global>{`
      .final-board-page{display:grid;gap:14px;min-width:0;--fb-border:#20395f;--fb-panel:#09172b;--fb-panel-2:#0c1d35;--fb-text:#edf4ff;--fb-muted:#8299b9;--fb-accent:#58a7ff}
      .fb-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:22px;padding:26px 28px;border:1px solid #29466d;border-radius:20px;background:radial-gradient(circle at 92% 8%,rgba(88,167,255,.19),transparent 34%),radial-gradient(circle at 12% 112%,rgba(32,206,183,.12),transparent 30%),linear-gradient(135deg,#0e213b 0%,#081528 68%,#071321 100%);box-shadow:0 22px 55px rgba(0,0,0,.22)}
      .fb-hero:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(#58a7ff,#20ceb7)}
      .fb-hero-copy{max-width:760px}.fb-eyebrow,.fb-board-kicker{display:block;color:#78a9dd;font-size:9px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}
      .fb-hero h1{margin:5px 0 8px;font-size:36px;line-height:1;letter-spacing:-.035em}.fb-hero p{margin:0;max-width:720px;color:#91a7c5;font-size:13px;line-height:1.55}
      .fb-sync{align-self:start;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #31527f;border-radius:999px;background:rgba(5,16,31,.66);color:#a9bdd7;font-size:10px;font-weight:900;white-space:nowrap}
      .fb-sync-cloud{border-color:rgba(32,206,183,.4);color:#9fe5dc}.fb-sync-local{border-color:#5c6470;color:#c0c8d2}.fb-sync-dot{width:7px;height:7px;border-radius:50%;background:#58a7ff;box-shadow:0 0 0 4px rgba(88,167,255,.11)}
      .fb-summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(120px,1fr)) minmax(260px,1.4fr);gap:8px}
      .fb-summary-card,.fb-position-summary{border:1px solid #29466d;border-radius:13px;background:rgba(5,16,31,.58);backdrop-filter:blur(8px)}
      .fb-summary-card{padding:12px 14px}.fb-summary-card>span{display:block;color:#7790b2;font-size:8px;font-weight:950;letter-spacing:.09em;text-transform:uppercase}.fb-summary-card strong{display:block;margin:3px 0 2px;font-size:22px;font-variant-numeric:tabular-nums}.fb-summary-card small{color:#6f87a8;font-size:9px}
      .fb-position-summary{display:grid;grid-template-columns:repeat(4,1fr);padding:6px}.fb-position-summary div{display:grid;place-items:center;align-content:center;min-height:54px;border-right:1px solid #20395f}.fb-position-summary div:last-child{border-right:0}.fb-position-summary b{color:#7892b5;font-size:9px}.fb-position-summary strong{margin-top:2px;font-size:17px}
      .fb-viewbar{display:flex;align-items:center;gap:16px;padding:9px 10px 9px 14px;border:1px solid var(--fb-border);border-radius:13px;background:#09172b}
      .fb-viewbar-label{min-width:126px}.fb-viewbar-label span,.fb-viewbar-label small{display:block}.fb-viewbar-label span{font-size:10px;font-weight:950;color:#d8e6f8}.fb-viewbar-label small{margin-top:2px;color:#6e88aa;font-size:8px}
      .fb-league-tabs{display:flex;gap:6px;min-width:0;overflow:auto;padding-bottom:1px}.fb-league-tabs button{flex:0 0 auto;padding:8px 11px;border:1px solid #29476e;border-radius:9px;background:#0c1d35;color:#829abb;font-size:10px;font-weight:850}
      .fb-league-tabs button:hover{border-color:#456a96;color:#e9f2ff;background:#10243f}.fb-league-tabs button.active{border-color:#6d9cd0;background:#eaf3ff;color:#071426;box-shadow:0 4px 15px rgba(0,0,0,.18)}
      .fb-toolbar{position:sticky;top:54px;z-index:35;display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #29466d;border-radius:14px;background:rgba(7,20,38,.96);backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(0,0,0,.2)}
      .fb-search{display:grid;grid-template-columns:auto minmax(150px,1fr) auto;align-items:center;gap:8px;min-width:min(360px,34vw);padding:0 9px;border:1px solid #31527f;border-radius:10px;background:#061326;color:#6983a6}
      .fb-search:focus-within{border-color:#5b82b2;box-shadow:0 0 0 3px rgba(88,167,255,.08)}.fb-search input{height:36px;padding:0;border:0;background:transparent;outline:0;color:#eaf2ff}.fb-search button{width:24px;height:24px;padding:0;background:transparent;color:#7690b1;font-size:18px}.fb-search button:hover{color:#fff}
      .fb-position-filter{display:flex;gap:5px;padding:4px;border:1px solid #20395f;border-radius:10px;background:#061326}.fb-position-filter button{display:flex;align-items:center;gap:6px;padding:6px 8px;border:0;border-radius:7px;background:transparent;color:#7f98ba;font-size:9px;font-weight:950}.fb-position-filter button span{color:#5f789b;font-variant-numeric:tabular-nums}.fb-position-filter button:hover{background:#10243f;color:#e7f0fd}.fb-position-filter button.active{background:#173659;color:#fff;box-shadow:inset 0 0 0 1px #315a89}.fb-position-filter button.active span{color:#9ec7f1}
      .fb-actions{margin-left:auto;display:flex;gap:6px}.fb-action{display:flex;align-items:center;gap:6px;padding:8px 9px;border:1px solid #29476e;border-radius:9px;background:#0d2038;color:#aabdd6;font-size:9px;font-weight:900}.fb-action:hover{border-color:#466d9a;color:#fff;background:#132b49}
      .fb-board-card{overflow:hidden;border:1px solid #29466d;border-radius:17px;background:#081528;box-shadow:0 18px 48px rgba(0,0,0,.18)}
      .fb-board-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:17px 19px;border-bottom:1px solid #20395f;background:linear-gradient(180deg,#0e213a,#0a192d)}
      .fb-board-head h2{margin:3px 0 0;font-size:20px}.fb-board-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.fb-board-meta span{padding:5px 8px;border:1px solid #29476e;border-radius:999px;background:#0a1a30;color:#7f98ba;font-size:8px;font-weight:850}
      .fb-table-wrap{overflow:auto;max-height:calc(100vh - 245px);min-height:260px}.fb-table{width:100%;border-collapse:separate;border-spacing:0;min-width:900px;font-size:11px}
      .fb-table thead th{position:sticky;top:0;z-index:8;padding:9px 11px;border-bottom:1px solid #31527f;background:#0c1d35;color:#7892b4;text-align:left;font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
      .fb-table tbody td{padding:9px 11px;border-bottom:1px solid #172b48;background:#081528;color:#dce7f7;vertical-align:middle}.fb-table tbody tr:nth-child(even) td{background:#09182b}.fb-table tbody tr:hover td{background:#10233c}.fb-table tbody tr:last-child td{border-bottom:0}
      .fb-rank-col{width:72px}.fb-order-col{width:92px}.fb-rank{white-space:nowrap;font-variant-numeric:tabular-nums}.fb-rank span{color:#4f6b90;font-size:10px}.fb-rank strong{margin-left:2px;color:#9bb7d9;font-size:15px;letter-spacing:-.02em}
      .fb-player-cell{min-width:220px}.fb-player-badge{display:inline-flex;align-items:center;min-height:30px;padding:5px 10px!important;border-radius:9px!important;font-size:11px!important;font-weight:950!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 3px 8px rgba(0,0,0,.12)}
      .fb-pos{display:inline-grid;place-items:center;min-width:35px;height:25px;padding:0 6px;border-radius:7px;font-size:8px;font-weight:950;letter-spacing:.04em;border:1px solid transparent}
      .fb-pos-qb{background:rgba(252,43,109,.12);border-color:rgba(252,43,109,.36);color:#ff86ad}.fb-pos-rb{background:rgba(32,206,183,.11);border-color:rgba(32,206,183,.34);color:#71e5d6}.fb-pos-wr{background:rgba(88,167,255,.12);border-color:rgba(88,167,255,.36);color:#8ec4ff}.fb-pos-te{background:rgba(254,173,88,.12);border-color:rgba(254,173,88,.34);color:#ffc481}
      .fb-college{color:#8da4c4;white-space:nowrap}.fb-tier-select{min-width:125px;height:31px;padding:0 28px 0 9px;border-radius:8px;border:1px solid #31527f;background:#0a1a30;color:#c8d7eb;font-size:9px;font-weight:900}
      .fb-tier-select[data-tier="tier-1"]{border-color:rgba(32,206,183,.6);background:rgba(32,206,183,.12);color:#a8eee5}.fb-tier-select[data-tier="tier-2"]{border-color:rgba(88,167,255,.58);background:rgba(88,167,255,.11);color:#b6d8ff}.fb-tier-select[data-tier="tier-3"]{border-color:rgba(173,122,255,.54);background:rgba(173,122,255,.1);color:#d6c0ff}.fb-tier-select[data-tier="tier-4"]{border-color:rgba(254,173,88,.5);background:rgba(254,173,88,.1);color:#ffd2a3}.fb-tier-select[data-tier="tier-5"]{border-color:rgba(239,100,100,.45);background:rgba(239,100,100,.09);color:#f5b0b0}.fb-tier-select[data-tier="watch"]{border-style:dashed;color:#a6b7cb}
      .fb-grade{display:grid;grid-template-columns:auto minmax(70px,1fr);gap:8px;align-items:center;min-width:150px}.fb-grade strong{display:grid;place-items:center;min-width:48px;height:29px;border:1px solid #3e668f;border-radius:8px;background:#102743;color:#cce3ff;font-size:13px;font-variant-numeric:tabular-nums}.fb-grade span{color:#718aab;font-size:8px;font-weight:850}.fb-grade.final strong{border-color:rgba(32,206,183,.45);background:rgba(32,206,183,.1);color:#a7eee5}.fb-grade-empty strong{border-color:#263d5c;background:#0b1b30;color:#586f8e}.fb-grade-empty span{color:#667d9c}
      .fb-order-actions{display:flex;gap:5px}.fb-order-actions button{display:grid;place-items:center;width:30px;height:28px;padding:0;border:1px solid #29476e;border-radius:7px;background:#0c1d35;color:#829cbd}.fb-order-actions button:hover:not(:disabled){border-color:#5b82b2;background:#163151;color:#fff}.fb-order-actions button:disabled{opacity:.28;cursor:default}
      .fb-empty{display:grid;place-items:center;align-content:center;gap:5px;min-height:240px;padding:32px;text-align:center}.fb-empty strong{font-size:15px}.fb-empty span{color:#7189a9;font-size:10px}
      .fb-board-note{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;align-items:start;padding:12px 17px;border-top:1px solid #20395f;background:#071426}.fb-board-note>span{color:#7c98bb;font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.fb-board-note p{margin:0;color:#6f87a7;font-size:9px;line-height:1.45}
      @media(max-width:1050px){
        .fb-summary{grid-template-columns:repeat(3,1fr)}.fb-position-summary{grid-column:1/-1}
        .fb-toolbar{flex-wrap:wrap}.fb-search{min-width:min(440px,100%)}.fb-actions{margin-left:0}.fb-position-filter{order:3;width:100%;overflow:auto}.fb-position-filter button{flex:1;justify-content:center}
      }
      @media(max-width:760px){
        .fb-hero{grid-template-columns:1fr;padding:20px}.fb-sync{justify-self:start}.fb-summary{grid-template-columns:repeat(3,1fr);gap:6px}.fb-summary-card{padding:10px}.fb-summary-card strong{font-size:18px}.fb-position-summary{grid-column:1/-1}
        .fb-viewbar{display:block}.fb-viewbar-label{margin:0 0 7px 3px}.fb-toolbar{top:0}.fb-search{width:100%;min-width:0}.fb-actions{width:100%}.fb-action{flex:1;justify-content:center}
        .fb-board-head{align-items:flex-start}.fb-board-meta{justify-content:flex-start}.fb-board-meta span:last-child{display:none}.fb-table-wrap{max-height:none}.fb-board-note{grid-template-columns:1fr;gap:5px}
      }
      @media(max-width:520px){
        .fb-hero h1{font-size:29px}.fb-summary{grid-template-columns:1fr 1fr}.fb-summary-card:nth-child(3){grid-column:1/-1}.fb-position-summary{grid-template-columns:repeat(4,1fr)}
        .fb-position-filter button{min-width:54px}.fb-league-tabs{margin-right:-2px}.fb-board-head{display:block}.fb-board-meta{margin-top:8px}
      }
    `}</style>
  </div>;
}
