"use client";

import {useState} from "react";

type Asset={id:string;type:"player"|"pick";name:string;detail:string;value:number|null;position?:string;team?:string};
type Idea={partnerTeam:{rosterId:number;name:string};youSend:Asset[];youGet:Asset[];sendValue:number;receiveValue:number;sendAdjusted:number;receiveAdjusted:number;differencePct:number;fitNote?:string};
const fmt=new Intl.NumberFormat("en-US");

export default function ShopPlayerButton({leagueKey,asset}:{leagueKey:string;asset:Asset}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[ideas,setIdeas]=useState<Idea[]>([]),[error,setError]=useState("");

  async function shop(){
    setOpen(true);setLoading(true);setError("");setIdeas([]);
    try{
      const r=await fetch("/api/dynasty-rosters/trade-ideas/shop",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey,selectedIds:[asset.id]})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not shop player");setIdeas(j?.ideas||[]);
    }catch(e:any){setError(e?.message||"Could not shop player")}finally{setLoading(false)}
  }

  return <>
    <button type="button" className="shop-player-row-button" onClick={()=>void shop()} title={"Find the best trade destinations for "+asset.name}>Shop</button>
    {open&&<div className="roster-ideas-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!loading)setOpen(false)}}>
      <section className="roster-shop-modal" role="dialog" aria-modal="true" aria-label={"Shop "+asset.name}>
        <header><div><div className="trade-kicker">Who Should I Shop Him To?</div><h2>{asset.name}</h2><p>Destinations are ranked using KTC value, current Sleeper ownership and each team's league-relative need at {asset.position||"the position"}.</p></div><button className="roster-ideas-close" onClick={()=>setOpen(false)}>×</button></header>
        <div className="roster-shop-body">
          {loading?<div className="trade-loading">Scanning every roster…</div>:error?<div className="trade-error">{error}</div>:ideas.length?<div className="shop-ideas-list">{ideas.slice(0,8).map((idea,i)=><article key={i}>
            <div className="shop-idea-head"><div><small>BEST DESTINATION</small><strong>{idea.partnerTeam.name}</strong>{idea.fitNote&&<small className="muted">{idea.fitNote}</small>}</div><span>{idea.differencePct.toFixed(1)}% adjusted gap</span></div>
            <div className="roster-idea-grid"><div><small>YOU SEND</small><p><span><b>{asset.name}</b></span><strong>{asset.value==null?"N/A":fmt.format(asset.value)}</strong></p></div><div className="roster-idea-arrow">→</div><div><small>YOU RECEIVE</small>{idea.youGet.map((a,j)=><p key={j}><span><b>{a.name}</b></span><strong>{a.value==null?"N/A":fmt.format(a.value)}</strong></p>)}</div></div>
          </article>)}</div>:<div className="trade-loading">No balanced destinations were found.</div>}
        </div>
      </section>
    </div>}
    <style jsx global>{`
      .shop-player-row-button{margin-left:6px;padding:5px 7px!important;background:#18395d!important;border:1px solid #315f95!important;color:#a9d2ff!important;border-radius:6px!important;font-size:9px!important;font-weight:900!important}
      .shop-player-row-button:hover{background:#214d7c!important;color:#fff!important}
    `}</style>
  </>;
}
