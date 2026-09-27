"use client";

import {Fragment,useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {draftAdjustedFinalGrade,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {qbAnalyticalGrade} from "@/lib/analytical-grades";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {usePlayerProfile} from "@/components/PlayerProfile";

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
type Tab="Film"|"Analytics"|"Stats"|"Combine"|"Draft";
type Mode="Evaluate"|"Compare";

const FILM=["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"] as const;
const ROLE_OPTIONS=["Early Starter","Developmental Starter","Backup","3rd String+"] as const;
const PROJECTION_OPTIONS=["Top 5","Top 10","First Round","Day 2","Early Day 3","Late Day 3","UDFA"] as const;
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
  const [newGameOpen,setNewGameOpen]=useState(false);
  const [newGame,setNewGame]=useState({opponent:"",notes:""});

  useEffect(()=>{
    if(!players.length){setSelectedId("");return}
    if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));
    setCompareIds(cur=>{
      const valid=cur.filter(id=>players.some(p=>String(p.id)===id));
      return valid.length?valid:players.slice(0,Math.min(3,players.length)).map(p=>String(p.id));
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
    if(!selected)return;
    const id=String(selected.id);
    if(sessions[id])return;
    const legacy=String(evalFor(selected,"__COMMENTARY__")||"").trim();
    const legacyLabel=String(evalFor(selected,"__GAME_LABEL__")||"").trim();
    if(demoMode){
      setSessions(x=>({...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]}));
      return;
    }
    fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{
      const live=Array.isArray(rows)?rows:[];
      const fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];
      setSessions(x=>({...x,[id]:live.length?live:fallback}));
    }).catch(()=>setSessions(x=>({...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]})));
  },[selected,vals,demoMode,sessions]);

  useEffect(()=>{
    if(demoMode)return;
    for(const p of players.filter(p=>compareIds.includes(String(p.id)))){
      const id=String(p.id);
      if(sessions[id])continue;
      fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{
        const live=Array.isArray(rows)?rows:[],legacy=String(evalFor(p,"__COMMENTARY__")||"").trim(),label=String(evalFor(p,"__GAME_LABEL__")||"").trim();
        setSessions(x=>x[id]?x:{...x,[id]:live.length?live:(legacy?[{id:"legacy-"+id,opponent:label||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[])});
      }).catch(()=>{});
    }
  },[compareIds,players,demoMode]);

  const filtered=useMemo(()=>{
    const q=norm(search);
    return players.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q));
  },[players,search]);

  function fieldsFor(p:Player){
    const out:Record<string,any>={...importedFor(p)};
    for(const cat of [...FILM,"Games watched","Expected Role","Draft Projection","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){
      const v=evalFor(p,cat);
      if(v!==undefined&&v!==null&&v!=="")out[cat]=v;
    }
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
      return {...metric,raw,percentile};
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

  const metricData=selected?metricDataFor(selected):[];
  const scouting=selected?scoutingFor(selected):null;
  const analytical=selected?analyticalFor(selected):null;
  const preDraft=selected?preDraftFor(selected):null;
  const fields=selected?fieldsFor(selected):{};
  const teamScore=num(fields["Team Score (10)"]),draftCapital=num(fields["Draft Capital Score (10)"]);
  const finalGrade=preDraft==null||teamScore==null||draftCapital==null?null:draftAdjustedFinalGrade("QB",preDraft,teamScore,draftCapital,(glossary.length?glossary:undefined) as GlossaryRows|undefined);

  const combinePopulation=useMemo(()=>({
    forty:(imports||[]).map(r=>num(r["40 Yard Dash"])).filter((x):x is number=>x!=null),
    speedScore:(imports||[]).map(r=>num(r["Speed Score"])).filter((x):x is number=>x!=null),
    broadJump:(imports||[]).map(r=>num(r["Broad Jump"])).filter((x):x is number=>x!=null),
    handSize:[],vertical:[],benchReps:[]
  }),[imports]);
  const combineInput={
    bmi:num(imported?.BMI)??undefined,
    forty:num(imported?.["40 Yard Dash"])??undefined,
    speedScore:num(imported?.["Speed Score"])??undefined,
    broadJump:num(imported?.["Broad Jump"])??undefined
  };
  const combine=Object.values(combineInput).some(v=>v!=null)?combineGrade("QB",combineInput,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null;

  async function persist(cat:string,value:any){
    if(!selected)return;
    setSaveState("saving");
    setVals(v=>({...v,[selected.id+"|"+cat]:value}));
    if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}
    try{await onSave(selected,cat,value);setSaveState("saved")}
    catch{setSaveState("error")}
  }
  function local(cat:string,value:any){if(selected)setVals(v=>({...v,[selected.id+"|"+cat]:value}))}

  async function saveSession(session:Session,patch:Partial<Session>){
    if(!selected)return;
    const id=String(selected.id),next={...session,...patch};
    setSessions(x=>({...x,[id]:(x[id]||[]).map(s=>String(s.id)===String(session.id)?next:s)}));
    if(session.legacy||demoMode){
      if(patch.raw_notes!==undefined)await persist("__COMMENTARY__",patch.raw_notes||"");
      if(patch.opponent!==undefined)await persist("__GAME_LABEL__",patch.opponent||"");
      return;
    }
    await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:session.id,opponent:next.opponent,gameDate:next.game_date,rawNotes:next.raw_notes,overallWriteup:next.overall_writeup})});
  }
  async function addSession(){
    if(!selected||(!newGame.opponent.trim()&&!newGame.notes.trim()))return;
    const id=String(selected.id);
    if(demoMode){
      const s:Session={id:"demo-"+Date.now(),opponent:newGame.opponent||"New game",raw_notes:newGame.notes,legacy:true};
      setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}));
    }else{
      const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:selected.id,opponent:newGame.opponent,rawNotes:newGame.notes})});
      if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}
    }
    setNewGame({opponent:"",notes:""});setNewGameOpen(false);
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched QBs yet</h2><p>Add a quarterback to the watched pool to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;

  const filmComplete=FILM.filter(x=>num(evalValue(x))!=null).length;
  const gamesWatched=num(evalValue("Games watched"))||0;
  const collegeStyle=schoolStyle(selected?.college);
  const comparePlayers=players.filter(p=>compareIds.includes(String(p.id))).slice(0,4);

  return <div className="qb-workspace">
    <aside className="qb-prospect-rail">
      <div className="qb-rail-head">
        <div><span className="ey">2027 Quarterbacks</span><strong>{players.length} available</strong></div>
        <button className="qb-add" onClick={onAdd} title="Add watched quarterback">+</button>
      </div>
      <div className="qb-mode-toggle">
        {(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}
      </div>
      <input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quarterbacks…"/>
      <div className="qb-prospect-list">
        {filtered.map((p,i)=>{
          const g=scoutingFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length,checked=compareIds.includes(String(p.id));
          return <div className={"qb-prospect-row "+(String(p.id)===String(selected?.id)?"active":"")} key={p.id}>
            <button className="qb-prospect-item" onClick={()=>{setSelectedId(String(p.id));setMode("Evaluate");setTab("Film")}}>
              <span className="qb-rank">QB{i+1}</span>
              <span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college||"College TBD"} · {done}/9 traits</small></span>
              <span className="qb-mini-grade">{g==null?"—":g.toFixed(2)}</span>
            </button>
            <label className="qb-compare-pin" title="Pin for comparison"><input type="checkbox" checked={checked} onChange={e=>setCompareIds(cur=>e.target.checked?[...cur.filter(x=>x!==String(p.id)),String(p.id)].slice(-4):cur.filter(x=>x!==String(p.id)))}/><span>⇄</span></label>
          </div>
        })}
      </div>
      {demoMode&&<div className="qb-demo-note">Preview seeded from the archived Arch Manning scouting row. Changes here are local to this preview.</div>}
    </aside>

    <section className="qb-scouting-pane">
      {mode==="Compare"?<CompareView players={comparePlayers.length?comparePlayers:[selected]} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor} sessions={sessions}/>:<>
        <header className="qb-player-hero" style={collegeStyle}>
          <div className="qb-player-photo">
            {selected.headshot_url?<img src={selected.headshot_url} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>:<span>{selected.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>}
          </div>
          <div className="qb-player-title">
            <div className="qb-kicker">QB {players.indexOf(selected)+1} · {selected.college||"College TBD"}{selected.jersey_number?" · #"+selected.jersey_number:""}</div>
            <h1>{selected.name}</h1>
            <div className="qb-hero-meta">
              <span>{imported?.Age?"Age "+imported.Age:"Age —"}</span>
              <span>{imported?.Class||"Class —"}</span>
              <span>{gamesWatched} game{gamesWatched===1?"":"s"} watched</span>
              {!demoMode&&<button onClick={()=>openPlayer(selected.id)}>Open player profile ↗</button>}
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

        <nav className="qb-section-tabs">
          {(["Film","Analytics","Stats","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}
        </nav>

        {tab==="Film"&&<div className="qb-tab-content">
          <div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2></div><div className="qb-completion">{filmComplete}/9 complete</div></div>
          <div className="qb-context-grid">
            <Field label="Games watched" source="Scout"><input type="number" min="0" step="1" value={inputValue(evalValue("Games watched"))} onChange={e=>local("Games watched",e.target.value)} onBlur={e=>persist("Games watched",e.target.value===""?"":Number(e.target.value))}/></Field>
            <ConstrainedField label="Expected role" value={inputValue(evalValue("Expected Role"))} options={[...ROLE_OPTIONS]} onLocal={v=>local("Expected Role",v)} onCommit={v=>persist("Expected Role",v)}/>
            <ConstrainedField label="Draft projection" value={inputValue(evalValue("Draft Projection"))} options={[...PROJECTION_OPTIONS]} onLocal={v=>local("Draft Projection",v)} onCommit={v=>persist("Draft Projection",v)}/>
          </div>

          <div className="qb-film-grid">
            {FILM.map(trait=>{
              const n=num(evalValue(trait));
              return <div className="qb-trait-card" key={trait}>
                <div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div>
                <input className="qb-grade-slider" type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(trait,Number(e.target.value))} onMouseUp={e=>persist(trait,Number((e.target as HTMLInputElement).value))} onTouchEnd={e=>persist(trait,Number((e.target as HTMLInputElement).value))}/>
                <div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div>
                <input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={inputValue(evalValue(trait))} onChange={e=>local(trait,e.target.value)} onBlur={e=>persist(trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)} placeholder="—"/>
              </div>
            })}
          </div>

          <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Experience & Risk</h2></div></div>
          <div className="qb-context-grid six">
            <ReadOnly label="Career Starts" value={imported?.["Career Starts"]} />
            <ReadOnly label="Career Attempts" value={imported?.["Career Attempts"]} />
            <ReadOnly label="Career Max YPG" value={imported?.["Career Max YPG"]} />
            {ADJUSTMENTS.map(([label,options])=><Field key={label} label={label} source="Scout"><select value={inputValue(evalValue(label)||options[0])} onChange={e=>persist(label,e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></Field>)}
          </div>

          <div className="qb-game-log">
            <div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2><p>One entry per game, newest first. This replaces spacing down inside one merged cell.</p></div><button className="ghost" onClick={()=>setNewGameOpen(x=>!x)}>+ Add game</button></div>
            {newGameOpen&&<div className="qb-game-note new">
              <input value={newGame.opponent} onChange={e=>setNewGame(x=>({...x,opponent:e.target.value}))} placeholder="Game label — e.g. 2026 · Ohio State"/>
              <textarea value={newGame.notes} onChange={e=>setNewGame(x=>({...x,notes:e.target.value}))} placeholder="Notes from this game…"/>
              <div className="row-actions"><button onClick={addSession}>Add to top</button><button className="ghost" onClick={()=>setNewGameOpen(false)}>Cancel</button></div>
            </div>}
            {(sessions[String(selected.id)]||[]).length?(sessions[String(selected.id)]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}>
              <div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[String(selected.id)]:(x[String(selected.id)]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(s,{opponent:e.target.value})} placeholder="Season · Opponent"/></div>
              <textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[String(selected.id)]:(x[String(selected.id)]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(s,{raw_notes:e.target.value})}/>
            </div>):<div className="qb-game-empty">No game notes yet. Add the first game above.</div>}
          </div>
        </div>}

        {tab==="Analytics"&&<div className="qb-tab-content">
          <div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Analytical Profile</h2><p>Raw QB data is joined directly to the player; percentile direction matches the workbook model.</p></div><GradePill value={analytical}/></div>
          <div className="qb-analytics-grid">
            {metricData.map(m=><div className="qb-metric" key={m.label}>
              <div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower raw value is better":"Higher raw value is better"}</small></div><b>{display(imported?.[m.label],m.pct,m.pct?1:2)}</b></div>
              <div className="qb-percentile"><i style={{width:((m.percentile??0)*100)+"%"}}/></div>
              <div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div>
            </div>)}
          </div>
        </div>}

        {tab==="Stats"&&<div className="qb-tab-content">
          <div className="qb-section-head"><div><span className="ey">Imported Data</span><h2>Production</h2><p>The sheet's lookup columns are presented as one joined player data record.</p></div></div>
          <div className="qb-stat-grid">
            {STATS.map(([label,source])=>{
              const raw=valueFor(imported,source),isPct=label.includes("%");
              return <div className="qb-stat-card" key={label}><span>{label}</span><strong>{display(raw,isPct,isPct?1:2)}</strong></div>
            })}
          </div>
          <div className="qb-per-game">
            <h3>Per Game</h3>
            {[
              ["Completions",num(imported?.Completions)],["Attempts",num(imported?.Attempts)],["Pass Yards",num(imported?.Yards)],
              ["Pass TD",num(imported?.Touchdowns)],["INT",num(imported?.Interceptions)],["Rush Attempts",num(imported?.Rushes)],
              ["Rush Yards",num(valueFor(imported,"Yards__rush"))],["Rush TD",num(valueFor(imported,"Touchdowns__rush"))]
            ].map(([label,v])=><div key={String(label)}><span>{label}</span><b>{typeof v==="number"&&num(imported?.Games)?(v/(num(imported?.Games)||1)).toFixed(2):"—"}</b></div>)}
          </div>
        </div>}

        {tab==="Combine"&&<div className="qb-tab-content">
          <div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Combine / Pro Day</h2><p>Measurements and testing flow directly from the player dataset.</p></div><GradePill value={combine}/></div>
          <div className="qb-combine-grid">
            <ReadOnly label="Height" value={imported?.Height}/>
            <ReadOnly label="Weight" value={imported?.Weight}/>
            <ReadOnly label="BMI" value={display(imported?.BMI,false,1)}/>
            <ReadOnly label="40 Yard Dash" value={display(imported?.["40 Yard Dash"],false,2)}/>
            <ReadOnly label="Speed Score" value={display(imported?.["Speed Score"],false,1)}/>
            <ReadOnly label="Broad Jump" value={imported?.["Broad Jump"]}/>
          </div>
        </div>}

        {tab==="Draft"&&<div className="qb-tab-content">
          <div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2><p>The scouting model remains intact without exposing spreadsheet lookup plumbing.</p></div></div>
          <div className="qb-draft-grid">
            <div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{preDraft==null?"—":preDraft.toFixed(2)}</strong><small>Scouting + analytical grade</small></div>
            <div className="qb-draft-arrow">→</div>
            <div className="qb-draft-card"><span>NFL Draft Result</span><strong>{fields["Draft Result"]||"Pending"}</strong><small>Auto-filled after the NFL Draft</small></div>
            <div className="qb-draft-arrow">→</div>
            <div className="qb-draft-card final"><span>Draft-Adjusted Final</span><strong>{finalGrade==null?"—":finalGrade.toFixed(2)}</strong><small>Team fit + draft capital adjustment</small></div>
          </div>
        </div>}
      </>}
    </section>
  </div>
}

function CompareView({players,vals,importedFor,scoutingFor,analyticalFor,preDraftFor,sessions}:{players:Player[],vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null,sessions:Record<string,Session[]>}){
  const rows=[
    {section:"Overview",label:"Scouting Grade",get:(p:Player)=>fmt(scoutingFor(p))},
    {section:"Overview",label:"Analytical Grade",get:(p:Player)=>fmt(analyticalFor(p))},
    {section:"Overview",label:"Pre-Draft Grade",get:(p:Player)=>fmt(preDraftFor(p))},
    {section:"Overview",label:"Games Watched",get:(p:Player)=>inputValue(vals[p.id+"|Games watched"])||"—"},
    {section:"Overview",label:"Role",get:(p:Player)=>inputValue(vals[p.id+"|Expected Role"])||"—"},
    {section:"Overview",label:"Draft Projection",get:(p:Player)=>inputValue(vals[p.id+"|Draft Projection"])||"—"},
    ...FILM.map(label=>({section:"Film",label,get:(p:Player)=>{const n=num(vals[p.id+"|"+label]);return n==null?"—":n.toFixed(2)}})),
    {section:"Production",label:"Comp %",get:(p:Player)=>display(importedFor(p)["Completion %"],true,1)},
    {section:"Production",label:"Yards / Att",get:(p:Player)=>display(importedFor(p)["Yards/Attempt"])},
    {section:"Production",label:"Pass TD",get:(p:Player)=>display(importedFor(p).Touchdowns,false,0)},
    {section:"Production",label:"INT",get:(p:Player)=>display(importedFor(p).Interceptions,false,0)},
    {section:"Production",label:"QBR",get:(p:Player)=>display(importedFor(p).QBR,false,1)},
    {section:"Production",label:"ADOT",get:(p:Player)=>display(importedFor(p).ADOT,false,1)},
    {section:"Production",label:"Adjusted Y/A",get:(p:Player)=>display(importedFor(p)["Adjusted Y/A"])},
    {section:"Production",label:"Pressure-to-Sack %",get:(p:Player)=>display(importedFor(p)["Pressure-to-Sack %"],true,1)},
    {section:"Production",label:"Rush Yards",get:(p:Player)=>display(importedFor(p)["Rush Yards"],false,0)},
    {section:"Production",label:"Rush Yds / Att",get:(p:Player)=>display(importedFor(p)["Rush Yards/Attempt"])},
    {section:"Notes",label:"Latest Game",get:(p:Player)=>sessions[String(p.id)]?.[0]?.opponent||inputValue(vals[p.id+"|__GAME_LABEL__"])||"—"},
    {section:"Notes",label:"Latest Commentary",get:(p:Player)=>sessions[String(p.id)]?.[0]?.raw_notes||inputValue(vals[p.id+"|__COMMENTARY__"])||"—"}
  ];
  let last="";
  return <div className="qb-compare-view">
    <div className="qb-compare-head"><div><span className="ey">Side-by-Side</span><h2>QB Comparison Board</h2><p>Pin up to four quarterbacks from the left rail. Comparable film grades, production and latest notes stay aligned.</p></div><span>{players.length}/4 pinned</span></div>
    <div className="qb-compare-scroll"><table className="qb-compare-table"><thead><tr><th>Metric</th>{players.map(p=><th key={p.id} style={schoolStyle(p.college)}><b>{p.name}</b><small>{p.college}</small></th>)}</tr></thead><tbody>
      {rows.map(r=>{const show=r.section!==last;last=r.section;return <Fragment key={r.section+r.label}>{show&&<tr><td className="qb-compare-section" colSpan={players.length+1}>{r.section}</td></tr>}<tr className={r.section==="Notes"?"notes":""}><th>{r.label}</th>{players.map(p=><td key={p.id}>{r.get(p)}</td>)}</tr></Fragment>})}
    </tbody></table></div>
  </div>
}

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
