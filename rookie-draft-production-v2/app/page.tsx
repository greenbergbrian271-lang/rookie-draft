"use client";import {useEffect,useMemo,useState} from "react";import {schoolStyle} from "@/lib/school-colors";
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
 "byu cougars":"byu","smu mustangs":"smu","utep miners":"utep","utsa roadrunners":"utsa","fiu panthers":"fiu","uab blazers":"uab"
};
const norm=(s:string)=>{const x=String(s||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");return ALIAS[x]||x};
function teamKeys(c:any){return new Set([c.team?.location,c.team?.displayName,c.team?.shortDisplayName,c.team?.name,c.team?.abbreviation].filter(Boolean).map((x:string)=>norm(x)))}
export default function Home(){const [events,setEvents]=useState<any[]>([]),[players,setPlayers]=useState<any[]>([]);useEffect(()=>{Promise.all([fetch("/api/college-football").then(r=>r.json()),fetch("/api/players",{cache:"no-store"}).then(r=>r.json())]).then(([g,p])=>{setEvents(g.events||[]);setPlayers(Array.isArray(p)?p:[])})},[]);const games=useMemo(()=>events.map(e=>{const competitors=e.competitions?.[0]?.competitors||[];const keys=competitors.map((c:any)=>teamKeys(c));const prospects=players.filter(p=>{if(p.draft_class!==2027||!p.college)return false;const school=norm(p.college);return keys.some((k:Set<string>)=>k.has(school))});return {...e,prospects}}).filter(e=>e.prospects.length),[events,players]);return <><h1>Rookie Draft Scouting System</h1><p className="muted">Upcoming college football games containing players in your 2027 scouting pool. Schedule cards require an exact canonical school identity match; substring and fuzzy matching are not used.</p><div className="grid">{games.map(g=><div className="card" key={g.id}><div className="ey">{new Date(g.date).toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div><h2>{g.shortName||g.name}</h2><div className="row-actions">{g.prospects.map((p:any)=><span key={p.id} className="player-badge" style={schoolStyle(p.college)}>{p.position} · {p.name}</span>)}</div></div>)}</div>{!games.length&&<div className="card muted">No upcoming games currently match the 2027 scouting pool.</div>}</>}
