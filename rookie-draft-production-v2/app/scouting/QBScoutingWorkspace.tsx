"use client";

import {Fragment,useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {draftAdjustedFinalGrade,glossaryNumber,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {qbAnalyticalGrade} from "@/lib/analytical-grades";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {usePlayerProfile} from "@/components/PlayerProfile";
import {DRAFT_PROJECTION_OPTIONS,DraftAdjustmentPanel,MockDraftablePanel,resolveDraftContext,useDraftPicks} from "./ScoutingShared";

type Player={
  id:string|number;
  name:string;
  position:"QB"|"RB"|"WR"|"TE";
  college?:string;
  draft_class:number;
  scouting_status:string;
  watch_order?:number;
  headshot_url?:string;
  jersey_number?:string;
};
type Session={
  id:string|number;
  player_id?:string|number;
  game_date?:string|null;
  opponent?:string|null;
  raw_notes?:string|null;
  overall_writeup?:string|null;
  created_at?:string|null;
  legacy?:boolean;
};
type Props={
  players:Player[];
  vals:Record<string,any>;
  setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;
  imports:any[];
  glossary:any[][];
  onSave:(player:Player,category:string,value:any)=>Promise<any>;
  onAdd:()=>void;
  demoMode?:boolean;
};
type Tab="Film"|"Production"|"Analytics"|"Combine"|"Draft";
type Mode="Evaluate"|"Compare";

const FILM=["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"] as const;
const ROLE_OPTIONS=["Early Starter","Developmental Starter","Backup","3rd String+"] as const;
const PROJECTION_OPTIONS=DRAFT_PROJECTION_OPTIONS;
const ARCHETYPE_OPTIONS=["Pocket Passer","Improviser","Scrambler"] as const;
const ADJUSTMENTS=[
  ["Injury Concerns",["No","Short Term","Long Term"]],
  ["Off-Field?",["No","Character","Arrest"]],
  ["All Star Game?",["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]],
  ["Combine Invite?",["None","Yes","No"]]
] as const;
const ANALYTICS=[
  {label:"ADOT",sheet:"AS",inverse:false,pct:false},
  {label:"QBR",sheet:"AT",inverse:false,pct:false},
  {label:"Adjusted Y/A",sheet:"AU",inverse:false,pct:false},
  {label:"Screen %",sheet:"AV",inverse:true,pct:true},
  {label:"ADJ Comp %",sheet:"AW",inverse:false,pct:true},
  {label:"Clean Comp %",sheet:"AX",inverse:false,pct:true},
  {label:"Big Time Throws",sheet:"AY",inverse:false,pct:false},
  {label:"BTT %",sheet:"AZ",inverse:false,pct:true},
  {label:"TO Worthy Plays",sheet:"BA",inverse:true,pct:false},
  {label:"TWP %",sheet:"BB",inverse:true,pct:true},
  {label:"Time to Throw",sheet:"BC",inverse:true,pct:false},
  {label:"Allowed Press. %",sheet:"BD",inverse:true,pct:true},
  {label:"20+ Comp %",sheet:"BE",inverse:false,pct:true},
  {label:"PA BTT %",sheet:"BF",inverse:false,pct:true},
  {label:"Pressure-to-Sack %",sheet:"BG",inverse:true,pct:true},
  {label:"Pressured ADJ%",sheet:"BH",inverse:false,pct:true},
  {label:"Pressured BTT%",sheet:"BI",inverse:false,pct:true},
  {label:"Pressured TWP%",sheet:"BJ",inverse:true,pct:true},
  {label:"Scrambles",sheet:"BK",inverse:false,pct:false},
  {label:"Scramble Yards",sheet:"BL",inverse:false,pct:false},
  {label:"Yards/Scramble",sheet:"BM",inverse:false,pct:false},
  {label:"Rush Yard %",sheet:"BN",inverse:false,pct:true},
  {label:"Press. Scrambles",sheet:"BO",inverse:false,pct:false},
  {label:"Clean Scramble %",sheet:"BP",inverse:true,pct:true}
] as const;
const STATS=[
  ["Games","Games"],["Completions","Completions"],["Attempts","Attempts"],["Completion %","Completion %"],
  ["Passing Yards","Yards"],["Yards / Attempt","Yards/Attempt"],["Passing TD","Touchdowns"],["Interceptions","Interceptions"],
  ["Rushes","Rushes"],["Rush Yards","Yards__rush"],["Rush Yards / Attempt","Yards/Attempt__rush"],["Rush TD","Touchdowns__rush"]
] as const;

const norm=(s:any)=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
function num(v:any,pct=false){
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const raw=String(v).trim(),n=Number(raw.replace(/[%,$]/g,"").replace(/,/g,""));
  if(!Number.isFinite(n))return null;
  return pct||raw.includes("%")?n/100:n;
}
function display(v:any,pct=false,digits=2){
  const n=num(v,pct);
  if(n==null)return "—";
  return pct?(n*100).toFixed(digits)+"%":n.toLocaleString(undefined,{maximumFractionDigits:digits});
}
function inputValue(v:any){return v==null?"":String(v)}
function valueFor(row:any,label:string){
  if(!row)return null;
  if(label==="Yards__rush")return row["Rush Yards"]??row["Yards.1"]??row["Yards (Rush)"];
  if(label==="Yards/Attempt__rush")return row["Rush Yards/Attempt"]??row["Yards/Attempt.1"]??row["Yards/Attempt (Rush)"];
  if(label==="Touchdowns__rush")return row["Rush Touchdowns"]??row["Touchdowns.1"]??row["Touchdowns (Rush)"];
  return row[label];
}
function scoreLabel(n:number|null){
  if(n==null)return "Not graded";
  if(n>=90)return "Elite";
  if(n>=80)return "Plus";
  if(n>=70)return "Solid";
  if(n>=60)return "Fringe";
  return "Concern";
}

export default function QBScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd,demoMode=false}:Props){
  const {openPlayer}=usePlayerProfile();
  const [selectedId,setSelectedId]=useState<string>("");
  const [search,setSearch]=useState("");
  const [tab,setTab]=useState<Tab>("Film");
  const [mode,setMode]=useState<Mode>("Evaluate");
  const [compareIds,setCompareIds]=useState<string[]>([]);
  const [saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");
  const [sessions,setSessions]=useState<Record<string,Session[]>>({});
  const [newGameOpen,setNewGameOpen]=useState<Record<string,boolean>>({});
  const [newGame,setNewGame]=useState<Record<string,{opponent:string;notes:string}>>({});
  const draftPicks=useDraftPicks();

  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"})},[]);

  useEffect(()=>{
    if(!players.length){setSelectedId("");return}
    if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));
    setCompareIds(cur=>{
      const valid=cur.filter(id=>players.some(p=>String(p.id)===id));
      return valid.length?valid:players.map(p=>String(p.id));
    });
  },[players,selectedId]);

  const importMap=useMemo(()=>{
    const m=new Map<string,any>();
    for(const row of imports||[]){
      const name=row?.Player??String(row?.["Player, College"]||"").split(",")[0];
      if(name)m.set(norm(name),row);
    }
    return m;
  },[imports]);

  const selected=players.find(p=>String(p.id)===selectedId)||players[0];
  const importedFor=(p:Player)=>importMap.get(norm(p.name))||{};
  const imported=selected?importedFor(selected):{};
  const evalFor=(p:Player,cat:string)=>vals[p.id+"|"+cat];
  const evalValue=(cat:string)=>selected?evalFor(selected,cat):"";

  useEffect(()=>{
    for(const p of players){
      const id=String(p.id);
      if(sessions[id])continue;
      const legacy=String(evalFor(p,"__COMMENTARY__")||"").trim();
      const legacyLabel=String(evalFor(p,"__GAME_LABEL__")||"").trim();
      if(demoMode){
        setSessions(x=>x[id]?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]});
        continue;
      }
      fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{
        const live=Array.isArray(rows)?rows:[],fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];
        setSessions(x=>x[id]?x:{...x,[id]:live.length?live:fallback});
      }).catch(()=>setSessions(x=>x[id]?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]}));
    }
  },[players,vals,demoMode]);

  function gameCountFor(p:Player){return (sessions[String(p.id)]||[]).length}
  function fieldsFor(p:Player){
    const out:Record<string,any>={...importedFor(p)};
    for(const cat of [...FILM,"Games watched","Expected Role","Archetype","Draft Projection","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){
      const v=evalFor(p,cat);
      if(v!==undefined&&v!==null&&v!=="")out[cat]=v;
    }
    out["Games watched"]=gameCountFor(p);
    return out;
  }
  function scoutingFor(p:Player){
    const grades=FILM.map(x=>num(evalFor(p,x))??NaN);
    return workbookScoutingGrade("QB",grades,fieldsFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function metricDataFor(p:Player){
    const imp=importedFor(p),all=(imports||[]).filter(r=>r&&norm(r.Player||String(r["Player, College"]||"").split(",")[0]));
    return ANALYTICS.map(metric=>{
      const population=all.map(r=>num(r[metric.label],metric.pct)).filter((x):x is number=>x!=null);
      const raw=num(imp?.[metric.label],metric.pct);
      const base=raw==null?null:percentRankInc(population,raw);
      const percentile=base==null?null:(metric.inverse?1-base:base);
      return {...metric,raw,rawPercentile:base,percentile};
    });
  }
  function productionMetricDataFor(p:Player){
    const imp=importedFor(p);
    return STATS.map(([label,source])=>{
      const pct=label.includes("%"),inverse=label==="Interceptions";
      const raw=num(valueFor(imp,source),pct);
      const population=(imports||[]).map(r=>num(valueFor(r,source),pct)).filter((v):v is number=>v!=null);
      const base=raw==null?null:percentRankInc(population,raw,3);
      const percentile=base==null?null:(inverse?1-base:base);
      return {label,source,pct,inverse,raw,percentile};
    });
  }
  function analyticalFor(p:Player){
    const scout=scoutingFor(p);
    if(scout==null)return null;
    const metrics=metricDataFor(p),imp=importedFor(p);
    const record=Object.fromEntries(metrics.map(x=>[x.sheet,x.percentile])) as Record<string,number|null>;
    record.pressureToSack=num(imp?.["Pressure-to-Sack %"],true);
    return qbAnalyticalGrade(scout,record,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function preDraftFor(p:Player){
    const scout=scoutingFor(p);if(scout==null)return null;
    return preDraftGrade("QB",scout,null,analyticalFor(p),false,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }

  function rankingGradeFor(p:Player){return preDraftFor(p)??scoutingFor(p)}
  const rankedPlayers=useMemo(()=>[...players].sort((a,b)=>{
    const ga=rankingGradeFor(a),gb=rankingGradeFor(b);
    if(ga==null&&gb==null)return (a.watch_order||9999)-(b.watch_order||9999);
    if(ga==null)return 1;if(gb==null)return -1;
    return gb-ga||((a.watch_order||9999)-(b.watch_order||9999));
  }),[players,vals,imports,glossary,sessions]);
  const filtered=useMemo(()=>{
    const q=norm(search);
    return rankedPlayers.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q));
  },[rankedPlayers,search]);

  const combinePopulation=useMemo(()=>({
    forty:(imports||[]).map(r=>num(r["40 Yard Dash"])).filter((x):x is number=>x!=null),
    speedScore:(imports||[]).map(r=>num(r["Speed Score"])).filter((x):x is number=>x!=null),
    broadJump:(imports||[]).map(r=>num(r["Broad Jump"])).filter((x):x is number=>x!=null),
    handSize:[],vertical:[],benchReps:[]
  }),[imports]);
  async function persist(p:Player,cat:string,value:any){
    setSaveState("saving");
    setVals(v=>({...v,[p.id+"|"+cat]:value}));
    if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}
    try{await onSave(p,cat,value);setSaveState("saved")}
    catch{setSaveState("error")}
  }
  function local(p:Player,cat:string,value:any){setVals(v=>({...v,[p.id+"|"+cat]:value}))}

  async function saveSession(p:Player,session:Session,patch:Partial<Session>){
    const id=String(p.id),next={...session,...patch};
    setSessions(x=>({...x,[id]:(x[id]||[]).map(s=>String(s.id)===String(session.id)?next:s)}));
    if(session.legacy||demoMode){
      if(patch.raw_notes!==undefined)await persist(p,"__COMMENTARY__",patch.raw_notes||"");
      if(patch.opponent!==undefined)await persist(p,"__GAME_LABEL__",patch.opponent||"");
      return;
    }
    await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:session.id,opponent:next.opponent,gameDate:next.game_date,rawNotes:next.raw_notes,overallWriteup:next.overall_writeup})});
  }
  async function addSession(p:Player){
    const id=String(p.id),draft=newGame[id]||{opponent:"",notes:""};
    if(!draft.opponent.trim()&&!draft.notes.trim())return;
    if(demoMode){
      const s:Session={id:"demo-"+Date.now(),opponent:draft.opponent||"New game",raw_notes:draft.notes,legacy:true};
      setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}));
    }else{
      const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,opponent:draft.opponent,rawNotes:draft.notes})});
      if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}
    }
    setNewGame(x=>({...x,[id]:{opponent:"",notes:""}}));setNewGameOpen(x=>({...x,[id]:false}));
  }

  useEffect(()=>{
    if(mode!=="Evaluate")return;
    const nodes=rankedPlayers.map(p=>document.getElementById("qb-eval-"+p.id)).filter(Boolean) as HTMLElement[];
    if(!nodes.length)return;
    const obs=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      if(visible[0])setSelectedId(String((visible[0].target as HTMLElement).dataset.playerId||""));
    },{rootMargin:"-150px 0px -65% 0px",threshold:[0,.01]});
    nodes.forEach(n=>obs.observe(n));return()=>obs.disconnect();
  },[mode,rankedPlayers]);

  function jumpToPlayer(p:Player){
    setMode("Evaluate");setSelectedId(String(p.id));
    requestAnimationFrame(()=>document.getElementById("qb-eval-"+p.id)?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  function renderPlayerSection(p:Player){
    const id=String(p.id),imp=importedFor(p),metrics=metricDataFor(p),productionMetrics=productionMetricDataFor(p),scouting=scoutingFor(p),analytical=analyticalFor(p),preDraft=preDraftFor(p),fields=fieldsFor(p),draftCtx=resolveDraftContext("QB",p.name,draftPicks,{result:fields["Draft Result"],teamScore:fields["Team Score (10)"],draftCapitalScore:fields["Draft Capital Score (10)"]});
    const teamScore=draftCtx.teamScore,draftCapital=draftCtx.draftCapitalScore,g=(glossary.length?glossary:undefined) as GlossaryRows|undefined;
    const teamAdj=preDraft==null?null:(teamScore-5)*2*glossaryNumber(23,g),capitalAdj=preDraft==null?null:(draftCapital-5)*2*glossaryNumber(24,g);
    const finalGrade=preDraft==null?null:draftAdjustedFinalGrade("QB",preDraft,teamScore,draftCapital,g);
    const combineInput={bmi:num(imp?.BMI)??undefined,forty:num(imp?.["40 Yard Dash"])??undefined,speedScore:num(imp?.["Speed Score"])??undefined,broadJump:num(imp?.["Broad Jump"])??undefined};
    const combine=Object.values(combineInput).some(v=>v!=null)?combineGrade("QB",combineInput,combinePopulation,g):null;
    const filmComplete=FILM.filter(x=>num(evalFor(p,x))!=null).length,gamesWatched=gameCountFor(p),rank=rankedPlayers.indexOf(p)+1,style=schoolStyle(p.college),draft=newGame[id]||{opponent:"",notes:""};
    return <article className="qb-evaluate-player" id={"qb-eval-"+p.id} data-player-id={p.id} key={p.id}>
      <header className={"qb-player-hero "+(!demoMode?"profile-clickable":"")} style={style} onClick={!demoMode?()=>openPlayer(p.id):undefined} role={!demoMode?"button":undefined} tabIndex={!demoMode?0:undefined} onKeyDown={!demoMode?e=>{if(e.key==="Enter"||e.key===" ")openPlayer(p.id)}:undefined}>
        <div className="qb-player-photo">{p.headshot_url?<img src={p.headshot_url} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>:<span>{p.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>}</div>
        <div className="qb-player-title">
          <div className="qb-kicker">QB {rank} · {p.college||"College TBD"}{p.jersey_number?" · #"+p.jersey_number:""}</div>
          <h1>{p.name}</h1>
          <div className="qb-hero-meta">
            <span>{imp?.Age?"Age "+imp.Age:"Age —"}</span><span>{imp?.Class||"Class —"}</span><span>{gamesWatched} game{gamesWatched===1?"":"s"} watched</span>
            <span className="qb-draft-result-badge" title={draftCtx.automated?"Auto-filled from the NFL Draft feed":"Draft team will populate here after the NFL Draft"}><img src="https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" alt="NFL"/><b>{draftCtx.automated?draftCtx.team:"TBD"}</b></span>
          </div>
        </div>
        <div className={"qb-save-state "+saveState}>{demoMode?"Preview data":saveState==="saving"?"Saving…":saveState==="error"?"Save failed":"✓ Saved"}</div>
      </header>
      <div className="qb-grade-strip">
        <GradeCard label="Scouting" value={scouting} accent="film" hint={filmComplete+"/9 traits graded"}/>
        <GradeCard label="Analytical" value={analytical} accent="analytics" hint="Workbook percentile model"/>
        <GradeCard label="Pre-Draft" value={preDraft} accent="pre" hint="Scouting + analytics"/>
        <GradeCard label="Final" value={finalGrade} accent="final" hint={finalGrade==null?"Waiting for NFL draft":"Draft-adjusted"}/>
      </div>

      {tab==="Film"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2></div><div className="qb-completion">{filmComplete}/9 complete</div></div>
        <div className="qb-context-grid">
          <ConstrainedField label="Archetype" value={inputValue(evalFor(p,"Archetype"))} options={[...ARCHETYPE_OPTIONS]} onLocal={v=>local(p,"Archetype",v)} onCommit={v=>persist(p,"Archetype",v)}/>
          <ConstrainedField label="Expected role" value={inputValue(evalFor(p,"Expected Role"))} options={[...ROLE_OPTIONS]} onLocal={v=>local(p,"Expected Role",v)} onCommit={v=>persist(p,"Expected Role",v)}/>
          <ConstrainedField label="Draft projection" value={inputValue(evalFor(p,"Draft Projection"))} options={[...PROJECTION_OPTIONS]} onLocal={v=>local(p,"Draft Projection",v)} onCommit={v=>persist(p,"Draft Projection",v)}/>
        </div>
        <div className="qb-film-grid">{FILM.map(trait=>{const n=num(evalFor(p,trait));return <div className="qb-trait-card" key={trait} style={{"--heat":heatColor((n??50)/100)} as any}>
          <div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div>
          <input className="qb-grade-slider heat" style={{color:heatColor((n??50)/100)}} type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(p,trait,Number(e.target.value))} onMouseUp={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))} onTouchEnd={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))}/>
          <div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div>
          <input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={inputValue(evalFor(p,trait))} onChange={e=>local(p,trait,e.target.value)} onBlur={e=>persist(p,trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)} placeholder="—"/>
        </div>})}</div>
        <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Experience & Risk</h2></div></div>
        <div className="qb-context-grid qb-context-data-row">
          <ReadOnly label="Career Starts" value={imp?.["Career Starts"]}/><ReadOnly label="Career Attempts" value={imp?.["Career Attempts"]}/><ReadOnly label="Career Max YPG" value={imp?.["Career Max YPG"]}/>
        </div>
        <div className="qb-context-grid qb-context-risk-row">
          {ADJUSTMENTS.map(([label,options])=><Field key={label} label={label} source="Scout"><select value={inputValue(evalFor(p,label)||options[0])} onChange={e=>persist(p,label,e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></Field>)}
        </div>
        <div className="qb-game-log">
          <div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2><p>One entry per game, newest first.</p></div><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:!x[id]}))}>+ Add game</button></div>
          {newGameOpen[id]&&<div className="qb-game-note new"><input value={draft.opponent} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,opponent:e.target.value}}))} placeholder="Game label — e.g. 2026 · Ohio State"/><textarea value={draft.notes} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,notes:e.target.value}}))} placeholder="Notes from this game…"/><div className="row-actions"><button onClick={()=>addSession(p)}>Add to top</button><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:false}))}>Cancel</button></div></div>}
          {(sessions[id]||[]).length?(sessions[id]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}><div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{opponent:e.target.value})} placeholder="Season · Opponent"/></div><textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{raw_notes:e.target.value})}/></div>):<div className="qb-game-empty">No game notes yet. Add the first game above.</div>}
        </div>
      </div>}

      {tab==="Analytics"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Analytical Profile</h2><p>Raw QB data is joined directly to the player; percentile direction matches the workbook model.</p></div><GradePill value={analytical}/></div><div className="qb-analytics-grid">
        {metrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower raw value is better":"Higher raw value is better"}</small></div><b>{display(imp?.[m.label],m.pct,m.pct?1:2)}</b></div><div className={"qb-percentile heat "+(m.inverse?"inverse":"")}><i style={{left:((m.rawPercentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}
      </div></div>}

      {tab==="Production"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Imported Data</span><h2>Production</h2><p>Season production shown against the full QB Player Data population.</p></div></div>
        <div className="qb-analytics-grid">{productionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower is better":"QB Player Data percentile"}</small></div><b>{display(m.raw,m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-per-game"><h3>Per Game</h3>{[["Completions",num(imp?.Completions)],["Attempts",num(imp?.Attempts)],["Pass Yards",num(imp?.Yards)],["Pass TD",num(imp?.Touchdowns)],["INT",num(imp?.Interceptions)],["Rush Attempts",num(imp?.Rushes)],["Rush Yards",num(valueFor(imp,"Yards__rush"))],["Rush TD",num(valueFor(imp,"Touchdowns__rush"))]].map(([label,v])=><div key={String(label)}><span>{label}</span><b>{typeof v==="number"&&num(imp?.Games)?(v/(num(imp?.Games)||1)).toFixed(2):"—"}</b></div>)}</div>
      </div>}

      {tab==="Combine"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Combine / Pro Day</h2></div><GradePill value={combine}/></div><div className="qb-combine-grid"><ReadOnly label="Height" value={imp?.Height}/><ReadOnly label="Weight" value={imp?.Weight}/><ReadOnly label="BMI" value={display(imp?.BMI,false,1)}/><ReadOnly label="40 Yard Dash" value={display(imp?.["40 Yard Dash"],false,2)}/><ReadOnly label="Speed Score" value={display(imp?.["Speed Score"],false,1)}/><ReadOnly label="Broad Jump" value={imp?.["Broad Jump"]}/></div><MockDraftablePanel playerName={p.name} position="QB" data={imp}/></div>}

      {tab==="Draft"&&<DraftAdjustmentPanel preDraft={preDraft} finalGrade={finalGrade} draftResult={draftCtx.result} teamScore={teamScore} draftCapital={draftCapital} teamAdj={teamAdj} capitalAdj={capitalAdj} production={false}/>}
    </article>
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched QBs yet</h2><p>Add a quarterback to the watched pool to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;

  const comparePlayers=rankedPlayers.filter(p=>compareIds.includes(String(p.id)));

  return <div className="qb-workspace">
    <aside className="qb-prospect-rail">
      <div className="qb-rail-head"><div><span className="ey">2027 Quarterbacks</span><strong>{players.length} available</strong></div><button className="qb-add" onClick={onAdd} title="New Players Watched">+</button></div>
      <div className="qb-mode-toggle">{(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}</div>
      <input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quarterbacks…"/>
      <div className="qb-prospect-list">{filtered.map(p=>{const g=rankingGradeFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length,rank=rankedPlayers.indexOf(p)+1;return <div className={"qb-prospect-row "+(String(p.id)===selectedId?"active":"")} key={p.id}><button className="qb-prospect-item" onClick={()=>jumpToPlayer(p)}><span className="qb-rank">QB{rank}</span><span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college||"College TBD"} · {done}/9 traits</small></span><span className="qb-mini-grade">{g==null?"—":g.toFixed(2)}</span></button></div>})}</div>
      {demoMode&&<div className="qb-demo-note">Preview data is local to this QB scouting build.</div>}
    </aside>
    <section className={"qb-scouting-pane "+(mode==="Evaluate"?"evaluate":"compare")}>
      {mode==="Compare"?<CompareView players={comparePlayers} allPlayers={rankedPlayers} compareIds={compareIds} setCompareIds={setCompareIds} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor} metricDataFor={metricDataFor}/>:<div className="qb-evaluate-stack">
        <nav className="qb-section-tabs qb-shared-tabs">{(["Film","Production","Analytics","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>
        {rankedPlayers.map(renderPlayerSection)}
      </div>}
    </section>
  </div>
}

function CompareView({players,allPlayers,compareIds,setCompareIds,vals,importedFor,scoutingFor,analyticalFor,preDraftFor,metricDataFor}:{players:Player[],allPlayers:Player[],compareIds:string[],setCompareIds:React.Dispatch<React.SetStateAction<string[]>>,vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null,metricDataFor:(p:Player)=>any[]}){
  type Metric={key:string;group:string;label:string;numeric?:boolean;inverse?:boolean;get:(p:Player)=>any;format?:(v:any)=>string};
  const [filterOpen,setFilterOpen]=useState(false);
  const [sortKey,setSortKey]=useState("rank");
  const [sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const metrics:Metric[]=[
    {key:"scouting",group:"Grades",label:"Scouting",numeric:true,get:scoutingFor,format:v=>fmt(v)},
    {key:"analytical",group:"Grades",label:"Analytical",numeric:true,get:analyticalFor,format:v=>fmt(v)},
    {key:"preDraft",group:"Grades",label:"Pre-Draft",numeric:true,get:preDraftFor,format:v=>fmt(v)},
    {key:"gamesWatched",group:"Profile",label:"Games Watched",numeric:true,get:p=>num(vals[p.id+"|Games watched"])},
    {key:"role",group:"Profile",label:"Role",get:p=>inputValue(vals[p.id+"|Expected Role"])||"—"},
    {key:"draftProjection",group:"Profile",label:"Draft Projection",get:p=>inputValue(vals[p.id+"|Draft Projection"])||"—"},
    {key:"draftResult",group:"Profile",label:"Draft Result",get:p=>inputValue(vals[p.id+"|Draft Result"])||"—"},
    ...FILM.map(label=>({key:"film-"+label,group:"Film",label,numeric:true,get:(p:Player)=>num(vals[p.id+"|"+label]),format:(v:any)=>v==null?"—":Number(v).toFixed(2)})),
    {key:"comp",group:"Production",label:"Comp %",numeric:true,get:(p:Player)=>num(importedFor(p)["Completion %"],true),format:(v:any)=>v==null?"—":(Number(v)*100).toFixed(1)+"%"},
    {key:"ypa",group:"Production",label:"Yards / Att",numeric:true,get:(p:Player)=>num(importedFor(p)["Yards/Attempt"]),format:(v:any)=>formatNumber(v,2)},
    {key:"passTd",group:"Production",label:"Pass TD",numeric:true,get:(p:Player)=>num(importedFor(p).Touchdowns),format:(v:any)=>formatNumber(v,0)},
    {key:"int",group:"Production",label:"INT",numeric:true,inverse:true,get:(p:Player)=>num(importedFor(p).Interceptions),format:(v:any)=>formatNumber(v,0)},
    {key:"qbr",group:"Production",label:"QBR",numeric:true,get:(p:Player)=>num(importedFor(p).QBR),format:(v:any)=>formatNumber(v,1)},
    {key:"adot",group:"Production",label:"ADOT",numeric:true,get:(p:Player)=>num(importedFor(p).ADOT),format:(v:any)=>formatNumber(v,1)},
    {key:"aya",group:"Production",label:"Adjusted Y/A",numeric:true,get:(p:Player)=>num(importedFor(p)["Adjusted Y/A"]),format:(v:any)=>formatNumber(v,2)},
    {key:"p2s",group:"Production",label:"Pressure-to-Sack %",numeric:true,inverse:true,get:(p:Player)=>num(importedFor(p)["Pressure-to-Sack %"],true),format:(v:any)=>v==null?"—":(Number(v)*100).toFixed(1)+"%"},
    {key:"rushYds",group:"Production",label:"Rush Yards",numeric:true,get:(p:Player)=>num(importedFor(p)["Rush Yards"]),format:(v:any)=>formatNumber(v,0)},
    {key:"rushYpa",group:"Production",label:"Rush Yds / Att",numeric:true,get:(p:Player)=>num(importedFor(p)["Rush Yards/Attempt"]),format:(v:any)=>formatNumber(v,2)},
    ...ANALYTICS.map(a=>({key:"analytics-"+a.label,group:"Analytics",label:a.label+" %ile",numeric:true,get:(p:Player)=>{const m=metricDataFor(p).find((x:any)=>x.label===a.label);return m?.percentile==null?null:m.percentile*100},format:(v:any)=>v==null?"—":Math.round(Number(v)).toString()}))
  ];
  const groups=Array.from(new Set(metrics.map(m=>m.group))).map(group=>({group,count:metrics.filter(m=>m.group===group).length}));
  const metricMap=new Map(metrics.map(m=>[m.key,m]));
  const toggle=(id:string)=>setCompareIds(cur=>cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]);
  const changeSort=(key:string)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir(key==="rank"||key==="player"?"asc":"desc")}};
  const sorted=[...players].sort((a,b)=>{
    let av:any,bv:any;
    if(sortKey==="rank"){av=allPlayers.indexOf(a)+1;bv=allPlayers.indexOf(b)+1}
    else if(sortKey==="player"){av=(a.name+" "+(a.college||"")).toLowerCase();bv=(b.name+" "+(b.college||"")).toLowerCase()}
    else{const m=metricMap.get(sortKey);av=m?.get(a);bv=m?.get(b)}
    const aBlank=av==null||av==="",bBlank=bv==null||bv==="";
    if(aBlank&&bBlank)return 0;if(aBlank)return 1;if(bBlank)return -1;
    const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
    return sortDir==="asc"?cmp:-cmp;
  });
  const arrow=(key:string)=>sortKey===key?(sortDir==="asc"?" ↑":" ↓"):"";
  return <div className="qb-compare-view">
    <div className="qb-compare-head">
      <div><span className="ey">Side-by-Side</span><h2>QB Comparison Board</h2><p>Click any column header to sort. Numeric cells are conditionally formatted within the current comparison set.</p></div>
      <div className="qb-compare-controls">
        <button className="ghost" onClick={()=>setCompareIds(allPlayers.map(p=>String(p.id)))}>All players</button>
        <div className="qb-compare-filter">
          <button className={"qb-compare-filter-button "+(filterOpen?"open":"")} onClick={()=>setFilterOpen(x=>!x)}>{players.length} of {allPlayers.length} Players <span>▾</span></button>
          {filterOpen&&<div className="qb-compare-filter-list">
            {allPlayers.map(p=><label key={p.id}><input type="checkbox" checked={compareIds.includes(String(p.id))} onChange={()=>toggle(String(p.id))}/><span>QB{allPlayers.indexOf(p)+1}</span><b>{p.name}</b><small>{p.college}</small></label>)}
          </div>}
        </div>
      </div>
    </div>
    {!players.length?<div className="qb-game-empty">Select at least one quarterback to compare.</div>:<div className="qb-compare-scroll">
      <table className="qb-compare-matrix">
        <thead>
          <tr className="groups">
            <th rowSpan={2}><button onClick={()=>changeSort("rank")}>Rank{arrow("rank")}</button></th>
            <th rowSpan={2}><button onClick={()=>changeSort("player")}>Player / School{arrow("player")}</button></th>
            {groups.map(g=><th key={g.group} colSpan={g.count}>{g.group}</th>)}
          </tr>
          <tr>{metrics.map(m=><th key={m.key}><button onClick={()=>changeSort(m.key)}>{m.label}{arrow(m.key)}</button></th>)}</tr>
        </thead>
        <tbody>
          {sorted.map(p=><tr key={p.id}>
            <th className="rank">QB{allPlayers.indexOf(p)+1}</th>
            <th className="player" style={schoolStyle(p.college)}><b>{p.name}</b><small> · {p.college}</small></th>
            {metrics.map(m=>{
              const raw=m.get(p),values=m.numeric?players.map(x=>m.get(x)).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)):[];
              const shown=m.format?m.format(raw):(raw==null||raw===""?"—":String(raw));
              return <td key={m.key} className={m.numeric?"numeric":""} style={m.numeric?conditionalStyle(raw,values,m.inverse):undefined}>{shown}</td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>}
  </div>
}

function heatColor(ratio:number){const r=Math.max(0,Math.min(1,ratio));return `hsl(${Math.round(r*120)} 72% 48%)`}
function conditionalStyle(value:any,values:number[],inverse=false){
  const n=typeof value==="number"?value:null;if(n==null||!Number.isFinite(n)||!values.length)return undefined;
  const min=Math.min(...values),max=Math.max(...values);let ratio=max===min?.5:(n-min)/(max-min);if(inverse)ratio=1-ratio;const h=Math.round(ratio*120);
  return {background:`hsl(${h} 72% 42% / .18)`,boxShadow:`inset 0 -2px 0 hsl(${h} 72% 48% / .75)`};
}
function formatNumber(v:any,digits=2){return typeof v==="number"&&Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—"}
function fmt(v:number|null){return v==null?"—":v.toFixed(2)}
function GradeCard({label,value,accent,hint}:{label:string,value:number|null,accent:string,hint:string}){return <div className={"qb-grade-card "+accent}><span>{label}</span><strong>{value==null?"—":value.toFixed(2)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{value==null?"—":value.toFixed(2)}</b></div>}
function Field({label,source,children}:{label:string,source:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>{source}</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
function ConstrainedField({label,value,options,onLocal,onCommit}:{label:string,value:string,options:string[],onLocal:(v:string)=>void,onCommit:(v:string)=>void|Promise<any>}){
  const isCustom=Boolean(value)&&!options.includes(value);
  const [other,setOther]=useState(isCustom);
  useEffect(()=>setOther(Boolean(value)&&!options.includes(value)),[value,options]);
  return <Field label={label} source="Scout"><div className="qb-constrained">
    <select value={other?"Other":value} onChange={e=>{if(e.target.value==="Other"){setOther(true);onLocal("")}else{setOther(false);onLocal(e.target.value);onCommit(e.target.value)}}}>
      <option value="">Select…</option>{options.map(x=><option key={x}>{x}</option>)}<option>Other</option>
    </select>
    {other&&<input value={value} onChange={e=>onLocal(e.target.value)} onBlur={e=>onCommit(e.target.value)} placeholder={"Other "+label.toLowerCase()+"…"}/>}
  </div></Field>
}
