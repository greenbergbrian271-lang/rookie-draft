"use client";
import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import styles from "../home.module.css";
import {useDraftClass} from "@/lib/use-draft-class";

const ALIAS:Record<string,string>={"miami fl":"miami florida","miami hurricanes":"miami florida","mia":"miami florida","miami oh":"miami ohio","miami redhawks":"miami ohio","mizzou":"missouri","missouri tigers":"missouri","uconn":"connecticut","connecticut huskies":"connecticut","umass":"massachusetts","massachusetts minutemen":"massachusetts","nc state":"north carolina state","n c state":"north carolina state","north carolina state wolfpack":"north carolina state","usc":"southern california","usc trojans":"southern california","southern california trojans":"southern california","ole miss":"mississippi","ole miss rebels":"mississippi","mississippi rebels":"mississippi","sam houston":"sam houston state","sam houston bearkats":"sam houston state","ul monroe":"louisiana monroe","ulm":"louisiana monroe","louisiana monroe warhawks":"louisiana monroe","louisiana ragin cajuns":"louisiana","cal":"california","california golden bears":"california","byu cougars":"byu","smu mustangs":"smu","utep miners":"utep","utsa roadrunners":"utsa","fiu panthers":"fiu","uab blazers":"uab","ucf knights":"ucf","south florida bulls":"south florida","usf":"south florida","texas a and m":"texas aandm","texas a m":"texas aandm","texas aggies":"texas aandm","app state":"appalachian state","appalachian state mountaineers":"appalachian state","western kentucky hilltoppers":"western kentucky","wku":"western kentucky"};
const norm=(s:any)=>{const x=String(s||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");return ALIAS[x]||x};
const POS:Record<string,number>={QB:0,RB:1,WR:2,TE:3};
const FBS_SCHOOLS=new Set(["Penn State","Georgia","Ole Miss","Texas","LSU","Oregon","Auburn","Illinois","Kentucky","Louisville","Miami (FL)","Mizzou","Oklahoma","Texas Tech","Arizona State","Duke","Houston","Indiana","Iowa","Northwestern","Ohio State","TCU","Tennessee","Texas A&M","Alabama","Arkansas","California","Florida","Florida State","Georgia Tech","Kansas State","Mississippi State","NC State","Notre Dame","Oklahoma State","SMU","South Carolina","USC","Vanderbilt","BYU","Clemson","Colorado","Colorado State","Fresno State","Memphis","Minnesota","Nebraska","North Dakota State","North Texas","Rutgers","Syracuse","UCLA","UNLV","Utah","UTSA","Virginia","Virginia Tech","Washington","West Virginia","Wisconsin","Arizona","Baylor","Bowling Green","Cincinnati","Delaware","Iowa State","Kansas","Liberty","Louisiana Tech","Michigan","Michigan State","Navy","Purdue","San Diego State","South Florida","Stanford","Temple","Texas State","Tulsa","UCF","UConn","Washington State","Western Michigan","Air Force","Akron","Appalachian State","Arkansas State","Army","Ball State","Boise State","Boston College","Buffalo","Central Michigan","Charlotte","Coastal Carolina","East Carolina","Eastern Michigan","FIU","Florida Atlantic","Georgia Southern","Georgia State","Hawaii","Jacksonville State","James Madison","Kennesaw State","Kent State","Louisiana","Marshall","Maryland","Massachusetts","Miami (OH)","Middle Tennessee","Missouri State","Nevada","New Mexico","New Mexico State","North Carolina","Northern Illinois","Ohio","Old Dominion","Oregon State","Pittsburgh","Rice","Sacramento State","Sam Houston State","San Jose State","South Alabama","Southern Miss","Toledo","Troy","Tulane","UAB","UL Monroe","Utah State","UTEP","Wake Forest","Western Kentucky","Wyoming"].map(norm));

function teamKeys(c:any){return new Set([c.team?.location,c.team?.displayName,c.team?.shortDisplayName,c.team?.name,c.team?.abbreviation].filter(Boolean).map(norm))}
function rankMap(rs:any[]){const poll=rs.find(r=>/college football playoff/i.test(r.name||r.shortName||""))||rs.find(r=>/AP Top 25/i.test(r.name||r.shortName||""));const m:Record<string,number>={};for(const x of poll?.ranks||[]){const t=x.team||x;for(const k of [t.location,t.displayName,t.name,t.abbreviation].filter(Boolean))m[norm(k)]=Number(x.current||x.rank||x.ranking)}return m}
function networkName(e:any){const comp=e.competitions?.[0]||{};const b=(comp.broadcasts||[]).flatMap((x:any)=>x.names||x.media?.shortName||[]).filter(Boolean);return b[0]||comp.geoBroadcasts?.[0]?.media?.shortName||comp.broadcast||"TBD"}
function dateKey(value:string){const d=new Date(value);return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")}

export default function Page(){
 const draftClass=useDraftClass();
 const [rows,setRows]=useState<any[]>([]),[events,setEvents]=useState<any[]>([]),[players,setPlayers]=useState<any[]>([]),[rankings,setRankings]=useState<any[]>([]),[loading,setLoading]=useState(true);

 useEffect(()=>{(async()=>{
  setLoading(true);
  try{
   const list=await fetch("/api/watch-list",{cache:"no-store"}).then(r=>r.json());
   const saved=Array.isArray(list)?list:[];
   setRows(saved);
   const days=Array.from(new Set(saved.map((x:any)=>dateKey(x.kickoff))));
   const [playerData,...scheduleData]=await Promise.all([
    fetch("/api/players",{cache:"no-store"}).then(r=>r.json()),
    ...days.map(day=>fetch("/api/college-football?start="+day+"&end="+day,{cache:"no-store"}).then(r=>r.json()).catch(()=>({events:[],rankings:[]})))
   ]);
   setPlayers(Array.isArray(playerData)?playerData:[]);
   const eventMap=new Map<string,any>();
   const allRankings:any[]=[];
   for(const payload of scheduleData){
    for(const event of payload?.events||[])eventMap.set(String(event.id),event);
    allRankings.push(...(payload?.rankings||[]));
   }
   setEvents(Array.from(eventMap.values()));
   setRankings(allRankings);
  }finally{setLoading(false)}
 })()},[]);

 const ranks=useMemo(()=>rankMap(rankings),[rankings]);
 const enriched=useMemo(()=>rows.map(x=>{
  const e=events.find((g:any)=>String(g.id)===String(x.espn_event_id));
  if(!e)return {...x,eventId:x.espn_event_id,title:x.away_team+" vs "+x.home_team,sides:[],network:"TBD",level:"FBS"};
  const comp=e.competitions?.[0]||{};
  const sides=(comp.competitors||[]).map((c:any)=>{
   const keys=teamKeys(c);
   const prospects=players.filter((p:any)=>p.draft_class===draftClass&&p.college&&keys.has(norm(p.college))).sort((a:any,b:any)=>(POS[a.position]??99)-(POS[b.position]??99)||String(a.name).localeCompare(String(b.name)));
   const rank=[...keys].map(k=>ranks[k]).find(Boolean);
   return {id:c.id||c.team?.id||c.team?.displayName,name:c.team?.displayName||c.team?.location||c.team?.name,logo:c.team?.logo||c.team?.logos?.[0]?.href||"",homeAway:c.homeAway,rank,prospects};
  });
  const rawSides=comp.competitors||[];
  const fbs=rawSides.some((c:any)=>[c.team?.location,c.team?.displayName,c.team?.shortDisplayName,c.team?.name].filter(Boolean).some((n:any)=>FBS_SCHOOLS.has(norm(String(n)))));
  return {...x,eventId:e.id||x.espn_event_id,title:e.shortName||e.name||x.away_team+" vs "+x.home_team,sides,network:networkName(e),level:fbs?"FBS":"Non-FBS"};
 }),[rows,events,players,ranks,draftClass]);

 async function remove(id:any){await fetch("/api/watch-list?id="+id,{method:"DELETE"});setRows(old=>old.filter(x=>x.id!==id))}
 async function watchNow(x:any){
  const home=x.sides.find((s:any)=>s.homeAway==="home")||{name:x.home_team,prospects:[]};
  const away=x.sides.find((s:any)=>s.homeAway==="away")||{name:x.away_team,prospects:[]};
  const date=new Date(x.kickoff).toLocaleDateString([],{month:"long",day:"numeric",year:"numeric"});
  const section=(s:any)=>s.name+"\n"+(s.prospects.length?s.prospects.map((p:any)=>"• "+(p.jersey_number?"#"+p.jersey_number+" ":"")+p.position+" "+p.name+"\n  ◦ ").join("\n"):"• No Draft Eligible Players");
  const title=(away?.name||x.away_team)+" vs "+(home?.name||x.home_team)+" - "+date;
  await fetch("/api/game-notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:x.eventId||x.espn_event_id,kickoff:x.kickoff,homeTeam:home?.name||x.home_team,awayTeam:away?.name||x.away_team,title,notes:section(away)+"\n\n"+section(home)})});
  location.href="/game-notes";
 }

 return <><div className="page-head"><div><h1>Watch List</h1><p className="muted">Games you saved to watch later, with the same scouting context as the homepage.</p></div></div>
 <div className={styles.schedule}>{enriched.map(x=><article className={styles.game} key={x.id}>
  <header className={styles.gameHeader}><div className={styles.gameTitle}>
   <div className="ey">{new Date(x.kickoff).toLocaleString([],{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div>
   <h2>{x.title}</h2>
   <div className={styles.broadcast}>Watch on <strong>{x.network}</strong> · {x.level}</div>
  </div><div className={styles.gameActions}><button className="success" onClick={()=>watchNow(x)}>Watch Now</button><button className="ghost" onClick={()=>remove(x.id)}>Remove</button></div></header>
  <div className={styles.matchup}>{x.sides.map((s:any)=><section className={styles.team} key={s.id||s.name}>
   <div className={styles.teamHead}><div className={styles.teamIdentity}>{s.logo&&<img src={s.logo} alt="" />}<strong>{s.rank?"#"+s.rank+" ":""}{s.name}</strong></div><span>{s.prospects.length} prospect{s.prospects.length===1?"":"s"}</span></div>
   {s.prospects.length?<div className={styles.prospects}>{s.prospects.map((p:any)=><span key={p.id} data-player-id={p.id} className="player-badge" style={schoolStyle(p.college)}>{p.jersey_number&&<>#{p.jersey_number} · </>}{p.position} · {p.name}</span>)}</div>:<div className={styles.none}>No Draft Eligible Players</div>}
  </section>)}</div>
 </article>)}</div>
 {loading&&<div className="card muted">Loading saved games…</div>}
 {!loading&&!rows.length&&<div className="card muted">No saved games yet. Choose Watch Later from the Home page.</div>}
 </>;
}
