"use client";

import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {draftAdjustedFinalGrade,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {qbAnalyticalGrade} from "@/lib/analytical-grades";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {usePlayerProfile} from "@/components/PlayerProfile";

type Player={
  id:string|number;
  name:string;
  position:"QB";
  college?:string;
  draft_class:number;
  scouting_status:string;
  watch_order?:number;
  headshot_url?:string;
  jersey_number?:string;
};
type Props={
  players:Player[];
  vals:Record<string,any>;
  setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;
  imports:any[];
  glossary:any[][];
  onSave:(player:Player,category:string,value:any)=>Promise<any>;
  onAdd:()=>void;
};
type Tab="Film"|"Analytics"|"Stats"|"Combine"|"Draft";

const FILM=["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"] as const;
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
function scoreLabel(n:number|null){if(n==null)return "Not graded";if(n>=8.5)return "Impact";if(n>=7)return "Strength";if(n>=5.5)return "Solid";if(n>=4)return "Concern";return "Liability"}

export default function QBScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd}:Props){
  const {openPlayer}=usePlayerProfile();
  const [selectedId,setSelectedId]=useState<string>("");
  const [search,setSearch]=useState("");
  const [tab,setTab]=useState<Tab>("Film");
  const [saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");

  useEffect(()=>{
    if(!players.length){setSelectedId("");return}
    if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));
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
  const imported=selected?importMap.get(norm(selected.name))||{}:{};
  const key=(cat:string)=>selected?selected.id+"|"+cat:"";
  const evalValue=(cat:string)=>selected?vals[key(cat)]:"";

  const filtered=useMemo(()=>{
    const q=norm(search);
    return players.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q));
  },[players,search]);

  const metricData=useMemo(()=>{
    const all=(imports||[]).filter(r=>r&&norm(r.Player||String(r["Player, College"]||"").split(",")[0]));
    return ANALYTICS.map(metric=>{
      const population=all.map(r=>num(r[metric.label],metric.pct)).filter((x):x is number=>x!=null);
      const raw=num(imported?.[metric.label],metric.pct);
      const base=raw==null?null:percentRankInc(population,raw);
      const percentile=base==null?null:(metric.inverse?1-base:base);
      return {...metric,raw,percentile};
    });
  },[imports,imported]);

  const fields=useMemo(()=>{
    const out:Record<string,any>={...imported};
    if(!selected)return out;
    for(const cat of [...FILM,"Games watched","Expected Role","Draft Projection","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){
      const v=vals[selected.id+"|"+cat];
      if(v!==undefined&&v!==null&&v!=="")out[cat]=v;
    }
    return out;
  },[imported,selected,vals]);

  const scouting=selected?workbookScoutingGrade("QB",FILM.map(x=>Number(evalValue(x))),fields,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null;
  const analyticalRecord=Object.fromEntries(metricData.map(x=>[x.sheet,x.percentile])) as Record<string,number|null>;
  analyticalRecord.pressureToSack=num(imported?.["Pressure-to-Sack %"],true);
  const analytical=scouting==null?null:qbAnalyticalGrade(scouting,analyticalRecord,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  const preDraft=scouting==null?null:preDraftGrade("QB",scouting,null,analytical,false,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
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
  const hasCombine=Object.values(combineInput).some(v=>v!=null);
  const combine=hasCombine?combineGrade("QB",combineInput,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null;

  async function persist(cat:string,value:any){
    if(!selected)return;
    setSaveState("saving");
    try{await onSave(selected,cat,value);setSaveState("saved")}
    catch{setSaveState("error")}
  }
  function local(cat:string,value:any){if(selected)setVals(v=>({...v,[selected.id+"|"+cat]:value}))}

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched QBs yet</h2><p>Add a quarterback to the watched pool to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;

  const filmComplete=FILM.filter(x=>num(evalValue(x))!=null).length;
  const gamesWatched=num(evalValue("Games watched"))||0;
  const collegeStyle=schoolStyle(selected?.college);

  return <div className="qb-workspace">
    <aside className="qb-prospect-rail">
      <div className="qb-rail-head">
        <div><span className="ey">2027 Quarterbacks</span><strong>{players.length} watched</strong></div>
        <button className="qb-add" onClick={onAdd} title="Add watched quarterback">+</button>
      </div>
      <input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quarterbacks…"/>
      <div className="qb-prospect-list">
        {filtered.map((p,i)=>{
          const g=(()=>{const imp=importMap.get(norm(p.name))||{},f={...imp};for(const cat of [...FILM,"Games watched","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?"]){const v=vals[p.id+"|"+cat];if(v!==undefined&&v!==null&&v!=="")f[cat]=v}return workbookScoutingGrade("QB",FILM.map(x=>Number(vals[p.id+"|"+x])),f,(glossary.length?glossary:undefined) as GlossaryRows|undefined)})();
          const done=FILM.filter(x=>num(vals[p.id+"|"+x])!=null).length;
          return <button key={p.id} className={"qb-prospect-item "+(String(p.id)===String(selected?.id)?"active":"")} onClick={()=>{setSelectedId(String(p.id));setTab("Film")}}>
            <span className="qb-rank">QB{i+1}</span>
            <span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college||"College TBD"} · {done}/9 traits</small></span>
            <span className="qb-mini-grade">{g==null?"—":g.toFixed(1)}</span>
          </button>
        })}
      </div>
    </aside>

    <section className="qb-scouting-pane">
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
            <button onClick={()=>openPlayer(selected.id)}>Open player profile ↗</button>
          </div>
        </div>
        <div className={"qb-save-state "+saveState}>{saveState==="saving"?"Saving…":saveState==="error"?"Save failed":"✓ Saved"}</div>
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
          <Field label="Expected role" source="Scout"><input value={inputValue(evalValue("Expected Role"))} onChange={e=>local("Expected Role",e.target.value)} onBlur={e=>persist("Expected Role",e.target.value)} placeholder="Starter, developmental, etc."/></Field>
          <Field label="Draft projection" source="Scout"><input value={inputValue(evalValue("Draft Projection"))} onChange={e=>local("Draft Projection",e.target.value)} onBlur={e=>persist("Draft Projection",e.target.value)} placeholder="Round / range"/></Field>
        </div>
        <div className="qb-film-grid">
          {FILM.map(trait=>{
            const n=num(evalValue(trait));
            return <div className="qb-trait-card" key={trait}>
              <div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(1)}</strong></div>
              <input className="qb-grade-slider" type="range" min="1" max="10" step=".5" value={n??5} onChange={e=>local(trait,Number(e.target.value))} onMouseUp={e=>persist(trait,Number((e.target as HTMLInputElement).value))} onTouchEnd={e=>persist(trait,Number((e.target as HTMLInputElement).value))}/>
              <div className="qb-trait-scale"><span>1</span><span>5</span><span>10</span></div>
              <input className="qb-grade-number" type="number" min="1" max="10" step=".5" value={inputValue(evalValue(trait))} onChange={e=>local(trait,e.target.value)} onBlur={e=>persist(trait,e.target.value===""?"":Number(e.target.value))} placeholder="—"/>
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

        <div className="qb-notes-card">
          <div className="qb-section-head compact"><div><span className="ey">Notebook</span><h2>Scouting Commentary</h2></div><small>Cloud saved on blur</small></div>
          <textarea value={inputValue(evalValue("__COMMENTARY__"))} onChange={e=>local("__COMMENTARY__",e.target.value)} onBlur={e=>persist("__COMMENTARY__",e.target.value)} placeholder="What did you see on film? Add game context, strengths, concerns, and projection notes…"/>
        </div>
      </div>}

      {tab==="Analytics"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Analytical Profile</h2><p>Raw PFF-style inputs are joined directly to the player record; percentile direction matches the workbook formula.</p></div><GradePill value={analytical}/></div>
        <div className="qb-analytics-grid">
          {metricData.map(m=><div className="qb-metric" key={m.label}>
            <div className="qb-metric-top"><div><span>{m.label}</span><small>{m.inverse?"Lower raw value is better":"Higher raw value is better"}</small></div><b>{display(imported?.[m.label],m.pct,m.pct?1:2)}</b></div>
            <div className="qb-percentile"><i style={{width:((m.percentile??0)*100)+"%"}}/></div>
            <div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div>
          </div>)}
        </div>
      </div>}

      {tab==="Stats"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Imported Data</span><h2>2025 Production</h2><p>The sheet's lookup columns are presented here as one joined player data record.</p></div></div>
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
        <div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Combine / Pro Day</h2><p>Measurements and testing flow directly from the player dataset; the score uses the same glossary weights as the workbook.</p></div><GradePill value={combine}/></div>
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
        <div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2><p>This keeps the sheet's final-grade logic without exposing the lookup machinery.</p></div></div>
        <div className="qb-draft-grid">
          <div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{preDraft==null?"—":preDraft.toFixed(2)}</strong><small>Scouting + analytical grade</small></div>
          <div className="qb-draft-arrow">→</div>
          <div className="qb-draft-card"><span>NFL Draft Result</span><strong>{fields["Draft Result"]||"Pending"}</strong><small>Auto-filled after the 2027 NFL Draft</small></div>
          <div className="qb-draft-arrow">→</div>
          <div className="qb-draft-card final"><span>Draft-Adjusted Final</span><strong>{finalGrade==null?"—":finalGrade.toFixed(2)}</strong><small>Team fit + draft capital adjustment</small></div>
        </div>
        <div className="qb-draft-detail">
          <ReadOnly label="Team Score (10)" value={teamScore==null?"Pending":teamScore.toFixed(1)}/>
          <ReadOnly label="Draft Capital Score (10)" value={draftCapital==null?"Pending":draftCapital.toFixed(1)}/>
          <Field label="Current Draft Projection" source="Scout"><input value={inputValue(evalValue("Draft Projection"))} onChange={e=>local("Draft Projection",e.target.value)} onBlur={e=>persist("Draft Projection",e.target.value)} placeholder="Round / range"/></Field>
        </div>
      </div>}
    </section>
  </div>
}

function GradeCard({label,value,accent,hint}:{label:string,value:number|null,accent:string,hint:string}){return <div className={"qb-grade-card "+accent}><span>{label}</span><strong>{value==null?"—":value.toFixed(2)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{value==null?"—":value.toFixed(2)}</b></div>}
function Field({label,source,children}:{label:string,source:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>{source}</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
