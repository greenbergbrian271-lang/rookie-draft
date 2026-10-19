"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from "react";
import NflModeToggle from "@/components/NflModeToggle";
import {usePlayerProfile} from "@/components/PlayerProfile";
import PlayerXSearch from "@/components/PlayerXSearch";

export type NflPlayerRef={name:string;position?:string;team?:string;sleeperId?:string};
type Ctx={openNflPlayer:(ref:NflPlayerRef)=>void};
const C=createContext<Ctx>({openNflPlayer:()=>{}});
export function useNflPlayerCard(){return useContext(C)}

const TABS=["Summary","History","Stats","Team","Game Log","Availability"] as const;
type Tab=typeof TABS[number];

const dash="—";
const f2=(x:any)=>x==null||!Number.isFinite(Number(x))?dash:Number(x).toFixed(2);
const f1=(x:any)=>x==null||!Number.isFinite(Number(x))?dash:Number(x).toFixed(1);
const int=(x:any)=>x==null||!Number.isFinite(Number(x))?dash:String(Math.round(Number(x)));
const ordinal=(x:any)=>x==null?dash:"#"+x;

function heightLabel(h:any){
  const n=Number(h);
  if(!Number.isFinite(n)||n<=0)return null;
  return `${Math.floor(n/12)}' ${n%12}"`;
}

export function NflPlayerCardProvider({children}:{children:React.ReactNode}){
  const {openPlayer}=usePlayerProfile();
  const [ref,setRef]=useState<NflPlayerRef|null>(null);
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [tab,setTab]=useState<Tab>("Summary");
  const [league,setLeague]=useState("");

  const openNflPlayer=useCallback((r:NflPlayerRef)=>{setRef(r);setTab("Summary")},[]);

  // open from anywhere: window event (React pages, college card toggle) or postMessage (War Room iframe)
  useEffect(()=>{
    const onEvent=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.name||d?.sleeperId)openNflPlayer(d)};
    const onMessage=(e:MessageEvent)=>{
      if(e.origin!==window.location.origin)return;
      const m=e.data;
      if(m&&m.type==="nfl-card:open"&&(m.name||m.sleeperId))openNflPlayer({name:m.name,position:m.position,team:m.team,sleeperId:m.sleeperId});
    };
    window.addEventListener("nfl-card:open",onEvent);
    window.addEventListener("message",onMessage);
    return()=>{window.removeEventListener("nfl-card:open",onEvent);window.removeEventListener("message",onMessage)};
  },[openNflPlayer]);

  useEffect(()=>{
    if(!ref)return;
    let live=true;
    setLoading(true);setError("");setData(null);
    const q=new URLSearchParams();
    if(ref.sleeperId)q.set("sleeperId",ref.sleeperId);
    if(ref.name)q.set("name",ref.name);
    if(ref.position)q.set("position",ref.position);
    if(ref.team)q.set("team",ref.team);
    fetch("/api/nfl-card?"+q.toString(),{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.detail||j?.error||"Could not load player");return j})
      .then(j=>{if(!live)return;setData(j);setLeague(cur=>(j.leagues||[]).some((l:any)=>l.key===cur)?cur:(j.leagues?.[0]?.key||""))})
      .catch(e=>{if(live)setError(e?.message||"Could not load player")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[ref]);

  const close=()=>{setRef(null);setData(null)};
  const toCollege=()=>{
    if(!data?.collegePlayerId)return;
    const back={name:data.player?.name||ref?.name||data.name||"",position:data.player?.position||ref?.position,team:data.player?.team||ref?.team,sleeperId:data.player?.id};
    close();
    openPlayer(data.collegePlayerId,back);
  };

  return <C.Provider value={{openNflPlayer}}>
    {children}
    {ref&&<div className="nfc-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}>
      <div className="nfc-modal" role="dialog" aria-label="NFL player card">
        <button className="nfc-close" onClick={close} aria-label="Close">×</button>
        <NflModeToggle mode="nfl" showNcaa={Boolean(data?.collegePlayerId)} onNfl={()=>{}} onNcaa={toCollege}/>
        {loading&&!data&&<div className="nfc-empty">Loading NFL player card…</div>}
        {error&&<div className="nfc-empty nfc-err">{error}</div>}
        {data&&data.found===false&&<NotFound data={data}/>}
        {data?.found&&<Card d={data} tab={tab} setTab={setTab} league={league} setLeague={setLeague} open={openNflPlayer}/>}
      </div>
    </div>}
    <NflCardStyles/>
  </C.Provider>;
}

function NotFound({data}:{data:any}){
  return <div className="nfc-pane"><h2>{data.name||"Player"}</h2>
    <div className="nfc-empty">No NFL profile was found for this player in Sleeper{data.collegePlayerId?" — use the NCAA toggle above to see the college card.":"."} This usually means a draft prospect who hasn't been added to an NFL roster yet.</div></div>;
}

function Card({d,tab,setTab,league,setLeague,open}:{d:any;tab:Tab;setTab:(t:Tab)=>void;league:string;setLeague:(k:string)=>void;open:(r:NflPlayerRef)=>void}){
  const p=d.player;
  const meta=[p.position,p.team,p.number!=null?"#"+p.number:null,heightLabel(p.height),p.weight?p.weight+" lbs":null,p.age?p.age+" yrs":null,p.yearsExp!=null?(Number(p.yearsExp)===0?"Rookie":p.yearsExp+" yr exp"):null,p.college].filter(Boolean).join(" · ");
  return <>
    <div className="nfc-hero">
      <div className="nfc-photo"><img src={p.headshot} alt={p.name} onError={e=>{e.currentTarget.style.visibility="hidden"}}/>{p.teamLogo&&<img className="nfc-teamlogo" src={p.teamLogo} alt={p.team||""} onError={e=>{e.currentTarget.style.display="none"}}/>}</div>
      <div className="nfc-id">
        <div className="nfc-ey">{meta}</div>
        <h1>{p.name}</h1>
        <div className="nfc-sub">{d.seasonLabel} season{p.injury?<span className="nfc-injury">{p.injury.status}{p.injury.bodyPart?" · "+p.injury.bodyPart:""}</span>:null}{!p.team&&<span className="nfc-injury">Free agent</span>}</div>
        <div style={{marginTop:8}}><PlayerXSearch name={p.name} context={p.team}/></div>
      </div>
      {d.leagues?.length>0&&<label className="nfc-league"><span>League</span>
        <select value={league} onChange={e=>setLeague(e.target.value)} aria-label="League (scoring and rosters)">{d.leagues.map((l:any)=><option key={l.key} value={l.key}>{l.name}</option>)}</select></label>}
    </div>
    <div className="nfc-tabs">{TABS.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="Summary"&&<Summary d={d} league={league} setLeague={setLeague}/>}
    {tab==="History"&&<History d={d} league={league} setLeague={setLeague}/>}
    {tab==="Stats"&&<Stats d={d} league={league} setLeague={setLeague}/>}
    {tab==="Team"&&<Team d={d} league={league} setLeague={setLeague} open={open}/>}
    {tab==="Game Log"&&<GameLog d={d} league={league}/>}
    {tab==="Availability"&&<Availability d={d}/>}
  </>;
}

function Tile({label,value,sub}:{label:string;value:string;sub?:string}){
  return <div className="nfc-tile"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>;
}

function Summary({d,league,setLeague}:{d:any;league:string;setLeague:(k:string)=>void}){
  const s=d.perLeague?.[league];
  const t=d.totals||{};
  const g=d.nextGame;
  const when=g?.date&&!Number.isNaN(new Date(g.date).getTime())?new Date(g.date).toLocaleString([],{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):null;
  const snapshot:[string,string][]=[];
  if(t.pass_att>0)snapshot.push(["Passing",`${int(t.pass_cmp)}/${int(t.pass_att)} · ${int(t.pass_yd)} yds · ${int(t.pass_td)} TD · ${int(t.pass_int)} INT`]);
  if(t.rush_att>0)snapshot.push(["Rushing",`${int(t.rush_att)} car · ${int(t.rush_yd)} yds · ${int(t.rush_td)} TD`]);
  if(t.rec_tgt>0||t.rec>0)snapshot.push(["Receiving",`${int(t.rec)} rec · ${int(t.rec_tgt)} tgt · ${int(t.rec_yd)} yds · ${int(t.rec_td)} TD`]);
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>Fantasy Production</h2></div>
    <div className="nfc-tiles">
      <Tile label="OVR Rank" value={ordinal(s?.ovrRank)} sub={s?.ovrCount?`of ${s.ovrCount} QB/RB/WR/TE`:undefined}/>
      <Tile label="POS Rank" value={s?.posRank!=null?d.player.position+s.posRank:dash} sub={s?.posCount?`of ${s.posCount} ${d.player.position}s`:undefined}/>
      <Tile label="Fantasy Pts / Game" value={f2(s?.ppg)} sub={s?`${f1(s.pts)} pts · ${s.gp} GP`:undefined}/>
    </div>
    <div className="nfc-two">
      <section className="nfc-card"><h3>Upcoming Game</h3>
        {g?<div className="nfc-next">
          <img src={`https://sleepercdn.com/images/team_logos/nfl/${String(g.opp).toLowerCase()}.png`} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>
          <div><strong>{g.home?"vs":"@"} {g.opp}</strong><span>Week {g.week}{when?" · "+when:""}</span>{g.byeWeek?<em>Bye this week (week {g.byeWeek})</em>:null}</div>
        </div>:<div className="nfc-muted">No upcoming game found{d.player.team?"":" — this player isn't on an NFL team"}.</div>}
      </section>
      <section className="nfc-card"><h3>{d.seasonLabel} Season Line</h3>
        {snapshot.length?snapshot.map(([k,v])=><div className="nfc-line" key={k}><span>{k}</span><b>{v}</b></div>):<div className="nfc-muted">No offensive stats recorded this season.</div>}
      </section>
    </div>
  </div>;
}

const KIND_CLASS:Record<string,string>={Trade:"trade",Waiver:"add",["Free Agent"]:"add",Drop:"drop",Draft:"draft",Commissioner:"comm"};

function History({d,league,setLeague}:{d:any;league:string;setLeague:(k:string)=>void}){
  const [h,setH]=useState<any>(null);
  const [error,setError]=useState("");
  const id=d.player.id;
  useEffect(()=>{
    let live=true;setH(null);setError("");
    fetch("/api/nfl-card/history?sleeperId="+encodeURIComponent(id),{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j?.detail||j?.error||"Could not load history");return j})
      .then(j=>{if(live)setH(j)}).catch(e=>{if(live)setError(e?.message||"Could not load history")});
    return()=>{live=false};
  },[id]);
  const events:any[]=h?.history?.[league]||[];
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>History</h2></div>
    {error&&<div className="nfc-empty nfc-err">{error}</div>}
    {!h&&!error&&<div className="nfc-empty">Loading transactions…</div>}
    {h&&(events.length?<div className="nfc-timeline">{events.map((e,i)=>
      <div className={"nfc-tl "+(KIND_CLASS[e.kind]||"")+(e.involvesMe?" mine":"")} key={i}>
        <i/>
        <div><span className="nfc-when">{e.ts?new Date(e.ts).toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"}):`${e.season}`} · {e.kind}{e.involvesMe?" · involves you":""}</span>
          <b>{e.title}</b>{e.detail&&<p>{e.detail}</p>}</div>
      </div>)}</div>
      :<div className="nfc-empty">No transactions found for this player in this league. History covers this league and up to two prior seasons.</div>)}
  </div>;
}

function Stats({d,league,setLeague}:{d:any;league:string;setLeague:(k:string)=>void}){
  const s=d.perLeague?.[league];
  const t=d.totals||{};
  const rowsRaw:[string,any][]=[["Pass Cmp/Att",t.pass_att?`${int(t.pass_cmp)}/${int(t.pass_att)}`:null],["Pass Yds",t.pass_att?int(t.pass_yd):null],["Pass TD",t.pass_att?int(t.pass_td):null],["INT",t.pass_att?int(t.pass_int):null],
    ["Rush Att",t.rush_att?int(t.rush_att):null],["Rush Yds",t.rush_att?int(t.rush_yd):null],["Rush TD",t.rush_att?int(t.rush_td):null],
    ["Targets",t.rec_tgt?int(t.rec_tgt):null],["Receptions",t.rec?int(t.rec):null],["Rec Yds",t.rec?int(t.rec_yd):null],["Rec TD",t.rec?int(t.rec_td):null],["Fumbles Lost",t.fum_lost?int(t.fum_lost):null]];
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>Stats · {d.seasonLabel}</h2></div>
    <div className="nfc-note">Points, per-game average and ranks recalculate from the selected league's scoring settings.</div>
    <div className="nfc-tiles four">
      <Tile label="Fantasy Points" value={f1(s?.pts)}/>
      <Tile label="Fantasy Pts / Game" value={f2(s?.ppg)} sub={s?`${s.gp} games`:undefined}/>
      <Tile label="Overall Rank" value={ordinal(s?.ovrRank)} sub={s?.ovrCount?`of ${s.ovrCount}`:undefined}/>
      <Tile label="Position Rank" value={s?.posRank!=null?d.player.position+s.posRank:dash} sub={s?.posCount?`of ${s.posCount}`:undefined}/>
    </div>
    <div className="nfc-two">
      <section className="nfc-card"><h3>All Leagues</h3>
        <table className="nfc-table"><thead><tr><th>League</th><th>FP</th><th>FP/G</th><th>OVR</th><th>POS</th></tr></thead>
          <tbody>{d.leagues.map((l:any)=>{const x=d.perLeague[l.key];return <tr key={l.key} className={l.key===league?"sel":""}><td>{l.name}</td><td>{f1(x?.pts)}</td><td>{f2(x?.ppg)}</td><td>{ordinal(x?.ovrRank)}</td><td>{x?.posRank!=null?d.player.position+x.posRank:dash}</td></tr>})}</tbody></table>
      </section>
      <section className="nfc-card"><h3>Season Totals</h3>
        {rowsRaw.filter(r=>r[1]!=null).length?rowsRaw.filter(r=>r[1]!=null).map(([k,v])=><div className="nfc-line" key={k}><span>{k}</span><b>{v}</b></div>):<div className="nfc-muted">No stats recorded this season.</div>}
      </section>
    </div>
  </div>;
}

function rankColor(rank:number|null,total:number){
  if(rank==null||total<2)return undefined;
  const t=Math.min(1,Math.max(0,(rank-1)/(total-1)));
  const hue=Math.round(120*(1-t));
  return {background:`hsla(${hue},62%,30%,.62)`,borderColor:`hsla(${hue},70%,48%,.8)`} as React.CSSProperties;
}

function Team({d,league,open}:{d:any;league:string;setLeague:(k:string)=>void;open:(r:NflPlayerRef)=>void}){
  const [onlyStats,setOnlyStats]=useState(true);
  const all:any[]=d.teammates?.[league]||[];
  const mates=onlyStats?all.filter(m=>m.isSelf||m.gp>0):all;
  const tr=d.teamRanks;
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>{d.player.team||"No team"} · Offense</h2></div>
    {tr?.games>0?<>
      <div className="nfc-note">Team ranks among {tr.teams} teams by per-game average (green = 1st, red = last), built from QB/RB/WR/TE player stats ({tr.games} games).</div>
      <div className="nfc-teamranks">{tr.rows.map((r:any)=><div key={r.key} className="nfc-rankcard" style={rankColor(r.rank,tr.teams)}><span>{r.label}</span><strong>{r.rank!=null?"#"+r.rank:dash}</strong><small>{r.value!=null?`${r.value.toLocaleString()} total · ${f1(r.perGame)}/g`:""}</small></div>)}</div>
    </>:<div className="nfc-muted">Team ranks aren't available (no games found for this team).</div>}

    <div className="nfc-h3row"><h3 className="nfc-h3">Fantasy-Eligible Teammates <small>(position ranks use selected league scoring)</small></h3>
      <label className="nfc-check"><input type="checkbox" checked={onlyStats} onChange={e=>setOnlyStats(e.target.checked)}/> Only players with stats</label></div>
    {mates.length?<div className="nfc-scroll"><table className="nfc-table"><thead><tr><th>Pos</th><th>Player</th><th>GP</th><th>FP</th><th>FP/G</th><th>POS Rank</th></tr></thead>
      <tbody>{mates.map(m=><tr key={m.id} className={m.isSelf?"sel":""}>
        <td><span className={"nfc-pos "+m.position}>{m.position}</span></td>
        <td>{m.isSelf?<b>{m.name}</b>:<button className="nfc-link" onClick={()=>open({sleeperId:m.id,name:m.name,position:m.position})}>{m.name}</button>}{m.injury&&<span className="nfc-inj">{m.injury}</span>}</td>
        <td>{m.gp||dash}</td><td>{f1(m.pts)}</td><td>{f2(m.ppg)}</td><td>{m.posRank!=null?m.position+m.posRank:dash}</td></tr>)}</tbody></table></div>
      :<div className="nfc-muted">No fantasy-eligible teammates found.</div>}
  </div>;
}

function GameLog({d,league}:{d:any;league:string}){
  const leagueName=d.leagues?.find((l:any)=>l.key===league)?.name;
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>Game Log · {d.seasonLabel}</h2></div>
    <div className="nfc-note">Fantasy points use {leagueName||"the selected league"}'s scoring.</div>
    <div className="nfc-scroll"><table className="nfc-table"><thead><tr><th>Wk</th><th>Opp</th><th>Stat Line</th><th>FP</th></tr></thead>
      <tbody>{d.gameLog.map((g:any)=><tr key={g.week} className={!g.played?"dim":""}>
        <td>{g.week}</td>
        <td>{g.bye?"BYE":g.opp?`${g.home===false?"@":g.home?"vs":""} ${g.opp}`.trim():dash}</td>
        <td>{g.played?g.line:(g.bye?"Bye week":g.upcoming?"Upcoming":"Did not play")}</td>
        <td><b>{g.played?f1(g.pts?.[league]):dash}</b></td></tr>)}</tbody></table></div>
  </div>;
}

function Availability({d}:{d:any}){
  const [ideas,setIdeas]=useState<Record<string,{loading:boolean;data?:any;error?:string}>>({});
  const run=async(key:string)=>{
    setIdeas(x=>({...x,[key]:{loading:true}}));
    try{
      const r=await fetch("/api/nfl-card/trade-ideas",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leagueKey:key,sleeperId:d.player.id})});
      const j=await r.json();
      if(!r.ok)throw new Error(j?.detail||j?.error||"Could not generate ideas");
      setIdeas(x=>({...x,[key]:{loading:false,data:j}}));
    }catch(e:any){setIdeas(x=>({...x,[key]:{loading:false,error:e?.message||"Could not generate ideas"}}))}
  };
  return <div className="nfc-pane">
    <div className="nfc-paneh"><h2>Availability</h2></div>
    {d.availability.map((a:any)=>{
      const st=ideas[a.leagueKey];
      return <section className="nfc-card nfc-avail" key={a.leagueKey}>
        <div className="nfc-avail-row">
          <div><strong>{a.leagueName}</strong>
            <span className={"nfc-status "+a.state}>{a.state==="mine"?`On your roster · ${a.slot}`:a.state==="other"?`Rostered by ${a.owner} · ${a.slot}`:"Free agent"}</span>
            </div>
          {a.state==="other"&&<button className="nfc-btn" disabled={st?.loading} onClick={()=>void run(a.leagueKey)}>{st?.loading?"Building offers…":st?.data?"Refresh Trade Ideas":"Trade Ideas"}</button>}
          {a.state==="free"&&<span className="nfc-muted">Not tradeable — available to claim.</span>}
        </div>
        {st?.error&&<div className="nfc-empty nfc-err">{st.error}</div>}
        {st?.data&&<Ideas data={st.data}/>}
      </section>;
    })}
    {!d.availability.length&&<div className="nfc-empty">No Sleeper leagues are connected.</div>}
  </div>;
}

function Ideas({data}:{data:any}){
  const money=new Intl.NumberFormat("en-US");
  const label=(a:any)=>a.type==="pick"&&a.detail?`${a.name} (${a.detail})`:a.name;
  if(data.error)return <div className="nfc-empty">{data.error}</div>;
  if(!data.ideas?.length)return <div className="nfc-empty">{data.note||"No trade ideas found."}</div>;
  return <div className="nfc-ideas">
    <div className="nfc-note">Offers to {data.partner.name} for {data.target.name} (KTC {money.format(Math.round(data.target.value))}).{data.myPositionNote?" "+data.myPositionNote:""}</div>
    {data.ideas.map((i:any,n:number)=><div className="nfc-idea" key={n}>
      <div className="nfc-idea-head"><b>{i.kind}</b><span className={i.differencePct<=6?"good":i.differencePct<=11?"mid":"warn"}>{i.differencePct}% gap</span></div>
      <div className="nfc-idea-cols">
        <div><span>You send</span>{i.youSend.map((a:any)=><p key={a.id}>{label(a)}<small>{a.value!=null?" · "+money.format(Math.round(a.value)):""}</small></p>)}</div>
        <div className="arrow">→</div>
        <div><span>You get</span>{i.youGet.map((a:any)=><p key={a.id}>{label(a)}<small>{a.value!=null?" · "+money.format(Math.round(a.value)):""}</small></p>)}</div>
      </div>
      <div className="nfc-idea-foot">Package value {money.format(i.sendAdjusted)} vs {money.format(i.receiveAdjusted)}{i.fitNote?" · "+i.fitNote:""}{i.preferenceNote?" · "+i.preferenceNote:""}</div>
    </div>)}
    <div className="nfc-note">{data.valueNote}</div>
  </div>;
}

function NflCardStyles(){
  return <style jsx global>{`
    .nfc-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.68);z-index:520;display:grid;place-items:center;padding:24px}
    .nfc-modal{position:relative;width:min(1000px,96vw);height:min(860px,92vh);overflow:auto;background:#071426;border:1px solid #29476e;border-radius:18px;color:#e6eefb}
    .nfc-close{position:absolute;right:14px;top:12px;z-index:4;width:38px;height:38px;border-radius:50%;font-size:25px}
    .nfc-hero{display:flex;gap:18px;align-items:center;padding:16px 22px 12px}
    .nfc-photo{position:relative;width:104px;height:104px;border-radius:50%;background:#0d2443;border:2px solid #29476e;flex:none}
    .nfc-photo>img:first-child{width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:top}
    .nfc-teamlogo{position:absolute;right:-6px;bottom:-4px;width:38px;height:38px;object-fit:contain;background:#071426;border-radius:50%;padding:3px;border:1px solid #29476e}
    .nfc-ey{color:#20e2dd;font-size:12px;font-weight:800;letter-spacing:.04em}
    .nfc-id h1{margin:3px 0 4px;font-size:30px}
    .nfc-sub{color:#8aa3c4;font-size:12px;display:flex;gap:10px;align-items:center}
    .nfc-injury{background:#4a1f26;color:#ff9aa6;border:1px solid #7a2f3b;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700}
    .nfc-tabs{display:flex;gap:6px;padding:0 22px;border-bottom:1px solid #20395f;position:sticky;top:0;background:#071426;z-index:3}
    .nfc-tabs button{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:#8aa3c4;padding:11px 14px;font-weight:700}
    .nfc-tabs button.active{color:#fff;border-bottom-color:#20e2dd}
    .nfc-pane{padding:18px 22px 26px}
    .nfc-paneh{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
    .nfc-paneh h2{margin:0;font-size:18px}
    .nfc-pills{display:flex;gap:6px;flex-wrap:wrap}
    .nfc-pills button{padding:6px 11px;font-size:11px;border-radius:999px;background:#0a1c33;border:1px solid #29476e;color:#9bb2d1;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .nfc-pills button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.18)}
    .nfc-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.nfc-tiles.four{grid-template-columns:repeat(4,1fr)}
    .nfc-tile{background:#0a1c33;border:1px solid #20395f;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
    .nfc-tile span{color:#8aa3c4;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    .nfc-tile strong{font-size:30px;line-height:1.05;color:#fff}.nfc-tile small{color:#7890b1;font-size:11px}
    .nfc-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .nfc-card{background:#0a1c33;border:1px solid #20395f;border-radius:14px;padding:14px 16px;margin-bottom:12px}
    .nfc-card h3,.nfc-h3{margin:0 0 10px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#9bb2d1}
    .nfc-h3{margin:20px 0 8px}.nfc-h3 small{text-transform:none;letter-spacing:0;color:#6f88aa;font-weight:500}
    .nfc-next{display:flex;align-items:center;gap:14px}.nfc-next img{width:54px;height:54px;object-fit:contain}
    .nfc-next strong{display:block;font-size:22px}.nfc-next span{color:#8aa3c4;font-size:12px}.nfc-next em{display:block;color:#f5c26b;font-size:11px;font-style:normal;margin-top:3px}
    .nfc-line{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #132b4a;font-size:13px}.nfc-line:last-child{border:0}.nfc-line span{color:#8aa3c4}
    .nfc-muted{color:#7890b1;font-size:13px}.nfc-note{color:#7890b1;font-size:12px;margin:0 0 10px}
    .nfc-empty{padding:28px 22px;color:#8aa3c4}.nfc-err{color:#ff9aa6}
    .nfc-table{width:100%;border-collapse:collapse;font-size:13px}
    .nfc-table th{text-align:left;color:#7890b1;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid #20395f}
    .nfc-table td{padding:7px 8px;border-bottom:1px solid #132b4a}.nfc-table tr.sel td{background:#10294a}.nfc-table tr.dim td{color:#6b83a5}
    .nfc-scroll{overflow-x:auto}
    .nfc-link{background:transparent;border:0;padding:0;color:#7fd7ff;font-weight:700;cursor:pointer;text-align:left}.nfc-link:hover{text-decoration:underline}
    .nfc-inj{margin-left:8px;font-size:10px;color:#ff9aa6}
    .nfc-pos{display:inline-block;min-width:30px;text-align:center;border-radius:6px;padding:2px 5px;font-size:10px;font-weight:900;color:#fff}
    .nfc-pos.QB{background:#c2354a}.nfc-pos.RB{background:#1f9d6b}.nfc-pos.WR{background:#2a7ad1}.nfc-pos.TE{background:#c77d1e}
    .nfc-league{margin-left:auto;display:flex;flex-direction:column;gap:4px;align-self:flex-start;margin-top:30px;margin-right:46px}
    .nfc-league span{color:#7890b1;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
    .nfc-league select{background:#0a1c33;color:#fff;border:1px solid #31577f;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;min-width:220px;max-width:300px}
    .nfc-h3row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:20px 0 8px}.nfc-h3row .nfc-h3{margin:0}
    .nfc-check{display:flex;align-items:center;gap:7px;color:#9bb2d1;font-size:12px;font-weight:700;cursor:pointer}
    .nfc-teamranks{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .nfc-rankcard{background:#0a1c33;border:1px solid #20395f;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
    .nfc-rankcard span{color:#8aa3c4;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.nfc-rankcard strong{font-size:22px}.nfc-rankcard small{color:#6f88aa;font-size:11px}
    .nfc-timeline{display:flex;flex-direction:column;gap:2px}
    .nfc-tl{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #132b4a}.nfc-tl i{width:10px;height:10px;border-radius:50%;background:#4a6a97;margin-top:5px;flex:none}
    .nfc-tl.trade i{background:#f5c26b}.nfc-tl.add i{background:#37c58d}.nfc-tl.drop i{background:#ff7a8a}.nfc-tl.draft i{background:#7fd7ff}.nfc-tl.mine b{color:#20e2dd}
    .nfc-when{display:block;color:#7890b1;font-size:11px}.nfc-tl b{display:block;font-size:14px;margin:2px 0}.nfc-tl p{margin:2px 0 0;color:#9bb2d1;font-size:12px}
    .nfc-avail-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.nfc-avail strong{display:block;font-size:15px;margin-bottom:5px}.nfc-avail small{display:block;color:#6f88aa;margin-top:4px}
    .nfc-status{display:inline-block;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;background:#132b4a;color:#cfe0f6}
    .nfc-status.mine{background:#0f3b36;color:#5fe3c0}.nfc-status.other{background:#3a2d12;color:#f5c26b}.nfc-status.free{background:#13324f;color:#7fd7ff}
    .nfc-btn{background:#173253;border:1px solid #31577f;color:#fff;border-radius:10px;padding:8px 14px;font-weight:800}.nfc-btn:disabled{opacity:.6}
    .nfc-ideas{margin-top:12px;display:grid;gap:10px}
    .nfc-idea{background:#071426;border:1px solid #20395f;border-radius:12px;padding:12px 14px}
    .nfc-idea-head{display:flex;justify-content:space-between;margin-bottom:8px}.nfc-idea-head span{font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px}
    .nfc-idea-head .good{background:#0f3b36;color:#5fe3c0}.nfc-idea-head .mid{background:#3a2d12;color:#f5c26b}.nfc-idea-head .warn{background:#4a1f26;color:#ff9aa6}
    .nfc-idea-cols{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start}.nfc-idea-cols .arrow{color:#4a6a97;font-size:20px;align-self:center}
    .nfc-idea-cols span{display:block;color:#7890b1;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}.nfc-idea-cols p{margin:2px 0;font-size:13px}.nfc-idea-cols small{color:#6f88aa}
    .nfc-idea-foot{margin-top:8px;color:#6f88aa;font-size:11px}
    @media(max-width:760px){.nfc-tiles,.nfc-tiles.four,.nfc-two,.nfc-teamranks{grid-template-columns:1fr 1fr}.nfc-two{grid-template-columns:1fr}.nfc-hero{flex-direction:column;align-items:flex-start}.nfc-league{margin:0}}
  `}</style>;
}
