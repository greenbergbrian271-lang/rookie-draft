"use client";
import {useEffect,useMemo,useState} from "react";
import PlayerName from "@/components/PlayerName";
import PlayerImage from "@/components/PlayerImage";

export const DRAFT_PROJECTION_OPTIONS=["Top 5","Top 10","First Round","Day 2","Early Day 3","Late Day 3","UDFA"] as const;

export type DraftPick={overall:number;round?:number;result?:string;pos:"QB"|"RB"|"WR"|"TE";name:string;team:string;college?:string;teamScore:number;draftCapitalScore:number};
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const NFL_LOGO_CODE:Record<string,string>={"49ers":"sf","bears":"chi","bengals":"cin","bills":"buf","broncos":"den","browns":"cle","buccaneers":"tb","bucs":"tb","cardinals":"ari","chargers":"lac","chiefs":"kc","colts":"ind","commanders":"wsh","cowboys":"dal","dolphins":"mia","eagles":"phi","falcons":"atl","giants":"nyg","jaguars":"jax","jets":"nyj","lions":"det","packers":"gb","panthers":"car","patriots":"ne","raiders":"lv","rams":"lar","ravens":"bal","saints":"no","seahawks":"sea","steelers":"pit","texans":"hou","titans":"ten","vikings":"min"};
const NFL_TEAM_BADGE:Record<string,{primary:string;secondary:string;color?:string}>={
"49ers":{primary:"#AA0000",secondary:"#B3995D"},"bears":{primary:"#0B162A",secondary:"#C83803"},"bengals":{primary:"#000000",secondary:"#FB4F14"},"bills":{primary:"#00338D",secondary:"#C60C30"},"broncos":{primary:"#002244",secondary:"#FB4F14"},"browns":{primary:"#311D00",secondary:"#FF3C00"},"buccaneers":{primary:"#D50A0A",secondary:"#FF7900"},"bucs":{primary:"#D50A0A",secondary:"#FF7900"},"cardinals":{primary:"#97233F",secondary:"#000000"},"chargers":{primary:"#0080C6",secondary:"#FFC20E"},"chiefs":{primary:"#E31837",secondary:"#FFB81C"},"colts":{primary:"#002C5F",secondary:"#A2AAAD"},"commanders":{primary:"#5A1414",secondary:"#FFB612"},"cowboys":{primary:"#003594",secondary:"#869397"},"dolphins":{primary:"#008E97",secondary:"#FC4C02"},"eagles":{primary:"#004C54",secondary:"#A5ACAF"},"falcons":{primary:"#A71930",secondary:"#000000"},"giants":{primary:"#0B2265",secondary:"#A71930"},"jaguars":{primary:"#006778",secondary:"#D7A22A"},"jets":{primary:"#125740",secondary:"#FFFFFF"},"lions":{primary:"#0076B6",secondary:"#B0B7BC"},"packers":{primary:"#203731",secondary:"#FFB612"},"panthers":{primary:"#101820",secondary:"#0085CA"},"patriots":{primary:"#002244",secondary:"#C60C30"},"raiders":{primary:"#000000",secondary:"#A5ACAF"},"rams":{primary:"#003594",secondary:"#FFA300"},"ravens":{primary:"#241773",secondary:"#9E7C0C"},"saints":{primary:"#101820",secondary:"#D3BC8D"},"seahawks":{primary:"#002244",secondary:"#69BE28"},"steelers":{primary:"#101820",secondary:"#FFB612"},"texans":{primary:"#03202F",secondary:"#A71930"},"titans":{primary:"#0C2340",secondary:"#4B92DB"},"vikings":{primary:"#4F2683",secondary:"#FFC62F"}};
function nflTeamBadgeStyle(team:any):React.CSSProperties{
  const key=norm(team);
  const hit=Object.entries(NFL_TEAM_BADGE).find(([name])=>{const n=norm(name);return key===n||key.endsWith(n)||key.includes(n)})?.[1];
  return hit?({
    "--nfl-primary":hit.primary,
    "--nfl-secondary":hit.secondary,
    "--nfl-text":hit.color||"#fff",
    backgroundColor:hit.primary,
    borderColor:hit.secondary,
    color:hit.color||"#fff",
    boxShadow:"inset 0 0 0 1px "+hit.secondary+"55"
  } as React.CSSProperties):{};
}
export function nflTeamLogo(team:any){
  const raw=String(team??"").trim(),key=norm(raw);
  const direct=Object.entries(NFL_LOGO_CODE).find(([name])=>{const n=norm(name);return key===n||key.endsWith(n)||key.includes(n)});
  return direct?("https://a.espncdn.com/i/teamlogos/nfl/500/"+direct[1]+".png"):"https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png";
}


export function useDraftFeed(draftClass=2027){
  const [picks,setPicks]=useState<DraftPick[]>([]);
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;
    const load=()=>fetch("/api/nfl-draft-results?draftClass="+encodeURIComponent(String(draftClass)),{cache:"no-store"}).then(r=>r.json()).then(j=>{if(!live)return;if(Array.isArray(j?.picks))setPicks(j.picks);else setPicks([]);setUpdatedAt(String(j?.updatedAt||new Date().toISOString()))}).catch(()=>{if(live)setPicks([])});
    load();
    const timer=draftClass>=2027?setInterval(load,60000):null;
    return()=>{live=false;if(timer)clearInterval(timer)};
  },[draftClass]);
  return {picks,updatedAt};
}
export function useDraftPicks(){return useDraftFeed().picks}
function nflPickLabel(overall:number,team:string,round?:number){
  const r=round||Math.floor((overall-1)/32)+1;
  return r+"."+String(overall).padStart(2,"0")+", "+team;
}
function teamFromStoredResult(result:string){
  const comma=result.lastIndexOf(",");
  if(comma>=0)return result.slice(comma+1).trim();
  const m=result.match(/(?:to|—|-)\s+([A-Za-z .'-]+)$/);
  return m?.[1]?.trim()||"";
}
export function resolveDraftContext(position:"QB"|"RB"|"WR"|"TE",playerName:string,picks:DraftPick[],fallback:{result?:any,teamScore?:any,draftCapitalScore?:any}={}){
  const live=picks.find(x=>x.pos===position&&norm(x.name)===norm(playerName));
  const number=(v:any)=>{if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const storedResult=String(fallback.result??"").trim(),storedTeam=number(fallback.teamScore),storedCapital=number(fallback.draftCapitalScore);
  const storedFinal=Boolean(storedResult&&!/^(pending|tbd|not drafted yet)$/i.test(storedResult)&&storedTeam!=null&&storedCapital!=null);
  return {
    result:live?(live.result||nflPickLabel(live.overall,live.team,live.round)):(storedResult||"Pending"),
    team:live?.team||teamFromStoredResult(storedResult),
    teamScore:storedTeam??live?.teamScore??5,
    draftCapitalScore:storedCapital??live?.draftCapitalScore??5,
    automated:Boolean(live),
    finalized:Boolean(live)||storedFinal
  };
}

export function DraftAdjustmentPanel({preDraft,finalGrade,draftResult,draftTeam,teamScore,draftCapital,teamAdj,capitalAdj,production=true,updatedAt}:{preDraft:number|null,finalGrade:number|null,draftResult:string,draftTeam?:string,teamScore:number,draftCapital:number,teamAdj:number|null,capitalAdj:number|null,production?:boolean,updatedAt?:string|null}){
  const fmt=(v:number|null)=>v==null?"—":v.toFixed(2),finalized=Boolean(draftResult&&!/^(pending|tbd|not drafted yet)$/i.test(draftResult.trim()));
  return <div className="qb-tab-content">
    <div className="qb-section-head"><div><span className="ey">Projection → Actual</span><h2>Draft Adjustment</h2><p>See exactly how landing spot and draft capital move the pre-draft grade after the NFL Draft.</p></div>{updatedAt&&<DataFreshness label="Draft feed" value={updatedAt}/>}</div>
    <div className="qb-draft-grid">
      <div className="qb-draft-card current"><span>Pre-Draft Grade</span><strong>{fmt(preDraft)}</strong><small>{production?"Scouting + production + analytics":"Scouting + analytics"}</small></div>
      <div className="qb-draft-arrow">→</div>
      <div className="qb-draft-card"><span>NFL Draft Result</span><strong className="qb-draft-result-with-logo" style={{display:"flex",alignItems:"center",gap:8}}>{draftResult}{draftTeam&&<img src={nflTeamLogo(draftTeam)} alt="" style={{width:28,height:28,objectFit:"contain",flex:"0 0 auto"}}/>}</strong><small>Auto-filled from the selected draft class</small></div>
      <div className="qb-draft-arrow">→</div>
      <div className="qb-draft-card final"><span>Final Draft Grade</span><strong>{fmt(finalGrade)}</strong><small>{!finalized?"Matches Pre-Draft until the NFL Draft":preDraft!=null&&finalGrade!=null?((finalGrade-preDraft)>=0?"+":"")+(finalGrade-preDraft).toFixed(2)+" total adjustment":"Team fit + draft capital"}</small></div>
    </div>
    <div className="qb-draft-detail">
      <div className="qb-draft-card"><span>Team Fit</span><strong>{finalized?teamScore.toFixed(2)+" / 10":"—"}</strong><small>{!finalized?"Populates after the NFL Draft":teamAdj==null?"Waiting for pre-draft grade":((teamAdj>=0?"+":"")+teamAdj.toFixed(2)+" grade points")}</small></div>
      <div className="qb-draft-card"><span>Draft Capital</span><strong>{finalized?draftCapital.toFixed(2)+" / 10":"—"}</strong><small>{!finalized?"Populates after the NFL Draft":capitalAdj==null?"Waiting for pre-draft grade":((capitalAdj>=0?"+":"")+capitalAdj.toFixed(2)+" grade points")}</small></div>
      <div className="qb-draft-card final"><span>Adjustment Math</span><strong>{!finalized?"0.00":preDraft==null||finalGrade==null?"—":(finalGrade-preDraft).toFixed(2)}</strong><small>{!finalized?"No post-draft adjustment yet":teamAdj==null||capitalAdj==null?"Post-draft inputs populate this breakdown":((teamAdj>=0?"+":"")+teamAdj.toFixed(2)+" team fit · "+(capitalAdj>=0?"+":"")+capitalAdj.toFixed(2)+" draft capital")}</small></div>
    </div>
  </div>
}

function splitMulti(value:any){return String(value??"").split(/\s*[|,]\s*/).map(x=>x.trim()).filter(Boolean)}
export function MultiSelectField({label,value,options,onCommit}:{label:string,value:any,options:readonly string[],onCommit:(v:string)=>void|Promise<any>}){
  const [open,setOpen]=useState(false);
  const selected=useMemo(()=>splitMulti(value),[value]);
  const toggle=(option:string)=>{const next=selected.includes(option)?selected.filter(x=>x!==option):[...selected,option];onCommit(next.join(" | "))};
  return <label className="qb-field qb-multi-field"><span>{label}<em>Scout</em></span><div className="qb-multi-select">
    <button type="button" className="qb-multi-trigger" onClick={e=>{e.preventDefault();setOpen(x=>!x)}}>{selected.length?selected.join(", "):"Select…"}<b>▾</b></button>
    {open&&<div className="qb-multi-menu">{options.map(option=><button type="button" key={option} className={selected.includes(option)?"selected":""} onClick={e=>{e.preventDefault();toggle(option)}}><span>{selected.includes(option)?"✓":""}</span>{option}</button>)}</div>}
  </div></label>
}

function mockSlug(name:string){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
export function MockDraftablePanel({playerName,position,data}:{playerName:string,position:"QB"|"RB"|"WR"|"TE",data:any}){
  const measurements=[
    ["Wingspan",data?.Wingspan],
    ["Arm Length",data?.["Arm Length"]],
    ["Hand Size",data?.["Hand Size"]]
  ].filter(([,v])=>v!==null&&v!==undefined&&v!=="");
  const url=String(data?.["MockDraftable URL"]||data?.MockDraftable||"").trim();
  const available=Boolean(url||measurements.length);
  if(!available)return <div className="mockdraftable-unavailable"><span className="ey">MockDraftable</span><strong>MockDraftable data not available yet</strong><p>The spider chart and supplemental measurements will appear automatically once the player has MockDraftable data.</p><DataFreshness label="Combine data" value={data?.["Combine Refreshed At"]}/></div>;
  return <><div className="qb-section-head compact"><div><span className="ey">MockDraftable</span><h2>Spider + Additional Measurements</h2><p>Supplemental measurements and the position-relative spider chart.</p></div><DataFreshness label="Combine data" value={data?.["Combine Refreshed At"]}/></div>
    {measurements.length>0&&<div className="qb-analytics-grid mockdraftable-metrics mockdraftable-unique-metrics">{measurements.map(([label,value])=><div className="qb-metric" key={String(label)}><div className="qb-metric-top"><div><span>{label}</span><small>MockDraftable measurement</small></div><b>{String(value)}</b></div></div>)}</div>}
    <div className="mockdraftable-frame-card mockdraftable-frame-full"><div className="mockdraftable-frame-head"><div><span className="ey">MockDraftable</span><strong>{playerName} · {position}</strong></div><a href={url||("https://www.mockdraftable.com/player/"+mockSlug(playerName))} target="_blank" rel="noreferrer">Open profile ↗</a></div><iframe title={playerName+" MockDraftable spider chart"} src={"https://www.mockdraftable.com/embed/"+mockSlug(playerName)+"?position="+position+"&page=GRAPH"} loading="lazy"/></div>
  </>;
}

export function earlyDeclareStatus(classLabel:any,override:any){
  const value=String(override??"").trim();
  const label=String(classLabel??"").trim();
  if(/^yes$/i.test(value))return {yes:true,source:"override" as const,classLabel:label};
  if(/^no$/i.test(value))return {yes:false,source:"override" as const,classLabel:label};
  const token=label.toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(/(JR|SO|FR)$/.test(token))return {yes:true,source:"auto" as const,classLabel:label};
  if(/SR$/.test(token))return {yes:false,source:"auto" as const,classLabel:label};
  return {yes:false,source:"unknown" as const,classLabel:label};
}
export function EarlyDeclareField({classLabel,value,onCommit}:{classLabel:any,value:any,onCommit:(v:string)=>void|Promise<any>}){
  const status=earlyDeclareStatus(classLabel,value);
  return <label className="qb-field"><span>Early Declare<em>Scout</em></span><div className="rb-early-control"><select value={String(value||"Auto")} onChange={e=>onCommit(e.target.value==="Auto"?"":e.target.value)}><option>Auto</option><option>Yes</option><option>No</option></select><small>{status.source==="auto"?"Auto · "+(status.classLabel||"class")+" → "+(status.yes?"Yes":"No"):status.source==="override"?"Override · "+(status.yes?"Yes":"No"):"Auto · Class unavailable"}</small></div></label>
}
export function DataFreshness({label,value}:{label:string,value:any}){
  const raw=String(value??"").trim();if(!raw)return null;
  const d=new Date(raw),shown=Number.isNaN(d.getTime())?raw:d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  return <span className="scouting-freshness">{label} · {shown}</span>;
}
export function PercentileMetricCard({label,detail,value,percentile,inverse=false}:{label:string,detail?:string,value:any,percentile:number|null,inverse?:boolean}){
  const p=percentile==null?null:Math.max(0,Math.min(1,percentile));
  return <div className="qb-metric"><div className="qb-metric-top"><div><span>{label}</span><small>{detail||(inverse?"Lower raw is better":"Higher raw is better")}</small></div><b>{value??"—"}</b></div><div className="qb-percentile heat"><i style={{left:((p??0)*100)+"%",background:`hsl(${Math.round((p??0)*120)} 72% 48%)`}}/></div><div className="qb-metric-foot"><span>Quality percentile</span><strong>{p==null?"—":Math.round(p*100)}</strong></div></div>
}

function explainFmt(v:any){return v==null||!Number.isFinite(Number(v))?"—":Number(v).toFixed(2)}
function ScoutingGradeExplainModal({data,onClose}:{data:any;onClose:()=>void}){const steps=Array.isArray(data?.steps)?data.steps:[],film=Array.isArray(data?.film?.inputs)?data.film.inputs:[];return <div className="profile-override-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="profile-override-modal grade-explain-modal"><div className="profile-override-head"><div><small>GRADE DEPENDENCY TRACE</small><h2>{data?.player?.name||"Explain Grade"}</h2><p>{data?.frozen?data.summary:"Recalculated from the same centralized grade engine used by the board."}</p></div><button type="button" onClick={onClose}>×</button></div>{data?.provisionalNote&&<div className="notice grade-explain-provisional"><b>Provisional scouting grade</b><div>{data.provisionalNote}</div></div>}{!data?.frozen&&<><div className="grade-explain-chain">{steps.map((s:any)=><div className={"grade-explain-step "+(s.status==="missing"?"missing":s.status==="provisional"?"provisional":"")} key={s.key}><div><span>{s.label}</span><strong>{explainFmt(s.value)}</strong></div><p>{s.formula}</p><small>Depends on: {(s.dependsOn||[]).join(" · ")}</small></div>)}</div><div className="grade-explain-summary"><div><span>Authoritative</span><strong>{explainFmt(data.authoritativeGrade)}</strong></div><div><span>Grade source</span><strong>{data.gradeSource||"—"}</strong></div><div><span>Player UID</span><strong>{data?.player?.uid||"—"}</strong></div></div><details className="grade-explain-details"><summary>Film contribution detail</summary><div className="grade-explain-film">{film.map((x:any)=><div key={x.label}><span>{x.label}</span><b>{explainFmt(x.value)}</b><small>{x.weight!=null?"Weight "+(Number(x.weight)*100).toFixed(1)+"%":"No weight"} · Contribution {explainFmt(x.weightedContribution)}</small></div>)}</div>{data?.film?.missing?.length?<p className="profile-transfer-error">Missing film inputs: {data.film.missing.join(", ")}</p>:null}</details><details className="grade-explain-details"><summary>Adjustments / draft inputs</summary><pre>{JSON.stringify(data.adjustments||{},null,2)}</pre></details><div className="profile-override-note">Engine: {data.engine} · recalculated {data.recalculatedAt?new Date(data.recalculatedAt).toLocaleString():"now"}</div></>}<div className="profile-transfer-actions"><button type="button" onClick={onClose}>Close</button></div></div></div>}
export function ExplainGradeButton({playerId}:{playerId:string|number}){const [data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");async function open(){setLoading(true);setError("");try{const r=await fetch("/api/grades/explain?playerId="+encodeURIComponent(String(playerId)),{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j?.error||"Could not explain grade");setData(j)}catch(e:any){setError(e?.message||"Could not explain grade")}finally{setLoading(false)}}return <><button type="button" className="ghost scouting-explain-grade-button" onClick={()=>void open()} disabled={loading}>{loading?"Recalculating…":"Explain Grade"}</button>{error&&<span className="scouting-explain-error">{error}</span>}{data&&<ScoutingGradeExplainModal data={data} onClose={()=>setData(null)}/>}</>}

function sharedNum(v:any){if(v==null||v==="")return null;const n=Number(String(v).replace(/[%,$]/g,"").replace(/,/g,""));return Number.isFinite(n)?n:null}
function rasFromData(data:any){
  const score=sharedNum(data?.RAS)??sharedNum(data?.["Raw Athletic Score"])??sharedNum(data?.["Relative Athletic Score"]);
  const url=String(data?.["RAS URL"]||"");
  const specs=[
    ["Height",data?.Height,data?.["Height RAS"]??data?.["Height Score"]],["Weight",data?.Weight,data?.["Weight RAS"]??data?.["Weight Score"]],
    ["40 Yard Dash",data?.["40 Yard Dash"],data?.["40 RAS"]??data?.["40 Yard Dash RAS"]??data?.["40 Score"]],
    ["20 Yard Split",data?.["20 Yard Split"],data?.["20 Yard Split RAS"]??data?.["20 Split Score"]],["10 Yard Split",data?.["10 Yard Split"],data?.["10 Yard Split RAS"]??data?.["10 Split Score"]],
    ["Bench Press",data?.["Bench Reps"]??data?.["Bench Press"],data?.["Bench RAS"]??data?.["Bench Score"]],["Vertical",data?.Vertical??data?.["Vertical Jump"],data?.["Vertical RAS"]??data?.["Vertical Score"]],["Broad Jump",data?.["Broad Jump"],data?.["Broad Jump RAS"]??data?.["Broad Score"]]
  ] as const;
  const metrics=specs.map(([label,value,s])=>({label,value:value==null||value===""?"—":String(value),score:sharedNum(s)})).filter(x=>x.score!=null);
  return {score,url,metrics};
}
export function ScoutingPlayerHero({player,position,rank,style,age,classLabel,gamesWatched,draftTeam,draftResult,draftAutomated,saveState,demoMode=false,archiveMode=false,onOpen,extraMeta}:{player:any,position:"QB"|"RB"|"WR"|"TE",rank:number,style?:React.CSSProperties,age?:any,classLabel?:any,gamesWatched:number,draftTeam?:string,draftResult?:string,draftAutomated?:boolean,saveState:"saved"|"saving"|"error",demoMode?:boolean,archiveMode?:boolean,onOpen?:()=>void,extraMeta?:React.ReactNode}){
  return <header className="qb-player-hero" style={style}>
    <div className="qb-player-photo"><PlayerImage player={player} alt={String(player.name||"")}/></div>
    <div className="qb-player-title"><div className="qb-kicker">{position} {rank} · {player.college||"College TBD"}{player.jersey_number?" · #"+player.jersey_number:""}</div><h1>{onOpen?<PlayerName id={player.id}>{player.name}</PlayerName>:player.name}</h1><div className="qb-hero-meta"><span>{age?"Age "+age:"Age —"}</span><span>{classLabel||"Class —"}</span>{extraMeta}<span>{gamesWatched} game{gamesWatched===1?"":"s"} watched</span><span className="qb-draft-result-badge qb-draft-result-badge-v2" style={nflTeamBadgeStyle(draftTeam)} title={draftAutomated?"Auto-filled from the NFL Draft feed":"NFL draft team"}><b>{draftResult&&draftResult!=="Pending"?String(draftResult).trim():(draftTeam||"TBD")}</b><img src={nflTeamLogo(draftTeam)} alt="" aria-hidden="true"/></span></div></div>
    <div className="qb-hero-actions"><div className={"qb-save-state "+saveState}>{archiveMode?"Historical snapshot":demoMode?"Preview data":saveState==="saving"?"Saving…":saveState==="error"?"Save failed":"✓ Saved"}</div>{!archiveMode&&!demoMode&&<ExplainGradeButton playerId={player.id}/>}</div>
  </header>
}
export function CombineTestingSection({playerName,position,data,grade,children}:{playerName:string,position:"QB"|"RB"|"WR"|"TE",data:any,grade:number|null,children?:React.ReactNode}){
  const ras=rasFromData(data);
  return <div className="qb-tab-content">
    <div className="qb-section-head"><div><span className="ey">Combine / Pro Day</span><h2>Testing Profile</h2><p>RAS first when available, followed by position testing and MockDraftable data.</p></div><div className="qb-grade-pill"><span>Grade</span><b>{grade==null?"—":grade.toFixed(2)}</b></div></div>
    {ras.score!=null&&<><div className="qb-section-head compact"><div><span className="ey">Relative Athletic Score</span><h2>RAS Breakdown</h2><p>Overall RAS plus position-relative 0–10 component scores available in Player Data.</p></div>{ras.url&&<a className="ghost" href={ras.url} target="_blank" rel="noreferrer">Open RAS profile ↗</a>}</div><div className="qb-analytics-grid"><div className="qb-metric"><div className="qb-metric-top"><div><span>RAS Score</span><small>Overall Relative Athletic Score</small></div><b>{ras.score.toFixed(2)}</b></div><div className="qb-percentile heat"><i style={{left:(ras.score*10)+"%",background:`hsl(${Math.round((ras.score/10)*120)} 72% 48%)`}}/></div><div className="qb-metric-foot"><span>Overall {position} score</span><strong>{ras.score.toFixed(2)} / 10</strong></div></div>{ras.metrics.map(m=><div className="qb-metric" key={"ras-"+m.label}><div className="qb-metric-top"><div><span>{m.label}</span><small>RAS component score</small></div><b>{m.value}</b></div><div className="qb-percentile heat"><i style={{left:((m.score??0)*10)+"%",background:`hsl(${Math.round(((m.score??0)/10)*120)} 72% 48%)`}}/></div><div className="qb-metric-foot"><span>{position} score</span><strong>{m.score?.toFixed(2)} / 10</strong></div></div>)}</div></>}
    {children}
    <MockDraftablePanel playerName={playerName} position={position} data={data}/>
  </div>
}

function ReadOnly({label,value}:{label:string,value:any}){return <div className="qb-readonly"><span>{label}<em>Data</em></span><strong>{value==null||value===""?"—":String(value)}</strong></div>}
