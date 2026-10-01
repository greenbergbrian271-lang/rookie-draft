"use client";

import {useMemo,useState} from "react";

type TradePreference="actively-shopping"|"open"|"neutral"|"reluctant"|"untouchable";
type Asset={
  id:string;
  type:"player"|"pick";
  name:string;
  detail:string;
  value:number|null;
  valueLabel?:string;
  position?:string;
  team?:string;
  status?:string;
};
type Idea={
  partnerTeam:{rosterId:number;name:string};
  youSend:Asset[];
  youGet:Asset[];
  sendValue:number;
  receiveValue:number;
  sendAdjusted:number;
  receiveAdjusted:number;
  differencePct:number;
};
type IdeaPayload={
  selected:Asset[];
  ideas:Idea[];
  valueNote:string;
};

const fmt=new Intl.NumberFormat("en-US");

function prefKey(name:string){
  return String(name||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

function prefLabel(value:TradePreference){
  return value==="actively-shopping"?"Shopping":value==="open"?"Open":value==="reluctant"?"Reluctant":value==="untouchable"?"Untouchable":"Neutral";
}

function assetLabel(asset:Asset){
  return asset.type==="pick"&&asset.detail?asset.name+" · "+asset.detail:asset.name;
}

export default function RosterTradeIdeas({
  leagueKey,assets,preferences,loading=false,
}:{
  leagueKey:string;
  assets:{players:Asset[];picks:Asset[]};
  preferences:Record<string,TradePreference>;
  loading?:boolean;
}){
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [query,setQuery]=useState("");
  const [ideaData,setIdeaData]=useState<IdeaPayload|null>(null);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");

  const allAssets=useMemo(()=>[...(assets?.players||[]),...(assets?.picks||[])],[assets]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return q?allAssets.filter(asset=>(asset.name+" "+asset.detail).toLowerCase().includes(q)):allAssets;
  },[allAssets,query]);
  const players=filtered.filter(asset=>asset.type==="player");
  const picks=filtered.filter(asset=>asset.type==="pick");

  function close(){
    if(generating)return;
    setOpen(false);setSelected(new Set());setQuery("");setIdeaData(null);setError("");
  }

  function toggle(asset:Asset){
    if(asset.type==="player"&&preferences[prefKey(asset.name)]==="untouchable")return;
    setSelected(current=>{
      const next=new Set(current);
      if(next.has(asset.id))next.delete(asset.id);
      else if(next.size<4)next.add(asset.id);
      return next;
    });
    setIdeaData(null);setError("");
  }

  async function generate(){
    if(!selected.size)return;
    setGenerating(true);setError("");setIdeaData(null);
    try{
      const res=await fetch("/api/dynasty-rosters/trade-ideas/shop",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({leagueKey,selectedIds:[...selected]}),
      });
      const body=await res.json();
      if(!res.ok)throw new Error(body?.error||body?.detail||"Could not generate trade ideas");
      setIdeaData(body);
    }catch(e:any){
      setError(e?.message||"Could not generate trade ideas");
    }finally{
      setGenerating(false);
    }
  }

  function copyIdea(idea:Idea){
    const send=idea.youSend.map(assetLabel).join(" + ");
    const get=idea.youGet.map(assetLabel).join(" + ");
    navigator.clipboard?.writeText(`Trade with ${idea.partnerTeam.name}\nI send: ${send}\nI receive: ${get}`);
  }

  const rows=(items:Asset[],title:string)=><>
    <div className="shop-group-title"><span>{title}</span><span>{items.length}</span></div>
    {items.map(asset=>{
      const preference=asset.type==="player"?(preferences[prefKey(asset.name)]||"neutral") as TradePreference:"neutral";
      const untouchable=preference==="untouchable";
      const checked=selected.has(asset.id);
      return <label className={"shop-asset-row "+(checked?"selected ":"")+(untouchable?"disabled":"")} key={asset.id}>
        <input type="checkbox" checked={checked} disabled={untouchable} onChange={()=>toggle(asset)}/>
        <span className="shop-asset-copy">
          <strong>{asset.name}</strong>
          <small>{asset.detail||asset.position||""}</small>
        </span>
        {asset.type==="player"&&preference!=="neutral"&&<em className={"shop-pref "+preference}>{prefLabel(preference)}</em>}
        <b>{asset.value==null?"N/A":fmt.format(asset.value)}</b>
      </label>;
    })}
  </>;

  return <>
    <button className="roster-shop-button" type="button" onClick={()=>setOpen(true)} disabled={loading||!leagueKey}>
      ✦ Trade Ideas
    </button>

    {open&&<div className="roster-ideas-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)close()}}>
      <section className="roster-shop-modal" role="dialog" aria-modal="true" aria-label="League-wide trade ideas">
        <header>
          <div>
            <div className="trade-kicker">League-Wide Trade Ideas</div>
            <h2>What are you looking to move?</h2>
            <p>Select up to four players/picks. I’ll scan every other roster for balanced return packages.</p>
          </div>
          <button type="button" className="roster-ideas-close" onClick={close} disabled={generating}>×</button>
        </header>

        <div className="roster-shop-body">
          <div className="roster-shop-toolbar">
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your players or picks"/>
            <span>{selected.size}/4 selected</span>
            <button type="button" onClick={()=>void generate()} disabled={!selected.size||generating}>
              {generating?"Searching league…":"Generate Ideas"}
            </button>
          </div>

          {error&&<div className="trade-error">{error}</div>}

          {!ideaData?<div className="shop-asset-list">
            {rows(players,"Players")}
            {rows(picks,"Draft Picks")}
          </div>:<>
            <div className="shop-selected-summary">
              <div><span>Shopping</span><strong>{ideaData.selected.map(assetLabel).join(" + ")}</strong></div>
              <button type="button" className="ghost" onClick={()=>setIdeaData(null)}>Change assets</button>
            </div>

            {ideaData.ideas.length?<div className="shop-ideas-list">{ideaData.ideas.map((idea,index)=><article key={index}>
              <div className="shop-idea-head">
                <div>
                  <small>TRADE WITH</small>
                  <strong>{idea.partnerTeam.name}</strong>
                </div>
                <span>{idea.differencePct.toFixed(1)}% adjusted gap</span>
              </div>
              <div className="roster-idea-grid">
                <div>
                  <small>YOU SEND</small>
                  {idea.youSend.map((asset,i)=><p key={i}><span><b>{asset.name}</b>{asset.type==="pick"&&asset.detail&&<i className="pick-origin">{asset.detail}</i>}</span><strong>{asset.value==null?"N/A":fmt.format(asset.value)}</strong></p>)}
                  <footer>Raw {fmt.format(idea.sendValue)} · Adjusted {fmt.format(idea.sendAdjusted)}</footer>
                </div>
                <div className="roster-idea-arrow">→</div>
                <div>
                  <small>YOU RECEIVE</small>
                  {idea.youGet.map((asset,i)=><p key={i}><span><b>{asset.name}</b>{asset.type==="pick"&&asset.detail&&<i className="pick-origin">{asset.detail}</i>}</span><strong>{asset.value==null?"N/A":fmt.format(asset.value)}</strong></p>)}
                  <footer>Raw {fmt.format(idea.receiveValue)} · Adjusted {fmt.format(idea.receiveAdjusted)}</footer>
                </div>
              </div>
              <button type="button" className="ghost roster-copy-idea" onClick={()=>copyIdea(idea)}>Copy trade</button>
            </article>)}</div>:<div className="trade-loading">No balanced league-wide packages were found for these assets.</div>}

            <div className="roster-ideas-note">{ideaData.valueNote}</div>
          </>}
        </div>
      </section>
    </div>}
  </>;
}
