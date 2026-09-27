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

  useEffect(()=>{
    setPartnerId("");setData(null);setSendIds(new Set());setReceiveIds(new Set());setError("");
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
    setData(null);setSendIds(new Set());setReceiveIds(new Set());setSendSearch("");setReceiveSearch("");setError("");
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

  const myAssets=useMemo(()=>data?[...data.myTeam.assets.players,...data.myTeam.assets.picks]:[],[data]);
  const partnerAssets=useMemo(()=>data?[...data.partnerTeam.assets.players,...data.partnerTeam.assets.picks]:[],[data]);
  const send=sumSelected(myAssets,sendIds);
  const receive=sumSelected(partnerAssets,receiveIds);
  const delta=receive.total-send.total;
  const anySelected=send.count+receive.count>0;

  return <section className="trade-calculator">
    <div className="trade-titlebar">
      <div>
        <div className="trade-kicker">Dynasty Trade Workspace</div>
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
      {anySelected&&<button className="ghost trade-clear" type="button" onClick={()=>{setSendIds(new Set());setReceiveIds(new Set())}}>Clear Package</button>}
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
  </section>;
}
