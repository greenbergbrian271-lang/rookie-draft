import {cacheGet,cacheSetStrict} from "@/lib/cache";
const ESPN_SCORE="https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",ESPN_RANK="https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";
export const ymd=(d:Date)=>d.toISOString().slice(0,10).replace(/-/g,"");
// Kickoff times and rankings move during the week, so anything that is not already in the past is cached briefly.
const RANK_TTL=21600,PAST_TTL=604800,UPCOMING_TTL=10800;
const todayEt=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),part=(t:string)=>parts.find(p=>p.type===t)?.value||"";return part("year")+part("month")+part("day")};
const ttlForDay=(day:string)=>day<todayEt()?PAST_TTL:UPCOMING_TTL;
export function currentFootballWeek(){const now=new Date(),parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now),v=Object.fromEntries(parts.map(x=>[x.type,x.value])),base=new Date(Date.UTC(+v.year,+v.month-1,+v.day,16)),dow=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(v.weekday),back=(dow+3)%7,start=new Date(base);start.setUTCDate(base.getUTCDate()-back);const end=new Date(start);end.setUTCDate(start.getUTCDate()+4);return {start,end}}
export function nextFootballWeek(){const w=currentFootballWeek(),start=new Date(w.start);start.setUTCDate(start.getUTCDate()+7);const end=new Date(start);end.setUTCDate(start.getUTCDate()+4);return {start,end}}
async function eventsForDay(day:string){const batches=await Promise.all(["80","81"].map(async group=>{const q=new URLSearchParams({limit:"500",groups:group,seasontype:"2",dates:day}),r=await fetch(ESPN_SCORE+"?"+q,{cache:"no-store"});if(!r.ok)throw new Error("ESPN schedule "+r.status+" on "+day);return (await r.json()).events||[]}));const seen=new Set<string>();return batches.flat().filter((e:any)=>e?.id&&!seen.has(String(e.id))&&!!seen.add(String(e.id)))}
export async function saveRankings(){const r=await fetch(ESPN_RANK,{cache:"no-store"});if(!r.ok)throw new Error("ESPN rankings "+r.status);const rankings=(await r.json()).rankings||[];await cacheSetStrict("cfb:rankings",rankings,RANK_TTL);return rankings}
export async function syncDates(dates:string[],fresh=false){
 const unique=Array.from(new Set(dates.filter(day=>/^\d{8}$/.test(day)))).slice(0,20);
 const groups=await Promise.all(unique.map(async day=>{
  const key="cfb:schedule:day:"+day,cached=fresh?null:await cacheGet<any[]>(key);
  if(cached)return cached;
  const events=await eventsForDay(day);await cacheSetStrict(key,events,ttlForDay(day));return events;
 }));
 const seen=new Set<string>();return groups.flat().filter((event:any)=>event?.id&&!seen.has(String(event.id))&&!!seen.add(String(event.id)));
}
export async function syncRange(start:Date,end:Date){const events:any[]=[];for(let d=new Date(start);d<=end;d=new Date(d.getTime()+86400000)){const day=ymd(d),dayEvents=await eventsForDay(day);events.push(...dayEvents);await cacheSetStrict("cfb:schedule:day:"+day,dayEvents,ttlForDay(day))}const seen=new Set<string>(),unique=events.filter(e=>!seen.has(String(e.id))&&!!seen.add(String(e.id)));await cacheSetStrict("cfb:schedule:"+ymd(start)+":"+ymd(end),unique,ymd(end)<todayEt()?PAST_TTL:UPCOMING_TTL);return unique}
export async function syncFullSeason(){let total=0;for(let start=new Date(Date.UTC(2026,7,27,16));start<=new Date(Date.UTC(2026,11,17,16));start=new Date(start.getTime()+7*86400000)){const end=new Date(start);end.setUTCDate(start.getUTCDate()+4);total+=(await syncRange(start,end)).length}await saveRankings();return {events:total}}
export async function syncUpcomingWeek(){const {start,end}=nextFootballWeek(),events=await syncRange(start,end);await saveRankings();return {events:events.length,start:ymd(start),end:ymd(end)}}

// ---- Refresh helpers (homepage Refresh Schedule + the global platform refresh button) ----
export function pickPoll(rankings:any[]){const polls=Array.isArray(rankings)?rankings:[];const has=(r:any)=>Array.isArray(r?.ranks)&&r.ranks.length>0;return polls.find(r=>has(r)&&/college football playoff/i.test(r.name||r.shortName||""))||polls.find(r=>has(r)&&/AP Top 25/i.test(r.name||r.shortName||""))||polls.find(has)||null}
export function rankById(rankings:any[]){const m:Record<string,number>={},poll=pickPoll(rankings);for(const x of poll?.ranks||[]){const id=String(x.team?.id||"");const n=Number(x.current||x.rank||0);if(id&&n>=1&&n<=25)m[id]=n}return m}
export function diffRankings(prev:any[]|null,next:any[]){const a=rankById(prev||[]),b=rankById(next||[]);if(!prev||!prev.length)return 0;return Array.from(new Set([...Object.keys(a),...Object.keys(b)])).filter(id=>a[id]!==b[id]).length}
export function diffEvents(prev:any[]|null,next:any[]){if(!prev||!prev.length)return {kickoff:0,added:0};const before=new Map(prev.map((e:any)=>[String(e.id),e])),out={kickoff:0,added:0};for(const e of next){const old=before.get(String(e.id));if(!old){out.added++;continue}if(old.date!==e.date)out.kickoff++}return out}
export function pollLabel(rankings:any[]){const poll=pickPoll(rankings);return poll?String(poll.shortName||poll.name||"Poll"):""}
const withTimeout=<T,>(p:Promise<T>,ms:number,label:string)=>Promise.race([p,new Promise<T>((_,rej)=>setTimeout(()=>rej(new Error(label+" timed out")),ms))]);
export async function refreshCollegeData(days=10){
  const previousRankings=await cacheGet<any[]>("cfb:rankings");
  const rankings=await withTimeout(saveRankings(),15000,"ESPN rankings");
  const base=new Date(),list:string[]=[];for(let i=0;i<days;i++){const d=new Date(base.getTime()+i*86400000);list.push(new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York"}).format(d).replace(/-/g,""))}
  const unique=Array.from(new Set(list));
  const before=await Promise.all(unique.map(day=>cacheGet<any[]>("cfb:schedule:day:"+day)));
  const after=await withTimeout(Promise.all(unique.map(async day=>{const events=await eventsForDay(day);await cacheSetStrict("cfb:schedule:day:"+day,events,ttlForDay(day));return events})),40000,"ESPN schedule");
  let kickoff=0,added=0,games=0;after.forEach((events,i)=>{games+=events.length;const d=diffEvents(before[i],events);kickoff+=d.kickoff;added+=d.added});
  return {poll:pollLabel(rankings),rankedTeams:Object.keys(rankById(rankings)).length,rankChanges:diffRankings(previousRankings,rankings),games,days:unique.length,kickoffChanges:kickoff,newGames:added};
}
