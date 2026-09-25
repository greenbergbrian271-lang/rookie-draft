"use client";
import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import styles from "./home.module.css";

const ALIAS:Record<string,string>={
 "miami fl":"miami florida","miami hurricanes":"miami florida","mia":"miami florida",
 "miami oh":"miami ohio","miami redhawks":"miami ohio",
 "mizzou":"missouri","missouri tigers":"missouri","uconn":"connecticut","connecticut huskies":"connecticut",
 "umass":"massachusetts","massachusetts minutemen":"massachusetts","nc state":"north carolina state","n c state":"north carolina state","north carolina state wolfpack":"north carolina state",
 "usc":"southern california","usc trojans":"southern california","southern california trojans":"southern california",
 "ole miss":"mississippi","ole miss rebels":"mississippi","mississippi rebels":"mississippi",
 "sam houston":"sam houston state","sam houston bearkats":"sam houston state",
 "ul monroe":"louisiana monroe","ulm":"louisiana monroe","louisiana monroe warhawks":"louisiana monroe",
 "louisiana ragin cajuns":"louisiana","cal":"california","california golden bears":"california",
 "byu cougars":"byu","smu mustangs":"smu","utep miners":"utep","utsa roadrunners":"utsa","fiu panthers":"fiu","uab blazers":"uab",
 "ucf knights":"ucf","south florida bulls":"south florida","usf":"south florida","texas a and m":"texas aandm","texas a m":"texas aandm","texas aggies":"texas aandm",
 "app state":"appalachian state","appalachian state mountaineers":"appalachian state","western kentucky hilltoppers":"western kentucky","wku":"western kentucky"
};
const norm=(s:string)=>{const x=String(s||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");return ALIAS[x]||x};
function teamKeys(c:any){return new Set([c.team?.location,c.team?.displayName,c.team?.shortDisplayName,c.team?.name,c.team?.abbreviation].filter(Boolean).map((x:string)=>norm(x)))}
function label(c:any){return c.team?.displayName||c.team?.location||c.team?.name||c.team?.shortDisplayName||"Team"}
const POS_ORDER:Record<string,number>={QB:0,RB:1,WR:2,TE:3};
function logo(c:any){return c.team?.logo||c.team?.logos?.[0]?.href||""}
function dayKey(d:string){return new Date(d).toLocaleDateString([],{weekday:"long",month:"short",day:"numeric"})}
export default function Home(){
 const [events,setEvents]=useState<any[]>([]),[players,setPlayers]=useState<any[]>([]),[day,setDay]=useState("All");
 useEffect(()=>{const now=new Date(),dow=now.getDay(),toThu=(4-dow+7)%7,thu=new Date(now);thu.setDate(now.getDate()+toThu);const mon=new Date(thu);mon.setDate(thu.getDate()+4);const fmt=(d:Date)=>d.toISOString().slice(0,10).replace(/-/g,"");Promise.all([fetch("/api/college-football?dates="+fmt(thu)+"-"+fmt(mon)).then(r=>r.json()),fetch("/api/players",{cache:"no-store"}).then(r=>r.json())]).then(([g,p])=>{setEvents(g.events||[]);setPlayers(Array.isArray(p)?p:[])})},[]);
 const games=useMemo(()=>events.map(e=>{const competitors=e.competitions?.[0]?.competitors||[];const sides=competitors.map((c:any)=>{const keys=teamKeys(c);const prospects=players.filter(p=>p.draft_class===2027&&p.college&&keys.has(norm(p.college))).sort((a:any,b:any)=>(POS_ORDER[a.position]??99)-(POS_ORDER[b.position]??99)||String(a.name).localeCompare(String(b.name)));return {id:c.id||label(c),name:label(c),logo:logo(c),homeAway:c.homeAway,score:c.score,prospects}});return {...e,sides,prospects:sides.flatMap((s:any)=>s.prospects)}}).filter(e=>e.prospects.length).sort((a:any,b:any)=>+new Date(a.date)-+new Date(b.date)),[events,players]);
 const days=useMemo(()=>["All",...Array.from(new Set(games.map((g:any)=>dayKey(g.date))))],[games]);const visible=day==="All"?games:games.filter((g:any)=>dayKey(g.date)===day);
 return <><div className="page-head"><div><div className="ey">2027 scouting schedule</div><h1>Rookie Draft Scouting System</h1><p className="muted">Upcoming games are joined to prospects by exact canonical school identity. There is no substring or fuzzy matching.</p></div></div><div className={styles.filters}>{days.map(d=><button key={d} className={day===d?"success":"ghost"} onClick={()=>setDay(d)}>{d==="All"?"All games":d}</button>)}</div><div className={styles.schedule}>{visible.map(g=><article className={styles.game} key={g.id}><header><div className="ey">{new Date(g.date).toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div><h2>{g.shortName||g.name}</h2></header><div className={styles.matchup}>{g.sides.map((s:any)=><section className={styles.team} key={s.id}><div className={styles.teamHead}><div className={styles.teamIdentity}>{s.logo&&<img src={s.logo} alt="" />}<strong>{s.name}</strong></div><span>{s.prospects.length} prospect{s.prospects.length===1?"":"s"}</span></div>{s.prospects.length?<div className={styles.prospects}>{s.prospects.map((p:any)=><span key={p.id} className="player-badge" style={schoolStyle(p.college)}>{p.position} · {p.name}</span>)}</div>:<div className={styles.none}>No 2027 prospects</div>}</section>)}</div></article>)}</div>{!visible.length&&<div className="card muted">No upcoming games currently match the 2027 scouting pool.</div>}</>
}
