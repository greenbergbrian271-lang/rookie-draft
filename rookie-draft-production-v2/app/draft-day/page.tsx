"use client";
import {useEffect,useMemo,useState} from "react";

type Pick={round:number,pickNo:number,slot:number,team:string,playerId:string|null,player:string|null,position:string|null,proTeam:string|null};
type LeagueResult={league:string,slug:string,draftId?:string|null,total:number,status:string,picks:Pick[],error?:string};
type AdpPlayer={name:string,position:string,team:string,college:string,adp:number,playerId:string,adjustedADP:number};
type AdpLeague={league:string,slug:string,top75:AdpPlayer[]};
type LeagueMeta={slug:string,name:string,rounds:number,teams:number};
type BoardPlayer={id:string|number,name:string,position:"QB"|"RB"|"WR"|"TE",college?:string|null,draft_class:number,scouting_status?:string|null};
type GradeRow={id:string|number,preDraftGrade:number|null,finalGrade:number|null};
type BoardState={order:string[],tiers:Record<string,string>};
type BoardRow=BoardPlayer&{boardRank:number,positionRank:number,grade:number|null,tier:string,sleeper:AdpPlayer|null,sleeperRank:number|null,delta:number|null,drafted:boolean};

const POSITIONS=["QB","RB","WR","TE"] as const;
const normalizeName=(name?:string|null)=>(name||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const pickLabel=(pickNo:number,teams:number)=>{const round=Math.floor((Math.max(1,pickNo)-1)/teams)+1;const slot=((Math.max(1,pickNo)-1)%teams)+1;return round+"."+String(slot).padStart(2,"0")};
const gradeText=(n:number|null)=>n==null?"—":n.toFixed(2);
const deltaText=(n:number|null)=>n==null?"—":n===0?"EVEN":n>0?"+"+n:String(n);

export default function DraftDayPage(){
  const [leagues,setLeagues]=useState<LeagueMeta[]>([]);
  const [results,setResults]=useState<LeagueResult[]>([]);
  const [adpLists,setAdpLists]=useState<AdpLeague[]>([]);
  const [players,setPlayers]=useState<BoardPlayer[]>([]);
  const [grades,setGrades]=useState<Record<string,{pre:number|null,final:number|null}>>({});
  const [board,setBoard]=useState<BoardState>({order:[],tiers:{}});
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const [slug,setSlug]=useState("");
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState<""|"picks"|"adp">("");
  const [error,setError]=useState("");

  async function loadMeta(){
    const r=await fetch("/api/draft-day",{cache:"no-store"});
    const j=await r.json();
    setLeagues(j.leagues||[]);
    if(!slug&&j.leagues?.length)setSlug(j.leagues[0].slug);
  }

  async function loadData(){
    setError("");
    try{
      const [statusRes,playersRes,boardRes,gradesRes]=await Promise.all([
        fetch("/api/draft-day/status",{cache:"no-store"}),
        fetch("/api/players",{cache:"no-store"}),
        fetch("/api/final-board",{cache:"no-store"}),
        fetch("/api/grades?draftClass=2027",{cache:"no-store"})
      ]);
      if(!statusRes.ok)throw new Error("Draft status endpoint returned "+statusRes.status);
      const status=await statusRes.json();
      setResults(status.draft_day_status?.results||[]);
      setAdpLists(status.sleeper_adp?.lists||[]);
      setUpdatedAt(status.draft_day_status?.updatedAt||status.sleeper_adp?.updatedAt||null);
      if(playersRes.ok){const p=await playersRes.json();setPlayers(Array.isArray(p)?p:[])}
      if(boardRes.ok){const b=await boardRes.json();setBoard({order:Array.isArray(b.order)?b.order.map(String):[],tiers:b.tiers&&typeof b.tiers==="object"?b.tiers:{}})}
      if(gradesRes.ok){const g=await gradesRes.json();if(Array.isArray(g))setGrades(Object.fromEntries(g.map((x:GradeRow)=>[String(x.id),{pre:x.preDraftGrade,final:x.finalGrade}])))}
    }catch(e:any){setError(e?.message||"Could not load draft-day data")}
    finally{setLoading(false)}
  }

  useEffect(()=>{loadMeta();loadData()},[]);

  async function sync(kind:"picks"|"adp"){
    setSyncing(kind);setError("");
    try{
      const r=await fetch("/api/draft-day",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:kind==="adp"?"adp":"sync"})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Sync failed");
      await loadData();
    }catch(e:any){setError(e?.message||"Sync failed")}
    finally{setSyncing("")}
  }

  const active=results.find(x=>x.slug===slug);
  const activeLeague=leagues.find(x=>x.slug===slug);
  const activeAdp=adpLists.find(x=>x.slug===slug);
  const q=query.trim().toLowerCase();
  const madeCount=active?.picks.filter(p=>p.player).length||0;
  const totalPicks=active?.total||((activeLeague?.rounds||0)*(activeLeague?.teams||0));
  const nextPick=Math.min(totalPicks||1,madeCount+1);
  const nextPickLabel=activeLeague?pickLabel(nextPick,activeLeague.teams):"—";

  const draftedNames=useMemo(()=>new Set((active?.picks||[]).map(p=>normalizeName(p.player)).filter(Boolean)),[active]);
  const adpByName=useMemo(()=>{
    const map=new Map<string,{player:AdpPlayer,rank:number}>();
    (activeAdp?.top75||[]).forEach((p,i)=>map.set(normalizeName(p.name),{player:p,rank:i+1}));
    return map;
  },[activeAdp]);

  const boardRows=useMemo<BoardRow[]>(()=>{
    const eligible=players.filter(x=>x.draft_class===2027&&(x.scouting_status==="WATCHED"||x.scouting_status==="FINISHED"));
    const ranked=[...eligible].sort((a,b)=>{
      const ai=board.order.indexOf(String(a.id)),bi=board.order.indexOf(String(b.id));
      if(ai<0&&bi<0)return a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
      if(ai<0)return 1;if(bi<0)return-1;return ai-bi;
    });
    const posCounts:Record<string,number>={};
    return ranked.map((p,i)=>{
      posCounts[p.position]=(posCounts[p.position]||0)+1;
      const match=adpByName.get(normalizeName(p.name));
      const g=grades[String(p.id)];
      const grade=g?(g.final??g.pre):null;
      const boardRank=i+1;
      const sleeperRank=match?.rank??null;
      return {...p,boardRank,positionRank:posCounts[p.position],grade,tier:board.tiers[String(p.id)]||"",sleeper:match?.player||null,sleeperRank,delta:sleeperRank==null?null:sleeperRank-boardRank,drafted:draftedNames.has(normalizeName(p.name))};
    });
  },[players,board,grades,adpByName,draftedNames]);

  const bestAvailable=useMemo(()=>Object.fromEntries(POSITIONS.map(pos=>[pos,boardRows.find(p=>p.position===pos&&!p.drafted)||null])) as Record<typeof POSITIONS[number],BoardRow|null>,[boardRows]);
  const visibleBoard=useMemo(()=>boardRows.filter(p=>!q||(`${p.name} ${p.college||""} ${p.position} ${p.tier}`).toLowerCase().includes(q)),[boardRows,q]);
  const visiblePicks=useMemo(()=>active?.picks.filter(p=>!q||(p.team+" "+(p.player||"")+" "+(p.position||"")).toLowerCase().includes(q))||[],[active,q]);
  const visibleAdp=useMemo(()=>activeAdp?.top75.filter(p=>!q||(`${p.name} ${p.college} ${p.position}`).toLowerCase().includes(q))||[],[activeAdp,q]);
  const boardByName=useMemo(()=>new Map(boardRows.map(p=>[normalizeName(p.name),p])),[boardRows]);

  const byTeam=useMemo(()=>{
    if(!active)return[] as {team:string,picks:Pick[]}[];
    const map=new Map<string,Pick[]>();
    for(const p of active.picks){if(!p.player)continue;const list=map.get(p.team)||[];list.push(p);map.set(p.team,list)}
    return[...map.entries()].map(([team,picks])=>({team,picks})).sort((a,b)=>b.picks.length-a.picks.length||a.team.localeCompare(b.team));
  },[active]);

  return <div className="dd-page">
    <section className="dd-hero">
      <div>
        <div className="ey">Draft Day</div>
        <h1>Rookie Draft Command Center</h1>
        <p>Live Sleeper picks on the left, your Final Draft Board in the middle, and Sleeper ADP on the right — all in one draft-room view.</p>
      </div>
      <span className={"status "+(error?"":loading?"":"cloud")}>{loading?"Connecting…":error?"● Data issue":updatedAt?"● Live · "+new Date(updatedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"● Ready"}</span>
    </section>

    {error&&<div className="notice"><b>Data status:</b> {error} <button className="small ghost" onClick={loadData}>Retry</button></div>}

    <div className="dd-leagues" role="tablist" aria-label="Draft league">
      {leagues.map(l=><button key={l.slug} className={slug===l.slug?"active":""} onClick={()=>{setSlug(l.slug);setQuery("")}}>{l.name}</button>)}
    </div>

    <section className="dd-kpis">
      <div className="dd-kpi"><span>Draft progress</span><strong>{madeCount}<small> / {totalPicks||"—"}</small></strong><i><b style={{width:(totalPicks?Math.min(100,(madeCount/totalPicks)*100):0)+"%"}}/></i></div>
      <div className="dd-kpi"><span>On the clock</span><strong>{madeCount>=totalPicks&&totalPicks?"Complete":nextPickLabel}</strong><small>{active?.status||"Waiting for Sleeper draft"}</small></div>
      <div className="dd-kpi"><span>Your board</span><strong>{boardRows.length}</strong><small>players · Final Draft Board</small></div>
      <div className="dd-kpi"><span>Market board</span><strong>{activeAdp?.top75.length||0}</strong><small>players · Sleeper ADP</small></div>
    </section>

    <section className="dd-controls">
      <div className="dd-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a player, team or position…"/></div>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("picks")}>{syncing==="picks"?"Syncing picks…":"↻ Sync picks"}</button>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("adp")}>{syncing==="adp"?"Syncing ADP…":"↻ Sync ADP"}</button>
    </section>

    <section className="dd-best">
      <div className="dd-section-title"><div><span>Best available</span><h2>Top player on your board by position</h2></div><small>Drafted players are removed automatically from the board view.</small></div>
      <div className="dd-best-grid">
        {POSITIONS.map(pos=>{const p=bestAvailable[pos];return <article key={pos} className="dd-best-card" data-pos={pos}>
          <div className="dd-best-pos">{pos}<span>{p?"#"+p.positionRank:"—"}</span></div>
          {p?<><div className="dd-best-rank">BOARD #{p.boardRank}</div><h3>{p.name}</h3><p>{p.college||"College TBD"}</p><div className="dd-best-meta"><span>Grade <b>{gradeText(p.grade)}</b></span><span>ADP <b>{p.sleeperRank??"—"}</b></span><span>Δ <b className={p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":""}>{deltaText(p.delta)}</b></span></div></>:<div className="dd-empty-card">No available {pos}</div>}
        </article>})}
      </div>
    </section>

    <section className="dd-war-room">
      <article className="dd-panel dd-live-panel">
        <header><div><span>Live draft</span><h2>Pick feed</h2></div><b>{madeCount} picks</b></header>
        <div className="dd-scroll">
          {visiblePicks.length?visiblePicks.map(p=><div className="dd-pick-row" key={p.pickNo}>
            <div className="dd-pick-no">{p.round}.{String(p.slot).padStart(2,"0")}</div>
            <div className="dd-pick-copy"><strong>{p.player||"—"}</strong><span>{p.team}</span></div>
            <div className="dd-pos" data-pos={p.position||""}>{p.position||"—"}</div>
          </div>):<div className="dd-empty">{active?.error?active.error:"No Sleeper picks yet. Sync once the draft is created or underway."}</div>}
        </div>
      </article>

      <article className="dd-panel dd-board-panel">
        <header><div><span>Your rankings</span><h2>Final Draft Board</h2></div><b>{boardRows.filter(p=>!p.drafted).length} available</b></header>
        <div className="dd-table-head dd-board-grid"><span>#</span><span>Player</span><span>Pos</span><span>Grade</span><span>ADP</span><span>Δ</span></div>
        <div className="dd-scroll">
          {visibleBoard.length?visibleBoard.map(p=><div className={"dd-board-row dd-board-grid "+(p.drafted?"drafted":"")} key={p.id}>
            <div className="dd-rank">{p.boardRank}</div>
            <div className="dd-player"><strong>{p.name}</strong><span>{p.college||"—"}{p.tier?" · "+p.tier:""}</span></div>
            <div className="dd-pos" data-pos={p.position}>{p.position}{p.positionRank}</div>
            <div className="dd-grade">{gradeText(p.grade)}</div>
            <div>{p.sleeperRank??"—"}</div>
            <div className={"dd-delta "+(p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":"")}>{deltaText(p.delta)}</div>
            {p.drafted&&<div className="dd-drafted-tag">DRAFTED</div>}
          </div>):<div className="dd-empty">No Final Draft Board players match this search.</div>}
        </div>
      </article>

      <article className="dd-panel dd-adp-panel">
        <header><div><span>Market</span><h2>Sleeper ADP</h2></div><b>Top 75</b></header>
        <div className="dd-table-head dd-adp-grid"><span>#</span><span>Player</span><span>Pos</span><span>Your #</span></div>
        <div className="dd-scroll">
          {visibleAdp.length?visibleAdp.map((p,i)=>{const boardPlayer=boardByName.get(normalizeName(p.name));const drafted=draftedNames.has(normalizeName(p.name));return <div className={"dd-adp-row dd-adp-grid "+(drafted?"drafted":"")} key={p.playerId}>
            <div className="dd-rank">{(activeAdp?.top75.indexOf(p)??i)+1}</div>
            <div className="dd-player"><strong>{p.name}</strong><span>{p.college||p.team||"—"}</span></div>
            <div className="dd-pos" data-pos={p.position}>{p.position}</div>
            <div>{boardPlayer?"#"+boardPlayer.boardRank:"—"}</div>
          </div>}):<div className="dd-empty">Sync Sleeper ADP to populate the market board.</div>}
        </div>
      </article>
    </section>

    <section className="dd-team-section">
      <div className="dd-section-title"><div><span>Draft audit</span><h2>Picks by team</h2></div><small>Quick roster-level review as the room fills in.</small></div>
      <div className="dd-team-grid">
        {byTeam.length?byTeam.map(({team,picks})=><details key={team}><summary><span>{team}</span><b>{picks.length}</b></summary><div>{picks.map(p=><p key={p.pickNo}><strong>{p.round}.{String(p.slot).padStart(2,"0")}</strong><span>{p.player}</span><em>{p.position}</em></p>)}</div></details>):<div className="dd-empty">No team picks recorded yet.</div>}
      </div>
    </section>

    <style jsx>{`
      .dd-page{display:grid;gap:18px;padding-bottom:30px}.dd-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:4px 0 2px}.dd-hero h1{font-size:34px;letter-spacing:-.03em;margin:5px 0 7px}.dd-hero p{margin:0;color:#8fa7c8;max-width:830px;font-size:14px;line-height:1.55}.dd-leagues{display:flex;gap:7px;overflow:auto;padding:5px;background:#081426;border:1px solid #20395f;border-radius:12px;width:max-content;max-width:100%}.dd-leagues button{background:transparent;border:1px solid transparent;color:#91a7c4;padding:8px 12px;white-space:nowrap;font-size:12px}.dd-leagues button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.12)}
      .dd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dd-kpi{min-height:112px;padding:16px;background:linear-gradient(180deg,#0e1f38,#0a172a);border:1px solid #20395f;border-radius:14px;display:flex;flex-direction:column;justify-content:center}.dd-kpi>span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#8098b9;font-weight:950}.dd-kpi>strong{font-size:28px;line-height:1.05;margin:8px 0 4px;font-variant-numeric:tabular-nums}.dd-kpi>strong small{font-size:13px;color:#7890b1}.dd-kpi>small{color:#7890b1;font-size:11px}.dd-kpi i{display:block;height:5px;background:#162b48;border-radius:999px;overflow:hidden;margin-top:9px}.dd-kpi i b{display:block;height:100%;background:linear-gradient(90deg,#20e2dd,#62e889);border-radius:999px}
      .dd-controls{display:grid;grid-template-columns:minmax(280px,1fr) auto auto;gap:9px;align-items:center}.dd-search{position:relative}.dd-search span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#7890b1;font-size:18px}.dd-search input{padding-left:37px;background:#08172a;border-color:#29476e}.dd-controls button{white-space:nowrap}
      .dd-section-title{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:10px}.dd-section-title span,.dd-panel header span{display:block;color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.dd-section-title h2,.dd-panel header h2{font-size:18px;margin:3px 0 0}.dd-section-title small{color:#7890b1;max-width:440px;text-align:right}.dd-best{background:linear-gradient(180deg,rgba(17,34,61,.58),rgba(9,23,43,.34));border:1px solid #20395f;border-radius:16px;padding:15px}.dd-best-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dd-best-card{position:relative;overflow:hidden;min-height:150px;background:#081629;border:1px solid #20395f;border-radius:12px;padding:14px}.dd-best-card:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:#6b7f9b}.dd-best-card[data-pos="QB"]:before{background:#fc2b6d}.dd-best-card[data-pos="RB"]:before{background:#20ceb7}.dd-best-card[data-pos="WR"]:before{background:#58a7ff}.dd-best-card[data-pos="TE"]:before{background:#fead58}.dd-best-pos{display:flex;justify-content:space-between;align-items:center;color:#aebfd6;font-size:11px;font-weight:950}.dd-best-pos span{color:#7189aa}.dd-best-rank{font-size:9px;color:#7189aa;margin-top:15px;letter-spacing:.08em}.dd-best-card h3{font-size:17px;margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-best-card p{margin:0;color:#8098b7;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-best-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:13px}.dd-best-meta span{background:#0e213b;border:1px solid #1c3658;border-radius:7px;padding:6px;color:#6f88aa;font-size:9px}.dd-best-meta b{display:block;color:#eaf2ff;font-size:12px;margin-top:1px}.dd-empty-card{display:grid;place-items:center;min-height:90px;color:#6c84a5}
      .dd-war-room{display:grid;grid-template-columns:minmax(245px,.9fr) minmax(450px,1.55fr) minmax(285px,1fr);gap:12px;align-items:stretch}.dd-panel{background:#081426;border:1px solid #20395f;border-radius:15px;overflow:hidden;min-width:0}.dd-panel header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 15px;background:linear-gradient(180deg,#10223d,#0c1b31);border-bottom:1px solid #20395f}.dd-panel header b{font-size:10px;color:#8ea5c4;border:1px solid #29476e;border-radius:999px;padding:5px 8px;white-space:nowrap}.dd-scroll{max-height:620px;overflow:auto}.dd-table-head{position:sticky;top:0;z-index:5;background:#0d2039;color:#7189aa;border-bottom:1px solid #29476e;padding:8px 10px;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.dd-board-grid{display:grid;grid-template-columns:36px minmax(155px,1fr) 54px 58px 42px 48px;gap:7px;align-items:center}.dd-adp-grid{display:grid;grid-template-columns:34px minmax(140px,1fr) 48px 52px;gap:7px;align-items:center}.dd-pick-row{display:grid;grid-template-columns:49px minmax(0,1fr) 40px;gap:9px;align-items:center;padding:10px 12px;border-bottom:1px solid #162c49}.dd-pick-row:hover,.dd-board-row:hover,.dd-adp-row:hover{background:#0e223d}.dd-pick-no,.dd-rank{font-variant-numeric:tabular-nums;font-weight:950;color:#dfe9f7}.dd-pick-no{font-size:12px}.dd-pick-copy,.dd-player{min-width:0}.dd-pick-copy strong,.dd-player strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.dd-pick-copy span,.dd-player span{display:block;color:#728aaa;font-size:9px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-board-row,.dd-adp-row{position:relative;min-height:47px;padding:7px 10px;border-bottom:1px solid #142943;font-size:11px}.dd-board-row.drafted,.dd-adp-row.drafted{opacity:.42}.dd-board-row.drafted .dd-player strong,.dd-adp-row.drafted .dd-player strong{text-decoration:line-through}.dd-drafted-tag{position:absolute;right:8px;top:4px;color:#ff7184;font-size:7px;font-weight:950;letter-spacing:.08em}.dd-grade{font-weight:950;color:#eaf2ff}.dd-delta{font-weight:950}.up{color:#62e889!important}.down{color:#ff7184!important}.dd-pos{display:inline-flex;align-items:center;justify-content:center;min-width:36px;padding:4px 5px;border-radius:6px;background:#20304a;color:#eaf2ff;font-size:9px;font-weight:950}.dd-pos[data-pos="QB"],.dd-best-card[data-pos="QB"] .dd-best-pos{color:#ff76a3}.dd-pos[data-pos="RB"],.dd-best-card[data-pos="RB"] .dd-best-pos{color:#4de5d0}.dd-pos[data-pos="WR"],.dd-best-card[data-pos="WR"] .dd-best-pos{color:#80bdff}.dd-pos[data-pos="TE"],.dd-best-card[data-pos="TE"] .dd-best-pos{color:#ffc37f}.dd-pos[data-pos="QB"]{background:rgba(252,43,109,.15)}.dd-pos[data-pos="RB"]{background:rgba(32,206,183,.14)}.dd-pos[data-pos="WR"]{background:rgba(88,167,255,.14)}.dd-pos[data-pos="TE"]{background:rgba(254,173,88,.14)}.dd-empty{padding:28px 18px;text-align:center;color:#6f88aa;font-size:11px;line-height:1.5}
      .dd-team-section{padding-top:2px}.dd-team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px}.dd-team-grid details{background:#08172a;border:1px solid #20395f;border-radius:11px;overflow:hidden}.dd-team-grid summary{list-style:none;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 12px;cursor:pointer;font-weight:850}.dd-team-grid summary::-webkit-details-marker{display:none}.dd-team-grid summary b{display:grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:#163150;color:#9fb7d4;font-size:10px}.dd-team-grid details>div{border-top:1px solid #20395f;padding:5px 10px}.dd-team-grid p{display:grid;grid-template-columns:42px 1fr auto;gap:8px;align-items:center;margin:0;padding:7px 2px;border-bottom:1px solid #142943;font-size:10px}.dd-team-grid p:last-child{border-bottom:0}.dd-team-grid p strong{color:#91a9c8}.dd-team-grid p span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-team-grid p em{font-style:normal;color:#6f88aa;font-weight:900}
      @media(max-width:1180px){.dd-war-room{grid-template-columns:1fr 1.45fr}.dd-adp-panel{grid-column:1/-1}.dd-adp-panel .dd-scroll{max-height:360px}.dd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dd-best-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:760px){.dd-hero{display:block}.dd-hero .status{margin-top:10px}.dd-hero h1{font-size:29px}.dd-kpis{grid-template-columns:1fr 1fr}.dd-controls{grid-template-columns:1fr 1fr}.dd-search{grid-column:1/-1}.dd-best-grid{grid-template-columns:1fr 1fr}.dd-war-room{grid-template-columns:1fr}.dd-adp-panel{grid-column:auto}.dd-scroll{max-height:460px}.dd-section-title{align-items:flex-start}.dd-section-title small{display:none}}
      @media(max-width:520px){.dd-kpis,.dd-best-grid{grid-template-columns:1fr}.dd-controls{grid-template-columns:1fr}.dd-controls button{width:100%}.dd-board-grid{grid-template-columns:32px minmax(130px,1fr) 48px 52px 38px 44px;gap:4px}.dd-board-row,.dd-table-head{padding-left:7px;padding-right:7px}}
    `}</style>
  </div>;
}
