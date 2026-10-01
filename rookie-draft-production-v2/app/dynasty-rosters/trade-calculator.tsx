"use client";

import {useEffect,useMemo,useState,type Dispatch,type SetStateAction} from "react";
import "./trade-calculator.css";

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
type TeamOption={rosterId:number;name:string};
type TeamAssets={rosterId:number;name:string;assets:{players:Asset[];picks:Asset[]}};
type TradeData={
  league:{key:string;name:string;leagueId:string};
  myTeam:TeamAssets;
  partnerTeam:TeamAssets;
  teams:TeamOption[];
  ktcUpdatedAt:string;
  pickValueNote:string;
};
type IdeaAsset=Asset&{preference?:string};
type TradeIdea={
  kind:string;youSend:IdeaAsset[];youGet:IdeaAsset[];
  sendValue:number;receiveValue:number;sendAdjusted:number;receiveAdjusted:number;
  differencePct:number;preferenceNote?:string;
};
type TradeIdeasPayload={
  myTeam:{name:string;rosterId:number};
  partnerTeam:{name:string;rosterId:number};
  ideas:TradeIdea[];
  preferencesApplied:number;
  ktcUpdatedAt:string;
  valueNote:string;
};

const numberFmt=new Intl.NumberFormat("en-US");

function fmtValue(value:number|null){
  return value==null?"N/A":numberFmt.format(value);
}

function fmtTime(value?:string){
  if(!value)return "";
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))return value;
  return new Date(parsed).toLocaleString("en-US",{
    timeZone:"America/New_York",
    month:"numeric",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",
  });
}

function sumSelected(assets:Asset[],selected:Set<string>){
  let total=0,unvalued=0,count=0;
  for(const asset of assets){
    if(!selected.has(asset.id))continue;
    count++;
    if(asset.value==null)unvalued++;
    else total+=asset.value;
  }
  return {total,unvalued,count};
}

function AssetList({
  title,assets,selected,onToggle,search,setSearch,
}:{
  title:string;assets:Asset[];selected:Set<string>;onToggle:(asset:Asset)=>void;
  search:string;setSearch:(value:string)=>void;
}){
  const query=search.trim().toLowerCase();
  const filtered=query?assets.filter(a=>(a.name+" "+a.detail).toLowerCase().includes(query)):assets;
  const players=filtered.filter(a=>a.type==="player");
  const picks=filtered.filter(a=>a.type==="pick");

  const rows=(items:Asset[],heading:string)=><>
    <div className="trade-asset-group-title"><span>{heading}</span><span>{items.length}</span></div>
    {items.length?items.map(asset=>{
      const checked=selected.has(asset.id);
      return <label className={"trade-asset-row "+(checked?"selected":"")} key={asset.id}>
        <input type="checkbox" checked={checked} onChange={()=>onToggle(asset)}/>
        <span className="trade-asset-main">
          <strong>{asset.name}</strong>
          <span>{asset.detail}</span>
        </span>
        <span className={"trade-asset-value "+(asset.value==null?"missing":"")} title={asset.valueLabel||"KTC value"}>
          {fmtValue(asset.value)}
        </span>
      </label>;
    }):<div className="trade-asset-empty">No {heading.toLowerCase()} match.</div>}
  </>;

  return <section className="trade-side">
    <div className="trade-side-head"><h3>{title}</h3><span>{selected.size} selected</span></div>
    <input
      className="trade-search"
      value={search}
      onChange={e=>setSearch(e.target.value)}
      placeholder="Search players or picks"
      aria-label={"Search "+title+" assets"}
    />
    <div className="trade-assets">
      {rows(players,"Players")}
      {rows(picks,"Draft Picks")}
    </div>
  </section>;
}

export default function TradeCalculator({leagueKey}:{leagueKey:string}){
  const [teams,setTeams]=useState<TeamOption[]>([]);
  const [myTeamName,setMyTeamName]=useState("Your Team");
  const [partnerId,setPartnerId]=useState("");
  const [data,setData]=useState<TradeData|null>(null);
  const [loadingTeams,setLoadingTeams]=useState(false);
  const [loadingAssets,setLoadingAssets]=useState(false);
  const [error,setError]=useState("");
  const [sendIds,setSendIds]=useState<Set<string>>(new Set());
  const [receiveIds,setReceiveIds]=useState<Set<string>>(new Set());
  const [sendSearch,setSendSearch]=useState("");
  const [receiveSearch,setReceiveSearch]=useState("");
  const [ideaData,setIdeaData]=useState<TradeIdeasPayload|null>(null);
  const [ideaLoading,setIdeaLoading]=useState(false);
  const [ideaError,setIdeaError]=useState("");

  useEffect(()=>{
    setPartnerId("");setData(null);setSendIds(new Set());setReceiveIds(new Set());setError("");setIdeaData(null);setIdeaError("");
    if(!leagueKey)return;
    let live=true;
    setLoadingTeams(true);
    fetch("/api/dynasty-rosters/trade?leagueKey="+encodeURIComponent(leagueKey),{cache:"no-store"})
      .then(async res=>{const body=await res.json();if(!res.ok)throw new Error(body?.error||"Could not load league teams");return body})
      .then(body=>{if(!live)return;setTeams(body?.teams||[]);setMyTeamName(body?.myTeam?.name||"Your Team")})
      .catch(e=>{if(live)setError(e?.message||"Could not load league teams")})
      .finally(()=>{if(live)setLoadingTeams(false)});
    return()=>{live=false};
  },[leagueKey]);

  async function choosePartner(value:string){
    setPartnerId(value);
    setData(null);setSendIds(new Set());setReceiveIds(new Set());setSendSearch("");setReceiveSearch("");setError("");setIdeaData(null);setIdeaError("");
    if(!value)return;
    setLoadingAssets(true);
    try{
      const res=await fetch("/api/dynasty-rosters/trade?leagueKey="+encodeURIComponent(leagueKey)+"&partnerRosterId="+encodeURIComponent(value),{cache:"no-store"});
      const body=await res.json();
      if(!res.ok)throw new Error(body?.error||body?.detail||"Could not load trade assets");
      setData(body);
    }catch(e:any){setError(e?.message||"Could not load trade assets")}
    finally{setLoadingAssets(false)}
  }

  function toggle(setter:Dispatch<SetStateAction<Set<string>>>,id:string){
    setter(current=>{
      const next=new Set(current);
      if(next.has(id))next.delete(id);else next.add(id);
      return next;
    });
  }

  async function generateIdeas(){
    if(!partnerId)return;
    setIdeaLoading(true);setIdeaError("");setIdeaData(null);
    try{
      const res=await fetch("/api/dynasty-rosters/trade-ideas",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({leagueKey,partnerRosterId:Number(partnerId)}),
      });
      const body=await res.json();
      if(!res.ok)throw new Error(body?.error||body?.detail||"Could not generate trade ideas");
      setIdeaData(body);
    }catch(e:any){
      setIdeaError(e?.message||"Could not generate trade ideas");
    }finally{
      setIdeaLoading(false);
    }
  }

  function closeIdeas(){
    setIdeaData(null);setIdeaError("");
  }

  function copyIdea(idea:TradeIdea){
    const send=idea.youSend.map(x=>x.name).join(" + ");
    const get=idea.youGet.map(x=>x.name).join(" + ");
    navigator.clipboard?.writeText(`I send: ${send}\nI receive: ${get}`);
  }

  const myAssets=useMemo(()=>data?[...data.myTeam.assets.players,...data.myTeam.assets.picks]:[],[data]);
  const partnerAssets=useMemo(()=>data?[...data.partnerTeam.assets.players,...data.partnerTeam.assets.picks]:[],[data]);
  const send=sumSelected(myAssets,sendIds);
  const receive=sumSelected(partnerAssets,receiveIds);
  const delta=receive.total-send.total;
  const anySelected=send.count+receive.count>0;

  return <>
    <section className="trade-calculator">
      <div className="trade-titlebar">
        <div>
          <div className="trade-kicker">Sleeper Trade Workspace</div>
          <h2>Trade Calculator</h2>
        </div>
        {data&&<div className="trade-ktc-time">KTC updated {fmtTime(data.ktcUpdatedAt)}</div>}
      </div>

      <div className="trade-controls">
        <label>
          <span>Trade With</span>
          <select value={partnerId} onChange={e=>void choosePartner(e.target.value)} disabled={loadingTeams}>
            <option value="">{loadingTeams?"Loading teams…":"Select a team"}</option>
            {teams.map(team=><option key={team.rosterId} value={team.rosterId}>{team.name}</option>)}
          </select>
        </label>
        <div className="trade-control-note">
          {partnerId?"Only assets owned by these two rosters are selectable.":"Choose a trade partner to lazy-load their players and current future picks."}
        </div>
        <div className="trade-control-actions">
          {partnerId&&<button className="trade-ideas-button" type="button" onClick={()=>void generateIdeas()} disabled={ideaLoading||loadingAssets}>
            {ideaLoading?"Generating…":"✦ Generate Trade Ideas"}
          </button>}
          {anySelected&&<button className="ghost trade-clear" type="button" onClick={()=>{setSendIds(new Set());setReceiveIds(new Set())}}>Clear Package</button>}
        </div>
      </div>

      {error&&<div className="trade-error">{error}</div>}
      {loadingAssets&&<div className="trade-loading">Loading this matchup’s players, picks, and KTC values…</div>}

      {data&&!loadingAssets&&<>
        <div className="trade-scoreboard" aria-live="polite">
          <div className="trade-score">
            <span>You Send</span>
            <strong>{numberFmt.format(send.total)}</strong>
            <small>{send.count} asset{send.count===1?"":"s"}{send.unvalued?" · "+send.unvalued+" unvalued":""}</small>
          </div>
          <div className="trade-delta">
            <span>Raw KTC Difference</span>
            <strong className={delta>0?"positive":delta<0?"negative":""}>{delta>0?"+":""}{numberFmt.format(delta)}</strong>
            <small>{numberFmt.format(receive.total)} received − {numberFmt.format(send.total)} sent</small>
          </div>
          <div className="trade-score">
            <span>You Receive</span>
            <strong>{numberFmt.format(receive.total)}</strong>
            <small>{receive.count} asset{receive.count===1?"":"s"}{receive.unvalued?" · "+receive.unvalued+" unvalued":""}</small>
          </div>
        </div>

        <div className="trade-columns">
          <AssetList
            title={"You Send · "+(data.myTeam.name||myTeamName)}
            assets={myAssets}
            selected={sendIds}
            onToggle={asset=>toggle(setSendIds,asset.id)}
            search={sendSearch}
            setSearch={setSendSearch}
          />
          <AssetList
            title={"You Receive · "+data.partnerTeam.name}
            assets={partnerAssets}
            selected={receiveIds}
            onToggle={asset=>toggle(setReceiveIds,asset.id)}
            search={receiveSearch}
            setSearch={setReceiveSearch}
          />
        </div>

        <div className="trade-footnote">
          <strong>Pick valuation:</strong> {data.pickValueNote} Player and pick totals are raw additive KTC values; no package-size adjustment is applied.
        </div>
      </>}
    </section>

    {(ideaData||ideaLoading||ideaError)&&<div className="roster-ideas-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!ideaLoading)closeIdeas()}}>
      <section className="roster-ideas-modal" role="dialog" aria-modal="true" aria-label="Roster trade ideas">
        <header>
          <div>
            <div className="trade-kicker">Preference-Aware Trade Ideas</div>
            <h2>{data?.myTeam.name||myTeamName} ↔ {data?.partnerTeam.name||"Trade Partner"}</h2>
            <p>Generated from current Sleeper ownership, KTC values, your future picks, and the willingness settings on this roster.</p>
          </div>
          <button type="button" className="roster-ideas-close" onClick={closeIdeas} disabled={ideaLoading}>×</button>
        </header>

        {ideaLoading?<div className="roster-ideas-loading">Building player-and-pick packages…</div>:ideaError?<div className="trade-error">{ideaError}</div>:ideaData?<div className="roster-ideas-body">
          <div className="roster-ideas-meta">
            <span>{ideaData.ideas.length} ideas</span>
            <span>{ideaData.preferencesApplied} custom preferences applied</span>
          </div>

          {ideaData.ideas.length?<div className="roster-ideas-list">{ideaData.ideas.map((idea,index)=><article key={index}>
            <div className="roster-idea-head">
              <strong>{idea.kind}</strong>
              <span>{idea.differencePct.toFixed(1)}% adjusted gap</span>
            </div>
            <div className="roster-idea-grid">
              <div>
                <small>YOU SEND</small>
                {idea.youSend.map((asset,i)=><p key={i}>
                  <span>
                    <b>{asset.name}</b>
                    {asset.type==="pick"&&<em>PICK</em>}
                    {asset.preference&&asset.preference!=="neutral"&&<em className={"pref-tag "+asset.preference}>{asset.preference.replace("-"," ")}</em>}
                  </span>
                  <strong>{fmtValue(asset.value)}</strong>
                </p>)}
                <footer>Raw {numberFmt.format(idea.sendValue)} · Adjusted {numberFmt.format(idea.sendAdjusted)}</footer>
              </div>
              <div className="roster-idea-arrow">→</div>
              <div>
                <small>YOU RECEIVE</small>
                {idea.youGet.map((asset,i)=><p key={i}>
                  <span><b>{asset.name}</b>{asset.type==="pick"&&<em>PICK</em>}</span>
                  <strong>{fmtValue(asset.value)}</strong>
                </p>)}
                <footer>Raw {numberFmt.format(idea.receiveValue)} · Adjusted {numberFmt.format(idea.receiveAdjusted)}</footer>
              </div>
            </div>
            {idea.preferenceNote&&<div className="roster-pref-note">{idea.preferenceNote}</div>}
            <button type="button" className="ghost roster-copy-idea" onClick={()=>copyIdea(idea)}>Copy trade</button>
          </article>)}</div>:<div className="trade-loading">No balanced ideas fit the current preferences. Try loosening a preference or choosing another partner.</div>}

          <div className="roster-ideas-note">{ideaData.valueNote}</div>
        </div>:null}
      </section>
    </div>}
  </>;
}
