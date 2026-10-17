"use client";

import {createContext,useCallback,useContext,useEffect,useState} from "react";
import {Profile,usePlayerProfile} from "@/components/PlayerProfile";
import styles from "./NFLPlayerProfile.module.css";

type NFLProfileContext={openNFLPlayer:(name:string,playerId?:string|number)=>void};
type Selection={name:string;playerId?:string};
type ProfileStatus={kind:"success"|"warning";text:string};
const NFLContext=createContext<NFLProfileContext>({openNFLPlayer:()=>{}});
const positions=["QB","RB","WR","TE"];
const fmt=(value:any)=>value==null||value===""||!Number.isFinite(Number(value))?"—":Number(value).toFixed(1);
const rank=(value:any)=>value==null||!Number.isFinite(Number(value))?"—":"#"+Number(value);
const prettyDate=(value:any)=>{const date=new Date(String(value||""));return Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Date unavailable"};

export function useNFLPlayerProfile(){return useContext(NFLContext)}

export function NFLPlayerName({name,playerId,children,className}:{name:string;playerId?:string|number;children?:React.ReactNode;className?:string}){
  const {openNFLPlayer}=useNFLPlayerProfile();
  return <button type="button" className={"nfl-player-name-link "+(className||"")} onClick={event=>{event.stopPropagation();openNFLPlayer(name,playerId)}}>{children||name}</button>;
}

function LeagueSwitcher({leagues,active,onChange}:{leagues:any[];active:string;onChange:(key:string)=>void}){
  if(!leagues?.length)return null;
  return <div className={styles.leagueSwitch} role="tablist" aria-label="Fantasy league scoring">
    {leagues.map(league=><button type="button" key={league.key} role="tab" aria-selected={active===league.key} className={active===league.key?styles.leagueActive:""} onClick={()=>onChange(league.key)}>{league.label}</button>)}
  </div>;
}

function Metric({label,value,detail}:{label:string;value:any;detail?:string}){
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>;
}

export function NFLPlayerProfileProvider({children}:{children:React.ReactNode}){
  const {openPlayer:openNCAAPlayer}=usePlayerProfile();
  const [selection,setSelection]=useState<Selection|null>(null);
  const [data,setData]=useState<any>(null);
  const [tab,setTab]=useState("Summary");
  const [sport,setSport]=useState<"NFL"|"NCAA">("NFL");
  const [leagueKey,setLeagueKey]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [ncaaData,setNcaaData]=useState<any>(null);
  const [ncaaTab,setNcaaTab]=useState("Summary");
  const [ncaaLoading,setNcaaLoading]=useState(false);
  const [ncaaStatus,setNcaaStatus]=useState<ProfileStatus|null>(null);
  const [historyCache,setHistoryCache]=useState<Record<string,any[]>>({});
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");

  const openNFLPlayer=useCallback((name:string,playerId?:string|number)=>{
    setSelection({name:String(name||"").trim(),playerId:playerId==null?undefined:String(playerId)});
    setData(null);setNcaaData(null);setTab("Summary");setSport("NFL");setLeagueKey("");setLoading(true);setError("");setNcaaStatus(null);setHistoryCache({});setHistoryLoading(false);setHistoryError("");
  },[]);

  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin)return;
      const message=event.data;
      if(message?.type==="rookie-draft:open-nfl-player"&&typeof message.name==="string")openNFLPlayer(message.name);
    };
    window.addEventListener("message",onMessage);
    return()=>window.removeEventListener("message",onMessage);
  },[openNFLPlayer]);

  useEffect(()=>{
    if(!selection)return;
    let live=true;
    const query=new URLSearchParams({name:selection.name});
    if(selection.playerId)query.set("playerId",selection.playerId);
    fetch("/api/nfl-player-profile?"+query.toString(),{cache:"no-store"}).then(async response=>{
      const result=await response.json();
      if(response.status===404){if(live){setSelection(null);setLoading(false)}return null}
      if(!response.ok)throw new Error(result?.error||"Could not load NFL player");
      return result;
    }).then(result=>{
      if(!live||!result)return;
      setData(result);setLeagueKey(result.defaultLeagueKey||result.leagues?.[0]?.key||"");setError("");
    }).catch((failure:any)=>{if(live)setError(failure?.message||"Could not load NFL player profile")}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[selection]);

  useEffect(()=>{
    if(tab!=="History"||!data?.player?.id||!leagueKey||historyCache[leagueKey])return;
    let live=true;
    setHistoryLoading(true);setHistoryError("");
    const query=new URLSearchParams({playerId:String(data.player.id),leagueKey});
    fetch("/api/nfl-player-profile/history?"+query.toString(),{cache:"no-store"}).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error||"Could not load transaction history");
      return result;
    }).then(result=>{
      if(live)setHistoryCache(current=>({...current,[leagueKey]:Array.isArray(result?.transactions)?result.transactions:[]}));
    }).catch((failure:any)=>{if(live)setHistoryError(failure?.message||"Could not load transaction history")}).finally(()=>{if(live)setHistoryLoading(false)});
    return()=>{live=false};
  },[tab,data?.player?.id,leagueKey,historyCache]);

  async function loadNCAA(){
    const ncaaId=data?.ncaaPlayerId;
    if(!ncaaId)return false;
    setNcaaLoading(true);setNcaaStatus(null);
    try{
      const response=await fetch("/api/player-profile?id="+encodeURIComponent(String(ncaaId)),{cache:"no-store"});
      const result=await response.json();
      if(!response.ok||!result?.player)throw new Error(result?.error||"Could not load the NCAA player card");
      setNcaaData(result);return true;
    }catch(failure:any){setNcaaStatus({kind:"warning",text:failure?.message||"Could not load the NCAA player card"});return false}
    finally{setNcaaLoading(false)}
  }

  async function selectNCAA(){
    if(!data?.ncaaPlayerId)return;
    setSport("NCAA");setNcaaTab("Summary");
    if(!ncaaData)await loadNCAA();
  }

  async function reloadNCAA(){
    const ncaaId=ncaaData?.player?.id||data?.ncaaPlayerId;
    if(!ncaaId)return false;
    try{
      const response=await fetch("/api/player-profile?id="+encodeURIComponent(String(ncaaId)),{cache:"no-store"});
      const result=await response.json();
      if(!response.ok||!result?.player)return false;
      setNcaaData(result);return true;
    }catch{return false}
  }

  async function applyNCAATransfer(result:any){
    setNcaaData((previous:any)=>previous?{...previous,player:result.player,transferHistory:[result.transfer,...(Array.isArray(previous.transferHistory)?previous.transferHistory:[])]}:previous);
    const synced=await reloadNCAA();
    setNcaaStatus(synced?{kind:"success",text:"Transfer saved and profile refreshed."}:{kind:"warning",text:"Transfer saved, but the latest profile could not refresh automatically."});
  }

  const close=()=>{setSelection(null);setData(null);setNcaaData(null);setError("");setNcaaStatus(null)};
  const activeLeague=(data?.leagues||[]).find((league:any)=>league.key===leagueKey)||(data?.leagues||[])[0];
  const player=data?.player;

  return <NFLContext.Provider value={{openNFLPlayer}}>
    {children}
    {selection&&<div className={styles.backdrop} onMouseDown={event=>event.target===event.currentTarget&&close()}>
      <div className={"player-profile-modal "+styles.modal} role="dialog" aria-modal="true" aria-label={(player?.name||selection.name)+" player card"}>
        <button type="button" className={"player-profile-close "+styles.close} onClick={close} aria-label="Close player card">×</button>
        {data?.ncaaPlayerId&&<div className={styles.sportSwitch} role="tablist" aria-label="Player level">
          <button type="button" role="tab" aria-selected={sport==="NFL"} className={sport==="NFL"?styles.sportActive:""} onClick={()=>setSport("NFL")}><img src="/nfl-logos/nfl.svg" alt="" className={styles.sportLogo}/><span>NFL</span></button>
          <button type="button" role="tab" aria-selected={sport==="NCAA"} className={sport==="NCAA"?styles.sportActive:""} onClick={()=>void selectNCAA()}><img src="/nfl-logos/ncaa.svg" alt="" className={styles.sportLogo}/><span>NCAA</span></button>
        </div>}
        {sport==="NCAA"?<div className={styles.ncaaWrap}>
          {ncaaLoading&&!ncaaData?<div className={styles.loading}>Loading NCAA player card…</div>:ncaaData?.player?<Profile d={ncaaData} tab={ncaaTab} setTab={setNcaaTab} open={openNCAAPlayer} applyTransfer={applyNCAATransfer} reload={reloadNCAA} setProfileStatus={setNcaaStatus}/>:<div className={styles.error}>{ncaaStatus?.text||"Could not load the NCAA player card."}</div>}
          {ncaaStatus&&<div className={styles.ncaaStatus+" "+(ncaaStatus.kind==="success"?styles.success:styles.warning)}>{ncaaStatus.text}</div>}
        </div>:loading&&!data?<div className={styles.loading}>Loading NFL player card…</div>:error&&!data?<div className={styles.error}>{error}</div>:data?.player?<div className={styles.content}>
          <div className={styles.hero}>
            {player.headshotUrl?<img src={player.headshotUrl} alt="" className={styles.headshot} onError={event=>{event.currentTarget.style.visibility="hidden"}}/>:<div className={styles.initials}>{String(player.name||"NFL").split(" ").map((part:string)=>part[0]||"").join("").slice(0,2)}</div>}
            <div className={styles.heroInfo}>
              <span className={styles.eyebrow}>{player.position} · {player.teamName||player.team}{player.number!=null?" · #"+player.number:""}</span>
              <h1>{player.name}</h1>
              <div className={styles.meta}>{[player.college,player.age?"Age "+player.age:"",player.yearsExp!=null?Number(player.yearsExp)===0?"Rookie":player.yearsExp+" yrs experience":"",player.injuryStatus&&player.injuryStatus!=="Healthy"?player.injuryStatus:""].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="NFL player card sections">
            {["Summary","History","Stats","Team"].map(section=><button key={section} type="button" role="tab" aria-selected={tab===section} className={tab===section?styles.tabActive:""} onClick={()=>setTab(section)}>{section}</button>)}
          </div>
          {tab==="Summary"&&<div className={styles.pane}>
            <div className={styles.metrics}>
              <Metric label="OVR Rank" value={rank(activeLeague?.summary?.overallRank)}/>
              <Metric label="POS Rank" value={rank(activeLeague?.summary?.positionRank)}/>
              <Metric label="Fantasy Points / Game" value={fmt(activeLeague?.summary?.fantasyPointsPerGame)}/>
            </div>
            <section className={styles.upcoming}>
              <div className={styles.sectionHeading}><span>UPCOMING GAME</span><small>{activeLeague?.label||"Default league"}</small></div>
              {player.upcomingGame?<><strong className={styles.opponent}>{player.upcomingGame.label}</strong><div className={styles.muted}>{prettyDate(player.upcomingGame.date)} · {player.upcomingGame.homeAway==="home"?"Home":player.upcomingGame.homeAway==="away"?"Away":"Venue TBD"}</div></>:<div className={styles.muted}>No upcoming game is available from the current schedule feed.</div>}
            </section>
          </div>}
          {tab==="History"&&<div className={styles.pane}>
            <LeagueSwitcher leagues={data.leagues||[]} active={leagueKey} onChange={setLeagueKey}/>
            <div className={styles.sectionHeading}><span>TRANSACTION HISTORY</span><small>{activeLeague?.label||""}</small></div>
            {historyLoading&&!historyCache[activeLeague?.key||""]?<div className={styles.loading}>Loading transaction history…</div>:historyError&&!historyCache[activeLeague?.key||""]?<div className={styles.error}>{historyError}</div>:(historyCache[activeLeague?.key||""]||activeLeague?.transactions||[]).length?<div className={styles.historyList}>{(historyCache[activeLeague?.key||""]||activeLeague?.transactions||[]).map((item:any,index:number)=><article className={styles.historyItem} key={String(item.id||index)+"-"+String(item.date||"")}><div className={styles.historyTop}><strong>{item.title||"Transaction"}</strong><time>{prettyDate(item.date)}</time></div><div className={styles.historyDetail}>{item.detail||"Transaction recorded"}{item.season?" · "+item.season+" season":""}</div></article>)}</div>:<div className={styles.empty}>No transactions involving this player were found in the stored history for this league.</div>}
          </div>}
          {tab==="Stats"&&<div className={styles.pane}>
            <LeagueSwitcher leagues={data.leagues||[]} active={leagueKey} onChange={setLeagueKey}/>
            <div className={styles.metrics+" "+styles.statsMetrics}>
              <Metric label="Fantasy Points" value={fmt(activeLeague?.summary?.fantasyPoints)}/>
              <Metric label="Fantasy Points / Game" value={fmt(activeLeague?.summary?.fantasyPointsPerGame)}/>
              <Metric label="Overall Rank" value={rank(activeLeague?.summary?.overallRank)}/>
              <Metric label="Position Rank" value={rank(activeLeague?.summary?.positionRank)}/>
            </div>
            <div className={styles.sectionHeading}><span>WEEKLY GAME LOG</span><small>{data.season} season · {activeLeague?.scoringSource||"League scoring"}</small></div>
            <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Week</th><th>Fantasy Points</th></tr></thead><tbody>{(activeLeague?.weekly||[]).slice().reverse().map((week:any)=><tr key={week.week}><td>Week {week.week}</td><td className={styles.points}>{fmt(week.points)}</td></tr>)}</tbody></table></div>
          </div>}
          {tab==="Team"&&<div className={styles.pane}>
            <LeagueSwitcher leagues={data.leagues||[]} active={leagueKey} onChange={setLeagueKey}/>
            <div className={styles.teamIntro}><div><span className={styles.eyebrow}>CURRENT OFFENSE</span><h2>{player.teamName||player.team} fantasy-eligible teammates</h2></div><span className={styles.muted}>{positions.join(" · ")}</span></div>
            <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Player</th><th>Pos</th><th>Pos Rank</th><th>Fantasy PPG</th><th>Fantasy Points</th></tr></thead><tbody>{(activeLeague?.teammates||[]).map((mate:any)=><tr key={mate.id}><td><NFLPlayerName name={mate.name} playerId={mate.id}>{mate.name}</NFLPlayerName></td><td><span className={styles["pos"+mate.position]}>{mate.position}</span></td><td>{rank(mate.positionRank)}</td><td>{fmt(mate.fantasyPointsPerGame)}</td><td>{fmt(mate.fantasyPoints)}</td></tr>)}</tbody></table></div>
            <div className={styles.sectionHeading}><span>TEAM OFFENSE RANKS</span><small>Current season · NFL teams</small></div>
            <div className={styles.rankGrid}>
              {[["Offensive Yards","offensiveYards","yards"],["Pass Yards","passYards","yards"],["Pass Attempts","passAttempts","att."],["Pass TDs","passTDs","TDs"],["Rush Yards","rushYards","yards"],["Rush Attempts","rushAttempts","att."],["Rush TDs","rushTDs","TDs"]].map(([label,key,unit]:any)=><div className={styles.rankCard} key={key}><span>{label}</span><strong>{rank(activeLeague?.teamRanks?.[key]?.rank)}</strong><small>{activeLeague?.teamRanks?.[key]?.value==null?"Stats unavailable":Number(activeLeague.teamRanks[key].value).toLocaleString()+" "+unit}</small></div>)}
            </div>
            <div className={styles.sectionHeading}><span>WEEKLY GAME LOG</span><small>Fantasy points · {activeLeague?.label||""}</small></div>
            <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Week</th><th>Fantasy Points</th></tr></thead><tbody>{(activeLeague?.weekly||[]).slice().reverse().map((week:any)=><tr key={"team-week-"+week.week}><td>Week {week.week}</td><td className={styles.points}>{fmt(week.points)}</td></tr>)}</tbody></table></div>
          </div>}
        </div>:null}
      </div>
    </div>}
  </NFLContext.Provider>;
}
