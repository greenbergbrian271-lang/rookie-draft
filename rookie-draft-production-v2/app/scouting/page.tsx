"use client";
import {Fragment,useEffect,useMemo,useState} from "react";import NewPlayerWatchedModal from "@/components/NewPlayerWatchedModal";import {schoolStyle} from "@/lib/school-colors";import {preDraftGrade,workbookScoutingGrade} from "@/lib/scouting-formulas";import PlayerName from "@/components/PlayerName";import QBScoutingWorkspace from "./QBScoutingWorkspace";import RBScoutingWorkspace from "./RBScoutingWorkspace";
type Pos="QB"|"RB"|"WR"|"TE";type Player={id:string|number,name:string,position:Pos,college?:string,draft_class:number,scouting_status:string,watch_order?:number};
const norm=(s:any)=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const HEAD:Record<Pos,string[]>={
QB:["Position Rank","Player, College","Player","College","Age","Class","Games watched","Expected Role","Draft Projection","Draft Adjusted Final Grade","Draft Result","Team Score (10)","Draft Capital Score (10)","Pre-Draft Grade","Scouting Grade","Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size","Career Starts","Career Attempts","Career Max YPG","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Games","Completions","Attempts","Completion %","Yards","Yards/Attempt","Touchdowns","Interceptions","Rushes","Yards","Yards/Attempt","Touchdowns","Analytical Grade","ADOT","QBR","Adjusted Y/A","Screen %","ADJ Comp %","Clean Comp %","Big Time Throws","BTT %","TO Worthy Plays","TWP %","Time to Throw","Allowed Press. %","20+ Comp %","PA BTT %","Pressure-to-Sack %","Pressured ADJ%","Pressured BTT%","Pressured TWP%","Scrambles","Scramble Yards","Yards/Scramble","Rush Yard %","Press. Scrambles","Clean Scramble %","Combine/Pro Day Grade","Height","Weight","BMI","40 Yard Dash","Speed Score","Broad Jump"],
RB:["Position Rank","Player, College","Player","College","Age","Class","Early Declare","Games watched","Expected Role","Draft Projection","Draft Adjusted Final Grade","Draft Result","Team Score (10)","Draft Capital Score (10)","Pre-Draft Grade","Scouting Grade","Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking","Special Teams?","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Production Grade","Games","Carries","Rush Yards","Yards/Carry","Touchdowns","Receptions","Rec Yards","Yards/Reception","Touchdowns","Yards/Touch","Rush Yards","Rush TDs","Rec Yards","Rec TDs","YPTP","Rec Share %","Dom Rtg","FR + Soph Rush Yd","Single Season Rec","Career Rec","Analytical Grade","Fumble Grade","Elusive Rating","MTFs","Breakaway Runs","Breakaway Yards","Breakaway %","Rush 1st Downs","1st Downs/ATT","YAC/ATT","MTF/Att","YPRR","YAC/Rec","ADOT","Rec 1st Downs","1st Downs/Tgt","Pass Block Grade","Combine/Pro Day Score","Height","Weight","BMI","40 Yard Dash","Speed Score","Broad Jump"],
WR:["Position Rank","Player, College","Player","College","Age","Class","Early Declare?","Games Watched","Expected Role","Draft Projection","Draft Adjusted Final Grade","Draft Result","Team Score (10)","Draft Capital Score (10)","Pre-Draft Grade","Scouting Grade","Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking","Special Teams","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Production Grade","Games","Receptions","Targets","Yards","Yards/Rec","Yards/Tgt","Touchdowns","Target %","Catch %","Pass Attempts","Pass Yards","Pass TDs","YPTPA","Weightd Dom Rtg","Dom Rtg","Max FR / SO Yds","Max FR / SO TDs","Analytical Grade","Drop %","Catch in Traffic %","1st Downs","1st Downs / Tgt","Targets/Route","1st Downs/Route","Y/RR","Y/RR vs Man","Y/RR vs Zone","Contested Target %","Air Yards %","YAC/Rec","MTFs","Yards/Rec","ADOT","Screen %","Catches in Traffic","Run Block Grade","Combine/Pro Day Grade","Height","Weight","BMI","Hand Size","40 Yard Dash","Speed Score","Vertical"],
TE:["Position Rank","Player, College","Player","College","Age","Class","Early Declare","Games watched","Expected Role","Draft Projection","Draft Adjusted Final Grade","Draft Result","Team Score (10)","Draft Capital Score (10)","Pre-Draft Grade","Scouting Grade","Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility","Special Teams","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Production Grade","Games","Receptions","Targets","Yards","Yards/Rec","Yards/Tgt","Touchdowns","Target %","Catch %","Pass Attempts","Pass Yards","Pass TDs","YPTPA","Weighted Dom Rtg","Dom Rtg","Max Yds/Rec","Analytical Grade","Drop %","Catch in Traffic %","1st Downs","1st Downs / Tgt","Y/RR","Y/RR vs Man","Y/RR vs Zone","Air Yard %","YAC/Rec","MTFs","Yards/Rec","ADOT","Catches in Traffic","Inline Snap %","Slot Snap %","Wide Snap %","Run Block Grade","Pass Block Grade","Combine/Pro Day Grade","Height","Weight","BMI","Hand Size","40 Yard Dash","Speed Score","Bench Reps"]};
const FILM:Record<Pos,string[]>={QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]};
const MANUAL=new Set(["Games watched","Games Watched","Expected Role","Draft Projection","Career Starts","Career Attempts","Career Max YPG","Injury Concerns","Off-Field?","All Star Game?","Combine Invite?","Special Teams?","Special Teams"]);
const OPT:Record<string,string[]>= {"Injury Concerns":["No","Short Term","Long Term"],"Off-Field?":["No","Character","Arrest"],"All Star Game?":["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"],"Combine Invite?":["None","Yes","No"],"Early Declare":["No","Yes"],"Early Declare?":["No","Yes"],"Special Teams?":["No","Yes"],"Special Teams":["No","Yes"]};
type HeaderGroup={label:string,start:number,count:number,key:string};
const GROUPS:Record<Pos,HeaderGroup[]>={
QB:[
{label:"QB",start:0,count:3,key:"group-info"},{label:"Player Information",start:3,count:6,key:"group-info"},
{label:"Draft Adjusted Final Grade",start:9,count:1,key:"group-final"},{label:"Post Draft Adjustments",start:10,count:3,key:"group-final"},
{label:"Pre-Draft Grade",start:13,count:1,key:"group-pre"},{label:"Scouting Grade",start:14,count:1,key:"group-scout"},
{label:"Scouting",start:15,count:16,key:"group-scout"},{label:"2025 Stats",start:31,count:12,key:"group-stats"},
{label:"Analytical Grade",start:43,count:1,key:"group-analytical"},{label:"Analytical Stats",start:44,count:24,key:"group-analytical"},
{label:"Combine/Pro Day Grade",start:68,count:1,key:"group-combine"},{label:"Combine/Pro Day Results",start:69,count:6,key:"group-combine"}],
RB:[
{label:"RB",start:0,count:2,key:"group-info"},{label:"Player Information",start:2,count:8,key:"group-info"},
{label:"Draft Adjusted Final Grade",start:10,count:1,key:"group-final"},{label:"Post Draft Adjustments",start:11,count:3,key:"group-final"},
{label:"Pre-Draft Grade",start:14,count:1,key:"group-pre"},{label:"Scouting Grade",start:15,count:1,key:"group-scout"},
{label:"Scouting",start:16,count:14,key:"group-scout"},{label:"Production Grade",start:30,count:1,key:"group-production"},
{label:"2025 Stats",start:31,count:10,key:"group-stats"},{label:"Team Stats",start:41,count:4,key:"group-stats"},
{label:"Production",start:45,count:3,key:"group-production"},{label:"Career Production",start:48,count:3,key:"group-production"},
{label:"Analytical Grade",start:51,count:1,key:"group-analytical"},{label:"Analytical Stats",start:52,count:16,key:"group-analytical"},
{label:"Combine/Pro Day Score",start:68,count:1,key:"group-combine"},{label:"Combine/Pro Day Results",start:69,count:6,key:"group-combine"}],
WR:[
{label:"WR",start:0,count:2,key:"group-info"},{label:"Player Information",start:2,count:8,key:"group-info"},
{label:"Draft Adjusted Final Grade",start:10,count:1,key:"group-final"},{label:"Post Draft Adjustments",start:11,count:3,key:"group-final"},
{label:"Pre-Draft Grade",start:14,count:1,key:"group-pre"},{label:"Scouting Grade",start:15,count:1,key:"group-scout"},
{label:"Scouting",start:16,count:12,key:"group-scout"},{label:"Production Grade",start:28,count:1,key:"group-production"},
{label:"2025 Stats",start:29,count:9,key:"group-stats"},{label:"Team Stats",start:38,count:3,key:"group-stats"},
{label:"Production",start:41,count:5,key:"group-production"},{label:"Analytical Grade",start:46,count:1,key:"group-analytical"},
{label:"Analytical Stats",start:47,count:18,key:"group-analytical"},{label:"Combine/Pro Day Grade",start:65,count:1,key:"group-combine"},
{label:"Combine/Pro Day Results",start:66,count:7,key:"group-combine"}],
TE:[
{label:"TE",start:0,count:2,key:"group-info"},{label:"Player Information",start:2,count:8,key:"group-info"},
{label:"Draft Adjusted Final Grade",start:10,count:1,key:"group-final"},{label:"Post Draft Adjustments",start:11,count:3,key:"group-final"},
{label:"Pre-Draft Grade",start:14,count:1,key:"group-pre"},{label:"Scouting Grade",start:15,count:1,key:"group-scout"},
{label:"Scouting",start:16,count:12,key:"group-scout"},{label:"Production Grade",start:28,count:1,key:"group-production"},
{label:"2025 Stats",start:29,count:9,key:"group-stats"},{label:"Team Stats",start:38,count:3,key:"group-stats"},
{label:"Production",start:41,count:4,key:"group-production"},{label:"Analytical Grade",start:45,count:1,key:"group-analytical"},
{label:"Analytical Stats",start:46,count:18,key:"group-analytical"},{label:"Combine/Pro Day Grade",start:64,count:1,key:"group-combine"},
{label:"Combine/Pro Day Results",start:65,count:7,key:"group-combine"}]};
function clsAt(pos:Pos,i:number){return GROUPS[pos].find(g=>i>=g.start&&i<g.start+g.count)?.key||"group-info"}
export default function Page(){const [pos,setPos]=useState<Pos>("QB"),[rows,setRows]=useState<Player[]>([]),[vals,setVals]=useState<Record<string,any>>({}),[imports,setImports]=useState<Record<string,any[]>>({}),[glossary,setGlossary]=useState<any[][]>([]),[watchedOpen,setWatchedOpen]=useState(false);
useEffect(()=>{const q=new URLSearchParams(window.location.search).get("pos") as Pos|null;if(q&&POSITIONS.includes(q))setPos(q)},[]);
useEffect(()=>{fetch("/api/scouting-glossary",{cache:"no-store"}).then(r=>r.json()).then(j=>setGlossary(Array.isArray(j?.rows)?j.rows:[])).catch(()=>{});Promise.all([fetch("/api/players",{cache:"no-store"}).then(r=>r.json()),fetch("/api/evaluations?draftClass=2027",{cache:"no-store"}).then(r=>r.json()).catch(()=>[])]).then(([ps,es])=>{if(!Array.isArray(ps))return;setRows(ps);const n:any={};if(Array.isArray(es))for(const e of es)n[e.player_id+"|"+e.category]=e.category==="__COMMENTARY__"?(e.commentary||""):(e.value??e.commentary??"");setVals(n)});Promise.all(POSITIONS.map(async p=>[p,(await fetch("/api/player-data?position="+p,{cache:"no-store"}).then(r=>r.json()).catch(()=>({rows:[]}))).rows||[]])).then(x=>setImports(Object.fromEntries(x)))},[]);
const watchedPlayers=useMemo(()=>rows.filter(x=>x.draft_class===2027&&x.position===pos&&x.scouting_status==="WATCHED").sort((a,b)=>(a.watch_order||0)-(b.watch_order||0)),[rows,pos]);
const demoQbNames=["Arch Manning","Julian Sayin","CJ Carr","Colton Joseph"];
const demoRbNames=["Hollywood Smothers","Raleek Brown","Abu Sama III"];
const demoQbs=useMemo(()=>demoQbNames.map(name=>rows.find(x=>x.draft_class===2027&&x.position==="QB"&&x.name===name)).filter(Boolean) as Player[],[rows]);
const demoRbs=useMemo(()=>demoRbNames.map(name=>rows.find(x=>x.draft_class===2027&&x.position==="RB"&&x.name===name)).filter(Boolean) as Player[],[rows]);
const qbDemoMode=pos==="QB"&&watchedPlayers.length===0;
const rbDemoMode=pos==="RB"&&watchedPlayers.length===0;
const players=useMemo(()=>qbDemoMode?demoQbs.map(p=>({...p,scouting_status:"WATCHED"})):rbDemoMode?demoRbs.map(p=>({...p,scouting_status:"WATCHED"})):watchedPlayers,[qbDemoMode,rbDemoMode,demoQbs,demoRbs,watchedPlayers]);
useEffect(()=>{
  const ids=Array.from(new Set([
    ...rows.filter(x=>x.draft_class===2027&&["WATCHED","FINISHED","MAYBE"].includes(x.scouting_status)).map(x=>String(x.id)),
    ...(qbDemoMode?demoQbs.map(x=>String(x.id)):[]),
    ...(rbDemoMode?demoRbs.map(x=>String(x.id)):[])
  ]));
  try{sessionStorage.setItem("rookie-draft:scouting-sheet-player-ids",JSON.stringify(ids))}catch{}
},[rows,qbDemoMode,rbDemoMode,demoQbs,demoRbs]);
useEffect(()=>{if(!qbDemoMode||!demoQbs.length)return;
const seeds:Record<string,Record<string,any>>={
"Arch Manning":{
"Games watched":1,"Expected Role":"Early Starter","Draft Projection":"First Round","Team Score (10)":5,"Draft Capital Score (10)":5,
"Arm Strength":96.75,"Arm Velocity":85,"Accuracy":62.5,"Decision Making":93,"Poise + OOS":92,"Mechanics":92,"Mobility":89.95,"Leadership":98,"Size":89,
"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Ohio State",
"__COMMENTARY__":"Ohio State: Almost the exact opposite of Julian Sayin. First half, would tell you he's a bust. Second half, mannnnnnn he's a top 5 pick. Threw the ball beautifully downfield (even if there was a Cam Coleman drop) The accuracy is a concern, no doubt about it, felt like he was just throwing with wayyyyyyy too much juice at times, take a little bit off and 62% could've been a lot higher. Multiple clutch 4th down conersions too. It's a LONG way to go but to me, he's QB1"
},
"Julian Sayin":{
"Games watched":1,"Expected Role":"Developmental Starter","Draft Projection":"Day 1-2","Team Score (10)":5,"Draft Capital Score (10)":5,
"Arm Strength":97,"Arm Velocity":75,"Accuracy":67.75,"Decision Making":95,"Poise + OOS":79,"Mechanics":85,"Mobility":69,"Leadership":80,"Size":74.5,
"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Texas",
"__COMMENTARY__":"Texas: If the game ended after the first half, I'd tell you he deserves to go Top 10. Based on the whole game....the outlook as not as optimistic. He's still a first round talent IMO, but there's still things that need to be developed about him. He's a really really effective pocket passer, unafraid of pushing the ball downfield. 7 of his 32 attempts went for 20+ yards and they were generally very effective. There's a lot to like about him, but need to see a complete game against a legit opponent. He's got a 3 game stretch of Indiana, USC and Oregon starting in Mid-October, we should learn A LOT about him then."
},
"CJ Carr":{
"Games watched":1,"Expected Role":"Early Starter","Draft Projection":"First Round","Team Score (10)":5,"Draft Capital Score (10)":5,
"Arm Strength":60,"Arm Velocity":68,"Accuracy":84.5,"Decision Making":94,"Poise + OOS":80,"Mechanics":88,"Mobility":73,"Leadership":90,"Size":79,
"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Wisconsin",
"__COMMENTARY__":"Wisconsin: If we were giving out letter grades, I would give this a B. For a guy with as few starts under his belt as Carr has, he reads the field SOOOO well, undoubtedly my favorite trait from Carr. What I really want to see more of is pushing the ball down the field. In this one he was simply a game manager, ND put up 41 and Carr had 0 big time throws per PFF. Only 5 of his 29 throws went beyond 10+ yards. I need to see a guy who's willing to tkae a shot down the field if he's going to be a viable NFL QB."
},
"Colton Joseph":{
"Games watched":1,"Expected Role":"Gritty Backup","Draft Projection":"Day 3","Team Score (10)":5,"Draft Capital Score (10)":5,
"Arm Strength":62.75,"Arm Velocity":65,"Accuracy":77,"Decision Making":68.75,"Poise + OOS":66,"Mechanics":71,"Mobility":89,"Leadership":70,"Size":69.75,
"Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Notre Dame",
"__COMMENTARY__":"Notre Dame: A pleasant surprise! ... As a runner. The box score won't give you the full picture as a runner IMO. I think Notre Dame's defense was SWARMING him after the first couple drives, but when he got space he was making the most of it. He had a couple nice throws, particularly to Coleman, but ultimately its going to be tough for any QB to throw on this defense. Intrigued to see him in future games."
}};
setVals(v=>{const next={...v};for(const p of demoQbs){const seed=seeds[p.name]||{};for(const [k,val] of Object.entries(seed)){const key=p.id+"|"+k;if(next[key]===undefined||next[key]==="")next[key]=val}}return next})
},[qbDemoMode,demoQbs]);

useEffect(()=>{if(!rbDemoMode||!demoRbs.length)return;
const seeds:Record<string,Record<string,any>>={
"Hollywood Smothers":{
"Games watched":1,"Expected Role":"RB1","Draft Projection":"Day 2","Early Declare":"No","Team Score (10)":5,"Draft Capital Score (10)":5,
"Ball Carrier Vision":89,"Carrying":90,"Elusiveness":89,"Big Play Speed":85,"Patience":95,"Contact Balance":93,"Effort":95,"Receiving Skills":70,"Pass Blocking":80,
"Special Teams?":"Yes","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Ohio State",
"__COMMENTARY__":"Ohio State: I wrote this note several times in just one game: I'm going to be IRRATIONALLY high on Smothers. I cooled it down a little bit in my initial rankings now that it's a couple days later, but by GOD he's so good. "
},
"Raleek Brown":{
"Games watched":1,"Expected Role":"RB2","Draft Projection":"Day 3","Early Declare":"No","Team Score (10)":5,"Draft Capital Score (10)":5,
"Ball Carrier Vision":72.5,"Carrying":25,"Elusiveness":65,"Big Play Speed":72.5,"Patience":72.5,"Contact Balance":85,"Effort":60,"Receiving Skills":67,"Pass Blocking":79,
"Special Teams?":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Ohio State",
"__COMMENTARY__":"Ohio State: I know there are some that really like Raleek Brown and potentially even more than his running mate Smothers...however Smothers is wayyyyyyyyy better imo. 2 fumbles, one in the pass game and one in the run game. There was also a play early in the game where he didn't dive for a 1st down when Texas was still treading water on offense. Don't want to rule him out after just 1 game but it's an uphill battle rn."
},
"Abu Sama III":{
"Games watched":1,"Expected Role":"Thumper Back","Draft Projection":"Day 3","Early Declare":"No","Team Score (10)":5,"Draft Capital Score (10)":5,
"Ball Carrier Vision":75,"Carrying":75,"Elusiveness":76,"Big Play Speed":65,"Patience":66,"Contact Balance":89.75,"Effort":92,"Receiving Skills":60,"Pass Blocking":77,
"Special Teams?":"No","Injury Concerns":"No","Off-Field?":"No","All Star Game?":"None","Combine Invite?":"None",
"__GAME_LABEL__":"2026 · Notre Dame",
"__COMMENTARY__":"One more where the numbers lie a bit because holy cow was he tough to tackle, it felt like everytime he added +3 from point of contact on every tackle. Excited to see more of him, espcially against a less NFL-esque defense, to see what he's like open field, as well as not being the extreme focal point."
}};
setVals(v=>{const next={...v};for(const p of demoRbs){const seed=seeds[p.name]||{};for(const [k,val] of Object.entries(seed)){const key=p.id+"|"+k;if(next[key]===undefined||next[key]==="")next[key]=val}}return next})
},[rbDemoMode,demoRbs]);

async function save(p:Player,cat:string,value:any){setVals(v=>({...v,[p.id+"|"+cat]:value}));const r=await fetch("/api/evaluations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerId:p.id,category:cat,value:typeof value==="number"?value:null,commentary:typeof value==="number"?null:String(value)})});if(!r.ok)throw new Error("Could not save evaluation");return r.json()}
function grade(p:Player){const fields:any={};for(const h of HEAD[pos])fields[h]=vals[p.id+"|"+h];return workbookScoutingGrade(pos,FILM[pos].map(h=>Number(vals[p.id+"|"+h])),fields,glossary.length?glossary:undefined)}
function cell(p:Player,h:string,i:number){const imp=(imports[pos]||[]).find((x:any)=>norm(x.Player)===norm(p.name)||norm(x["Player, College"])===norm(p.name+", "+(p.college||"")))||{},k=p.id+"|"+h,v=vals[k]??"";const imported=imp[h]??imp[h.replace("Watched","watched")]??imp[h.replace("Weightd","Weighted")];if(i===0)return <b>{pos} {players.indexOf(p)+1}</b>;if(i===1)return <div className="college-cell" style={schoolStyle(p.college)}><b>{p.name}, {p.college}</b></div>;if(i===2)return <PlayerName id={p.id}>{p.name}</PlayerName>;if(i===3)return p.college||"";if(h==="Age"||h==="Class"||h==="Early Declare"||h==="Early Declare?")return imported??vals[k]??"—";if(h==="Scouting Grade"){const g=grade(p);return g==null?"—":g.toFixed(2)}if(h==="Pre-Draft Grade"){const g=grade(p);return g==null?"—":preDraftGrade(pos,g,null,null,vals[p.id+"|Early Declare"]??vals[p.id+"|Early Declare?"]??false,glossary.length?glossary:undefined).toFixed(2)}if(FILM[pos].includes(h))return <input type="number" step=".1" value={v} onChange={e=>setVals(x=>({...x,[k]:e.target.value}))} onBlur={e=>save(p,h,Number(e.target.value))}/>;if(MANUAL.has(h)){if(OPT[h])return <select value={v} onChange={e=>save(p,h,e.target.value)}>{OPT[h].map(o=><option key={o}>{o}</option>)}</select>;return <input value={v} onChange={e=>setVals(x=>({...x,[k]:e.target.value}))} onBlur={e=>save(p,h,e.target.value)}/>}return imported??vals[k]??"—"}
const groups=GROUPS[pos];if(pos==="QB")return <><div className="page-head"><div><span className="ey">Scouting Workspace</span><h1>QB Scouting</h1><p className="muted">Film-first quarterback evaluation with workbook-parity grades, direct data joins and an audit-friendly analytics view.</p></div><span className="status cloud">● Editable + cloud saved</span></div><NewPlayerWatchedModal open={watchedOpen} onClose={()=>setWatchedOpen(false)} onDone={()=>location.reload()}/><div className="tabs scouting-position-tabs">{POSITIONS.map(x=><button key={x} className={x===pos?"success":"ghost"} onClick={()=>setPos(x)}>{x} Scouting</button>)}</div><QBScoutingWorkspace players={players} vals={vals} setVals={setVals} imports={imports.QB||[]} glossary={glossary} onSave={save} onAdd={()=>setWatchedOpen(true)} demoMode={qbDemoMode}/></>;
if(pos==="RB")return <><div className="page-head"><div><span className="ey">Scouting Workspace</span><h1>RB Scouting</h1><p className="muted">Film-first running back evaluation with workbook-parity scouting, production, analytical and combine grades.</p></div><span className="status cloud">● Editable + cloud saved</span></div><NewPlayerWatchedModal open={watchedOpen} onClose={()=>setWatchedOpen(false)} onDone={()=>location.reload()}/><div className="tabs scouting-position-tabs">{POSITIONS.map(x=><button key={x} className={x===pos?"success":"ghost"} onClick={()=>setPos(x)}>{x} Scouting</button>)}</div><RBScoutingWorkspace players={players} vals={vals} setVals={setVals} imports={imports.RB||[]} glossary={glossary} onSave={save} onAdd={()=>setWatchedOpen(true)} demoMode={rbDemoMode}/></>;
return <><div className="page-head"><div><h1>{pos} Scouting</h1><p className="muted">Workbook-first scouting view. Column order, grouped color language, frozen identity columns and paired commentary rows mirror the live {pos} Scouting tab.</p></div><div><button className="success" onClick={()=>setWatchedOpen(true)}>+ New Player Watched</button> <span className="status cloud">● Editable + cloud saved</span></div></div><NewPlayerWatchedModal open={watchedOpen} onClose={()=>setWatchedOpen(false)} onDone={()=>location.reload()}/><div className="tabs">{POSITIONS.map(x=><button key={x} className={x===pos?"success":"ghost"} onClick={()=>setPos(x)}>{x} Scouting</button>)}</div><div className={`sheet-wrap scouting-workbook pos-${pos.toLowerCase()}`}><table className="sheet"><thead><tr>{groups.map(g=><th key={g.start} colSpan={g.count} className={g.key}>{g.label}</th>)}</tr><tr>{HEAD[pos].map((h,i)=><th key={i} className={(i===0?"sticky-rank ":i===1?"sticky-player ":"")+clsAt(pos,i)}>{h}</th>)}</tr></thead><tbody>{players.map(p=><Fragment key={p.id}><tr className="player-row">{HEAD[pos].map((h,i)=><td key={i} className={(i===0?"sticky-rank ":i===1?"sticky-player ":"")+clsAt(pos,i)}>{cell(p,h,i)}</td>)}</tr><tr className="commentary-row"><td className="sticky-rank">↳</td><td className="sticky-player"><b>Commentary</b></td><td colSpan={HEAD[pos].length-2}><textarea value={vals[p.id+"|__COMMENTARY__"]??""} onChange={e=>setVals(v=>({...v,[p.id+"|__COMMENTARY__"]:e.target.value}))} onBlur={e=>save(p,"__COMMENTARY__",e.target.value)} placeholder="Game watched + scouting commentary…"/></td></tr></Fragment>)}</tbody></table>{!players.length&&<div className="empty">No watched 2027 {pos}s yet.</div>}</div></>}
