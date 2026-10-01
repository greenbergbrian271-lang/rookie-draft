"use client";

import {useEffect,useMemo,useState} from "react";
import Image from "next/image";
import PlayerName from "@/components/PlayerName";
import {FINAL_BOARD_POSITIONS,type FinalBoardScoredRow} from "@/lib/final-board";

type Pick={
  round:number;
  pickNo:number;
  slot:number;
  rosterId?:number;
  team:string;
  isMine?:boolean;
  playerId:string|null;
  player:string|null;
  position:string|null;
  proTeam:string|null;
};
type LeagueResult={
  league:string;
  slug:string;
  boardKey?:string;
  draftId?:string|null;
  total:number;
  status:string;
  teams?:number;
  rounds?:number;
  picks:Pick[];
  slots?:Pick[];
  error?:string;
};
type AdpPlayer={name:string;position:string;team:string;college:string;adp:number;playerId:string;adjustedADP:number};
type AdpLeague={league:string;slug:string;top75:AdpPlayer[]};
type LeagueMeta={slug:string;boardKey:string;name:string;rounds:number;teams:number;tePremium?:boolean};
type IntelRow=FinalBoardScoredRow&{adpRank:number|null;delta:number|null};
type BoardPayload={view?:{key:string;label:string;tePremium:boolean;rosterKey?:string};rows?:FinalBoardScoredRow[]};
type TradeAsset={name:string;position?:string;value:number;source?:string};
type TradeIdea={kind:string;youSend:TradeAsset[];youGet:TradeAsset[];sendValue:number;receiveValue:number;sendAdjusted:number;receiveAdjusted:number;differencePct:number};
type TradeResponse={
  pick:{name:string;value:number;source?:string;ownerName:string;pickNo:number;round:number;slot:number};
  owner:{name:string;rosterId:number;valuedPlayers:number};
  me:{name:string;rosterId:number;valuedPlayers:number};
  ideas:TradeIdea[];
  source:{provider:string;basis:string;attribution:string;url:string};
  generatedAt:string;
};

const normName=(value:any)=>String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const gradeText=(n:number|null)=>n==null?"—":n.toFixed(2);
const deltaText=(n:number|null)=>n==null?"—":n===0?"EVEN":n>0?"+"+n:String(n);
const posTone=(p?:string|null)=>p?"dd-pos-"+p.toLowerCase():"";
const gradeTone=(n:number|null)=>n==null?"":n>=85?"elite":n>=75?"plus":n>=65?"solid":n>=55?"fringe":"concern";
const ESPN_TEAM:Record<string,string>={
  ARI:"ari",ATL:"atl",BAL:"bal",BUF:"buf",CAR:"car",CHI:"chi",CIN:"cin",CLE:"cle",DAL:"dal",DEN:"den",DET:"det",GB:"gb",
  HOU:"hou",IND:"ind",JAX:"jax",KC:"kc",LAC:"lac",LAR:"lar",LV:"lv",MIA:"mia",MIN:"min",NE:"ne",NO:"no",NYG:"nyg",NYJ:"nyj",
  PHI:"phi",PIT:"pit",SEA:"sea",SF:"sf",TB:"tb",TEN:"ten",WAS:"wsh"
};
const nflLogo=(team?:string|null)=>team&&ESPN_TEAM[team]?`https://a.espncdn.com/i/teamlogos/nfl/500/${ESPN_TEAM[team]}.png`:null;
const PREVIEW_CLEAR_ONE_LEAGUE=true;

export default function DraftDayPage(){
  const [leagues,setLeagues]=useState<LeagueMeta[]>([]);
  const [results,setResults]=useState<LeagueResult[]>([]);
  const [adpLists,setAdpLists]=useState<AdpLeague[]>([]);
  const [boardRows,setBoardRows]=useState<FinalBoardScoredRow[]>([]);
  const [boardLabel,setBoardLabel]=useState("");
  const [liveDraft,setLiveDraft]=useState<LeagueResult|null>(null);
  const [archivedNames,setArchivedNames]=useState<Set<string>>(new Set());
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const [slug,setSlug]=useState("");
  const [query,setQuery]=useState("");
  const [intelTab,setIntelTab]=useState<"board"|"adp">("board");
  const [hideSelected,setHideSelected]=useState(false);
  const [loading,setLoading]=useState(true);
  const [boardLoading,setBoardLoading]=useState(false);
  const [syncing,setSyncing]=useState<""|"picks"|"adp">("");
  const [error,setError]=useState("");
  const [tradePick,setTradePick]=useState<Pick|null>(null);
  const [tradeData,setTradeData]=useState<TradeResponse|null>(null);
  const [tradeLoading,setTradeLoading]=useState(false);
  const [tradeError,setTradeError]=useState("");

  async function loadMeta(){
    const r=await fetch("/api/draft-day",{cache:"no-store"});
    const j=await r.json();
    const next=Array.isArray(j.leagues)?j.leagues:[];
    setLeagues(next);
    if(!slug&&next.length)setSlug(next[0].slug);
  }

  async function loadStatus(){
    setError("");
    try{
      const [statusRes,archiveRes]=await Promise.all([
        fetch("/api/draft-day/status",{cache:"no-store"}),
        fetch("/api/players/archive",{cache:"no-store"})
      ]);
      if(!statusRes.ok)throw new Error("Draft status endpoint returned "+statusRes.status);
      const [status,archiveData]=await Promise.all([
        statusRes.json(),
        archiveRes.ok?archiveRes.json():[]
      ]);
      setResults(status.draft_day_status?.results||[]);
      setAdpLists(status.sleeper_adp?.lists||[]);
      setUpdatedAt(status.draft_day_status?.updatedAt||status.sleeper_adp?.updatedAt||null);
      setArchivedNames(new Set(Array.isArray(archiveData)?archiveData.map((p:any)=>normName(p.player_name)):[]));
    }catch(e:any){
      setError(e?.message||"Could not load draft-day data");
    }finally{
      setLoading(false);
    }
  }

  async function loadLiveDraft(nextSlug:string){
    try{
      const r=await fetch("/api/draft-day?slug="+encodeURIComponent(nextSlug),{cache:"no-store"});
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Could not load live draft");
      setLiveDraft(data);
    }catch(e:any){
      setError(e?.message||"Could not load live draft");
    }
  }

  async function loadBoard(boardKey:string){
    setBoardLoading(true);
    try{
      const r=await fetch("/api/final-board/live?view="+encodeURIComponent("league:"+boardKey),{cache:"no-store"});
      const data:BoardPayload&{error?:string}=await r.json();
      if(!r.ok)throw new Error(data?.error||"Could not load league Final Draft Board");
      setBoardRows(Array.isArray(data.rows)?data.rows:[]);
      setBoardLabel(data.view?.label||"League Final Draft Board");
    }catch(e:any){
      setBoardRows([]);
      setError(e?.message||"Could not load league Final Draft Board");
    }finally{
      setBoardLoading(false);
    }
  }

  useEffect(()=>{
    loadMeta();
    loadStatus();
    const refresh=()=>loadStatus();
    window.addEventListener("rookie-draft:archives-changed",refresh);
    window.addEventListener("rookie-draft:players-changed",refresh);
    return()=>{
      window.removeEventListener("rookie-draft:archives-changed",refresh);
      window.removeEventListener("rookie-draft:players-changed",refresh);
    };
  },[]);

  const activeMeta=leagues.find(x=>x.slug===slug);
  useEffect(()=>{
    if(activeMeta?.boardKey)loadBoard(activeMeta.boardKey);
    if(activeMeta?.slug)loadLiveDraft(activeMeta.slug);
  },[activeMeta?.boardKey,activeMeta?.slug]);

  async function sync(kind:"picks"|"adp"){
    setSyncing(kind);
    setError("");
    try{
      const r=await fetch("/api/draft-day",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:kind==="adp"?"adp":"sync"})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Sync failed");
      await loadStatus();
      if(slug)await loadLiveDraft(slug);
    }catch(e:any){
      setError(e?.message||"Sync failed");
    }finally{
      setSyncing("");
    }
  }

  const savedActive=results.find(x=>x.slug===slug);
  const activeBase=liveDraft?.slug===slug?liveDraft:savedActive;
  const active=useMemo<LeagueResult|undefined>(()=>{
    if(!activeBase)return undefined;
    if(activeBase.slots?.length){
      const rows=activeBase.slots.map(p=>slug==="one-league"&&PREVIEW_CLEAR_ONE_LEAGUE?{...p,playerId:null,player:null,position:null,proTeam:null}:p);
      return {...activeBase,picks:rows};
    }
    if(slug==="one-league"&&PREVIEW_CLEAR_ONE_LEAGUE)return {...activeBase,picks:[]};
    return activeBase;
  },[activeBase,slug]);
  const activeAdp=adpLists.find(x=>x.slug===slug);
  const q=query.trim().toLowerCase();

  const pickByName=useMemo(()=>{
    const map=new Map<string,Pick>();
    for(const p of active?.picks||[])if(p.player)map.set(normName(p.player),p);
    return map;
  },[active]);

  const draftedNames=useMemo(()=>new Set([...pickByName.keys()]),[pickByName]);

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
    pos,
    intelRows.find(p=>p.position===pos&&p.boardGrade!=null&&!draftedNames.has(normName(p.name)))||null
  ])) as Record<(typeof FINAL_BOARD_POSITIONS)[number],IntelRow|null>,[intelRows,draftedNames]);

  const visibleFeed=useMemo(()=>(active?.picks||[]).filter(p=>{
    if(archivedNames.has(normName(p.player)))return false;
    return !q||(p.team+" "+(p.player||"")+" "+(p.position||"")+" "+(p.proTeam||"")).toLowerCase().includes(q);
  }),[active,q,archivedNames]);

  const visibleBoard=useMemo(()=>intelRows.filter(p=>{
    const key=normName(p.name);
    if(archivedNames.has(key))return false;
    if(hideSelected&&draftedNames.has(key))return false;
    return !q||(`${p.name} ${p.college||""} ${p.position}`).toLowerCase().includes(q);
  }),[intelRows,q,archivedNames,hideSelected,draftedNames]);

  const visibleAdp=useMemo(()=>(activeAdp?.top75||[]).map((p,i)=>({...p,rank:i+1})).filter(p=>{
    const key=normName(p.name);
    if(archivedNames.has(key))return false;
    if(hideSelected&&draftedNames.has(key))return false;
    return !q||(`${p.name} ${p.college} ${p.position}`).toLowerCase().includes(q);
  }),[activeAdp,q,archivedNames,hideSelected,draftedNames]);

  const boardByName=useMemo(()=>new Map<string,IntelRow>(intelRows.map(p=>[normName(p.name),p] as [string,IntelRow])),[intelRows]);

  const byTeam=useMemo(()=>{
    if(!active)return[] as {team:string;picks:Pick[]}[];
    const map=new Map<string,Pick[]>();
    for(const p of active.picks){
      if(!p.player||archivedNames.has(normName(p.player)))continue;
      const list=map.get(p.team)||[];
      list.push(p);
      map.set(p.team,list);
    }
    return[...map.entries()].map(([team,picks])=>({team,picks})).sort((a,b)=>b.picks.length-a.picks.length||a.team.localeCompare(b.team));
  },[active,archivedNames]);

  const madeCount=active?.picks.filter(p=>p.player&&!archivedNames.has(normName(p.player))).length||0;
  const totalPicks=active?.total||((activeMeta?.rounds||0)*(activeMeta?.teams||0));

  function selectionClass(name:string){
    const pick=pickByName.get(normName(name));
    if(!pick)return "";
    return pick.isMine?" selected-mine":" selected-other";
  }

  async function openTradeIdeas(pick:Pick){
    setTradePick(pick);
    setTradeData(null);
    setTradeError("");
    setTradeLoading(true);
    try{
      const r=await fetch("/api/draft-day/trade-ideas",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,pickNo:pick.pickNo})});
      const data=await r.json();
      if(!r.ok)throw new Error(data?.error||"Could not calculate trade ideas");
      setTradeData(data);
    }catch(e:any){
      setTradeError(e?.message||"Could not calculate trade ideas");
    }finally{
      setTradeLoading(false);
    }
  }

  function closeTradeIdeas(){
    setTradePick(null);
    setTradeData(null);
    setTradeError("");
  }

  function copyTrade(idea:TradeIdea){
    const send=idea.youSend.map(x=>x.name).join(" + ");
    const get=idea.youGet.map(x=>x.name).join(" + ");
    navigator.clipboard?.writeText(`I send: ${send}\nI receive: ${get}`);
  }

  return <div className="dd-page">
    <section className="dd-hero">
      <div>
        <div className="ey">Draft Day</div>
        <h1>Rookie Draft Command Center</h1>
        <p>Live Sleeper picks on the left. The <b>same league-specific Final Draft Board output</b> used by the Final Draft Board page—or Sleeper ADP—on the right.</p>
      </div>
      <span className={"status "+(error?"":loading?"":"cloud")}>{loading?"Connecting…":error?"● Data issue":updatedAt?"● Live · "+new Date(updatedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"● Ready"}</span>
    </section>

    {error&&<div className="notice"><b>Data status:</b> {error} <button className="small ghost" onClick={()=>{loadStatus();if(activeMeta?.boardKey)loadBoard(activeMeta.boardKey)}}>Retry</button></div>}

    <section className="dd-league-row">
      <div className="dd-leagues" role="tablist" aria-label="Draft league">
        {leagues.map(l=><button key={l.slug} className={slug===l.slug?"active":""} onClick={()=>{setSlug(l.slug);setQuery("");setIntelTab("board")}}>{l.name}</button>)}
      </div>
      <div className="dd-inline-status">
        {slug==="one-league"&&PREVIEW_CLEAR_ONE_LEAGUE?<span className="test">Preview test · picks cleared</span>:<span>{active?.status||"Waiting for Sleeper"}</span>}
        <b>{madeCount} / {totalPicks||"—"} picks</b>
      </div>
    </section>

    <section className="dd-controls">
      <div className="dd-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, team, college or position…"/></div>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("picks")}>{syncing==="picks"?"Syncing picks…":"↻ Sync picks"}</button>
      <button className="ghost" disabled={syncing!==""} onClick={()=>sync("adp")}>{syncing==="adp"?"Syncing ADP…":"↻ Sync ADP"}</button>
    </section>

    <section className="dd-best">
      <div className="dd-section-title">
        <div><span>Best available</span><h2>Top remaining player by position</h2></div>
        <small>Uses the selected league's Final Draft Board. Any drafted player is removed automatically.</small>
      </div>
      <div className="dd-best-grid">
        {FINAL_BOARD_POSITIONS.map(pos=>{
          const p=bestAvailable[pos];
          return <article key={pos} className={"dd-best-card "+posTone(pos)}>
            <div className="dd-best-pos"><b>{pos}</b><span>{p?p.position+p.positionRank:"—"}</span></div>
            {p?<>
              <div className="dd-best-rank">BOARD #{p.overallRank}</div>
              <PlayerName id={p.id} className="dd-best-name">{p.name}</PlayerName>
              <p>{p.college||"—"}</p>
              <div className="dd-best-meta">
                <span>Grade <b>{gradeText(p.boardGrade)}</b></span>
                <span>ADP <b>{p.adpRank??"—"}</b></span>
                <span>Δ <b className={p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":""}>{deltaText(p.delta)}</b></span>
              </div>
            </>:<div className="dd-empty-card">No available {pos}</div>}
          </article>;
        })}
      </div>
    </section>

    <section className="dd-command-grid">
      <article className="dd-panel dd-live-panel">
        <header>
          <div><span>Live Sleeper draft</span><h2>Draft feed</h2></div>
          <div className="dd-live-count"><b>{madeCount}</b><small>picks</small></div>
        </header>
        {active?.error&&<div className="dd-inline-error">{active.error}</div>}
        <div className="dd-feed-scroll">
          {visibleFeed.length?visibleFeed.map(p=>{
            const boardPlayer=boardByName.get(normName(p.player));
            const logo=nflLogo(p.proTeam);
            return <div className={"dd-feed-row "+(p.isMine?"mine":"")} key={p.pickNo}>
              <div className="dd-feed-pick"><strong>{p.round}.{String(p.slot).padStart(2,"0")}</strong><span>#{p.pickNo}</span></div>
              <div className="dd-feed-player">
                <strong>{p.player||"Open pick"}</strong>
                <span>{p.team}{boardPlayer?" · Board #"+boardPlayer.overallRank:""}</span>
              </div>
              <div className={"dd-pos-pill "+posTone(p.position)}>{p.position||"—"}</div>
              <div className="dd-feed-logo">{logo?<Image src={logo} alt={p.proTeam+" logo"} width={28} height={28}/>:<span>—</span>}</div>
              <div className="dd-feed-action">
                {!p.player&&(p.isMine?<span className="dd-own-pick">YOUR PICK</span>:<button type="button" onClick={()=>openTradeIdeas(p)}>Trade ideas</button>)}
              </div>
            </div>;
          }):<div className="dd-empty">{active?.picks?.length?"No picks match this search.":"No Sleeper draft slots are available yet."}</div>}
        </div>
      </article>

      <article className="dd-panel dd-intel-panel">
        <header className="dd-intel-head">
          <div><span>Draft intel</span><h2>{intelTab==="board"?(boardLabel||"League Final Draft Board"):"Sleeper ADP"}</h2></div>
          <div className="dd-intel-actions">
            <div className="dd-intel-tabs">
              <button className={intelTab==="board"?"active":""} onClick={()=>setIntelTab("board")}>My Board</button>
              <button className={intelTab==="adp"?"active":""} onClick={()=>setIntelTab("adp")}>Sleeper ADP</button>
            </div>
            <label className={"dd-hide-selected "+(hideSelected?"active":"")}>
              <input type="checkbox" checked={hideSelected} onChange={e=>setHideSelected(e.target.checked)}/>
              <span>Hide selected</span>
            </label>
          </div>
        </header>

        {intelTab==="board"?<>
          <div className="dd-board-head dd-board-grid"><span>#</span><span>Player</span><span>Pos</span><span>Grade</span><span>ADP</span><span>Δ</span></div>
          <div className="dd-intel-scroll">
            {boardLoading?<div className="dd-empty">Loading the league Final Draft Board…</div>:visibleBoard.length?visibleBoard.map(p=>{
              const pick=pickByName.get(normName(p.name));
              return <div className={"dd-board-row dd-board-grid"+selectionClass(p.name)} key={p.id}>
                <div className="dd-rank">{p.overallRank??"—"}</div>
                <div className="dd-player"><PlayerName id={p.id}>{p.name}</PlayerName><span>{p.college||"—"}{p.tier?" · T"+p.tier:""}</span></div>
                <div className={"dd-pos-pill "+posTone(p.position)}>{p.position}{p.positionRank??"—"}</div>
                <div className={"dd-grade "+gradeTone(p.boardGrade)}>{gradeText(p.boardGrade)}</div>
                <div>{p.adpRank??"—"}</div>
                <div className={"dd-delta "+(p.delta!=null&&p.delta>0?"up":p.delta!=null&&p.delta<0?"down":"")}>{deltaText(p.delta)}</div>
                {pick&&<span className="dd-selected-tag">{pick.isMine?"YOUR PICK":"SELECTED"}</span>}
              </div>;
            }):<div className="dd-empty">No Final Draft Board players match this view.</div>}
          </div>
        </>:<>
          <div className="dd-adp-head dd-adp-grid"><span>#</span><span>Player</span><span>Pos</span><span>Your #</span></div>
          <div className="dd-intel-scroll">
            {visibleAdp.length?visibleAdp.map(p=>{
              const boardPlayer=boardByName.get(normName(p.name));
              const pick=pickByName.get(normName(p.name));
              return <div className={"dd-adp-row dd-adp-grid"+selectionClass(p.name)} key={p.playerId}>
                <div className="dd-rank">{p.rank}</div>
                <div className="dd-player"><strong>{p.name}</strong><span>{p.college||p.team||"—"}</span></div>
                <div className={"dd-pos-pill "+posTone(p.position)}>{p.position}</div>
                <div>{boardPlayer?.overallRank??"—"}</div>
                {pick&&<span className="dd-selected-tag">{pick.isMine?"YOUR PICK":"SELECTED"}</span>}
              </div>;
            }):<div className="dd-empty">Sync Sleeper ADP to populate the market board.</div>}
          </div>
        </>}
      </article>
    </section>

    <section className="dd-team-section">
      <div className="dd-section-title"><div><span>Draft audit</span><h2>Picks by team</h2></div><small>Quick roster-level review as the room fills in.</small></div>
      <div className="dd-team-grid">
        {byTeam.length?byTeam.map(({team,picks})=><details key={team}><summary><span>{team}</span><b>{picks.length}</b></summary><div>{picks.map(p=><p className={p.isMine?"mine":""} key={p.pickNo}><strong>{p.round}.{String(p.slot).padStart(2,"0")}</strong><span>{p.player}</span><em>{p.position}</em></p>)}</div></details>):<div className="dd-empty">No team picks recorded yet.</div>}
      </div>
    </section>

    {tradePick&&<div className="dd-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)closeTradeIdeas()}}>
      <section className="dd-trade-modal" role="dialog" aria-modal="true" aria-label="Trade ideas">
        <header>
          <div>
            <span className="ey">Trade for pick {tradePick.round}.{String(tradePick.slot).padStart(2,"0")}</span>
            <h2>{tradeData?tradeData.pick.ownerName:tradePick.team}</h2>
            <p>Value-based offers you can use as starting points with the current owner of this pick.</p>
          </div>
          <button type="button" className="dd-modal-close" onClick={closeTradeIdeas}>×</button>
        </header>

        {tradeLoading?<div className="dd-trade-loading"><strong>Calculating market values…</strong><span>Matching the pick against both Sleeper rosters.</span></div>:tradeError?<div className="dd-trade-error">{tradeError}</div>:tradeData?<div className="dd-trade-body">
          <div className="dd-trade-summary">
            <div><span>Target pick</span><strong>{tradeData.pick.name}</strong></div>
            <div><span>Market value</span><strong>{Math.round(tradeData.pick.value).toLocaleString()}</strong></div>
            <div><span>Pick owner</span><strong>{tradeData.owner.name}</strong></div>
            <div><span>Ideas found</span><strong>{tradeData.ideas.length}</strong></div>
          </div>

          {tradeData.ideas.length?<div className="dd-trade-ideas">{tradeData.ideas.map((idea,index)=><article key={index}>
            <div className="dd-trade-card-head"><span>{idea.kind}</span><b>{idea.differencePct.toFixed(1)}% value gap</b></div>
            <div className="dd-trade-sides">
              <div><small>YOU SEND</small>{idea.youSend.map((asset,i)=><p key={i}><strong>{asset.name}</strong><span>{Math.round(asset.value).toLocaleString()}</span></p>)}<em>Raw KTC {Math.round(idea.sendValue).toLocaleString()} · Adjusted {Math.round(idea.sendAdjusted).toLocaleString()}</em></div>
              <div className="arrow">→</div>
              <div><small>YOU RECEIVE</small>{idea.youGet.map((asset,i)=><p key={i}><strong>{asset.name}</strong><span>{Math.round(asset.value).toLocaleString()}</span></p>)}<em>Raw KTC {Math.round(idea.receiveValue).toLocaleString()} · Adjusted {Math.round(idea.receiveAdjusted).toLocaleString()}</em></div>
            </div>
            <button type="button" className="ghost dd-copy-trade" onClick={()=>copyTrade(idea)}>Copy trade</button>
          </article>)}</div>:<div className="dd-empty">No close-value offers were found from the two current rosters. Try another pick.</div>}

          <div className="dd-trade-source">
            <strong>{tradeData.source.attribution}</strong>
            <span>{tradeData.source.basis} Package-adjusted totals apply a conservative consolidation discount to secondary pieces. Values are a market reference, not a guarantee another manager will accept the offer.</span>
            <a href={tradeData.source.url} target="_blank" rel="noreferrer">Open Tradyr ↗</a>
          </div>
        </div>:null}
      </section>
    </div>}

    <style jsx global>{`
      .dd-page{display:grid;gap:14px;padding-bottom:30px;max-width:1720px;margin:0 auto}
      .dd-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:3px 0}.dd-hero h1{font-size:34px;letter-spacing:-.03em;margin:5px 0 7px}.dd-hero p{margin:0;color:#8fa7c8;max-width:940px;font-size:14px;line-height:1.55}.dd-hero p b{color:#dce8f6}
      .dd-league-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.dd-leagues{display:flex;gap:7px;overflow:auto;padding:5px;background:#081426;border:1px solid #20395f;border-radius:12px;width:max-content;max-width:100%}.dd-leagues button{background:transparent;border:1px solid transparent;color:#91a7c4;padding:8px 12px;white-space:nowrap;font-size:12px}.dd-leagues button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.12)}.dd-inline-status{display:flex;align-items:center;gap:9px;color:#7890b1;font-size:10px;white-space:nowrap}.dd-inline-status span{padding:5px 8px;border:1px solid #29476e;border-radius:999px;background:#0b1b30;color:#9db2ce}.dd-inline-status span.test{border-color:#8a6c25;background:rgba(255,209,102,.08);color:#ffd166}.dd-inline-status b{color:#dce8f6}
      .dd-controls{display:grid;grid-template-columns:minmax(300px,1fr) auto auto;gap:8px;align-items:center}.dd-search{position:relative}.dd-search span{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:19px;color:#6884a9}.dd-search input{padding-left:38px;background:#08172a;border-color:#29476e}.dd-controls button{white-space:nowrap}
      .dd-section-title{display:flex;align-items:end;justify-content:space-between;gap:18px}.dd-section-title>div>span,.dd-panel header>div>span{display:block;color:#20e2dd;font-size:9px;font-weight:950;letter-spacing:.11em;text-transform:uppercase}.dd-section-title h2,.dd-panel header h2{font-size:18px;margin:3px 0 0}.dd-section-title small{color:#7890b1;max-width:500px;text-align:right}
      .dd-best{padding:13px;background:linear-gradient(180deg,rgba(17,34,61,.58),rgba(9,23,43,.35));border:1px solid #20395f;border-radius:15px}.dd-best-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:10px}.dd-best-card{position:relative;overflow:hidden;min-height:128px;background:#081629;border:1px solid #20395f;border-radius:11px;padding:11px 13px}.dd-best-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#6b7f9b}.dd-best-card.dd-pos-qb:before{background:#fc2b6d}.dd-best-card.dd-pos-rb:before{background:#20ceb7}.dd-best-card.dd-pos-wr:before{background:#58a7ff}.dd-best-card.dd-pos-te:before{background:#fead58}.dd-best-pos{display:flex;justify-content:space-between;align-items:center;color:#aebfd6;font-size:11px}.dd-best-pos b{font-size:12px}.dd-best-pos span{color:#7189aa}.dd-best-rank{font-size:8px;color:#7189aa;margin:10px 0 2px;letter-spacing:.08em}.dd-best-name{display:block!important;color:#f4f8ff!important;font-size:15px!important;font-weight:950!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-best-card p{margin:2px 0 0;color:#8199b8;font-size:10px}.dd-best-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}.dd-best-meta span{padding:4px 6px;background:#0e213b;border:1px solid #1c3658;border-radius:7px;color:#7189aa;font-size:8px}.dd-best-meta b{display:block;color:#eaf2ff;font-size:11px;margin-top:1px}.up{color:#62e889!important}.down{color:#ff7184!important}.dd-empty-card{display:grid;place-items:center;min-height:82px;color:#687f9f;font-size:10px}
      .dd-command-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:stretch}.dd-panel{min-width:0;background:#081426;border:1px solid #20395f;border-radius:15px;overflow:hidden}.dd-panel>header{min-height:66px;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 14px;background:linear-gradient(180deg,#10223d,#0b1a30);border-bottom:1px solid #20395f}
      .dd-live-count{display:flex;align-items:baseline;gap:5px;padding:5px 8px;border:1px solid #29476e;border-radius:8px;background:#0b1b30}.dd-live-count b{font-size:16px}.dd-live-count small{font-size:8px;color:#8198b7;text-transform:uppercase;font-weight:900}.dd-feed-scroll,.dd-intel-scroll{height:650px;overflow:auto}.dd-feed-scroll{padding:6px}.dd-feed-row{display:grid;grid-template-columns:58px minmax(150px,1fr) 50px 34px 82px;gap:8px;align-items:center;min-height:50px;padding:5px 8px;margin-bottom:4px;background:#0b1a30;border:1px solid #1a3353;border-radius:8px}.dd-feed-row:hover{background:#102642;border-color:#31577f}.dd-feed-row.mine{background:rgba(45,180,105,.1);border-color:rgba(98,232,137,.44);box-shadow:inset 3px 0 0 #62e889}.dd-feed-pick{display:flex;align-items:baseline;gap:5px;border-right:1px solid #20395f}.dd-feed-pick strong{font-size:14px;font-variant-numeric:tabular-nums}.dd-feed-pick span{font-size:8px;color:#7189aa}.dd-feed-player{min-width:0}.dd-feed-player>strong{display:block;font-size:13px;color:#f4f8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-feed-player>span{display:block;margin-top:2px;color:#829bbb;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-feed-logo{display:grid;place-items:center;width:32px;height:32px}.dd-feed-logo img{object-fit:contain}.dd-feed-logo span{color:#617a9c;font-size:9px}.dd-feed-action{display:flex;justify-content:flex-end}.dd-feed-action button{height:27px;padding:0 8px;border:1px solid #2b6179;border-radius:7px;background:rgba(32,226,221,.08);color:#75ebe7;font-size:8px;font-weight:950;white-space:nowrap}.dd-feed-action button:hover{background:rgba(32,226,221,.16);border-color:#20e2dd}.dd-own-pick{font-size:7px;font-weight:950;letter-spacing:.06em;color:#62e889;white-space:nowrap}.dd-inline-error{padding:9px 12px;border-bottom:1px solid #703341;background:#351922;color:#ffc1c9;font-size:10px}
      .dd-pos-pill{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:26px;padding:0 5px;border-radius:6px;background:#20304a;color:#eaf2ff;font-size:9px;font-weight:950}.dd-pos-pill.dd-pos-qb{background:rgba(252,43,109,.18);color:#ff7ca5;border:1px solid rgba(252,43,109,.35)}.dd-pos-pill.dd-pos-rb{background:rgba(32,206,183,.16);color:#52e8d2;border:1px solid rgba(32,206,183,.3)}.dd-pos-pill.dd-pos-wr{background:rgba(88,167,255,.16);color:#8fc6ff;border:1px solid rgba(88,167,255,.3)}.dd-pos-pill.dd-pos-te{background:rgba(254,173,88,.16);color:#ffc887;border:1px solid rgba(254,173,88,.3)}
      .dd-intel-head{align-items:center!important}.dd-intel-actions{display:flex;align-items:center;gap:7px}.dd-intel-tabs{display:flex;gap:4px;padding:3px;background:#071426;border:1px solid #29476e;border-radius:9px}.dd-intel-tabs button{background:transparent;border:0;color:#7891b2;font-size:9px;padding:6px 8px}.dd-intel-tabs button.active{background:#173253;color:#fff}.dd-hide-selected{display:flex;align-items:center;gap:5px;height:31px;padding:0 8px;border:1px solid #29476e;border-radius:8px;background:#0b1b30;color:#8fa7c8;font-size:8px;font-weight:900;white-space:nowrap;cursor:pointer}.dd-hide-selected input{width:12px;height:12px;margin:0;accent-color:#20e2dd}.dd-hide-selected.active{border-color:#20a9a7;color:#dce8f6;background:rgba(32,226,221,.08)}
      .dd-board-head,.dd-adp-head{position:sticky;top:0;z-index:4;background:#0d2039;color:#7189aa;border-bottom:1px solid #29476e;padding:8px 9px;font-size:8px;font-weight:950;text-transform:uppercase;letter-spacing:.055em}.dd-board-grid{display:grid;grid-template-columns:32px minmax(150px,1fr) 50px 52px 42px 44px;gap:7px;align-items:center}.dd-adp-grid{display:grid;grid-template-columns:32px minmax(165px,1fr) 49px 52px;gap:8px;align-items:center}.dd-board-row,.dd-adp-row{position:relative;min-height:52px;padding:7px 9px;border-bottom:1px solid #142943;color:#cfdced;font-size:10px}.dd-board-row:hover,.dd-adp-row:hover{background:#0e223d}.dd-rank{font-size:13px;font-weight:950;color:#edf4ff;text-align:center}.dd-player{min-width:0}.dd-player>a,.dd-player>button,.dd-player>strong{display:block!important;color:#eef5ff!important;font-size:11px!important;font-weight:900!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-player span{display:block;margin-top:2px;color:#7089aa;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-grade{font-weight:950;font-variant-numeric:tabular-nums}.dd-grade.elite,.dd-grade.plus{color:#62e889}.dd-grade.fringe{color:#ffd166}.dd-grade.concern{color:#ff8b9a}.dd-delta{font-weight:950}
      .dd-board-row.selected-other,.dd-adp-row.selected-other{background:rgba(255,77,99,.08)}.dd-board-row.selected-other .dd-player>a,.dd-board-row.selected-other .dd-player>button,.dd-board-row.selected-other .dd-player>strong,.dd-adp-row.selected-other .dd-player>strong{color:#ff7184!important;text-decoration:line-through;text-decoration-thickness:2px}.dd-board-row.selected-mine,.dd-adp-row.selected-mine{background:rgba(57,190,112,.16);box-shadow:inset 4px 0 0 #62e889}.dd-board-row.selected-mine .dd-player>a,.dd-board-row.selected-mine .dd-player>button,.dd-board-row.selected-mine .dd-player>strong,.dd-adp-row.selected-mine .dd-player>strong{color:#9af0b8!important}.dd-selected-tag{position:absolute;right:7px;top:3px;font-size:6px;font-weight:950;letter-spacing:.08em;color:#ff7184}.selected-mine .dd-selected-tag{color:#62e889}
      .dd-empty{display:grid;place-items:center;min-height:120px;padding:24px;color:#7189aa;text-align:center;font-size:10px;line-height:1.5}
      .dd-modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:22px;background:rgba(3,9,18,.78);backdrop-filter:blur(8px)}.dd-trade-modal{width:min(980px,96vw);max-height:90vh;overflow:auto;border:1px solid #31577f;border-radius:16px;background:#081426;box-shadow:0 28px 90px rgba(0,0,0,.52)}.dd-trade-modal>header{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:18px;padding:18px 20px;background:linear-gradient(180deg,#102641,#0a172a);border-bottom:1px solid #27476e}.dd-trade-modal>header h2{margin:3px 0 4px;font-size:22px}.dd-trade-modal>header p{margin:0;color:#849dbd;font-size:11px}.dd-modal-close{width:34px;height:34px;border-radius:999px;border:1px solid #395b83;background:#0b1d34;color:#dce8f6;font-size:22px;line-height:1}.dd-trade-loading{display:grid;place-items:center;gap:6px;min-height:260px;color:#dce8f6}.dd-trade-loading span{color:#7f97b7;font-size:10px}.dd-trade-error{margin:18px;padding:13px;border:1px solid #7a3341;border-radius:10px;background:#351a23;color:#ffc0c8}.dd-trade-body{padding:16px}.dd-trade-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.dd-trade-summary>div{padding:10px 11px;border:1px solid #20395f;border-radius:10px;background:#0b1a30}.dd-trade-summary span{display:block;color:#6f89aa;font-size:8px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}.dd-trade-summary strong{display:block;margin-top:4px;color:#eff5ff;font-size:13px}.dd-trade-ideas{display:grid;gap:9px}.dd-trade-ideas article{padding:11px;border:1px solid #20395f;border-radius:11px;background:#09172a}.dd-trade-card-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.dd-trade-card-head span{color:#20e2dd;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}.dd-trade-card-head b{color:#8fa7c8;font-size:9px}.dd-trade-sides{display:grid;grid-template-columns:1fr 26px 1fr;gap:8px;align-items:stretch}.dd-trade-sides>div:not(.arrow){padding:8px;border:1px solid #1b3557;border-radius:9px;background:#0d1f38}.dd-trade-sides small{display:block;margin-bottom:6px;color:#7088aa;font-size:7px;font-weight:950;letter-spacing:.08em}.dd-trade-sides p{display:flex;justify-content:space-between;gap:10px;margin:0;padding:5px 0;border-bottom:1px solid #18304f}.dd-trade-sides p:last-of-type{border-bottom:0}.dd-trade-sides p strong{font-size:10px;color:#eef5ff}.dd-trade-sides p span{font-size:9px;color:#8fa7c8;font-variant-numeric:tabular-nums}.dd-trade-sides em{display:block;margin-top:6px;color:#7e96b5;font-size:8px;font-style:normal;font-weight:900}.dd-trade-sides .arrow{display:grid;place-items:center;color:#4ea8c8;font-size:18px;font-weight:950}.dd-copy-trade{margin-top:8px;height:30px;padding:0 10px;font-size:9px}.dd-trade-source{display:grid;grid-template-columns:1fr auto;gap:3px 14px;margin-top:12px;padding:10px 12px;border:1px solid #29476e;border-radius:10px;background:#0b1b30}.dd-trade-source strong{color:#c7d8ec;font-size:9px}.dd-trade-source span{grid-column:1/2;color:#738baa;font-size:8px;line-height:1.4}.dd-trade-source a{grid-column:2/3;grid-row:1/3;align-self:center;color:#20e2dd;font-size:9px;font-weight:900;text-decoration:none}.dd-team-section{padding-top:2px}.dd-team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:9px;margin-top:10px}.dd-team-grid details{background:#08172a;border:1px solid #20395f;border-radius:11px;overflow:hidden}.dd-team-grid summary{list-style:none;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 12px;cursor:pointer;font-weight:850}.dd-team-grid summary::-webkit-details-marker{display:none}.dd-team-grid summary b{display:grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:#163150;color:#9fb7d4;font-size:10px}.dd-team-grid details>div{border-top:1px solid #20395f;padding:5px 10px}.dd-team-grid p{display:grid;grid-template-columns:42px 1fr auto;gap:8px;align-items:center;margin:0;padding:7px 2px;border-bottom:1px solid #142943;font-size:10px}.dd-team-grid p:last-child{border-bottom:0}.dd-team-grid p strong{color:#91a9c8}.dd-team-grid p span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-team-grid p em{font-style:normal;color:#7189aa;font-weight:900}.dd-team-grid p.mine{background:rgba(57,190,112,.1)}
      @media(max-width:1120px){.dd-command-grid{grid-template-columns:1fr}.dd-feed-scroll{height:520px}.dd-intel-scroll{height:560px}.dd-best-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){.dd-trade-summary{grid-template-columns:1fr 1fr}.dd-trade-sides{grid-template-columns:1fr}.dd-trade-sides .arrow{transform:rotate(90deg)}.dd-hero{display:block}.dd-hero .status{margin-top:10px}.dd-league-row{display:block}.dd-inline-status{margin-top:7px}.dd-controls{grid-template-columns:1fr 1fr}.dd-search{grid-column:1/-1}.dd-best-grid{grid-template-columns:1fr 1fr}.dd-section-title small{display:none}.dd-intel-head{align-items:flex-start!important;flex-direction:column}.dd-intel-actions{width:100%;justify-content:space-between}.dd-feed-row{grid-template-columns:54px minmax(0,1fr) 44px 30px 72px}.dd-board-grid{grid-template-columns:29px minmax(125px,1fr) 46px 47px 36px 38px}.dd-feed-scroll,.dd-intel-scroll{height:auto;max-height:620px}}
      @media(max-width:500px){.dd-best-grid{grid-template-columns:1fr}.dd-controls{grid-template-columns:1fr}.dd-controls button{width:100%}.dd-board-head span:nth-child(4),.dd-board-row>div:nth-child(4){display:none}.dd-board-grid{grid-template-columns:27px minmax(115px,1fr) 43px 34px 36px}}
    `}</style>
  </div>;
}
