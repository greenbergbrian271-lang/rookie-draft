"use client";

import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {draftAdjustedFinalGrade,glossaryNumber,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {wrAnalyticalGrade} from "@/lib/analytical-grades";
import {wrProductionGrade} from "@/lib/wr-grades";
import {combineGrade,percentRankIncSheet} from "@/lib/combine-formulas";
import {usePlayerProfile} from "@/components/PlayerProfile";

type Player={
  id:string|number;name:string;position:"QB"|"RB"|"WR"|"TE";college?:string;draft_class:number;
  scouting_status:string;watch_order?:number;headshot_url?:string;jersey_number?:string;
};
type Session={id:string|number;player_id?:string|number;game_date?:string|null;opponent?:string|null;raw_notes?:string|null;overall_writeup?:string|null;created_at?:string|null;legacy?:boolean};
type Props={
  players:Player[];vals:Record<string,any>;setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;
  imports:any[];glossary:any[][];onSave:(player:Player,category:string,value:any)=>Promise<any>;onAdd:()=>void;demoMode?:boolean;
};
type Tab="Film"|"Analytics"|"Stats"|"Combine"|"Draft";
type Mode="Evaluate"|"Compare";

const FILM=["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"] as const;
const ROLE_OPTIONS=["WR 1","WR 1/2","WR 2","WR 2/3","WR 3","WR 4/5","Specialist"] as const;
const PROJECTION_OPTIONS=["Top 5","Top 10","Round 1","Late Round 1","Day 2","Early Day 3","Late Day 3","UDFA"] as const;
const ADJUSTMENTS=[
  ["Special Teams",["No","Yes"]],
  ["Injury Concerns",["No","Short Term","Long Term"]],
  ["Off-Field?",["No","Character","Arrest"]],
  ["All Star Game?",["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]],
  ["Combine Invite?",["None","Yes","No"]]
] as const;
const ANALYTICS=[
  {key:"dropPct",label:"Drop %",source:"Drop %",inverse:true,pct:true,weighted:true},
  {key:"catchTrafficPct",label:"Catch in Traffic %",source:"Catch in Traffic %",inverse:false,pct:true,weighted:true},
  {key:"firstDowns",label:"1st Downs",source:"1st Downs",inverse:false,pct:false,weighted:true},
  {key:"firstDownsPerTarget",label:"1st Downs / Tgt",source:"1st Downs / Tgt",inverse:false,pct:false,weighted:true},
  {key:"targetsPerRoute",label:"Targets / Route",source:"Targets/Route",inverse:false,pct:false,weighted:true},
  {key:"firstDownsPerRoute",label:"1st Downs / Route",source:"1st Downs/Route",inverse:false,pct:false,weighted:true},
  {key:"yrr",label:"Y/RR",source:"Y/RR",inverse:false,pct:false,weighted:true},
  {key:"yrrMan",label:"Y/RR vs Man",source:"Y/RR vs Man",inverse:false,pct:false,weighted:true},
  {key:"yrrZone",label:"Y/RR vs Zone",source:"Y/RR vs Zone",inverse:false,pct:false,weighted:true},
  {key:"contestedPct",label:"Contested Target %",source:"Contested Target %",inverse:true,pct:true,weighted:true},
  {key:"airYardsPct",label:"Air Yards %",source:"Air Yards %",inverse:false,pct:true,weighted:true},
  {key:"yacPerRec",label:"YAC/Rec",source:"YAC/Rec",inverse:false,pct:false,weighted:true},
  {key:"mtfs",label:"MTFs",source:"MTFs",inverse:false,pct:false,weighted:true},
  {key:"yardsPerRec",label:"Yards/Rec",source:"Yards/Rec",inverse:false,pct:false,weighted:true},
  {key:"adot",label:"ADOT",source:"ADOT",inverse:false,pct:false,weighted:true},
  {key:"screenPct",label:"Screen %",source:"Screen %",inverse:true,pct:true,weighted:true},
  {key:"catchesInTraffic",label:"Catches in Traffic",source:"Catches in Traffic",inverse:false,pct:false,weighted:true},
  {key:"runBlockGrade",label:"Run Block Grade",source:"Run Block Grade",inverse:false,pct:false,weighted:true}
] as const;
const STATS=[
  ["Games","Games",false],["Receptions","Receptions",false],["Targets","Targets",false],["Yards","Yards",false],
  ["Yards / Rec","Yards/Rec",false],["Yards / Tgt","Yards/Tgt",false],["Touchdowns","Touchdowns",false],["Catch %","Catch %",true],
  ["Target %","Target %",true],["YPTPA","YPTPA",false],["Weighted Dom Rtg","Weighted Dom Rtg",true],["Dom Rtg","Dom Rtg",true]
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
  const n=num(v,pct);if(n==null)return "—";
  return pct?(n*100).toFixed(digits)+"%":n.toLocaleString(undefined,{maximumFractionDigits:digits});
}
function inputValue(v:any){return v==null?"":String(v)}
function scoreLabel(n:number|null){if(n==null)return "Not graded";if(n>=90)return "Elite";if(n>=80)return "Plus";if(n>=70)return "Solid";if(n>=60)return "Fringe";return "Concern"}
function sourceValue(row:any,key:string){
  if(!row)return null;
  const aliases:Record<string,string[]>={
    "Yards/Tgt":["Yards/Tgt","Yards/target"],
    "1st Downs / Tgt":["1st Downs / Tgt","1st/target"],
    "Targets/Route":["Targets/Route","Targets/Route Run"],
    "1st Downs/Route":["1st Downs/Route","1st Downs/Route Run"],
    "Contested Target %":["Contested Target %","contested_targets %"],
    "Screen %":["Screen %","Screen target %"],
    "40 Yard Dash":["40 Yard Dash","40-YD"],
    "Vertical":["Vertical","Vertical Jump"]
  };
  for(const k of aliases[key]||[key])if(row[k]!==undefined&&row[k]!==null&&row[k]!=="")return row[k];
  return null;
}
function heightInches(v:any){
  const s=String(v??"").trim(),m=s.match(/(\d+)\s*['′]\s*(\d+)?/);return m?Number(m[1])*12+Number(m[2]||0):null;
}
function heatColor(ratio:number){const r=Math.max(0,Math.min(1,ratio));return "hsl("+Math.round(r*120)+" 72% 48%)"}
function fmt(v:number|null){return v==null?"—":v.toFixed(2)}

export default function WRScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd,demoMode=false}:Props){
  const {openPlayer}=usePlayerProfile();
  const [selectedId,setSelectedId]=useState("");
  const [search,setSearch]=useState("");
  const [tab,setTab]=useState<Tab>("Film");
  const [mode,setMode]=useState<Mode>("Evaluate");
  const [compareIds,setCompareIds]=useState<string[]>([]);
  const [saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");
  const [sessions,setSessions]=useState<Record<string,Session[]>>({});
  const [newGameOpen,setNewGameOpen]=useState<Record<string,boolean>>({});
  const [newGame,setNewGame]=useState<Record<string,{opponent:string;notes:string}>>({});
  const [colleges,setColleges]=useState<any[]>([]);

  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"})},[]);
  useEffect(()=>{fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json()).then(j=>Array.isArray(j)&&setColleges(j)).catch(()=>{})},[]);
  useEffect(()=>{
    if(!players.length){setSelectedId("");return}
    if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));
    setCompareIds(cur=>{const valid=cur.filter(id=>players.some(p=>String(p.id)===id));return valid.length?valid:players.map(p=>String(p.id))});
  },[players,selectedId]);

  const importMap=useMemo(()=>{
    const m=new Map<string,any>();
    for(const row of imports||[]){const name=row?.Player??String(row?.["Player, College"]||"").split(",")[0];if(name)m.set(norm(name),row)}
    return m;
  },[imports]);
  const collegeMap=useMemo(()=>new Map<string,any>(colleges.map(x=>[norm(x.team),x] as [string,any])),[colleges]);
  const importedFor=(p:Player)=>importMap.get(norm(p.name))||{};
  const collegeFor=(p:Player)=>collegeMap.get(norm(p.college))||{};
  const evalFor=(p:Player,cat:string)=>vals[p.id+"|"+cat];
  const selected=players.find(p=>String(p.id)===selectedId)||players[0];

  useEffect(()=>{
    for(const p of players){
      const id=String(p.id);if(sessions[id]?.length||(!demoMode&&sessions[id]))continue;
      const legacy=String(evalFor(p,"__COMMENTARY__")||"").trim(),legacyLabel=String(evalFor(p,"__GAME_LABEL__")||"").trim();
      if(demoMode){setSessions(x=>x[id]?.length?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]});continue}
      fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{
        const live=Array.isArray(rows)?rows:[],fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];
        setSessions(x=>x[id]?x:{...x,[id]:live.length?live:fallback});
      }).catch(()=>setSessions(x=>x[id]?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:legacyLabel||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]}));
    }
  },[players,vals,demoMode]);

  const combinePopulation=useMemo(()=>({
    forty:(imports||[]).map(r=>num(sourceValue(r,"40 Yard Dash"))).filter((x):x is number=>x!=null),
    speedScore:(imports||[]).map(r=>num(r["Speed Score"])).filter((x):x is number=>x!=null),
    vertical:(imports||[]).map(r=>num(sourceValue(r,"Vertical"))).filter((x):x is number=>x!=null),
    handSize:(imports||[]).map(r=>num(r["Hand Size"])).filter((x):x is number=>x!=null),
    broadJump:[],benchReps:[]
  }),[imports]);

  function fieldsFor(p:Player){
    const out:Record<string,any>={...importedFor(p)};
    for(const cat of [...FILM,"Games watched","Games Watched","Expected Role","Draft Projection","Early Declare?","Special Teams","Special Teams?","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){
      const v=evalFor(p,cat);if(v!==undefined&&v!==null&&v!=="")out[cat]=v;
    }
    if(out["Games watched"]==null&&out["Games Watched"]!=null)out["Games watched"]=out["Games Watched"];
    if(out["Special Teams"]==null&&out["Special Teams?"]!=null)out["Special Teams"]=out["Special Teams?"];
    return out;
  }
  function manualScoutingFor(p:Player){
    const grades=FILM.map(x=>num(evalFor(p,x))??NaN);
    return workbookScoutingGrade("WR",grades,fieldsFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function combineFor(p:Player){
    const imp=importedFor(p),height=heightInches(imp?.Height),weight=num(imp?.Weight),forty=num(sourceValue(imp,"40 Yard Dash"));
    const bmi=num(imp?.BMI)??(height&&weight?weight*703/(height*height):null);
    const speedScore=num(imp?.["Speed Score"])??(weight&&forty?weight*200/Math.pow(forty,4):null);
    const input={bmi:bmi??undefined,forty:forty??undefined,speedScore:speedScore??undefined,vertical:num(sourceValue(imp,"Vertical"))??undefined,handSize:num(imp?.["Hand Size"])??undefined,weight:weight??undefined,heightInches:height??undefined};
    return Object.values(input).some(v=>v!=null)?combineGrade("WR",input,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null;
  }
  function percentileFor(source:string,p:Player,inverse=false,pct=false){
    const imp=importedFor(p),raw=num(sourceValue(imp,source),pct);
    if(raw==null)return null;
    const pop=(imports||[]).map(r=>num(sourceValue(r,source),pct)).filter((x):x is number=>x!=null);
    const base=percentRankIncSheet(pop,raw,3);return base==null?null:(inverse?1-base:base);
  }
  const productionPopulation=useMemo(()=>({
    yardsPerReception:(imports||[]).map(r=>num(sourceValue(r,"Yards/Rec"))).filter((x):x is number=>x!=null),
    yardsPerTarget:(imports||[]).map(r=>num(sourceValue(r,"Yards/Tgt"))).filter((x):x is number=>x!=null),
    targetShare:(imports||[]).map(r=>num(sourceValue(r,"Target %"),true)).filter((x):x is number=>x!=null),
    catchPct:(imports||[]).map(r=>num(sourceValue(r,"Catch %"),true)).filter((x):x is number=>x!=null),
    yptpa:(imports||[]).map(r=>num(sourceValue(r,"YPTPA"))).filter((x):x is number=>x!=null),
    weightedDomRtg:(imports||[]).map(r=>num(sourceValue(r,"Weighted Dom Rtg"),true)).filter((x):x is number=>x!=null),
    domRtg:(imports||[]).map(r=>num(sourceValue(r,"Dom Rtg"),true)).filter((x):x is number=>x!=null),
    speedScore:(imports||[]).map(r=>num(sourceValue(r,"Speed Score"))).filter((x):x is number=>x!=null)
  }),[imports]);
  function productionFor(p:Player){
    const r=importedFor(p),college=collegeFor(p),frY=num(r["FR Yards"]),soY=num(r["Soph Yards"]),frTd=num(r["FR TDs"]),soTd=num(r["Soph TDs"]);
    return wrProductionGrade({
      scouting:manualScoutingFor(p),
      yardsPerReception:num(sourceValue(r,"Yards/Rec")),
      yardsPerTarget:num(sourceValue(r,"Yards/Tgt")),
      targetShare:num(sourceValue(r,"Target %"),true),
      catchPct:num(sourceValue(r,"Catch %"),true),
      yptpa:num(sourceValue(r,"YPTPA")),
      weightedDomRtg:num(sourceValue(r,"Weighted Dom Rtg"),true),
      domRtg:num(sourceValue(r,"Dom Rtg"),true),
      speedScore:num(sourceValue(r,"Speed Score")),
      combineScore:combineFor(p),
      maxFrSophYards:frY==null&&soY==null?null:Math.max(frY??0,soY??0),
      maxFrSophTds:frTd==null&&soTd==null?null:Math.max(frTd??0,soTd??0),
      isNonFbs:college?.subdivision==="FCS"
    },productionPopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function metricDataFor(p:Player){
    const imp=importedFor(p);
    return ANALYTICS.map(metric=>{
      const raw=num(sourceValue(imp,metric.source),metric.pct);
      const population=(imports||[]).map(r=>num(sourceValue(r,metric.source),metric.pct)).filter((x):x is number=>x!=null);
      const base=raw==null?null:percentRankIncSheet(population,raw,3);
      const percentile=base==null?null:(metric.inverse?1-base:base);
      return {...metric,raw,rawPercentile:base,percentile};
    });
  }
  function penaltyFor(p:Player){
    const imp=importedFor(p),adot=num(sourceValue(imp,"ADOT")),contested=num(sourceValue(imp,"Contested Target %"),true);
    return adot!=null&&contested!=null&&adot<=13&&contested>=.23;
  }
  function analyticalFor(p:Player){
    const metrics=metricDataFor(p),record=Object.fromEntries(metrics.map(x=>[x.key,x.percentile])) as Record<string,number|null>;
    return wrAnalyticalGrade(manualScoutingFor(p),record,penaltyFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function scoutingFor(p:Player){
    const watched=num(evalFor(p,"Games watched")??evalFor(p,"Games Watched"))||0;
    if(watched>=1)return manualScoutingFor(p);
    const fallback=[productionFor(p),analyticalFor(p)].filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));
    return fallback.length?fallback.reduce((s,v)=>s+v,0)/fallback.length:null;
  }
  function preDraftFor(p:Player){
    const scout=scoutingFor(p);if(scout==null)return null;
    const early=evalFor(p,"Early Declare?")??importedFor(p)?.["Early Declare?"]??false;
    return preDraftGrade("WR",scout,productionFor(p),analyticalFor(p),early,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
  }
  function rankingGradeFor(p:Player){return preDraftFor(p)??analyticalFor(p)??productionFor(p)??scoutingFor(p)}
  const rankedPlayers=useMemo(()=>[...players].sort((a,b)=>{
    const ga=rankingGradeFor(a),gb=rankingGradeFor(b);
    if(ga==null&&gb==null)return (a.watch_order||9999)-(b.watch_order||9999);
    if(ga==null)return 1;if(gb==null)return -1;return gb-ga||((a.watch_order||9999)-(b.watch_order||9999));
  }),[players,vals,imports,colleges,glossary]);
  const filtered=useMemo(()=>{const q=norm(search);return rankedPlayers.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q))},[rankedPlayers,search]);

  async function persist(p:Player,cat:string,value:any){
    setSaveState("saving");setVals(v=>({...v,[p.id+"|"+cat]:value}));
    if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}
    try{await onSave(p,cat,value);setSaveState("saved")}catch{setSaveState("error")}
  }
  function local(p:Player,cat:string,value:any){setVals(v=>({...v,[p.id+"|"+cat]:value}))}
  async function saveSession(p:Player,session:Session,patch:Partial<Session>){
    const id=String(p.id),next={...session,...patch};setSessions(x=>({...x,[id]:(x[id]||[]).map(s=>String(s.id)===String(session.id)?next:s)}));
    if(session.legacy||demoMode){if(patch.raw_notes!==undefined)await persist(p,"__COMMENTARY__",patch.raw_notes||"");if(patch.opponent!==undefined)await persist(p,"__GAME_LABEL__",patch.opponent||"");return}
    await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:session.id,opponent:next.opponent,gameDate:next.game_date,rawNotes:next.raw_notes,overallWriteup:next.overall_writeup})});
  }
  async function addSession(p:Player){
    const id=String(p.id),draft=newGame[id]||{opponent:"",notes:""};if(!draft.opponent.trim()&&!draft.notes.trim())return;
    if(demoMode){const s:Session={id:"demo-"+Date.now(),opponent:draft.opponent||"New game",raw_notes:draft.notes,legacy:true};setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}
    else{const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,opponent:draft.opponent,rawNotes:draft.notes})});if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}}
    setNewGame(x=>({...x,[id]:{opponent:"",notes:""}}));setNewGameOpen(x=>({...x,[id]:false}));
  }

  useEffect(()=>{
    if(mode!=="Evaluate")return;
    const nodes=rankedPlayers.map(p=>document.getElementById("wr-eval-"+p.id)).filter(Boolean) as HTMLElement[];if(!nodes.length)return;
    const obs=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setSelectedId(String((visible[0].target as HTMLElement).dataset.playerId||""))},{rootMargin:"-150px 0px -65% 0px",threshold:[0,.01]});
    nodes.forEach(n=>obs.observe(n));return()=>obs.disconnect();
  },[mode,rankedPlayers]);
  function jumpToPlayer(p:Player){setMode("Evaluate");setSelectedId(String(p.id));requestAnimationFrame(()=>document.getElementById("wr-eval-"+p.id)?.scrollIntoView({behavior:"smooth",block:"start"}))}

  function renderPlayerSection(p:Player){
    const id=String(p.id),imp=importedFor(p),metrics=metricDataFor(p),scouting=scoutingFor(p),production=productionFor(p),analytical=analyticalFor(p),preDraft=preDraftFor(p),fields=fieldsFor(p),combine=combineFor(p);
    const teamScore=num(fields["Team Score (10)"]),draftCapital=num(fields["Draft Capital Score (10)"]);
    const finalGrade=preDraft==null||teamScore==null||draftCapital==null?null:draftAdjustedFinalGrade("WR",preDraft,teamScore,draftCapital,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
    const filmComplete=FILM.filter(x=>num(evalFor(p,x))!=null).length,gamesWatched=num(evalFor(p,"Games watched")??evalFor(p,"Games Watched"))||0,rank=rankedPlayers.indexOf(p)+1,style=schoolStyle(p.college),draft=newGame[id]||{opponent:"",notes:""};
    const penalty=penaltyFor(p),penaltyValue=glossaryNumber(205,(glossary.length?glossary:undefined) as GlossaryRows|undefined);
    return <article className="qb-evaluate-player" id={"wr-eval-"+p.id} data-player-id={p.id} key={p.id}>
      <header className="qb-player-hero" style={style}>
        <div className="qb-player-photo">{p.headshot_url?<img src={p.headshot_url} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>:<span>{p.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>}</div>
        <div className="qb-player-title"><div className="qb-kicker">WR {rank} · {p.college||"College TBD"}{p.jersey_number?" · #"+p.jersey_number:""}</div><h1>{p.name}</h1>
          <div className="qb-hero-meta"><span>{imp?.Age?"Age "+imp.Age:"Age —"}</span><span>{imp?.Class||imp?.["Draft Class"]||"Class —"}</span><span>{gamesWatched} game{gamesWatched===1?"":"s"} watched</span>
            <span className="qb-draft-result-badge" title="Draft team will populate here after the NFL Draft"><img src="https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" alt="NFL"/><b>TBD</b></span>{!demoMode&&<button onClick={()=>openPlayer(p.id)}>Open player profile ↗</button>}
          </div>
        </div>
        <div className={"qb-save-state "+saveState}>{demoMode?"Preview data":saveState==="saving"?"Saving…":saveState==="error"?"Save failed":"✓ Saved"}</div>
      </header>
      <div className="qb-grade-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <GradeCard label="Scouting" value={scouting} accent="film" hint={filmComplete+"/7 traits graded"}/>
        <GradeCard label="Production" value={production} accent="pre" hint="Workbook production model"/>
        <GradeCard label="Analytical" value={analytical} accent="analytics" hint={penalty?"ADOT / contested penalty applied":"Workbook percentile model"}/>
        <GradeCard label="Pre-Draft" value={preDraft} accent="pre" hint="Scout + production + analytics"/>
        <GradeCard label="Final" value={finalGrade} accent="final" hint={finalGrade==null?"Waiting for NFL draft":"Draft-adjusted"}/>
      </div>

      {tab==="Film"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2><p>Seven WR traits retain the workbook weights while using the same focused interaction model as QB scouting.</p></div><div className="qb-completion">{filmComplete}/7 complete</div></div>
        <div className="qb-context-grid">
          <Field label="Games watched" source="Scout"><input type="number" min="0" step="1" value={inputValue(evalFor(p,"Games watched")??evalFor(p,"Games Watched"))} onChange={e=>local(p,"Games watched",e.target.value)} onBlur={e=>persist(p,"Games watched",e.target.value===""?"":Number(e.target.value))}/></Field>
          <ConstrainedField label="Expected role" value={inputValue(evalFor(p,"Expected Role"))} options={[...ROLE_OPTIONS]} onLocal={v=>local(p,"Expected Role",v)} onCommit={v=>persist(p,"Expected Role",v)}/>
          <ConstrainedField label="Draft projection" value={inputValue(evalFor(p,"Draft Projection"))} options={[...PROJECTION_OPTIONS]} onLocal={v=>local(p,"Draft Projection",v)} onCommit={v=>persist(p,"Draft Projection",v)}/>
        </div>
        <div className="qb-film-grid">{FILM.map(trait=>{const n=num(evalFor(p,trait));return <div className="qb-trait-card" key={trait}>
          <div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div>
          <input className="qb-grade-slider heat" style={{color:heatColor((n??50)/100)}} type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(p,trait,Number(e.target.value))} onMouseUp={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))} onTouchEnd={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))}/>
          <div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div>
          <input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={inputValue(evalFor(p,trait))} onChange={e=>local(p,trait,e.target.value)} onBlur={e=>persist(p,trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)} placeholder="—"/>
        </div>})}</div>
        <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Role, Risk & Extras</h2></div></div>
        <div className="qb-context-grid six">
          <Field label="Early Declare?" source="Scout"><select value={inputValue(evalFor(p,"Early Declare?")||"No")} onChange={e=>persist(p,"Early Declare?",e.target.value)}><option>No</option><option>Yes</option></select></Field>
          {ADJUSTMENTS.map(([label,options])=><Field key={label} label={label} source="Scout"><select value={inputValue(evalFor(p,label)||evalFor(p,label+"?")||options[0])} onChange={e=>persist(p,label,e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></Field>)}
        </div>
        <div className="qb-game-log">
          <div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2><p>One entry per game, newest first.</p></div><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:!x[id]}))}>+ Add game</button></div>
          {newGameOpen[id]&&<div className="qb-game-note new"><input value={draft.opponent} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,opponent:e.target.value}}))} placeholder="Game label — e.g. 2026 · Michigan"/><textarea value={draft.notes} onChange={e=>setNewGame(x=>({...x,[id]:{...draft,notes:e.target.value}}))} placeholder="Notes from this game…"/><div className="row-actions"><button onClick={()=>addSession(p)}>Add to top</button><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:false}))}>Cancel</button></div></div>}
          {(sessions[id]||[]).length?(sessions[id]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}><div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{opponent:e.target.value})} placeholder="Season · Opponent"/></div><textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{raw_notes:e.target.value})}/></div>):<div className="qb-game-empty">No game notes yet. Add the first game above.</div>}
        </div>
      </div>}

      {tab==="Analytics"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Analytical Profile</h2><p>Percentiles mirror the WR workbook. Drop rate is inverted; all other displayed percentiles reward higher values.</p></div><GradePill value={analytical}/></div>
        <div className={"notice "+(penalty?"warning":"")} style={{marginBottom:12}}><b>ADOT / contested-target check:</b> ADOT ≤ 13 and contested targets ≥ 23%. {penalty?"Triggered — "+penaltyValue.toFixed(2)+" points deducted.":"Not triggered for this player."}</div>
        <div className="qb-analytics-grid">{metrics.map(m=><div className="qb-metric" key={m.key}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.weighted?(m.inverse?"Lower raw value is better":"Higher raw value is better"):"Context / adjustment input"}</small></div><b>{display(sourceValue(imp,m.source),m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.rawPercentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
      </div>}

      {tab==="Stats"&&<div className="qb-tab-content">
        <div className="qb-section-head"><div><span className="ey">Imported Data</span><h2>Production</h2><p>2025 receiving production and team-context inputs used by the WR production model.</p></div><GradePill value={production}/></div>
        <div className="qb-stat-grid">{STATS.map(([label,source,pct])=><div className="qb-stat-card" key={label}><span>{label}</span><strong>{display(sourceValue(imp,source),pct,pct?1:2)}</strong></div>)}</div>
        <div className="qb-per-game"><h3>Per Game</h3>{[["Receptions",num(imp?.Receptions)],["Targets",num(imp?.Targets)],["Rec Yards",num(imp?.Yards)],["TD",num(imp?.Touchdowns)]].map(([label,v])=><div key={String(label)}><span>{label}</span><b>{typeof v==="number"&&num(imp?.Games)?(v/(num(imp?.Games)||1)).toFixed(2):"—"}</b></div>)}</div>
      </div>}

      {tab==="Combine"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Imported + Calculated</span><h2>Combine / Pro Day</h2></div><GradePill value={combine}/></div><div className="qb-combine-grid">
        <ReadOnly label="Height" value={imp?.Height}/><ReadOnly label="Weight" value={imp?.Weight}/><ReadOnly label="BMI" value={display(imp?.BMI,false,1)}/><ReadOnly label="Hand Size" value={imp?.["Hand Size"]}/><ReadOnly label="40 Yard Dash" value={display(sourceValue(imp,"40 Yard Dash"),false,2)}/><ReadOnly label="Speed Score" value={display(imp?.["Speed Score"],false,1)}/><ReadOnly label="Vertical" value={sourceValue(imp,"Vertical")}/>
      </div></div>}

      {tab==="Draft"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2></div></div>
        <div className="qb-context-grid"><Field label="Team Score (10)" source="Scout"><input type="number" min="0" max="10" step=".25" value={inputValue(evalFor(p,"Team Score (10)"))} onChange={e=>local(p,"Team Score (10)",e.target.value)} onBlur={e=>persist(p,"Team Score (10)",e.target.value===""?"":Number(e.target.value))}/></Field><Field label="Draft Capital Score (10)" source="Scout"><input type="number" min="0" max="10" step=".25" value={inputValue(evalFor(p,"Draft Capital Score (10)"))} onChange={e=>local(p,"Draft Capital Score (10)",e.target.value)} onBlur={e=>persist(p,"Draft Capital Score (10)",e.target.value===""?"":Number(e.target.value))}/></Field><ReadOnly label="Draft Result" value={fields["Draft Result"]||"Pending"}/></div>
        <div className="qb-draft-grid"><div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{fmt(preDraft)}</strong><small>Scouting + production + analytics</small></div><div className="qb-draft-arrow">→</div><div className="qb-draft-card"><span>NFL Draft Result</span><strong>{fields["Draft Result"]||"Pending"}</strong><small>Auto-filled after the NFL Draft</small></div><div className="qb-draft-arrow">→</div><div className="qb-draft-card final"><span>Draft-Adjusted Final</span><strong>{fmt(finalGrade)}</strong><small>Team fit + draft capital adjustment</small></div></div>
      </div>}
    </article>
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched WRs yet</h2><p>Add a wide receiver to the watched pool to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;
  const comparePlayers=rankedPlayers.filter(p=>compareIds.includes(String(p.id)));
  return <div className="qb-workspace">
    <aside className="qb-prospect-rail"><div className="qb-rail-head"><div><span className="ey">2027 Wide Receivers</span><strong>{players.length} available</strong></div><button className="qb-add" onClick={onAdd} title="New Players Watched">+</button></div>
      <div className="qb-mode-toggle">{(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}</div>
      <input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wide receivers…"/>
      <div className="qb-prospect-list">{filtered.map(p=>{const g=rankingGradeFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length,rank=rankedPlayers.indexOf(p)+1;return <div className={"qb-prospect-row "+(String(p.id)===selectedId?"active":"")} key={p.id}><button className="qb-prospect-item" onClick={()=>jumpToPlayer(p)}><span className="qb-rank">WR{rank}</span><span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college||"College TBD"} · {done}/7 traits</small></span><span className="qb-mini-grade">{g==null?"—":g.toFixed(2)}</span></button></div>})}</div>
      {demoMode&&<div className="qb-demo-note">Previewing Jeremiah Smith, Cam Coleman and Jordan Faison from WR Data. Film grades remain blank until you scout them.</div>}
    </aside>
    <section className={"qb-scouting-pane "+(mode==="Evaluate"?"evaluate":"compare")}>{mode==="Compare"?<CompareView players={comparePlayers} allPlayers={rankedPlayers} compareIds={compareIds} setCompareIds={setCompareIds} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} productionFor={productionFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor}/>:<div className="qb-evaluate-stack"><nav className="qb-section-tabs qb-shared-tabs">{(["Film","Analytics","Stats","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>{rankedPlayers.map(renderPlayerSection)}</div>}</section>
  </div>
}

function CompareView({players,allPlayers,compareIds,setCompareIds,vals,importedFor,scoutingFor,productionFor,analyticalFor,preDraftFor}:{players:Player[],allPlayers:Player[],compareIds:string[],setCompareIds:React.Dispatch<React.SetStateAction<string[]>>,vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,productionFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null}){
  const toggle=(id:string)=>setCompareIds(cur=>cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]);
  const metrics=[
    ["Scouting",(p:Player)=>scoutingFor(p)],["Production",(p:Player)=>productionFor(p)],["Analytical",(p:Player)=>analyticalFor(p)],["Pre-Draft",(p:Player)=>preDraftFor(p)],
    ...FILM.map(label=>[label,(p:Player)=>num(vals[p.id+"|"+label])] as const),
    ["Y/RR",(p:Player)=>num(sourceValue(importedFor(p),"Y/RR"))],["ADOT",(p:Player)=>num(sourceValue(importedFor(p),"ADOT"))],["YAC/Rec",(p:Player)=>num(sourceValue(importedFor(p),"YAC/Rec"))],
    ["Catch %",(p:Player)=>{const v=num(sourceValue(importedFor(p),"Catch %"),true);return v==null?null:v*100}],["Contested %",(p:Player)=>{const v=num(sourceValue(importedFor(p),"Contested Target %"),true);return v==null?null:v*100}]
  ] as const;
  return <div className="qb-compare-view"><div className="qb-compare-head"><div><span className="ey">Side-by-Side</span><h2>WR Comparison Board</h2><p>Film grades, production and the key receiver analytics in one view.</p></div><div className="qb-compare-controls"><button className="ghost" onClick={()=>setCompareIds(allPlayers.map(p=>String(p.id)))}>All players</button></div></div>
    <div className="qb-compare-filter-list" style={{position:"static",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",marginBottom:12}}>{allPlayers.map(p=><label key={p.id}><input type="checkbox" checked={compareIds.includes(String(p.id))} onChange={()=>toggle(String(p.id))}/><span>WR{allPlayers.indexOf(p)+1}</span><b>{p.name}</b><small>{p.college}</small></label>)}</div>
    {!players.length?<div className="qb-game-empty">Select at least one wide receiver to compare.</div>:<div className="qb-compare-scroll"><table className="qb-compare-matrix"><thead><tr><th>Rank</th><th>Player / School</th>{metrics.map(([label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{players.map(p=><tr key={p.id}><th className="rank">WR{allPlayers.indexOf(p)+1}</th><th className="player" style={schoolStyle(p.college)}><b>{p.name}</b><small> · {p.college}</small></th>{metrics.map(([label,get])=>{const v=get(p);return <td key={label} className="numeric">{v==null?"—":Number(v).toFixed(2)}</td>})}</tr>)}</tbody></table></div>}
  </div>
}

function GradeCard({label,value,accent,hint}:{label:string,value:number|null,accent:string,hint:string}){return <div className={"qb-grade-card "+accent}><span>{label}</span><strong>{value==null?"—":value.toFixed(2)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{value==null?"—":value.toFixed(2)}</b></div>}
function Field({label,source,children}:{label:string,source:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>{source}</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
function ConstrainedField({label,value,options,onLocal,onCommit}:{label:string,value:string,options:string[],onLocal:(v:string)=>void,onCommit:(v:string)=>void|Promise<any>}){
  const isCustom=Boolean(value)&&!options.includes(value),[other,setOther]=useState(isCustom);
  useEffect(()=>setOther(Boolean(value)&&!options.includes(value)),[value,options]);
  return <Field label={label} source="Scout"><div className="qb-constrained"><select value={other?"Other":value} onChange={e=>{if(e.target.value==="Other"){setOther(true);onLocal("")}else{setOther(false);onLocal(e.target.value);onCommit(e.target.value)}}}><option value="">Select…</option>{options.map(x=><option key={x}>{x}</option>)}<option>Other</option></select>{other&&<input value={value} onChange={e=>onLocal(e.target.value)} onBlur={e=>onCommit(e.target.value)} placeholder={"Other "+label.toLowerCase()+"…"}/>}</div></Field>
}
