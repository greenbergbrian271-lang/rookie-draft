"use client";
import {useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {AlertTriangle,CheckCircle2,Clock3,ExternalLink,Globe2,Link2,Play,RefreshCw,Settings,Users,X} from "lucide-react";
import {schoolStyle} from "@/lib/school-colors";
import styles from "./all-star-games.module.css";

const POSITIONS=["QB","RB","WR","TE"];
const sourceLabel=(kind:string)=>kind==="twitter"?"X":kind==="roster_a"?"Roster A":kind==="roster_b"?"Roster B":kind==="legacy"?"Legacy":"Website";

export default function AllStarGamesPage(){
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[scanning,setScanning]=useState(false),[message,setMessage]=useState<any>(null),[editing,setEditing]=useState<any>(null),[form,setForm]=useState<any>(null),[saving,setSaving]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const r=await fetch("/api/all-star-games?draftClass=2027",{cache:"no-store"}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not load all-star games.");
      setData(j);
    }catch(e:any){setMessage({type:"error",text:e?.message||"Could not load all-star games."})}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const totalInvites=useMemo(()=>data?.games?.reduce((n:number,g:any)=>n+(g.invites?.length||0),0)||0,[data]);

  function openSettings(game:any){
    setEditing(game);
    setForm({...game.config});
    setMessage(null);
  }
  async function saveSettings(){
    if(!editing||!form)return;
    setSaving(true);
    try{
      const r=await fetch("/api/all-star-games",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(form)}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not save settings.");
      setEditing(null);setForm(null);setMessage({type:"success",text:editing.name+" sources saved."});await load();
    }catch(e:any){setMessage({type:"error",text:e?.message||"Could not save settings."})}
    finally{setSaving(false)}
  }
  async function checkInvites(){
    setScanning(true);setMessage(null);
    try{
      const r=await fetch("/api/all-star-games/check",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Invite scan failed.");
      const sourceFailures=(j.results||[]).flatMap((x:any)=>(x.sourceSummary||[]).filter((s:any)=>!s.ok));
      setMessage({type:sourceFailures.length?"warn":"success",text:j.totalAdded?j.totalAdded+" new invite"+(j.totalAdded===1?"":"s")+" found across "+j.results.length+" games.":j.totalMatched?"No new invites. "+j.totalMatched+" known invite"+(j.totalMatched===1?" was":"s were")+" confirmed.":"No new invitations were found in the configured sources.",detail:sourceFailures.length?sourceFailures.length+" source"+(sourceFailures.length===1?"":"s")+" could not be read; the remaining sources were still checked.":""});
      await load();
    }catch(e:any){setMessage({type:"error",text:e?.message||"Invite scan failed."})}
    finally{setScanning(false)}
  }
  async function watchNow(game:any){
    const cfg=game.config,byRoster=(key:string)=>game.invites.filter((p:any)=>p.roster_key===key),unassigned=game.invites.filter((p:any)=>!p.roster_key);
    const section=(name:string,players:any[])=>name+"\n"+(players.length?players.map((p:any)=>"• "+p.position+" "+p.name+" — "+(p.college||"College TBD")+"\n  ◦ ").join("\n"):"• No tracked invites yet");
    const notes=[section(cfg.rosterAName,byRoster("A")),section(cfg.rosterBName,byRoster("B")),unassigned.length?section("Accepted Invites — Roster TBD",unassigned):""].filter(Boolean).join("\n\n");
    const r=await fetch("/api/game-notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"all-star-"+game.key+"-2027",kickoff:game.date,homeTeam:cfg.rosterAName,awayTeam:cfg.rosterBName,title:game.name+" - "+game.dateLabel,notes,matchupSnapshot:{type:"all-star-game",gameKey:game.key,rosterA:cfg.rosterAName,rosterB:cfg.rosterBName}})});
    if(r.ok)location.href="/game-notes";else{const j=await r.json().catch(()=>({}));setMessage({type:"error",text:j.error||"Could not create the game note."})}
  }

  return <div className={styles.page}>
    <div className={styles.hero}>
      <div><div className="ey">2027 draft cycle</div><h1>College All-Star Games</h1><p>Accepted-invite tracking for the Senior Bowl, East-West Bowl, Hula Bowl and American Bowl.</p></div>
      <div className={styles.heroActions}><div className={styles.total}><Users size={17}/><strong>{totalInvites}</strong><span>tracked invites</span></div><button className={styles.scanButton} onClick={checkInvites} disabled={scanning}>{scanning?<><RefreshCw size={17} className={styles.spin}/>Checking sources…</>:<><RefreshCw size={17}/>Check for Invites</>}</button></div>
    </div>

    {message&&<div className={message.type==="error"?styles.error:message.type==="warn"?styles.warning:styles.successNotice}>{message.type==="error"?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<div><strong>{message.text}</strong>{message.detail&&<span>{message.detail}</span>}</div></div>}
    {loading&&<div className="card muted">Loading all-star game tracker…</div>}

    <div className={styles.gameGrid}>{data?.games?.map((game:any)=>{
      const cfg=game.config,last=game.lastScan?.checkedAt?new Date(game.lastScan.checkedAt):null;
      return <section className={styles.gameCard} key={game.key} style={{"--game-accent":game.accent,"--game-accent2":game.accent2} as CSSProperties}>
        <div className={styles.brandBar}/>
        <header className={styles.gameHeader}>
          <div className={styles.gameIdentity}><div className={styles.mark}>{game.name.split(" ").filter((x:string)=>!["The","Panini","Children's"].includes(x)).slice(0,2).map((x:string)=>x[0]).join("")}</div><div><div className={styles.dateLine}>{game.dateLabel} · {game.location}</div><h2>{game.name}</h2><p>{game.tagline}</p></div></div>
          <div className={styles.cardActions}><button className={styles.watch} onClick={()=>watchNow(game)}><Play size={15}/>Watch Now</button><button className={styles.iconButton} aria-label={"Settings for "+game.name} onClick={()=>openSettings(game)}><Settings size={18}/></button></div>
        </header>

        <div className={styles.sourceStrip}>
          <a href={cfg.websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={14}/>Website<ExternalLink size={12}/></a>
          <a href={cfg.twitterUrl} target="_blank" rel="noreferrer"><strong>𝕏</strong>X feed<ExternalLink size={12}/></a>
          {cfg.rosterAUrl&&<a href={cfg.rosterAUrl} target="_blank" rel="noreferrer"><Link2 size={14}/>{cfg.rosterAName}<ExternalLink size={12}/></a>}
          {cfg.rosterBUrl&&<a href={cfg.rosterBUrl} target="_blank" rel="noreferrer"><Link2 size={14}/>{cfg.rosterBName}<ExternalLink size={12}/></a>}
          <span className={styles.lastCheck}><Clock3 size={13}/>{last?"Checked "+last.toLocaleString():"Not checked yet"}</span>
        </div>

        <div className={styles.rosterSummary}>
          <div><span className={styles.rosterDot+" "+styles.rosterA}/><strong>{cfg.rosterAName}</strong><b>{game.invites.filter((p:any)=>p.roster_key==="A").length}</b></div>
          <div><span className={styles.rosterDot+" "+styles.rosterB}/><strong>{cfg.rosterBName}</strong><b>{game.invites.filter((p:any)=>p.roster_key==="B").length}</b></div>
          <div><span className={styles.rosterDot+" "+styles.rosterTbd}/><strong>Roster TBD</strong><b>{game.invites.filter((p:any)=>!p.roster_key).length}</b></div>
        </div>

        <div className={styles.positions}>{POSITIONS.map(pos=>{
          const ps=game.invites.filter((p:any)=>p.position===pos);
          return <div className={styles.positionCol} key={pos}><div className={styles.positionHead+" "+styles["pos"+pos]}><span>{pos}</span><b>{ps.length}</b></div><div className={styles.playerList}>{ps.length?ps.map((p:any)=><button key={p.player_id} data-player-id={p.player_id} className={styles.player} style={schoolStyle(p.college)} title={p.source_excerpt||"Tracked all-star invite"}><span className={styles.playerName}>{p.name}</span><span className={styles.playerMeta}>{p.college||"College TBD"}</span><span className={styles.sourceBadge}>{p.roster_key==="A"?cfg.rosterAName:p.roster_key==="B"?cfg.rosterBName:sourceLabel(p.source_kind)}</span></button>):<div className={styles.emptyPos}>No invites yet</div>}</div></div>
        })}</div>
      </section>
    })}</div>

    {editing&&form&&<div className={styles.modalBackdrop} onMouseDown={e=>e.target===e.currentTarget&&setEditing(null)}>
      <div className={styles.modal}>
        <div className={styles.modalHead}><div><div className="ey">Invite Sources</div><h2>{editing.name}</h2><p>Update where Check for Invites looks and how the two game rosters are labeled.</p></div><button className={styles.closeButton} onClick={()=>setEditing(null)} aria-label="Close"><X size={20}/></button></div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Webpage to scan<input value={form.websiteUrl} onChange={e=>setForm({...form,websiteUrl:e.target.value})} placeholder="https://…"/></label>
          <label className={styles.full}>X / Twitter feed<input value={form.twitterUrl} onChange={e=>setForm({...form,twitterUrl:e.target.value})} placeholder="https://x.com/…"/></label>
          <div className={styles.rosterEditor}><label>Roster A name<input value={form.rosterAName} onChange={e=>setForm({...form,rosterAName:e.target.value})}/></label><label>Roster A link<input value={form.rosterAUrl} onChange={e=>setForm({...form,rosterAUrl:e.target.value})} placeholder="Optional until roster is published"/></label></div>
          <div className={styles.rosterEditor}><label>Roster B name<input value={form.rosterBName} onChange={e=>setForm({...form,rosterBName:e.target.value})}/></label><label>Roster B link<input value={form.rosterBUrl} onChange={e=>setForm({...form,rosterBUrl:e.target.value})} placeholder="Optional until roster is published"/></label></div>
        </div>
        <div className={styles.modalFoot}><p><strong>How it works:</strong> the main webpage and X feed find accepted invitations. Roster A/B pages also assign matched players directly to that side.</p><div><button className="ghost" onClick={()=>setEditing(null)}>Cancel</button><button onClick={saveSettings} disabled={saving}>{saving?"Saving…":"Save Sources"}</button></div></div>
      </div>
    </div>}
  </div>;
}
