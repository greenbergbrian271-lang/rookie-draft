"use client";
import {useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {AlertTriangle,Ban,CheckCircle2,Clock3,ExternalLink,Globe2,Link2,Play,RefreshCw,RotateCcw,Settings,Users,X} from "lucide-react";
import {schoolStyle} from "@/lib/school-colors";
import styles from "./all-star-games.module.css";
import {useDraftClass} from "@/lib/use-draft-class";

const POSITIONS=["QB","RB","WR","TE"];
const isOut=(p:any)=>String(p.participation_status||"ACTIVE")==="OPTED_OUT";
const sourceLabel=(kind:string)=>kind==="twitter"?"X":kind==="roster_a"?"Roster A":kind==="roster_b"?"Roster B":kind==="legacy"?"Legacy":"Website";

export default function AllStarGamesPage(){
  const draftClass=useDraftClass(),historical=draftClass<2027;
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[scanning,setScanning]=useState(false),[message,setMessage]=useState<any>(null),[editing,setEditing]=useState<any>(null),[form,setForm]=useState<any>(null),[saving,setSaving]=useState(false),[rosterView,setRosterView]=useState<any>(null),[participationBusy,setParticipationBusy]=useState<number|null>(null);

  async function load(){
    setLoading(true);
    try{
      const r=await fetch("/api/all-star-games?draftClass="+encodeURIComponent(String(draftClass)),{cache:"no-store"}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not load all-star games.");
      setData(j);
    }catch(e:any){setMessage({type:"error",text:e?.message||"Could not load all-star games."})}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[draftClass]);

  const totalInvites=useMemo(()=>data?.games?.reduce((n:number,g:any)=>n+(g.invites?.length||0),0)||0,[data]);
  const viewGame=rosterView?data?.games?.find((g:any)=>g.key===rosterView.gameKey):null;
  const viewPlayers=useMemo(()=>{
    if(!viewGame||!rosterView)return [];
    if(rosterView.rosterKey==="OUT")return viewGame.invites.filter((p:any)=>isOut(p));
    return viewGame.invites.filter((p:any)=>!isOut(p)&&(rosterView.rosterKey==="TBD"?!p.roster_key:p.roster_key===rosterView.rosterKey));
  },[viewGame,rosterView]);

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
  async function setParticipation(gameKey:string,player:any,status:"ACTIVE"|"OPTED_OUT"){
    setParticipationBusy(Number(player.player_id));
    try{
      const r=await fetch("/api/all-star-games/participation",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({gameKey,playerId:player.player_id,status})}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not update participation.");
      setMessage({type:"success",text:player.name+(status==="OPTED_OUT"?" marked as not playing. The invite remains on file.":" restored to the active game roster.")});
      await load();
    }catch(e:any){setMessage({type:"error",text:e?.message||"Could not update participation."})}
    finally{setParticipationBusy(null)}
  }
  async function watchNow(game:any){
    const cfg=game.config,active=game.invites.filter((p:any)=>!isOut(p)),out=game.invites.filter((p:any)=>isOut(p)),byRoster=(key:string)=>active.filter((p:any)=>p.roster_key===key),unassigned=active.filter((p:any)=>!p.roster_key);
    const section=(name:string,players:any[])=>name+"\n"+(players.length?players.map((p:any)=>"• "+p.position+" "+p.name+" — "+(p.college||"College TBD")+"\n  ◦ ").join("\n"):"• No tracked invites yet");
    const notes=[section(cfg.rosterAName,byRoster("A")),section(cfg.rosterBName,byRoster("B")),unassigned.length?section("Accepted Invites — Roster TBD",unassigned):"",out.length?section("Not Playing / Practice Only",out):""].filter(Boolean).join("\n\n");
    const r=await fetch("/api/game-notes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"all-star-"+game.key+"-"+draftClass,kickoff:game.date,homeTeam:cfg.rosterAName,awayTeam:cfg.rosterBName,title:game.name+" - "+game.dateLabel,notes,matchupSnapshot:{type:"all-star-game",gameKey:game.key,rosterA:cfg.rosterAName,rosterB:cfg.rosterBName}})});
    if(r.ok)location.href="/game-notes";else{const j=await r.json().catch(()=>({}));setMessage({type:"error",text:j.error||"Could not create the game note."})}
  }

  return <div className={styles.page}>
    <div className={styles.hero}>
      <div><div className="ey">{draftClass} draft cycle</div><h1>College All-Star Games</h1><p>{historical?"Participants preserved from the historical rookie-draft workbook.":"Accepted-invite tracking for the Senior Bowl, East-West Bowl, Hula Bowl and American Bowl."}</p></div>
      <div className={styles.heroActions}><div className={styles.total}><Users size={17}/><strong>{totalInvites}</strong><span>{historical?"historical participants":"tracked invites"}</span></div>{!historical&&<button className={styles.scanButton} onClick={checkInvites} disabled={scanning}>{scanning?<><RefreshCw size={17} className={styles.spin}/>Checking sources…</>:<><RefreshCw size={17}/>Check for Invites</>}</button>}</div>
    </div>

    {message&&<div className={message.type==="error"?styles.error:message.type==="warn"?styles.warning:styles.successNotice}>{message.type==="error"?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<div><strong>{message.text}</strong>{message.detail&&<span>{message.detail}</span>}</div></div>}
    {loading&&<div className="card muted">Loading all-star game tracker…</div>}

    <div className={styles.gameGrid}>{data?.games?.map((game:any)=>{
      const cfg=game.config,last=game.lastScan?.checkedAt?new Date(game.lastScan.checkedAt):null,active=game.invites.filter((p:any)=>!isOut(p)),out=game.invites.filter((p:any)=>isOut(p));
      const openRoster=(rosterKey:string,title:string)=>setRosterView({gameKey:game.key,rosterKey,title});
      return <section className={styles.gameCard} key={game.key} style={{"--game-accent":game.accent,"--game-accent2":game.accent2} as CSSProperties}>
        <div className={styles.brandBar}/>
        <header className={styles.gameHeader}>
          <div className={styles.gameIdentity}><div className={styles.logoWrap}><img src={game.logoUrl} alt={game.name+" logo"} className={styles.gameLogo}/></div><div><div className={styles.dateLine}>{game.dateLabel} · {game.location}</div><h2>{game.name}</h2><p>{game.tagline}</p></div></div>
          <div className={styles.cardActions}>{!historical&&<><button className={styles.watch} onClick={()=>watchNow(game)}><Play size={15}/>Watch Now</button><button className={styles.iconButton} aria-label={"Settings for "+game.name} onClick={()=>openSettings(game)}><Settings size={18}/></button></>}</div>
        </header>

        {!historical&&<div className={styles.sourceStrip}>
          <a href={cfg.websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={14}/>Website<ExternalLink size={12}/></a>
          <a href={cfg.twitterUrl} target="_blank" rel="noreferrer"><strong>𝕏</strong>X feed<ExternalLink size={12}/></a>
          {cfg.rosterAUrl&&<a href={cfg.rosterAUrl} target="_blank" rel="noreferrer"><Link2 size={14}/>{cfg.rosterAName}<ExternalLink size={12}/></a>}
          {cfg.rosterBUrl&&<a href={cfg.rosterBUrl} target="_blank" rel="noreferrer"><Link2 size={14}/>{cfg.rosterBName}<ExternalLink size={12}/></a>}
          <span className={styles.lastCheck}><Clock3 size={13}/>{last?"Checked "+last.toLocaleString():"Not checked yet"}</span>
        </div>}

        <div className={styles.rosterSummary}>
          <button onClick={()=>openRoster("A",cfg.rosterAName)}><span className={styles.rosterDot+" "+styles.rosterA}/><strong>{cfg.rosterAName}</strong><b>{active.filter((p:any)=>p.roster_key==="A").length}</b></button>
          <button onClick={()=>openRoster("B",cfg.rosterBName)}><span className={styles.rosterDot+" "+styles.rosterB}/><strong>{cfg.rosterBName}</strong><b>{active.filter((p:any)=>p.roster_key==="B").length}</b></button>
          <button onClick={()=>openRoster("TBD","Roster TBD")}><span className={styles.rosterDot+" "+styles.rosterTbd}/><strong>Roster TBD</strong><b>{active.filter((p:any)=>!p.roster_key).length}</b></button>
          {out.length>0&&<button className={styles.outChip} onClick={()=>openRoster("OUT","Not Playing / Practice Only")}><Ban size={12}/><strong>Not Playing</strong><b>{out.length}</b></button>}
        </div>

        <div className={styles.positions}>{POSITIONS.map(pos=>{
          const ps=active.filter((p:any)=>p.position===pos);
          return <div className={styles.positionCol} key={pos}><div className={styles.positionHead+" "+styles["pos"+pos]}><span>{pos}</span><b>{ps.length}</b></div><div className={styles.playerList}>{ps.length?ps.map((p:any)=><button key={p.player_id} data-player-id={p.player_id} className={styles.player} style={schoolStyle(p.college)} title={p.source_excerpt||"Tracked all-star invite"}><span className={styles.playerName}>{p.name}</span><span className={styles.playerMeta}>{p.college||"College TBD"}</span><span className={styles.sourceBadge}>{p.roster_key==="A"?cfg.rosterAName:p.roster_key==="B"?cfg.rosterBName:sourceLabel(p.source_kind)}</span></button>):<div className={styles.emptyPos}>No active invites yet</div>}</div></div>
        })}</div>
      </section>
    })}</div>

    {viewGame&&rosterView&&<div className={styles.modalBackdrop} onMouseDown={e=>e.target===e.currentTarget&&setRosterView(null)}>
      <div className={styles.rosterModal}>
        <div className={styles.modalHead}><div className={styles.rosterModalTitle}><div className={styles.miniLogo}><img src={viewGame.logoUrl} alt=""/></div><div><div className="ey">{viewGame.name}</div><h2>{rosterView.title}</h2><p>{viewPlayers.length} tracked player{viewPlayers.length===1?"":"s"} · click a player name for the profile.</p></div></div><button className={styles.closeButton} onClick={()=>setRosterView(null)} aria-label="Close"><X size={20}/></button></div>
        <div className={styles.rosterBody}>{POSITIONS.map(pos=>{
          const ps=viewPlayers.filter((p:any)=>p.position===pos);
          if(!ps.length)return null;
          return <section className={styles.rosterPosition} key={pos}><div className={styles.rosterPositionHead+" "+styles["pos"+pos]}><strong>{pos}</strong><span>{ps.length}</span></div><div className={styles.rosterRows}>{ps.map((p:any)=><div className={styles.rosterRow} key={p.player_id}><button data-player-id={p.player_id} className={styles.rosterPlayer} style={schoolStyle(p.college)}><strong>{p.name}</strong><span>{p.college||"College TBD"}</span></button><span className={styles.rosterSource}>{p.roster_key==="A"?viewGame.config.rosterAName:p.roster_key==="B"?viewGame.config.rosterBName:sourceLabel(p.source_kind)}</span>{!historical&&(isOut(p)?<button className={styles.restoreButton} disabled={participationBusy===Number(p.player_id)} onClick={()=>setParticipation(viewGame.key,p,"ACTIVE")}><RotateCcw size={13}/>Restore</button>:<button className={styles.optOutButton} disabled={participationBusy===Number(p.player_id)} onClick={()=>setParticipation(viewGame.key,p,"OPTED_OUT")}><Ban size={13}/>Opt Out</button>)}</div>)}</div></section>
        })}{!viewPlayers.length&&<div className={styles.rosterEmpty}>No players are assigned to this roster yet.</div>}</div>
      </div>
    </div>}

    {!historical&&editing&&form&&<div className={styles.modalBackdrop} onMouseDown={e=>e.target===e.currentTarget&&setEditing(null)}>
      <div className={styles.modal}>
        <div className={styles.modalHead}><div><div className="ey">Invite Sources</div><h2>{editing.name}</h2><p>Update where Check for Invites looks and how the two game rosters are labeled.</p></div><button className={styles.closeButton} onClick={()=>setEditing(null)} aria-label="Close"><X size={20}/></button></div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Webpage to scan<input value={form.websiteUrl} onChange={e=>setForm({...form,websiteUrl:e.target.value})} placeholder="https://…"/></label>
          <label className={styles.full}>X / Twitter feed<input value={form.twitterUrl} onChange={e=>setForm({...form,twitterUrl:e.target.value})} placeholder="https://x.com/…"/></label>
          <div className={styles.rosterEditor}><label>Roster A name<input value={form.rosterAName} onChange={e=>setForm({...form,rosterAName:e.target.value})}/></label><label>Roster A link<input value={form.rosterAUrl} onChange={e=>setForm({...form,rosterAUrl:e.target.value})} placeholder="Optional until roster is published"/></label></div>
          <div className={styles.rosterEditor}><label>Roster B name<input value={form.rosterBName} onChange={e=>setForm({...form,rosterBName:e.target.value})}/></label><label>Roster B link<input value={form.rosterBUrl} onChange={e=>setForm({...form,rosterBUrl:e.target.value})} placeholder="Optional until roster is published"/></label></div>
        </div>
        <div className={styles.modalFoot}><p><strong>How it works:</strong> the main webpage and X feed find accepted invitations. Roster A/B pages also assign matched players directly to that side. Manual opt-outs are preserved when the sources are scanned again.</p><div><button className="ghost" onClick={()=>setEditing(null)}>Cancel</button><button onClick={saveSettings} disabled={saving}>{saving?"Saving…":"Save Sources"}</button></div></div>
      </div>
    </div>}
  </div>;
}
