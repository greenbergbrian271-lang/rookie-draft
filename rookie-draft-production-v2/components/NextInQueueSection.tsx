"use client";
import {useEffect,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {usePlayerProfile} from "@/components/PlayerProfile";
import PlayerImage from "@/components/PlayerImage";
import styles from "@/app/home.module.css";

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
function findGame(events:any[],college:string,after:number):NextGame|null{const target=norm(college);for(const e of [...events].sort((a,b)=>+new Date(a.date)-+new Date(b.date))){const kickoff=+new Date(e.date);if(!Number.isFinite(kickoff)||kickoff<after-4*3600000)continue;const competitors=e?.competitions?.[0]?.competitors||[],mine=competitors.find((c:any)=>teamKeys(c).has(target));if(!mine)continue;const opponent=competitors.find((c:any)=>c!==mine),home=competitors.find((c:any)=>c.homeAway==="home"),away=competitors.find((c:any)=>c.homeAway==="away");return {id:String(e.id),kickoff:e.date,opponent:teamName(opponent),venue:mine.homeAway==="away"?"at":"vs",network:networkName(e),homeTeam:teamName(home),awayTeam:teamName(away)}}return null}
function kickoffLabel(value:string){return new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))}

export default function NextInQueueSection({players,draftClass,isLocked}:{players:Player[];draftClass:number;isLocked:boolean}){
  const {openPlayer}=usePlayerProfile(),[games,setGames]=useState<Record<string,NextGame|null>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[toast,setToast]=useState("");
  const best=Object.fromEntries(POSITIONS.map(pos=>[pos,players.filter(p=>p.draft_class===draftClass&&p.position===pos&&p.scouting_status==="TO_SCOUT").sort((a,b)=>(a.watch_order||9999)-(b.watch_order||9999)||String(a.name).localeCompare(String(b.name)))[0]||null])) as Record<Pos,Player|null>;
  const signature=POSITIONS.map(pos=>best[pos]?.id||"").join("|");

  useEffect(()=>{let cancelled=false;setGames({});setError("");setLoading(true);(async()=>{try{const unresolved=new Set(POSITIONS.filter(pos=>best[pos]?.college)),found:Record<string,NextGame|null>={};for(let offset=0;offset<12&&unresolved.size;offset++){const {startKey,endKey}=weekRange(offset),r=await fetch(`/api/college-football?start=${startKey}&end=${endKey}`,{cache:"no-store"});if(!r.ok)continue;const data=await r.json(),events=Array.isArray(data?.events)?data.events:[];for(const pos of [...unresolved]){const p=best[pos];if(!p?.college){unresolved.delete(pos);continue}const game=findGame(events,p.college,Date.now());if(game){found[String(p.id)]=game;unresolved.delete(pos)}}if(!cancelled)setGames({...found})}for(const pos of POSITIONS){const p=best[pos];if(p&&!Object.prototype.hasOwnProperty.call(found,String(p.id)))found[String(p.id)]=null}if(!cancelled)setGames(found)}catch(e:any){if(!cancelled)setError(e?.message||"Could not load upcoming games.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[draftClass,signature]);

  async function watchLater(game:NextGame){if(isLocked)return;const r=await fetch("/api/watch-list",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:game.id,kickoff:game.kickoff,homeTeam:game.homeTeam,awayTeam:game.awayTeam,draftClass})});if(!r.ok){setError("Could not add that game to the Watch List.");return}setToast("Added to Watch List");window.setTimeout(()=>setToast(""),2200)}

  return <section className={styles.nextQueueSection}>
    {toast&&<div className={styles.nextQueueToast}>✓ {toast}</div>}
    <div className={styles.nextQueueHead}><div><span className="ey">SCOUTING QUEUE</span><h2>Next in Queue by Position</h2><p>The highest player in each Players to Scout column who has not been watched yet.</p></div></div>
    {error&&<div className="notice">{error}</div>}
    <div className={styles.nextQueueGrid}>{POSITIONS.map(pos=>{const p=best[pos],game=p?games[String(p.id)]:undefined;return <article key={pos} className={styles.nextQueueCard} style={p?schoolStyle(p.college):undefined}>
      <div className={styles.nextQueueCardTop}><span className={styles.nextQueuePos}>{pos}</span><small>{p?.watch_order!=null?"QUEUE #"+p.watch_order:"QUEUE"}</small></div>
      {p?<><button type="button" className={styles.nextQueuePlayer} onClick={()=>openPlayer(p.id)} aria-label={"Open "+p.name+" player card"}><PlayerImage player={p} className={styles.nextQueuePhoto} initialsClassName={styles.nextQueuePhoto}/><span><strong>{p.name}</strong><small>{p.college||"College not set"}</small></span></button><div className={styles.nextQueueGame}><span>NEXT GAME</span>{game?<><strong>{kickoffLabel(game.kickoff)}</strong><small>{game.venue} {game.opponent}{game.network&&game.network!=="TBD"?" · "+game.network:""}</small>{!isLocked&&<button type="button" className="ghost small" onClick={()=>void watchLater(game)}>Watch Later</button>}</>:game===null?<small>No future game found on the available schedule.</small>:<small>{loading?"Checking schedule…":"Schedule unavailable."}</small>}</div></>:<div className={styles.nextQueueEmpty}>No unwatched {pos} remains.</div>}
    </article>})}</div>
  </section>
}
