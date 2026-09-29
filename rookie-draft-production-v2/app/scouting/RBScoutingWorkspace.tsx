"use client";

import {useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {combineGrade,percentRankInc} from "@/lib/combine-formulas";
import {draftAdjustedFinalGrade,preDraftGrade,workbookScoutingGrade,type GlossaryRows} from "@/lib/scouting-formulas";
import {rbAnalyticalGrade} from "@/lib/analytical-grades";
import {rbProductionGrade} from "@/lib/rb-grades";
import {usePlayerProfile} from "@/components/PlayerProfile";

type Player={id:string|number;name:string;position:"QB"|"RB"|"WR"|"TE";college?:string;draft_class:number;scouting_status:string;watch_order?:number;headshot_url?:string;jersey_number?:string};
type Session={id:string|number;opponent?:string|null;raw_notes?:string|null;game_date?:string|null;overall_writeup?:string|null;legacy?:boolean};
type Mode="Evaluate"|"Compare";
type Tab="Film"|"Production"|"Analytics"|"Combine"|"Draft";
type Props={players:Player[];vals:Record<string,any>;setVals:React.Dispatch<React.SetStateAction<Record<string,any>>>;imports:any[];glossary:any[][];onSave:(p:Player,category:string,value:any)=>Promise<any>;onAdd:()=>void;demoMode?:boolean};

const FILM=["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"] as const;
const ROLE_OPTIONS=["RB 1","RB 2","RB 3+","Special Teams / Depth"] as const;
const ARCHETYPE_OPTIONS=["Rotational Back","Thumper","Receiving Back","Speedster"] as const;
const PROJECTION_OPTIONS=["Top 5","Top 10","First Round","Day 2","Early Day 3","Late Day 3","UDFA"] as const;
const ADJUSTMENTS=[
  ["Special Teams?",["No","Yes"]],
  ["Injury Concerns",["No","Short Term","Long Term"]],
  ["Off-Field?",["No","Character","Arrest"]],
  ["All Star Game?",["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"]],
  ["Combine Invite?",["None","Yes","No"]]
] as const;
const ANALYTICS=[
  {label:"Fumble Grade",sheet:"BA",pct:false},{label:"Elusive Rating",sheet:"BB",pct:false},{label:"MTFs",sheet:"BC",pct:false},
  {label:"Breakaway Runs",sheet:"BD",pct:false},{label:"Breakaway Yards",sheet:"BE",pct:false},{label:"Breakaway %",sheet:"BF",pct:true},
  {label:"Rush 1st Downs",sheet:"BG",pct:false},{label:"1st Downs/ATT",sheet:"BH",pct:true},{label:"YAC/ATT",sheet:"BI",pct:false},
  {label:"MTF/Att",sheet:"BJ",pct:true},{label:"Y/RR",sheet:"BK",pct:false},{label:"YAC/Rec",sheet:"BL",pct:false},
  {label:"ADOT",sheet:"BM",pct:false},{label:"Rec First Downs",sheet:"BN",pct:false},{label:"1st Downs/Tgt",sheet:"BO",pct:true},
  {label:"Pass Block Grade",sheet:"BP",pct:false}
] as const;
function mockDraftableSlug(name:string){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function boardPercentile(values:number[],value:number|null,inverse=false){if(value==null)return null;const p=percentRankInc(values,value);return p==null?null:(inverse?1-p:p)}
function rbExpectedRoleValue(v:any){const s=String(v??"");if(s==="RB1")return"RB 1";if(s==="RB2")return"RB 2";if(["Rotation Back","Thumper Back","Receiving Back","Change-of-Pace","Developmental"].includes(s))return"RB 3+";return s}
function rbArchetypeValue(role:any,archetype:any){if(archetype)return String(archetype);const s=String(role??"");if(s==="Rotation Back")return"Rotational Back";if(s==="Thumper Back")return"Thumper";if(s==="Receiving Back")return"Receiving Back";if(s==="Change-of-Pace")return"Speedster";return""}
const STATS=[
  ["Games","Games",false],["Carries","Carries",false],["Rush Yards","Rush Yards",false],["Yards / Carry","Yards/Carry",false],["Rush TD","Rush Touchdowns",false],
  ["Receptions","Receptions",false],["Rec Yards","Rec Yards",false],["Yards / Reception","Yards/Reception",false],["Rec TD","Rec Touchdowns",false],["Yards / Touch","Yards/Touch",false]
] as const;

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
function num(v:any,pct=false){if(v==null||v==="")return null;if(typeof v==="number")return Number.isFinite(v)?v:null;const s=String(v).trim(),n=Number(s.replace(/[%,$]/g,"").replace(/,/g,""));if(!Number.isFinite(n))return null;return pct||s.includes("%")?n/100:n}
function show(v:any,pct=false,digits=2){const n=num(v,pct);if(n==null)return "—";return pct?(n*100).toFixed(digits)+"%":n.toLocaleString(undefined,{maximumFractionDigits:digits})}
function fmt(v:number|null){return v==null?"—":v.toFixed(2)}
function heatColor(ratio:number){const r=Math.max(0,Math.min(1,ratio));return `hsl(${Math.round(r*120)} 72% 48%)`}
function conditionalStyle(value:any,values:number[]){const n=typeof value==="number"?value:null;if(n==null||!Number.isFinite(n)||!values.length)return undefined;const min=Math.min(...values),max=Math.max(...values),ratio=max===min?.5:(n-min)/(max-min),h=Math.round(ratio*120);return {background:`hsl(${h} 72% 42% / .18)`,boxShadow:`inset 0 -2px 0 hsl(${h} 72% 48% / .75)`}}
function scoreLabel(n:number|null){if(n==null)return "Not graded";if(n>=90)return"Elite";if(n>=80)return"Plus";if(n>=70)return"Solid";if(n>=60)return"Fringe";return"Concern"}

export default function RBScoutingWorkspace({players,vals,setVals,imports,glossary,onSave,onAdd,demoMode=false}:Props){
  const {openPlayer}=usePlayerProfile();
  const [mode,setMode]=useState<Mode>("Evaluate"),[tab,setTab]=useState<Tab>("Film"),[search,setSearch]=useState(""),[selectedId,setSelectedId]=useState("");
  const [compareIds,setCompareIds]=useState<string[]>([]),[saveState,setSaveState]=useState<"saved"|"saving"|"error">("saved");
  const [sessions,setSessions]=useState<Record<string,Session[]>>({}),[newGameOpen,setNewGameOpen]=useState<Record<string,boolean>>({}),[newGame,setNewGame]=useState<Record<string,{opponent:string;notes:string}>>({});
  const [colleges,setColleges]=useState<any[]>([]);

  useEffect(()=>{fetch("/api/college-stats",{cache:"no-store"}).then(r=>r.json()).then(j=>Array.isArray(j)&&setColleges(j)).catch(()=>{})},[]);
  useEffect(()=>{if(!players.length){setSelectedId("");return}if(!players.some(p=>String(p.id)===selectedId))setSelectedId(String(players[0].id));setCompareIds(cur=>{const valid=cur.filter(id=>players.some(p=>String(p.id)===id));return valid.length?valid:players.map(p=>String(p.id))})},[players,selectedId]);
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"auto"})},[]);

  const importMap=useMemo(()=>{const m=new Map<string,any>();for(const row of imports||[]){if(row?.Player)m.set(norm(row.Player),row)}return m},[imports]);
  const collegeMap=useMemo(()=>new Map<string,any>(colleges.map(x=>[norm(x.team),x] as [string,any])),[colleges]);
  const importedFor=(p:Player)=>importMap.get(norm(p.name))||{};
  const collegeFor=(p:Player)=>collegeMap.get(norm(p.college))||{};
  const evalFor=(p:Player,cat:string)=>vals[p.id+"|"+cat];

  function earlyDeclareFor(p:Player){
    const override=String(evalFor(p,"Early Declare")??"").trim();
    if(/^yes$/i.test(override))return {yes:true,source:"override",classLabel:String(importedFor(p).Class||importedFor(p)["Draft Class"]||"")};
    if(/^no$/i.test(override))return {yes:false,source:"override",classLabel:String(importedFor(p).Class||importedFor(p)["Draft Class"]||"")};
    const classLabel=String(importedFor(p).Class||importedFor(p)["Draft Class"]||"").trim();
    const token=classLabel.toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(/(JR|SO|FR)$/.test(token))return {yes:true,source:"auto",classLabel};
    if(/SR$/.test(token))return {yes:false,source:"auto",classLabel};
    return {yes:false,source:"unknown",classLabel};
  }

  useEffect(()=>{for(const p of players){const id=String(p.id);if(sessions[id])continue;const legacy=String(evalFor(p,"__COMMENTARY__")||"").trim(),label=String(evalFor(p,"__GAME_LABEL__")||"").trim();if(demoMode){setSessions(x=>x[id]?x:{...x,[id]:legacy?[{id:"legacy-"+id,opponent:label||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[]});continue}fetch("/api/scouting-sessions?playerId="+encodeURIComponent(id),{cache:"no-store"}).then(r=>r.ok?r.json():[]).then((rows:any[])=>{const live=Array.isArray(rows)?rows:[],fallback=!live.length&&legacy?[{id:"legacy-"+id,opponent:label||"Legacy scouting note",raw_notes:legacy,legacy:true}]:[];setSessions(x=>x[id]?x:{...x,[id]:live.length?live:fallback})}).catch(()=>{})}},[players,vals,demoMode]);

  function fieldsFor(p:Player){const out:any={...importedFor(p)};for(const cat of [...FILM,"Games watched","Expected Role","Archetype","Draft Projection","Early Declare","Special Teams?","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Draft Result","Team Score (10)","Draft Capital Score (10)"]){const v=evalFor(p,cat);if(v!==undefined&&v!==null&&v!=="")out[cat]=v}return out}
  function scoutingFor(p:Player){return workbookScoutingGrade("RB",FILM.map(x=>num(evalFor(p,x))??NaN),fieldsFor(p),(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  const combinePopulation=useMemo(()=>({forty:players.map(p=>num(importMap.get(norm(p.name))?.["40 Yard Dash"])).filter((x):x is number=>x!=null),speedScore:players.map(p=>num(importMap.get(norm(p.name))?.["Speed Score"])).filter((x):x is number=>x!=null),broadJump:players.map(p=>num(importMap.get(norm(p.name))?.["Broad Jump"])).filter((x):x is number=>x!=null),handSize:[],vertical:[],benchReps:[]}),[players,importMap]);
  function combineFor(p:Player){const r=importedFor(p),x={bmi:num(r.BMI)??undefined,forty:num(r["40 Yard Dash"])??undefined,speedScore:num(r["Speed Score"])??undefined,broadJump:num(r["Broad Jump"])??undefined};return Object.values(x).some(v=>v!=null)?combineGrade("RB",x,combinePopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined):null}
  function prodMetrics(p:Player){const r=importedFor(p),c=collegeFor(p),rushY=num(r["Rush Yards"])||0,recY=num(r["Rec Yards"])||0,rushTd=num(r["Rush Touchdowns"])||0,recTd=num(r["Rec Touchdowns"])||0,recs=num(r.Receptions)||0;const teamY=(num(c.rushYards)||0)+(num(c.passYards)||0),teamTd=(num(c.rushTDs)||0)+(num(c.passTDs)||0);return {yptp:num(c.totalPlays)?(rushY+recY)/(num(c.totalPlays)||1):num(r.YPTP),recShare:num(c.completions)?recs/(num(c.completions)||1):num(r["Rec Share %"],true),domRtg:teamY&&teamTd?(((rushY+recY)/teamY)+((rushTd+recTd)/teamTd))/2:num(r["Dom Rtg"],true)}}
  const productionPopulation=useMemo(()=>({yardsPerCarry:imports.map(r=>num(r["Yards/Carry"]??r["Yards/Attempt"])).filter((x):x is number=>x!=null),yardsPerReception:imports.map(r=>num(r["Yards/Reception"])).filter((x):x is number=>x!=null),yardsPerTouch:imports.map(r=>num(r["Yards/Touch"])).filter((x):x is number=>x!=null),yptp:imports.map(r=>num(r.YPTP)).filter((x):x is number=>x!=null),recShare:imports.map(r=>num(r["Rec Share %"],true)).filter((x):x is number=>x!=null),domRtg:imports.map(r=>num(r["Dom Rtg"],true)).filter((x):x is number=>x!=null),speedScore:players.map(p=>num(importMap.get(norm(p.name))?.["Speed Score"])).filter((x):x is number=>x!=null)}),[imports,players,importMap]);
  function productionFor(p:Player){const scouting=scoutingFor(p);if(scouting==null)return null;const r=importedFor(p),m=prodMetrics(p),college=collegeFor(p),carries=num(r.Carries??r["Rush Attempts"]),rushYards=num(r["Rush Yards"]),receptions=num(r.Receptions),recYards=num(r["Rec Yards"]);const yardsPerCarry=carries&&rushYards!=null?rushYards/carries:null,yardsPerReception=receptions&&recYards!=null?recYards/receptions:null,totalTouches=(carries||0)+(receptions||0),yardsPerTouch=totalTouches&&rushYards!=null&&recYards!=null?(rushYards+recYards)/totalTouches:null;return rbProductionGrade({scouting,yardsPerCarry,yardsPerReception,yardsPerTouch,yptp:m.yptp,recShare:m.recShare,domRtg:m.domRtg,speedScore:num(r["Speed Score"]),receptions,carries,combineScore:combineFor(p),frSophRushYd:num(r["FR + Soph Rush Yd"]),singleSeasonRec:num(r["Single Season Rec"]),careerRec:num(r["Career Rec"]),isNonFbs:college?.subdivision==="FCS"},productionPopulation,(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  function productionMetricDataFor(p:Player){
    const r=importedFor(p),m=prodMetrics(p),carries=num(r.Carries??r["Rush Attempts"]),rushYards=num(r["Rush Yards"]),receptions=num(r.Receptions),recYards=num(r["Rec Yards"]);
    const ypc=carries&&rushYards!=null?rushYards/carries:null,ypr=receptions&&recYards!=null?recYards/receptions:null,totalTouches=(carries||0)+(receptions||0),ypt=totalTouches&&rushYards!=null&&recYards!=null?(rushYards+recYards)/totalTouches:null;
    const specs=[
      {label:"Yards / Carry",raw:ypc,pct:false,values:productionPopulation.yardsPerCarry},
      {label:"Yards / Reception",raw:ypr,pct:false,values:productionPopulation.yardsPerReception},
      {label:"Yards / Touch",raw:ypt,pct:false,values:productionPopulation.yardsPerTouch},
      {label:"YPTP",raw:m.yptp,pct:false,values:productionPopulation.yptp},
      {label:"Receiving Share",raw:m.recShare,pct:true,values:productionPopulation.recShare},
      {label:"Dominator Rating",raw:m.domRtg,pct:true,values:productionPopulation.domRtg},
      {label:"Speed Score",raw:num(r["Speed Score"]),pct:false,values:productionPopulation.speedScore}
    ];
    return specs.map(s=>({...s,percentile:s.raw==null?null:percentRankInc(s.values,s.raw)}));
  }
  function metricDataFor(p:Player){const r=importedFor(p);return ANALYTICS.map(m=>{const population=imports.map(x=>num(x[m.label],m.pct)).filter((v):v is number=>v!=null),raw=num(r[m.label],m.pct),percentile=raw==null?null:percentRankInc(population,raw);return {...m,raw,percentile}})}
  function analyticalFor(p:Player){const scouting=scoutingFor(p);if(scouting==null)return null;const rec=Object.fromEntries(metricDataFor(p).map(m=>[m.sheet,m.percentile])) as Record<string,number|null>;return rbAnalyticalGrade(scouting,rec,(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  function preDraftFor(p:Player){const s=scoutingFor(p);if(s==null)return null;return preDraftGrade("RB",s,productionFor(p),analyticalFor(p),earlyDeclareFor(p).yes,(glossary.length?glossary:undefined) as GlossaryRows|undefined)}
  function rankingGradeFor(p:Player){return preDraftFor(p)??scoutingFor(p)}
  const rankedPlayers=useMemo(()=>[...players].sort((a,b)=>{const ga=rankingGradeFor(a),gb=rankingGradeFor(b);if(ga==null&&gb==null)return(a.watch_order||9999)-(b.watch_order||9999);if(ga==null)return 1;if(gb==null)return-1;return gb-ga||((a.watch_order||9999)-(b.watch_order||9999))}),[players,vals,imports,colleges,glossary]);
  const filtered=useMemo(()=>{const q=norm(search);return rankedPlayers.filter(p=>!q||norm(p.name+" "+(p.college||"")).includes(q))},[rankedPlayers,search]);

  async function persist(p:Player,cat:string,value:any){setSaveState("saving");setVals(v=>({...v,[p.id+"|"+cat]:value}));if(demoMode){setTimeout(()=>setSaveState("saved"),120);return}try{await onSave(p,cat,value);setSaveState("saved")}catch{setSaveState("error")}}
  function local(p:Player,cat:string,value:any){setVals(v=>({...v,[p.id+"|"+cat]:value}))}
  async function saveSession(p:Player,s:Session,patch:Partial<Session>){const id=String(p.id),next={...s,...patch};setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?next:y)}));if(s.legacy||demoMode){if(patch.raw_notes!==undefined)await persist(p,"__COMMENTARY__",patch.raw_notes||"");if(patch.opponent!==undefined)await persist(p,"__GAME_LABEL__",patch.opponent||"");return}await fetch("/api/scouting-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,opponent:next.opponent,rawNotes:next.raw_notes})})}
  async function addSession(p:Player){const id=String(p.id),d=newGame[id]||{opponent:"",notes:""};if(!d.opponent.trim()&&!d.notes.trim())return;if(demoMode){setSessions(x=>({...x,[id]:[{id:"demo-"+Date.now(),opponent:d.opponent||"New game",raw_notes:d.notes,legacy:true},...(x[id]||[])]}))}else{const r=await fetch("/api/scouting-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,opponent:d.opponent,rawNotes:d.notes})});if(r.ok){const s=await r.json();setSessions(x=>({...x,[id]:[s,...(x[id]||[])]}))}}setNewGame(x=>({...x,[id]:{opponent:"",notes:""}}));setNewGameOpen(x=>({...x,[id]:false}))}

  useEffect(()=>{if(mode!=="Evaluate")return;const nodes=rankedPlayers.map(p=>document.getElementById("rb-eval-"+p.id)).filter(Boolean) as HTMLElement[];if(!nodes.length)return;const obs=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setSelectedId(String((visible[0].target as HTMLElement).dataset.playerId||""))},{rootMargin:"-150px 0px -65% 0px",threshold:[0,.01]});nodes.forEach(n=>obs.observe(n));return()=>obs.disconnect()},[mode,rankedPlayers]);
  function jump(p:Player){setMode("Evaluate");setSelectedId(String(p.id));requestAnimationFrame(()=>document.getElementById("rb-eval-"+p.id)?.scrollIntoView({behavior:"smooth",block:"start"}))}

  function renderPlayer(p:Player){const id=String(p.id),r=importedFor(p),c=collegeFor(p),metrics=metricDataFor(p),productionMetrics=productionMetricDataFor(p),scouting=scoutingFor(p),production=productionFor(p),analytical=analyticalFor(p),pre=preDraftFor(p),fields=fieldsFor(p),combine=combineFor(p),early=earlyDeclareFor(p),teamScore=num(fields["Team Score (10)"]),draftCap=num(fields["Draft Capital Score (10)"]),final=pre==null||teamScore==null||draftCap==null?null:draftAdjustedFinalGrade("RB",pre,teamScore,draftCap,(glossary.length?glossary:undefined) as GlossaryRows|undefined),rank=rankedPlayers.indexOf(p)+1,complete=FILM.filter(x=>num(evalFor(p,x))!=null).length,games=num(evalFor(p,"Games watched"))||0,style=schoolStyle(p.college),d=newGame[id]||{opponent:"",notes:""},pm=prodMetrics(p);
    return <article className="qb-evaluate-player" id={"rb-eval-"+p.id} data-player-id={p.id} key={p.id}>
      <header className="qb-player-hero" style={style}><div className="qb-player-photo">{p.headshot_url?<img src={p.headshot_url} alt=""/>:<span>{p.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span>}</div><div className="qb-player-title"><div className="qb-kicker">RB {rank} · {p.college||"College TBD"}{p.jersey_number?" · #"+p.jersey_number:""}</div><h1>{p.name}</h1><div className="qb-hero-meta"><span>{r.Age?"Age "+r.Age:"Age —"}</span><span>{r.Class||"Class —"}</span>{early.yes&&<span className="rb-early-declare-badge" title={early.source==="auto"?"Automatically inferred from "+(early.classLabel||"class data"):"Manual early-declare override"}>★ EARLY DECLARE</span>}<span>{games} game{games===1?"":"s"} watched</span><span className="qb-draft-result-badge"><img src="https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" alt="NFL"/><b>TBD</b></span>{!demoMode&&<button onClick={()=>openPlayer(p.id)}>Open player profile ↗</button>}</div></div><div className={"qb-save-state "+saveState}>{demoMode?"Preview data":saveState==="saving"?"Saving…":saveState==="error"?"Save failed":"✓ Saved"}</div></header>
      <div className="qb-grade-strip rb-grade-strip"><GradeCard label="Scouting" value={scouting} hint={complete+"/9 traits"}/><GradeCard label="Production" value={production} hint="Workbook production model"/><GradeCard label="Analytical" value={analytical} hint="PFF percentile model"/><GradeCard label="Pre-Draft" value={pre} hint="Scout + prod + analytics"/><GradeCard label="Final" value={final} hint={final==null?"Waiting for NFL draft":"Draft-adjusted"}/></div>

      {tab==="Film"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Scout Inputs</span><h2>Film Evaluation</h2></div><div className="qb-completion">{complete}/9 complete</div></div>
        <div className="qb-context-grid"><Field label="Games watched"><input type="number" min="0" value={evalFor(p,"Games watched")??""} onChange={e=>local(p,"Games watched",e.target.value)} onBlur={e=>persist(p,"Games watched",e.target.value===""?"":Number(e.target.value))}/></Field><ConstrainedField label="Expected role" value={rbExpectedRoleValue(evalFor(p,"Expected Role"))} options={[...ROLE_OPTIONS]} onLocal={v=>local(p,"Expected Role",v)} onCommit={v=>persist(p,"Expected Role",v)}/><ConstrainedField label="Archetype" value={rbArchetypeValue(evalFor(p,"Expected Role"),evalFor(p,"Archetype"))} options={[...ARCHETYPE_OPTIONS]} onLocal={v=>local(p,"Archetype",v)} onCommit={v=>persist(p,"Archetype",v)}/><ConstrainedField label="Draft projection" value={String(evalFor(p,"Draft Projection")||"")} options={[...PROJECTION_OPTIONS]} onLocal={v=>local(p,"Draft Projection",v)} onCommit={v=>persist(p,"Draft Projection",v)}/></div>
        <div className="qb-film-grid">{FILM.map(trait=>{const n=num(evalFor(p,trait));return <div className="qb-trait-card" key={trait} style={{"--heat":heatColor((n??50)/100)} as any}><div className="qb-trait-head"><div><span>{trait}</span><small>{scoreLabel(n)}</small></div><strong>{n==null?"—":n.toFixed(2)}</strong></div><input className="qb-grade-slider heat" type="range" min="0" max="100" step=".25" value={n??50} onChange={e=>local(p,trait,Number(e.target.value))} onMouseUp={e=>persist(p,trait,Number((e.target as HTMLInputElement).value))}/><div className="qb-trait-scale"><span>0</span><span>50</span><span>100</span></div><input className="qb-grade-number" type="number" min="0" max="100" step=".01" value={evalFor(p,trait)??""} onChange={e=>local(p,trait,e.target.value)} onBlur={e=>persist(p,trait,e.target.value===""?"":Math.round(Number(e.target.value)*100)/100)}/></div>})}</div>
        <div className="qb-section-head compact"><div><span className="ey">Context Adjustments</span><h2>Role & Risk</h2></div></div><div className="qb-context-grid six"><Field label="Early Declare"><div className="rb-early-control"><select value={evalFor(p,"Early Declare")||"Auto"} onChange={e=>persist(p,"Early Declare",e.target.value==="Auto"?"":e.target.value)}><option>Auto</option><option>Yes</option><option>No</option></select><small>{early.source==="auto"?"Auto · "+(early.classLabel||"class")+" → "+(early.yes?"Yes":"No"):early.source==="override"?"Override · "+(early.yes?"Yes":"No"):"Auto · Class unavailable"}</small></div></Field>{ADJUSTMENTS.map(([label,opts])=><Field key={label} label={label}><select value={evalFor(p,label)||opts[0]} onChange={e=>persist(p,label,e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select></Field>)}</div>
        <div className="qb-game-log"><div className="qb-section-head compact"><div><span className="ey">Game Log</span><h2>Scouting Commentary</h2></div><button className="ghost" onClick={()=>setNewGameOpen(x=>({...x,[id]:!x[id]}))}>+ Add game</button></div>{newGameOpen[id]&&<div className="qb-game-note new"><input value={d.opponent} onChange={e=>setNewGame(x=>({...x,[id]:{...d,opponent:e.target.value}}))} placeholder="Season · Opponent"/><textarea value={d.notes} onChange={e=>setNewGame(x=>({...x,[id]:{...d,notes:e.target.value}}))}/><button onClick={()=>addSession(p)}>Add to top</button></div>}{(sessions[id]||[]).map((s,i)=><div className="qb-game-note" key={String(s.id)}><div className="qb-game-note-head"><span>{i===0?"Latest":"Game "+(i+1)}</span><input value={s.opponent||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,opponent:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{opponent:e.target.value})}/></div><textarea value={s.raw_notes||""} onChange={e=>setSessions(x=>({...x,[id]:(x[id]||[]).map(y=>String(y.id)===String(s.id)?{...y,raw_notes:e.target.value}:y)}))} onBlur={e=>saveSession(p,s,{raw_notes:e.target.value})}/></div>)}</div>
      </div>}

      {tab==="Production"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Production Model</span><h2>Usage & Production</h2><p>Production inputs now use the same percentile-card treatment as Analytics, making the grade-driving metrics easy to scan.</p></div><GradePill value={production}/></div>
        <div className="qb-analytics-grid">{productionMetrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>Higher is better</small></div><b>{show(m.raw,m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div>
        <div className="qb-section-head compact"><div><span className="ey">Raw Production</span><h2>Season & Career Context</h2></div></div><div className="qb-stat-grid">{STATS.map(([label,key,pct])=><Stat key={label} label={label} value={show(r[key],pct,2)}/>)}</div><div className="rb-production-grid"><Stat label="FR + Soph Rush Yds" value={show(r["FR + Soph Rush Yd"],false,0)}/><Stat label="Single Season Rec" value={show(r["Single Season Rec"],false,0)}/><Stat label="Career Rec" value={show(r["Career Rec"],false,0)}/></div>
        <div className="qb-section-head compact"><div><span className="ey">Team Context</span><h2>{p.college}</h2></div></div><div className="qb-stat-grid"><Stat label="Team Rush Yards" value={show(c.rushYards,false,0)}/><Stat label="Team Rush TD" value={show(c.rushTDs,false,0)}/><Stat label="Team Pass Yards" value={show(c.passYards,false,0)}/><Stat label="Team Pass TD" value={show(c.passTDs,false,0)}/></div></div>}

      {tab==="Analytics"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">PFF + Calculated</span><h2>Analytical Profile</h2></div><GradePill value={analytical}/></div><div className="qb-analytics-grid">{metrics.map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>Higher is better</small></div><b>{show(r[m.label],m.pct,m.pct?1:2)}</b></div><div className="qb-percentile heat"><i style={{left:((m.percentile??0)*100)+"%",background:heatColor(m.percentile??0)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{m.percentile==null?"—":Math.round(m.percentile*100)}</strong></div></div>)}</div></div>}

      {tab==="Combine"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Combine / Pro Day</span><h2>Testing Profile</h2><p>MockDraftable spider chart alongside the local testing inputs used by the grade model.</p></div><GradePill value={combine}/></div><div className="mockdraftable-testing-layout"><div className="mockdraftable-frame-card"><div className="mockdraftable-frame-head"><div><span className="ey">MockDraftable</span><strong>{p.name} · RB</strong></div><a href={"https://www.mockdraftable.com/player/"+mockDraftableSlug(p.name)} target="_blank" rel="noreferrer">Open profile ↗</a></div><iframe title={p.name+" MockDraftable spider chart"} src={"https://www.mockdraftable.com/embed/"+mockDraftableSlug(p.name)+"?position=RB&page=GRAPH"} loading="lazy"/></div><div className="qb-analytics-grid mockdraftable-metrics">{[
          {label:"Height",value:r.Height,percentile:null},{label:"Weight",value:r.Weight,percentile:null},{label:"BMI",value:show(r.BMI,false,1),percentile:null},
          {label:"40 Yard Dash",value:show(r["40 Yard Dash"],false,2),percentile:boardPercentile(combinePopulation.forty,num(r["40 Yard Dash"]),true)},
          {label:"Speed Score",value:show(r["Speed Score"],false,1),percentile:boardPercentile(combinePopulation.speedScore,num(r["Speed Score"]))},
          {label:"Broad Jump",value:r["Broad Jump"],percentile:boardPercentile(combinePopulation.broadJump,num(r["Broad Jump"]))}
        ].map(m=><div className="qb-metric" key={m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>{m.percentile==null?"Imported testing data":"Board percentile"}</small></div><b>{m.value||"—"}</b></div>{m.percentile!=null&&<><div className="qb-percentile heat"><i style={{left:(m.percentile*100)+"%",background:heatColor(m.percentile)}}/></div><div className="qb-metric-foot"><span>Percentile</span><strong>{Math.round(m.percentile*100)}</strong></div></>}</div>)}</div></div></div>}

      {tab==="Draft"&&<div className="qb-tab-content"><div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2></div></div><div className="qb-draft-grid"><div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{fmt(pre)}</strong><small>Scouting + production + analytics</small></div><div className="qb-draft-arrow">→</div><div className="qb-draft-card"><span>NFL Draft Result</span><strong>{fields["Draft Result"]||"Pending"}</strong><small>Auto-filled after the NFL Draft</small></div><div className="qb-draft-arrow">→</div><div className="qb-draft-card final"><span>Draft-Adjusted Final</span><strong>{fmt(final)}</strong><small>Team fit + draft capital</small></div></div></div>}
    </article>
  }

  if(!players.length)return <div className="qb-workspace-empty"><h2>No watched RBs yet</h2><p>Add a running back to start a scouting report.</p><button className="success" onClick={onAdd}>+ New Player Watched</button></div>;
  const comparePlayers=rankedPlayers.filter(p=>compareIds.includes(String(p.id)));
  return <div className="qb-workspace rb-workspace"><aside className="qb-prospect-rail"><div className="qb-rail-head"><div><span className="ey">2027 Running Backs</span><strong>{players.length} available</strong></div><button className="qb-add" onClick={onAdd}>+</button></div><div className="qb-mode-toggle">{(["Evaluate","Compare"] as Mode[]).map(x=><button key={x} className={mode===x?"active":""} onClick={()=>setMode(x)}>{x}</button>)}</div><input className="qb-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search running backs…"/><div className="qb-prospect-list">{filtered.map(p=>{const rank=rankedPlayers.indexOf(p)+1,g=rankingGradeFor(p),done=FILM.filter(x=>num(evalFor(p,x))!=null).length;return <div className={"qb-prospect-row "+(String(p.id)===selectedId?"active":"")} key={p.id}><button className="qb-prospect-item" onClick={()=>jump(p)}><span className="qb-rank">RB{rank}</span><span className="qb-prospect-copy"><b>{p.name}</b><small>{p.college} · {done}/9 traits</small></span><span className="qb-mini-grade">{fmt(g)}</span></button></div>})}</div>{demoMode&&<div className="qb-demo-note">Preview seeded from the live 2027 RB Scouting sheet.</div>}</aside><section className={"qb-scouting-pane "+(mode==="Evaluate"?"evaluate":"compare")}>{mode==="Compare"?<CompareView players={comparePlayers} allPlayers={rankedPlayers} compareIds={compareIds} setCompareIds={setCompareIds} vals={vals} importedFor={importedFor} scoutingFor={scoutingFor} productionFor={productionFor} analyticalFor={analyticalFor} preDraftFor={preDraftFor} metricDataFor={metricDataFor}/>:<div className="qb-evaluate-stack"><nav className="qb-section-tabs qb-shared-tabs">{(["Film","Production","Analytics","Combine","Draft"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>{rankedPlayers.map(renderPlayer)}</div>}</section></div>
}

function CompareView({players,allPlayers,compareIds,setCompareIds,vals,importedFor,scoutingFor,productionFor,analyticalFor,preDraftFor,metricDataFor}:{players:Player[],allPlayers:Player[],compareIds:string[],setCompareIds:React.Dispatch<React.SetStateAction<string[]>>,vals:Record<string,any>,importedFor:(p:Player)=>any,scoutingFor:(p:Player)=>number|null,productionFor:(p:Player)=>number|null,analyticalFor:(p:Player)=>number|null,preDraftFor:(p:Player)=>number|null,metricDataFor:(p:Player)=>any[]}){
  type M={key:string;group:string;label:string;numeric?:boolean;get:(p:Player)=>any;format?:(v:any)=>string};
  const [open,setOpen]=useState(false),[sortKey,setSortKey]=useState("rank"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const metrics:M[]=[
    {key:"scouting",group:"Grades",label:"Scouting",numeric:true,get:scoutingFor,format:fmt},{key:"production",group:"Grades",label:"Production",numeric:true,get:productionFor,format:fmt},{key:"analytical",group:"Grades",label:"Analytical",numeric:true,get:analyticalFor,format:fmt},{key:"predraft",group:"Grades",label:"Pre-Draft",numeric:true,get:preDraftFor,format:fmt},
    {key:"games",group:"Profile",label:"Games Watched",numeric:true,get:p=>num(vals[p.id+"|Games watched"])},{key:"role",group:"Profile",label:"Role",get:p=>vals[p.id+"|Expected Role"]||"—"},{key:"proj",group:"Profile",label:"Draft Projection",get:p=>vals[p.id+"|Draft Projection"]||"—"},
    ...FILM.map(label=>({key:"film-"+label,group:"Film",label,numeric:true,get:(p:Player)=>num(vals[p.id+"|"+label]),format:(v:any)=>v==null?"—":Number(v).toFixed(2)})),
    ...STATS.map(([label,key,pct])=>({key:"stat-"+key,group:"Production",label,numeric:true,get:(p:Player)=>num(importedFor(p)[key],pct),format:(v:any)=>v==null?"—":pct?(Number(v)*100).toFixed(1)+"%":Number(v).toFixed(label.includes("Yards /")?2:0)})),
    ...ANALYTICS.map(a=>({key:"a-"+a.label,group:"Analytics",label:a.label+" %ile",numeric:true,get:(p:Player)=>{const m=metricDataFor(p).find((x:any)=>x.label===a.label);return m?.percentile==null?null:m.percentile*100},format:(v:any)=>v==null?"—":Math.round(Number(v)).toString()}))
  ];
  const map=new Map(metrics.map(m=>[m.key,m])),groups=Array.from(new Set(metrics.map(m=>m.group))).map(group=>({group,count:metrics.filter(m=>m.group===group).length}));
  const change=(key:string)=>{if(sortKey===key)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(key);setSortDir(key==="rank"||key==="player"?"asc":"desc")}};
  const sorted=[...players].sort((a,b)=>{let av:any,bv:any;if(sortKey==="rank"){av=allPlayers.indexOf(a)+1;bv=allPlayers.indexOf(b)+1}else if(sortKey==="player"){av=(a.name+" "+a.college).toLowerCase();bv=(b.name+" "+b.college).toLowerCase()}else{const m=map.get(sortKey);av=m?.get(a);bv=m?.get(b)}if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return sortDir==="asc"?cmp:-cmp});
  const arrow=(k:string)=>sortKey===k?(sortDir==="asc"?" ↑":" ↓"):"";
  return <div className="qb-compare-view"><div className="qb-compare-head"><div><span className="ey">Side-by-Side</span><h2>RB Comparison Board</h2><p>Every numeric column is sortable and conditionally formatted inside the current comparison set.</p></div><div className="qb-compare-controls"><button className="ghost" onClick={()=>setCompareIds(allPlayers.map(p=>String(p.id)))}>All players</button><div className="qb-compare-filter"><button className="qb-compare-filter-button" onClick={()=>setOpen(x=>!x)}>{players.length} of {allPlayers.length} Players ▾</button>{open&&<div className="qb-compare-filter-list">{allPlayers.map(p=><label key={p.id}><input type="checkbox" checked={compareIds.includes(String(p.id))} onChange={()=>setCompareIds(cur=>cur.includes(String(p.id))?cur.filter(x=>x!==String(p.id)):[...cur,String(p.id)])}/><span>RB{allPlayers.indexOf(p)+1}</span><b>{p.name}</b><small>{p.college}</small></label>)}</div>}</div></div></div><div className="qb-compare-scroll"><table className="qb-compare-matrix"><thead><tr className="groups"><th rowSpan={2}><button onClick={()=>change("rank")}>Rank{arrow("rank")}</button></th><th rowSpan={2}><button onClick={()=>change("player")}>Player / School{arrow("player")}</button></th>{groups.map(g=><th colSpan={g.count} key={g.group}>{g.group}</th>)}</tr><tr>{metrics.map(m=><th key={m.key}><button onClick={()=>change(m.key)}>{m.label}{arrow(m.key)}</button></th>)}</tr></thead><tbody>{sorted.map(p=><tr key={p.id}><th className="rank">RB{allPlayers.indexOf(p)+1}</th><th className="player" style={schoolStyle(p.college)}><b>{p.name}</b><small> · {p.college}</small></th>{metrics.map(m=>{const raw=m.get(p),values=m.numeric?players.map(x=>m.get(x)).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)):[];return <td key={m.key} className={m.numeric?"numeric":""} style={m.numeric?conditionalStyle(raw,values):undefined}>{m.format?m.format(raw):(raw??"—")}</td>})}</tr>)}</tbody></table></div></div>
}

function GradeCard({label,value,hint}:{label:string,value:number|null,hint:string}){return <div className="qb-grade-card"><span>{label}</span><strong>{fmt(value)}</strong><small>{hint}</small></div>}
function GradePill({value}:{value:number|null}){return <div className="qb-grade-pill"><span>Grade</span><b>{fmt(value)}</b></div>}
function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="qb-field"><span>{label}<em>Scout</em></span>{children}</label>}
function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
function Stat({label,value}:{label:string,value:any}){return <div className="qb-stat-card"><span>{label}</span><strong>{value}</strong></div>}
function ConstrainedField({label,value,options,onLocal,onCommit}:{label:string,value:string,options:string[],onLocal:(v:string)=>void,onCommit:(v:string)=>void|Promise<any>}){
  const isCustom=Boolean(value)&&!options.includes(value);
  const [other,setOther]=useState(isCustom);
  useEffect(()=>setOther(Boolean(value)&&!options.includes(value)),[value,options]);
  return <Field label={label}><div className="qb-constrained">
    <select value={other?"Other":value} onChange={e=>{
      if(e.target.value==="Other"){setOther(true);onLocal("")}
      else{setOther(false);onLocal(e.target.value);onCommit(e.target.value)}
    }}>
      <option value="">Select…</option>
      {options.map(x=><option key={x}>{x}</option>)}
      <option>Other</option>
    </select>
    {other&&<input value={value} onChange={e=>onLocal(e.target.value)} onBlur={e=>onCommit(e.target.value)} placeholder={"Other "+label.toLowerCase()+"…"}/>}
  </div></Field>
}
