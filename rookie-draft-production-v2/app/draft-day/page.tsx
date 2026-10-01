// @ts-nocheck
"use client";
import {useEffect,useMemo,useState} from "react";
import PlayerName from "@/components/PlayerName";
import {buildFinalBoardRows,FINAL_BOARD_POSITIONS,type FinalBoardGradeRow,type FinalBoardRoster} from "@/lib/final-board";
import {type GlossaryRows} from "@/lib/scouting-formulas";

type Pick={round:number,pickNo:number,slot:number,team:string,playerId:string|null,player:string|null,position:string|null,proTeam:string|null};
type LeagueResult={league:string,slug:string,draftId?:string|null,total:number,status:string,picks:Pick[],error?:string};
type AdpPlayer={name:string,position:string,team:string,college:string,adp:number,playerId:string,adjustedADP:number};
type AdpLeague={league:string,slug:string,top75:AdpPlayer[]};
type LeagueMeta={slug:string,boardKey:string,name:string,rounds:number,teams:number,tePremium?:boolean};
type IntegrationLeague={key:string,name:string,tePremium?:boolean,enabled?:boolean};
type RosterView=FinalBoardRoster&{key:string;label?:string};
type IntelRow=ReturnType<typeof buildFinalBoardRows>[number]&{adpRank:number|null;delta:number|null};

const normName=(value:any)=>String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const pickLabel=(pickNo:number,teams:number)=>{if(!teams)return "—";const round=Math.floor((Math.max(1,pickNo)-1)/teams)+1,slot=((Math.max(1,pickNo)-1)%teams)+1;return round+"."+String(slot).padStart(2,"0")};
const gradeText=(n:number|null)=>n==null?"—":n.toFixed(2);
const deltaText=(n:number|null)=>n==null?"—":n===0?"EVEN":n>0?"+"+n:String(n);
const posTone=(p?:string|null)=>p?"dd-pos-"+p.toLowerCase():"";
const gradeTone=(n:number|null)=>n==null?"":n>=85?"elite":n>=75?"plus":n>=65?"solid":n>=55?"fringe":"concern";

export default function DraftDayPage(){
  const [leagues,setLeagues]=useState<LeagueMeta[]>([]);
  const [results,setResults]=useState<LeagueResult[]>([]);
  const [adpLists,setAdpLists]=useState<AdpLeague[]>([]);
  const [grades,setGrades]=useState<FinalBoardGradeRow[]>([]);
  const [glossary,setGlossary]=useState<any[][]>([]);
  const [rosters,setRosters]=useState<RosterView[]>([]);
  const [integrationLeagues,setIntegrationLeagues]=useState<IntegrationLeague[]>([]);
  const [archivedNames,setArchivedNames]=useState<Set<string>>(new Set());
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const [slug,setSlug]=useState("");
  const [query,setQuery]=useState("");
  const [intelTab,setIntelTab]=useState<"board"|"adp">("board");
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState<""|"picks"|"adp">("");
  const [error,setError]=useState("");

  async function loadMeta(){
    const r=await fetch("/api/draft-day",{cache:"no-store"});
    const j=await r.json();
    const next=Array.isArray(j.leagues)?j.leagues:[];
    setLeagues(next);
    if(!slug&&next.length)setSlug(next[0].slug);
  }

  async function loadData(){
    setError("");
    try{
      const [statusRes,gradeRes,glossaryRes,rosterRes,integrationRes,archiveRes]=await Promise.all([
        fetch("/api/draft-day/status",{cache:"no-store"}),
        fetch("/api/grades?draftClass=2027",{cache:"no-store"}),
        fetch("/api/scouting-glossary",{cache:"no-store"}),
        fetch("/api/dynasty-rosters",{cache:"no-store"}),
        fetch("/api/integrations",{cache:"no-store"}),
        fetch("/api/players/archive",{cache:"no-store"})
      ]);
      if(!statusRes.ok)throw new Error("Draft status endpoint returned "+statusRes.status);
      const [status,gradeData,glossaryData,rosterData,integrationData,archiveData]=await Promise.all([
        statusRes.json(),gradeRes.ok?gradeRes.json():[],glossaryRes.ok?glossaryRes.json():{},rosterRes.ok?rosterRes.json():{},integrationRes.ok?integrationRes.json():{},archiveRes.ok?archiveRes.json():[]
      ]);
      setResults(status.draft_day_status?.results||[]);
      setAdpLists(status.sleeper_adp?.lists||[]);
      setUpdatedAt(status.draft_day_status?.updatedAt||status.sleeper_adp?.updatedAt||null);
      setGrades(Array.isArray(gradeData)?gradeData:[]);
      setGlossary(Array.isArray(glossaryData?.rows)?glossaryData.rows:[]);
      setRosters(Array.isArray(rosterData?.rosters)?rosterData.rosters:[]);
      setIntegrationLeagues(Array.isArray(integrationData?.sleeper?.leagues)?integrationData.sleeper.leagues:[]);
      setArchivedNames(new Set(Array.isArray(archiveData)?archiveData.map((p:any)=>normName(p.player_name)):[]));
    }catch(e:any){setError(e?.message||"Could not load draft-day data")}
    finally{setLoading(false)}
  }

  useEffect(()=>{
    loadMeta();loadData();
    const refresh=()=>loadData();
    window.addEventListener("rookie-draft:archives-changed",refresh);
    window.addEventListener("rookie-draft:players-changed",refresh);
    return()=>{window.removeEventListener("rookie-draft:archives-changed",refresh);window.removeEventListener("rookie-draft:players-changed",refresh)};
  },[]);

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

  const activeMeta=leagues.find(x=>x.slug===slug);
  const active=results.find(x=>x.slug===slug);
  const activeAdp=adpLists.find(x=>x.slug===slug);
  const activeBoardLeague=integrationLeagues.find(x=>x.key===activeMeta?.boardKey);
  const activeRoster=rosters.find(x=>x.key===activeMeta?.boardKey);
  const q=query.trim().toLowerCase();
  const draftedNames=useMemo(()=>new Set((active?.picks||[]).map(p=>normName(p.player)).filter(Boolean)),[active]);

  const boardRows=useMemo(()=>buildFinalBoardRows(
    grades,
    {tePremium:Boolean(activeBoardLeague?.tePremium??activeMeta?.tePremium)},
    activeRoster,
    (glossary.length?glossary:undefined) as GlossaryRows|undefined
  ),[grades,activeBoardLeague,activeMeta,activeRoster,glossary]);

  const adpByName=useMemo(()=>{
    const map=new Map<string,{player:AdpPlayer;rank:number}>();
    (activeAdp?.top75||[]).forEach((p,i)=>map.set(normName(p.name),{player:p,rank:i+1}));
    return map;
  },[activeAdp]);

  const intelRows=useMemo<IntelRow[]>(()=>boardRows.map(row=>{
    const market=adpByName.get(normName(row.name));
    const adpRank=market?.rank??null;
    return {...row,adpRank,delta:adpRank==null||row.overallRank==null?null:adpRank-row.overallRank};
  }),[boardRows,adpByName]);

  const bestAvailable=useMemo(()=>Object.fromEntries(FINAL_BOARD_POSITIONS.map(pos=>[
    pos,intelRows.find(p=>p.position===pos&&p.boardGrade!=null&&!draftedNames.has(normName(p.name)))||null
  ])) as Record<(typeof FINAL_BOARD_POSITIONS)[number],IntelRow|null>,[intelRows,draftedNames]);

  const visibleFeed=useMemo(()=>(active?.picks||[]).filter(p=>{
    if(archivedNames.has(normName(p.player)))return false;
    return !q||(p.team+" "+(p.player||"")+" "+(p.position||"")).toLowerCase().includes(q);
  }),[active,q,archivedNames]);

  const visibleBoard=useMemo(()=>intelRows.filter(p=>{
    if(archivedNames.has(normName(p.name)))return false;
    return !q||(`${p.name} ${p.college||""} ${p.position}`).toLowerCase().includes(q);
  }),[intelRows,q,archivedNames]);

  const visibleAdp=useMemo(()=>(activeAdp?.top75||[]).map((p,i)=>({...p,rank:i+1})).filter(p=>{
    if(archivedNames.has(normName(p.name)))return false;
    return !q||(`${p.name} ${p.college} ${p.position}`).toLowerCase().includes(q);
  }),[activeAdp,q,archivedNames]);

  const boardByName=useMemo(()=>new Map<string,IntelRow>(intelRows.map(p=>[normName(p.name),p] as [string,IntelRow])),[intelRows]);
  const byTeam=useMemo(()=>{
    if(!active)return[] as {team:string,picks:Pick[]}[];
    const map=new Map<string,Pick[]>();
    for(const p of active.picks){if(!p.player||archivedNames.has(normName(p.player)))continue;const list=map.get(p.team)||[];list.push(p);map.set(p.team,list)}
    return[...map.entries()].map(([team,picks])=>({team,picks})).sort((a,b)=>b.picks.length-a.picks.length||a.team.localeCompare(b.team));
  },[active,archivedNames]);

  const madeCount=active?.picks.filter(p=>p.player&&!archivedNames.has(normName(p.player))).length||0;
  const totalPicks=active?.total||((activeMeta?.rounds||0)*(activeMeta?.teams||0));
  const nextPick=totalPicks?Math.min(totalPicks,madeCount+1):0;
  const progress=totalPicks?Math.min(100,(madeCount/totalPicks)*100):0;

  return <div className="dd-page">
    <section className="dd-hero">
      <div>
        <div className="ey">Draft Day</div>
        <h1>Rookie Draft Command Center</h1>
        <p>Live Sleeper picks get the room. Your selected league's <b>exact Final Draft Board</b> stays beside it, with Sleeper ADP layered directly into the board.</p>
      </div>
      <span className={"status "+(error?"":loading?"":"cloud")}>{loading?"Connecting…":error?"● Data issue":updatedAt?"● Live · "+new Date(updatedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"● Ready"}</span>
    </section>

    {error&&<div className="notice"><b>Data status:</b> {error} <button className="small ghost" onClick={loadData}>Retry</button></div>}

    <div className="dd-leagues" role="tablist" aria-label="Draft league">
      {leagues.map(l=><button key={l.slug} className={slug===l.slug?"active":""} onClick={()=>{setSlug(l.slug);setQuery("");setIntelTab("board")}}>{l.name}</button>)}
    </div>

    <section className="dd-scoreboard">
      <div className="dd-progress-card">
        <span>Draft progress</span><strong>{madeCount}<small> / {totalPicks||"—"}</small></strong>
        <i><b style={{width:progress+"%"}}/></i>
      </div>
      <div><span>On the clock</span><strong>{madeCount>=totalPicks&&totalPicks?"Complete":nextPick&&activeMeta?pickLabel(nextPick,activeMeta.teams):"—"}</strong><small>{active?.status||"Waiting for Sleeper"}</small></div>
      <div><span>Board source</span><strong>{activeBoardLeague?.name||activeMeta?.name||"—"}</strong><small>{activeBoardLeague?.tePremium?"TE Premium · ":""}Final Draft Board</small></div>
      <div><span>Board / market</span><strong>{boardRows.filter(x=>x.boardGrade!=null).length} <small>/ {(activeAdp?.top75||[]).length}</small></strong><small>ranked / Sleeper ADP</small></div>
    </section>

    <section className="dd-controls">
      <div className="dd-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, team, college or position…"/></div>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("picks")}>{syncing==="picks"?"Syncing picks…":"↻ Sync picks"}</button>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("adp")}>{syncing==="adp"?"Syncing ADP…":"↻ Sync ADP"}</button>
    </section>

    <section className="dd-best">
      <div className="dd-section-title"><div><span>Best available</span><h2>Top remaining player by position</h2></div><small>Always follows this league's Final Draft Board; drafted players disappear automatically.</small></div>
      <div className="dd-best-grid">
        {FINAL_BOARD_POSITIONS.map(pos=>{const p=bestAvailable[pos];return <article key={pos} className={"dd-best-card "+posTone(pos)}>
          <div className="dd-best-pos"><b>{pos}</b><span>{p?p.position+p.positionRank:"—"}</span></div>
          {p?<><div className="dd-best-rank">BOARD #{p.overallRank}</div><PlayerName id={p.id} className="dd-best-name">{p.name}</PlayerName><p>{p.college||"—"}</p><div className="dd-best-meta"><span>Grade <b>{gradeText(p.boardGrade)}</b></span><span>ADP <b>{p.adpRank??"—"}</b></span><span>Δ <b className={p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":""}>{deltaText(p.delta)}</b></span></div></>:<div className="dd-empty-card">No available {pos}</div>}
        </article>})}
      </div>
    </section>

    <section className="dd-command-grid">
      <article className="dd-panel dd-live-panel">
        <header>
          <div><span>Live Sleeper draft</span><h2>Draft feed</h2></div>
          <div className="dd-live-count"><b>{madeCount}</b><small>picks made</small></div>
        </header>
        {active?.error&&<div className="dd-inline-error">{active.error}</div>}
        <div className="dd-feed-scroll">
          {visibleFeed.length?visibleFeed.map(p=>{
            const boardPlayer=boardByName.get(normName(p.player));
            return <div className="dd-feed-card" key={p.pickNo}>
              <div className="dd-feed-pick"><small>PICK</small><strong>{p.round}.{String(p.slot).padStart(2,"0")}</strong><span>#{p.pickNo}</span></div>
              <div className="dd-feed-player">
                <strong>{p.player||"—"}</strong><span>{p.team}</span>
                {boardPlayer&&<small>Your board #{boardPlayer.overallRank} · Grade {gradeText(boardPlayer.boardGrade)}</small>}
              </div>
              <div className={"dd-pos-pill "+posTone(p.position)}>{p.position||"—"}</div>
              <div className="dd-feed-pro"><span>NFL</span><b>{p.proTeam||"—"}</b></div>
            </div>
          }):<div className="dd-empty">{active?.picks?.length?"No picks match this search.":"No Sleeper picks yet. Sync once the draft is created or underway."}</div>}
        </div>
      </article>

      <article className="dd-panel dd-intel-panel">
        <header className="dd-intel-head">
          <div><span>Draft intel</span><h2>{intelTab==="board"?"League Final Draft Board":"Sleeper ADP"}</h2></div>
          <div className="dd-intel-tabs">
            <button className={intelTab==="board"?"active":""} onClick={()=>setIntelTab("board")}>My Board</button>
            <button className={intelTab==="adp"?"active":""} onClick={()=>setIntelTab("adp")}>Sleeper ADP</button>
          </div>
        </header>

        {intelTab==="board"?<>
          <div className="dd-board-head dd-board-grid"><span>#</span><span>Player</span><span>Pos</span><span>Grade</span><span>ADP</span><span>Δ</span></div>
          <div className="dd-intel-scroll">
            {visibleBoard.length?visibleBoard.map(p=><div className={"dd-board-row dd-board-grid "+(draftedNames.has(normName(p.name))?"drafted":"")} key={p.id}>
              <div className="dd-rank">{p.overallRank??"—"}</div>
              <div className="dd-player"><PlayerName id={p.id}>{p.name}</PlayerName><span>{p.college||"—"}{p.tier?" · T"+p.tier:""}</span></div>
              <div className={"dd-pos-pill "+posTone(p.position)}>{p.position}{p.positionRank??"—"}</div>
              <div className={"dd-grade "+gradeTone(p.boardGrade)}>{gradeText(p.boardGrade)}</div>
              <div>{p.adpRank??"—"}</div>
              <div className={"dd-delta "+(p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":"")}>{deltaText(p.delta)}</div>
              {draftedNames.has(normName(p.name))&&<span className="dd-drafted-tag">DRAFTED</span>}
            </div>):<div className="dd-empty">No Final Draft Board players match this search.</div>}
          </div>
        </>:<>
          <div className="dd-adp-head dd-adp-grid"><span>#</span><span>Player</span><span>Pos</span><span>Your #</span></div>
          <div className="dd-intel-scroll">
            {visibleAdp.length?visibleAdp.map(p=>{const boardPlayer=boardByName.get(normName(p.name));const drafted=draftedNames.has(normName(p.name));return <div className={"dd-adp-row dd-adp-grid "+(drafted?"drafted":"")} key={p.playerId}>
              <div className="dd-rank">{p.rank}</div>
              <div className="dd-player"><strong>{p.name}</strong><span>{p.college||p.team||"—"}</span></div>
              <div className={"dd-pos-pill "+posTone(p.position)}>{p.position}</div>
              <div>{boardPlayer?.overallRank??"—"}</div>
              {drafted&&<span className="dd-drafted-tag">DRAFTED</span>}
            </div>}):<div className="dd-empty">Sync Sleeper ADP to populate the market board.</div>}
          </div>
        </>}
      </article>
    </section>

    <section className="dd-team-section">
      <div className="dd-section-title"><div><span>Draft audit</span><h2>Picks by team</h2></div><small>Quick roster-level review as the room fills in.</small></div>
      <div className="dd-team-grid">
        {byTeam.length?byTeam.map(({team,picks})=><details key={team}><summary><span>{team}</span><b>{picks.length}</b></summary><div>{picks.map(p=><p key={p.pickNo}><strong>{p.round}.{String(p.slot).padStart(2,"0")}</strong><span>{p.player}</span><em>{p.position}</em></p>)}</div></details>):<div className="dd-empty">No team picks recorded yet.</div>}
      </div>
    </section>

    <style jsx global>{`
      .dd-page{display:grid;gap:16px;padding-bottom:30px;max-width:1700px;margin:0 auto}
      .dd-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:3px 0}.dd-hero h1{font-size:34px;letter-spacing:-.03em;margin:5px 0 7px}.dd-hero p{margin:0;color:#8fa7c8;max-width:900px;font-size:14px;line-height:1.55}.dd-hero p b{color:#dce8f6}
      .dd-leagues{display:flex;gap:7px;overflow:auto;padding:5px;background:#081426;border:1px solid #20395f;border-radius:12px;width:max-content;max-width:100%}.dd-leagues button{background:transparent;border:1px solid transparent;color:#91a7c4;padding:8px 12px;white-space:nowrap;font-size:12px}.dd-leagues button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.12)}
      .dd-scoreboard{display:grid;grid-template-columns:1.08fr .92fr 1.2fr 1fr;gap:10px}.dd-scoreboard>div{min-height:104px;padding:14px 16px;background:linear-gradient(180deg,#0e1f38,#0a172a);border:1px solid #20395f;border-radius:13px;display:flex;flex-direction:column;justify-content:center}.dd-scoreboard span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8098b9;font-weight:950}.dd-scoreboard strong{font-size:23px;line-height:1.08;margin:7px 0 3px;font-variant-numeric:tabular-nums}.dd-scoreboard strong small{font-size:12px;color:#7890b1}.dd-scoreboard>div>small{color:#7890b1;font-size:10px}.dd-progress-card i{height:5px;background:#162b48;border-radius:999px;overflow:hidden;margin-top:8px}.dd-progress-card i b{display:block;height:100%;background:linear-gradient(90deg,#20e2dd,#62e889);border-radius:999px}
      .dd-controls{display:grid;grid-template-columns:minmax(300px,1fr) auto auto;gap:8px;align-items:center}.dd-search{position:relative}.dd-search span{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:19px;color:#6884a9}.dd-search input{padding-left:38px;background:#08172a;border-color:#29476e}.dd-controls button{white-space:nowrap}
      .dd-section-title{display:flex;align-items:end;justify-content:space-between;gap:18px}.dd-section-title>div>span,.dd-panel header>div>span{display:block;color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.dd-section-title h2,.dd-panel header h2{font-size:18px;margin:3px 0 0}.dd-section-title small{color:#7890b1;max-width:470px;text-align:right}
      .dd-best{padding:14px;background:linear-gradient(180deg,rgba(17,34,61,.58),rgba(9,23,43,.35));border:1px solid #20395f;border-radius:15px}.dd-best-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:11px}.dd-best-card{position:relative;overflow:hidden;min-height:142px;background:#081629;border:1px solid #20395f;border-radius:11px;padding:12px 13px}.dd-best-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#6b7f9b}.dd-best-card.dd-pos-qb:before{background:#fc2b6d}.dd-best-card.dd-pos-rb:before{background:#20ceb7}.dd-best-card.dd-pos-wr:before{background:#58a7ff}.dd-best-card.dd-pos-te:before{background:#fead58}.dd-best-pos{display:flex;justify-content:space-between;align-items:center;color:#aebfd6;font-size:11px}.dd-best-pos b{font-size:12px}.dd-best-pos span{color:#7189aa}.dd-best-rank{font-size:8px;color:#7189aa;margin:12px 0 3px;letter-spacing:.08em}.dd-best-name{display:block!important;color:#f4f8ff!important;font-size:16px!important;font-weight:950!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-best-card p{margin:2px 0 0;color:#8199b8;font-size:10px}.dd-best-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:11px}.dd-best-meta span{padding:5px 6px;background:#0e213b;border:1px solid #1c3658;border-radius:7px;color:#7189aa;font-size:8px}.dd-best-meta b{display:block;color:#eaf2ff;font-size:11px;margin-top:1px}.up{color:#62e889!important}.down{color:#ff7184!important}.dd-empty-card{display:grid;place-items:center;min-height:90px;color:#687f9f;font-size:10px}
      .dd-command-grid{display:grid;grid-template-columns:minmax(0,1.58fr) minmax(420px,1fr);gap:12px;align-items:stretch}.dd-panel{min-width:0;background:#081426;border:1px solid #20395f;border-radius:15px;overflow:hidden}.dd-panel>header{min-height:68px;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:13px 15px;background:linear-gradient(180deg,#10223d,#0b1a30);border-bottom:1px solid #20395f}
      .dd-live-panel{box-shadow:0 18px 50px rgba(0,0,0,.16)}.dd-live-count{display:flex;align-items:baseline;gap:6px;padding:6px 9px;border:1px solid #29476e;border-radius:9px;background:#0b1b30}.dd-live-count b{font-size:17px}.dd-live-count small{font-size:9px;color:#8198b7;text-transform:uppercase;font-weight:900}.dd-feed-scroll,.dd-intel-scroll{height:640px;overflow:auto}.dd-feed-scroll{padding:8px}.dd-feed-card{display:grid;grid-template-columns:72px minmax(180px,1fr) 58px 58px;gap:12px;align-items:center;min-height:78px;padding:10px 12px;margin-bottom:7px;background:#0b1a30;border:1px solid #1d3658;border-radius:10px}.dd-feed-card:hover{background:#102642;border-color:#31577f}.dd-feed-pick{align-self:stretch;display:flex;flex-direction:column;justify-content:center;align-items:center;border-right:1px solid #20395f}.dd-feed-pick small{font-size:7px;color:#6580a3;font-weight:950;letter-spacing:.12em}.dd-feed-pick strong{font-size:19px;margin:3px 0 1px;font-variant-numeric:tabular-nums}.dd-feed-pick span{font-size:9px;color:#7189aa}.dd-feed-player{min-width:0}.dd-feed-player>strong{display:block;font-size:16px;color:#f4f8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-feed-player>span{display:block;margin-top:3px;color:#91a7c4;font-size:11px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-feed-player>small{display:block;margin-top:5px;color:#20e2dd;font-size:9px}.dd-feed-pro{text-align:center}.dd-feed-pro span{display:block;font-size:7px;color:#6882a5;font-weight:950}.dd-feed-pro b{display:block;margin-top:3px;font-size:10px;color:#b7c8dd}.dd-inline-error{padding:9px 12px;border-bottom:1px solid #703341;background:#351922;color:#ffc1c9;font-size:10px}
      .dd-pos-pill{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:29px;padding:0 6px;border-radius:7px;background:#20304a;color:#eaf2ff;font-size:9px;font-weight:950}.dd-pos-pill.dd-pos-qb{background:rgba(252,43,109,.18);color:#ff7ca5;border:1px solid rgba(252,43,109,.35)}.dd-pos-pill.dd-pos-rb{background:rgba(32,206,183,.16);color:#52e8d2;border:1px solid rgba(32,206,183,.3)}.dd-pos-pill.dd-pos-wr{background:rgba(88,167,255,.16);color:#8fc6ff;border:1px solid rgba(88,167,255,.3)}.dd-pos-pill.dd-pos-te{background:rgba(254,173,88,.16);color:#ffc887;border:1px solid rgba(254,173,88,.3)}
      .dd-intel-head{align-items:center!important}.dd-intel-tabs{display:flex;gap:4px;padding:3px;background:#071426;border:1px solid #29476e;border-radius:9px}.dd-intel-tabs button{background:transparent;border:0;color:#7891b2;font-size:9px;padding:6px 8px}.dd-intel-tabs button.active{background:#173253;color:#fff}.dd-board-head,.dd-adp-head{position:sticky;top:0;z-index:4;background:#0d2039;color:#7189aa;border-bottom:1px solid #29476e;padding:8px 9px;font-size:8px;font-weight:950;text-transform:uppercase;letter-spacing:.055em}.dd-board-grid{display:grid;grid-template-columns:30px minmax(130px,1fr) 49px 48px 38px 42px;gap:6px;align-items:center}.dd-adp-grid{display:grid;grid-template-columns:30px minmax(145px,1fr) 48px 48px;gap:7px;align-items:center}.dd-board-row,.dd-adp-row{position:relative;min-height:54px;padding:7px 9px;border-bottom:1px solid #142943;color:#cfdced;font-size:10px}.dd-board-row:hover,.dd-adp-row:hover{background:#0e223d}.dd-board-row.drafted,.dd-adp-row.drafted{opacity:.42}.dd-rank{font-size:13px;font-weight:950;color:#edf4ff;text-align:center}.dd-player{min-width:0}.dd-player>a,.dd-player>button,.dd-player>strong{display:block!important;color:#eef5ff!important;font-size:11px!important;font-weight:900!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-player span{display:block;margin-top:2px;color:#7089aa;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-grade{font-weight:950;font-variant-numeric:tabular-nums}.dd-grade.elite,.dd-grade.plus{color:#62e889}.dd-grade.fringe{color:#ffd166}.dd-grade.concern{color:#ff8b9a}.dd-delta{font-weight:950}.dd-drafted-tag{position:absolute;right:6px;top:3px;color:#ff7184;font-size:6px;font-weight:950;letter-spacing:.08em}.dd-empty{display:grid;place-items:center;min-height:120px;padding:24px;color:#7189aa;text-align:center;font-size:10px;line-height:1.5}
      .dd-team-section{padding-top:2px}.dd-team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;margin-top:10px}.dd-team-grid details{background:#08172a;border:1px solid #20395f;border-radius:11px;overflow:hidden}.dd-team-grid summary{list-style:none;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 12px;cursor:pointer;font-weight:850}.dd-team-grid summary::-webkit-details-marker{display:none}.dd-team-grid summary b{display:grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:#163150;color:#9fb7d4;font-size:10px}.dd-team-grid details>div{border-top:1px solid #20395f;padding:5px 10px}.dd-team-grid p{display:grid;grid-template-columns:42px 1fr auto;gap:8px;align-items:center;margin:0;padding:7px 2px;border-bottom:1px solid #142943;font-size:10px}.dd-team-grid p:last-child{border-bottom:0}.dd-team-grid p strong{color:#91a9c8}.dd-team-grid p span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-team-grid p em{font-style:normal;color:#7189aa;font-weight:900}
      @media(max-width:1250px){.dd-command-grid{grid-template-columns:minmax(0,1.35fr) minmax(390px,1fr)}.dd-scoreboard{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:1040px){.dd-command-grid{grid-template-columns:1fr}.dd-feed-scroll{height:560px}.dd-intel-scroll{height:520px}.dd-best-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:720px){.dd-hero{display:block}.dd-hero .status{margin-top:10px}.dd-scoreboard{grid-template-columns:1fr 1fr}.dd-controls{grid-template-columns:1fr 1fr}.dd-search{grid-column:1/-1}.dd-best-grid{grid-template-columns:1fr 1fr}.dd-section-title small{display:none}.dd-feed-card{grid-template-columns:62px minmax(0,1fr) 45px}.dd-feed-pro{display:none}.dd-board-grid{grid-template-columns:27px minmax(120px,1fr) 45px 46px 34px 38px}.dd-feed-scroll,.dd-intel-scroll{height:auto;max-height:620px}}
      @media(max-width:500px){.dd-scoreboard,.dd-best-grid{grid-template-columns:1fr}.dd-controls{grid-template-columns:1fr}.dd-controls button{width:100%}.dd-board-head span:nth-child(4),.dd-board-row>div:nth-child(4){display:none}.dd-board-grid{grid-template-columns:27px minmax(115px,1fr) 45px 34px 38px}}
    `}</style>
  </div>;
}
