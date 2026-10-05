"use client";
import {useEffect,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";

type Pos="QB"|"RB"|"WR"|"TE";
type Player={id:string|number;name:string;position:Pos;college?:string;draft_class:number;scouting_status:string;watch_order?:number;headshot_url?:string};
type NextGame={id:string;kickoff:string;opponent:string;venue:string;network:string;homeTeam:string;awayTeam:string};
const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const ALIAS:Record<string,string>={
  "miami fl":"miami florida","miami hurricanes":"miami florida","mia":"miami florida","miami oh":"miami ohio","miami redhawks":"miami ohio",
  "mizzou":"missouri","missouri tigers":"missouri","uconn":"connecticut","connecticut huskies":"connecticut","umass":"massachusetts",
  "massachusetts minutemen":"massachusetts","nc state":"north carolina state","n c state":"north carolina state","north carolina state wolfpack":"north carolina state",
  "usc":"southern california","usc trojans":"southern california","southern california trojans":"southern california","ole miss":"mississippi",
  "ole miss rebels":"mississippi","mississippi rebels":"mississippi","sam houston":"sam houston state","sam houston bearkats":"sam houston state",
  "ul monroe":"louisiana monroe","ulm":"louisiana monroe","louisiana monroe warhawks":"louisiana monroe","louisiana ragin cajuns":"louisiana",
  "cal":"california","california golden bears":"california","byu cougars":"byu","smu mustangs":"smu","utep miners":"utep","utsa roadrunners":"utsa",
  "fiu panthers":"fiu","uab blazers":"uab","ucf knights":"ucf","south florida bulls":"south florida","usf":"south florida",
  "texas a and m":"texas aandm","texas a m":"texas aandm","texas aggies":"texas aandm","app state":"appalachian state",
  "appalachian state mountaineers":"appalachian state","western kentucky hilltoppers":"western kentucky","wku":"western kentucky"
};
const norm=(s:any)=>{const x=String(s??"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");return ALIAS[x]||x};
const teamKeys=(c:any)=>new Set([c?.team?.location,c?.team?.displayName,c?.team?.shortDisplayName,c?.team?.name,c?.team?.abbreviation].filter(Boolean).map((x:any)=>norm(x)));
const teamName=(c:any)=>c?.team?.displayName||c?.team?.location||c?.team?.name||c?.team?.shortDisplayName||"Opponent";
function networkName(e:any){const comp=e?.competitions?.[0]||{},names=(comp.broadcasts||[]).flatMap((x:any)=>x.names||x.media?.shortName||[]).filter(Boolean);return names[0]||comp.geoBroadcasts?.[0]?.media?.shortName||comp.broadcast||"TBD"}
function weekRange(offset:number){const now=new Date(),dow=now.getDay(),back=(dow+3)%7,start=new Date(now);start.setHours(12,0,0,0);start.setDate(now.getDate()-back+offset*7);const end=new Date(start);end.setDate(start.getDate()+4);const fmt=(d:Date)=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;return {startKey:fmt(start),endKey:fmt(end)}}
function findGame(events:any[],college:string,after:number):NextGame|null{
  const target=norm(college);
  for(const e of [...events].sort((a,b)=>+new Date(a.date)-+new Date(b.date))){
    const kickoff=+new Date(e.date);if(!Number.isFinite(kickoff)||kickoff<after-4*3600000)continue;
    const competitors=e?.competitions?.[0]?.competitors||[];
    const mine=competitors.find((c:any)=>teamKeys(c).has(target));if(!mine)continue;
    const opponent=competitors.find((c:any)=>c!==mine);
    const home=competitors.find((c:any)=>c.homeAway==="home"),away=competitors.find((c:any)=>c.homeAway==="away");
    return {id:String(e.id),kickoff:e.date,opponent:teamName(opponent),venue:mine.homeAway==="away"?"at":"vs",network:networkName(e),homeTeam:teamName(home),awayTeam:teamName(away)};
  }
  return null;
}
function kickoffLabel(value:string){return new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))}
function PlayerHeadshot({player}:{player:Player}){const [failed,setFailed]=useState(false),initials=player.name.split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join("");return player.headshot_url&&!failed?<img src={player.headshot_url} alt="" onError={()=>setFailed(true)} style={{width:78,height:78,borderRadius:14,objectFit:"cover",objectPosition:"center top",background:"rgba(3,14,30,.24)",border:"1px solid rgba(255,255,255,.28)",flex:"0 0 auto"}}/>:<div aria-hidden="true" style={{width:78,height:78,borderRadius:14,display:"grid",placeItems:"center",fontSize:22,fontWeight:900,background:"rgba(3,14,30,.2)",border:"1px solid rgba(255,255,255,.22)",flex:"0 0 auto"}}>{initials}</div>}

export default function BestUnwatchedPlayerModal({open,onClose,draftClass=2027}:{open:boolean;onClose:()=>void;draftClass?:number}){
  const [best,setBest]=useState<Record<Pos,Player|null>>({QB:null,RB:null,WR:null,TE:null});
  const [games,setGames]=useState<Record<string,NextGame|null>>({});
  const [loading,setLoading]=useState(false),[error,setError]=useState("");

  useEffect(()=>{if(!open)return;let cancelled=false;setLoading(true);setError("");setGames({});setBest({QB:null,RB:null,WR:null,TE:null});
    (async()=>{try{
      const r=await fetch("/api/players",{cache:"no-store"});if(!r.ok)throw new Error("Could not load Players to Scout.");
      const rows=await r.json();if(!Array.isArray(rows))throw new Error("Invalid player response.");
      const chosen={} as Record<Pos,Player|null>;
      for(const pos of POSITIONS){
        const column=(rows as Player[]).filter(p=>p.draft_class===draftClass&&p.position===pos&&p.scouting_status!=="FINISHED"&&p.scouting_status!=="MAYBE").sort((a,b)=>(a.watch_order||0)-(b.watch_order||0)||String(a.name).localeCompare(String(b.name)));
        chosen[pos]=column.find(p=>p.scouting_status!=="WATCHED")||null;
      }
      if(cancelled)return;setBest(chosen);
      const unresolved=new Set(POSITIONS.filter(pos=>chosen[pos]?.college));
      const found:Record<string,NextGame|null>={};
      for(let offset=0;offset<12&&unresolved.size;offset++){
        const {startKey,endKey}=weekRange(offset),sr=await fetch(`/api/college-football?start=${startKey}&end=${endKey}`,{cache:"no-store"});
        if(!sr.ok)continue;const data=await sr.json(),events=Array.isArray(data?.events)?data.events:[];
        for(const pos of [...unresolved]){const p=chosen[pos];if(!p?.college){unresolved.delete(pos);continue}const game=findGame(events,p.college,Date.now());if(game){found[String(p.id)]=game;unresolved.delete(pos)}}
        if(!cancelled)setGames({...found});
      }
      for(const pos of POSITIONS){const p=chosen[pos];if(p&&!Object.prototype.hasOwnProperty.call(found,String(p.id)))found[String(p.id)]=null}
      if(!cancelled)setGames(found);
    }catch(e:any){if(!cancelled)setError(e?.message||"Could not calculate the best unwatched players.")}finally{if(!cancelled)setLoading(false)}})();
    return()=>{cancelled=true};
  },[open,draftClass]);

  async function watchLater(game:NextGame){await fetch("/api/watch-list",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:game.id,kickoff:game.kickoff,homeTeam:game.homeTeam,awayTeam:game.awayTeam})})}

  if(!open)return null;
  return <div className="watched-modal-backdrop" role="dialog" aria-modal="true" aria-label="Best Unwatched Player" onMouseDown={e=>e.target===e.currentTarget&&!loading&&onClose()}>
    <div className="watched-modal" style={{maxWidth:900}} onMouseDown={e=>e.stopPropagation()}>
      <div className="watched-modal-head"><div><span className="ey">{draftClass} · Scouting Tools</span><h2>Best Unwatched Player</h2><p>The first player in each Players to Scout position column who is not already on the active Scouting tab.</p></div><button className="small ghost" disabled={loading} onClick={onClose}>Close</button></div>
      {error&&<div className="notice">{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,padding:"14px 0 4px"}}>
        {POSITIONS.map(pos=>{const p=best[pos],game=p?games[String(p.id)]:undefined;return <section key={pos} className="school-coded" style={{...(p?schoolStyle(p.college):{}),borderRadius:14,padding:16,border:"1px solid rgba(255,255,255,.14)",minHeight:178}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><span className="pos">{pos}</span><span style={{fontSize:10,fontWeight:900,opacity:.72}}>{p?.watch_order!=null?`QUEUE #${p.watch_order}`:"QUEUE"}</span></div>
          {loading&&!p?<div className="watched-empty" style={{padding:"34px 0"}}>Finding best unwatched {pos}…</div>:p?<><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,marginTop:14}}><div style={{minWidth:0}}><h3 style={{fontSize:18,margin:"0 0 3px"}}>{p.name}</h3><div style={{fontSize:12,opacity:.8}}>{p.college||"College not set"}</div></div><PlayerHeadshot player={p}/></div><div style={{marginTop:16,paddingTop:13,borderTop:"1px solid rgba(255,255,255,.14)"}}><div className="ey" style={{marginBottom:5}}>NEXT GAME</div>{game?<div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12}}><div style={{minWidth:0}}><strong style={{display:"block",fontSize:14}}>{kickoffLabel(game.kickoff)}</strong><span style={{display:"block",marginTop:4,fontSize:12}}>{game.venue} {game.opponent}{game.network&&game.network!=="TBD"?` · ${game.network}`:""}</span></div><button type="button" className="ghost small" style={{flex:"0 0 auto"}} onClick={()=>watchLater(game)}>Watch Later</button></div>:game===null?<span style={{fontSize:12,opacity:.75}}>No future game found on the available schedule.</span>:<span style={{fontSize:12,opacity:.75}}>Checking schedule…</span>}</div></>:<div className="watched-empty" style={{padding:"34px 0"}}>No unwatched {pos} remains in this column.</div>}
        </section>})}
      </div>
      <div className="watched-footer" style={{marginTop:14}}><button className="success" disabled={loading} onClick={onClose}>{loading?"Loading schedules…":"Done"}</button></div>
    </div>
  </div>
}
