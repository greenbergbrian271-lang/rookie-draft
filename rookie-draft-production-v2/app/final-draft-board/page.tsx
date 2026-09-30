"use client";

import {Fragment,useEffect,useMemo,useState} from "react";
import {schoolStyle} from "@/lib/school-colors";
import {glossaryNumber,type GlossaryRows} from "@/lib/scouting-formulas";
import PlayerName from "@/components/PlayerName";

type Pos="QB"|"RB"|"WR"|"TE";
type GradeRow={
  id:string|number;
  name:string;
  position:Pos;
  college?:string;
  draft_class:number;
  scouting_status:string;
  headshot_url?:string;
  scoutingGrade:number|null;
  preDraftGrade:number|null;
  finalGrade:number|null;
  authoritativeGrade:number|null;
  gradeSource:"Pre-Draft"|"Final";
  draftResult?:string|null;
  draftTeam?:string|null;
};
type HandcuffItem={slot:string;name:string;team?:string};
type RosterView={key:string;label:string;startingCoverage?:HandcuffItem[];benchCoverage?:HandcuffItem[];bonus?:HandcuffItem[]};
type League={key:string;name:string;tePremium?:boolean;enabled?:boolean};
type BoardView={key:string;label:string;tePremium:boolean;rosterKey?:string};
type ScoredRow=GradeRow&{
  sourceGrade:number|null;
  multiplier:number;
  handcuffAdjustment:number;
  boardGrade:number|null;
  overallRank:number|null;
  positionRank:number|null;
  tier:number|null;
  tierGapBefore:number|null;
};

const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const POS_MULTIPLIER_ROW:Record<Pos,number>={QB:4,RB:5,WR:6,TE:7};
const HANDCUFF_ROW:Record<Pos,number>={QB:15,RB:16,WR:17,TE:18};
const TIER_GAP=2.5;
const FALLBACK_LEAGUES:League[]=[
  {key:"one-league",name:"One League",tePremium:false,enabled:true},
  {key:"drew-ross",name:"D+R",tePremium:false,enabled:true},
  {key:"last-man-standing",name:"Last Man Standing",tePremium:true,enabled:true},
  {key:"last-minute-dynasty",name:"Last Minute",tePremium:true,enabled:true}
];
const SHORT_LABELS:Record<string,string>={
  "one-league":"One League",
  "drew-ross":"D+R",
  "last-man-standing":"Last Man Standing",
  "last-minute-dynasty":"Last Minute"
};
const NFL_TEAM_ALIASES:Record<string,string[]>={
  "49ers":["49ers","san francisco 49ers"],bears:["bears","chicago bears"],bengals:["bengals","cincinnati bengals"],bills:["bills","buffalo bills"],
  broncos:["broncos","denver broncos"],browns:["browns","cleveland browns"],buccaneers:["buccaneers","bucs","tampa bay buccaneers"],cardinals:["cardinals","arizona cardinals"],
  chargers:["chargers","los angeles chargers"],chiefs:["chiefs","kansas city chiefs"],colts:["colts","indianapolis colts"],commanders:["commanders","washington commanders"],
  cowboys:["cowboys","dallas cowboys"],dolphins:["dolphins","miami dolphins"],eagles:["eagles","philadelphia eagles"],falcons:["falcons","atlanta falcons"],
  giants:["giants","new york giants"],jaguars:["jaguars","jacksonville jaguars"],jets:["jets","new york jets"],lions:["lions","detroit lions"],
  packers:["packers","green bay packers"],panthers:["panthers","carolina panthers"],patriots:["patriots","new england patriots"],raiders:["raiders","las vegas raiders"],
  rams:["rams","los angeles rams"],ravens:["ravens","baltimore ravens"],saints:["saints","new orleans saints"],seahawks:["seahawks","seattle seahawks"],
  steelers:["steelers","pittsburgh steelers"],texans:["texans","houston texans"],titans:["titans","tennessee titans"],vikings:["vikings","minnesota vikings"]
};
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const fmt=(v:number|null,digits=2)=>v==null?"—":v.toFixed(digits);

function teamKey(value:any){
  const n=norm(value);
  if(!n)return "";
  for(const [key,aliases] of Object.entries(NFL_TEAM_ALIASES)){
    if(aliases.some(alias=>{const a=norm(alias);return n===a||n.endsWith(a)||n.includes(a)}))return key;
  }
  return n;
}
function coverageHasTeam(items:HandcuffItem[]|undefined,slot:string|undefined,team:string){
  if(!team)return false;
  return (items||[]).some(item=>{
    if(slot&&norm(item.slot)!==norm(slot))return false;
    const names=String(item.name||"").split(",").map(teamKey).filter(Boolean);
    return names.includes(team);
  });
}
function posClass(position:Pos){return "board-pos board-pos-"+position.toLowerCase()}
function gradeTone(value:number|null){
  if(value==null)return "missing";
  if(value>=85)return "elite";
  if(value>=75)return "plus";
  if(value>=65)return "solid";
  if(value>=55)return "fringe";
  return "concern";
}
function heatColor(ratio:number){
  const r=Math.max(0,Math.min(1,ratio));
  return `hsl(${Math.round(r*120)} 72% 48%)`;
}

export default function Page(){
  const [grades,setGrades]=useState<GradeRow[]>([]);
  const [glossary,setGlossary]=useState<any[][]>([]);
  const [rosters,setRosters]=useState<RosterView[]>([]);
  const [leagues,setLeagues]=useState<League[]>(FALLBACK_LEAGUES);
  const [viewKey,setViewKey]=useState("base");
  const [position,setPosition]=useState<"ALL"|Pos>("ALL");
  const [search,setSearch]=useState("");
  const [showGradeDetails,setShowGradeDetails]=useState(false);
  const [compactTiers,setCompactTiers]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let live=true;
    (async()=>{
      setLoading(true);setError("");
      try{
        const [gradeRes,glossaryRes,rosterRes,integrationRes]=await Promise.all([
          fetch("/api/grades?draftClass=2027",{cache:"no-store"}),
          fetch("/api/scouting-glossary",{cache:"no-store"}),
          fetch("/api/dynasty-rosters",{cache:"no-store"}),
          fetch("/api/integrations",{cache:"no-store"})
        ]);
        const safeJson=async(res:Response)=>{if(!res.ok)return {};try{return await res.json()}catch{return {}}};
        const gradeData=await gradeRes.json();
        const [glossaryData,rosterData,integrationData]=await Promise.all([safeJson(glossaryRes),safeJson(rosterRes),safeJson(integrationRes)]);
        if(!gradeRes.ok)throw new Error(gradeData?.error||"Could not load scouting grades");
        if(!live)return;
        setGrades(Array.isArray(gradeData)?gradeData:[]);
        setGlossary(Array.isArray(glossaryData?.rows)?glossaryData.rows:[]);
        setRosters(Array.isArray(rosterData?.rosters)?rosterData.rosters:[]);
        const liveLeagues=integrationData?.sleeper?.leagues;
        if(Array.isArray(liveLeagues)&&liveLeagues.length)setLeagues(liveLeagues);
      }catch(e:any){
        if(live)setError(e?.message||"Could not load Final Draft Board");
      }finally{if(live)setLoading(false)}
    })();
    return()=>{live=false};
  },[]);

  const views=useMemo<BoardView[]>(()=>{
    const leagueViews=leagues.filter(x=>x.enabled!==false).map(x=>({
      key:"league:"+x.key,
      label:SHORT_LABELS[x.key]||x.name,
      tePremium:Boolean(x.tePremium),
      rosterKey:x.key
    }));
    return [
      {key:"base",label:"Base",tePremium:false},
      {key:"tep",label:"TE Premium",tePremium:true},
      ...leagueViews
    ];
  },[leagues]);
  const activeView:BoardView=views.find(x=>x.key===viewKey)||{key:"base",label:"Base",tePremium:false};
  const activeRoster=activeView?.rosterKey?rosters.find(x=>x.key===activeView.rosterKey):undefined;
  const g=(glossary.length?glossary:undefined) as GlossaryRows|undefined;

  const scored=useMemo<ScoredRow[]>(()=>{
    const provisional=grades.map(row=>{
      const sourceGrade=row.finalGrade??row.preDraftGrade??null;
      const multiplierRow=row.position==="TE"&&activeView?.tePremium?8:POS_MULTIPLIER_ROW[row.position];
      const multiplier=glossaryNumber(multiplierRow,g);
      const rookieTeam=teamKey(row.draftTeam||row.draftResult||"");
      const positionHit=coverageHasTeam(activeRoster?.startingCoverage,row.position,rookieTeam);
      const benchHit=!positionHit&&coverageHasTeam(activeRoster?.benchCoverage,undefined,rookieTeam);
      const handcuffAdjustment=positionHit?glossaryNumber(HANDCUFF_ROW[row.position],g):(benchHit?glossaryNumber(20,g):0);
      const boardGrade=sourceGrade==null?null:sourceGrade*multiplier+handcuffAdjustment;
      return {...row,sourceGrade,multiplier,handcuffAdjustment,boardGrade,overallRank:null,positionRank:null,tier:null,tierGapBefore:null};
    });

    const positionRanks=new Map<string,number>();
    for(const pos of POSITIONS){
      provisional
        .filter(x=>x.position===pos&&x.boardGrade!=null)
        .sort((a,b)=>(b.boardGrade??-Infinity)-(a.boardGrade??-Infinity)||a.name.localeCompare(b.name))
        .forEach((row,index)=>positionRanks.set(String(row.id),index+1));
    }
    const sorted=[...provisional].sort((a,b)=>{
      if(a.boardGrade==null&&b.boardGrade==null)return a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
      if(a.boardGrade==null)return 1;
      if(b.boardGrade==null)return -1;
      return b.boardGrade-a.boardGrade||a.position.localeCompare(b.position)||a.name.localeCompare(b.name);
    });
    let rank=0,tier=1,previousGrade:number|null=null;
    return sorted.map(row=>{
      const overallRank=row.boardGrade==null?null:++rank;
      let rowTier:number|null=null,tierGapBefore:number|null=null;
      if(row.boardGrade!=null){
        if(previousGrade!=null){
          const gap=previousGrade-row.boardGrade;
          if(gap>=TIER_GAP){tier++;tierGapBefore=gap}
        }
        rowTier=tier;
        previousGrade=row.boardGrade;
      }
      return {...row,overallRank,positionRank:positionRanks.get(String(row.id))??null,tier:rowTier,tierGapBefore};
    });
  },[grades,activeView,activeRoster,g]);

  const visible=useMemo(()=>{
    const q=norm(search);
    return scored.filter(row=>(position==="ALL"||row.position===position)&&(!q||norm(row.name+" "+(row.college||"")).includes(q)));
  },[scored,position,search]);

  function exportBoard(){
    const header=["Overall Rank","Tier","Position Rank","Position","Player","College","Grade Source","Source Grade","Handcuff Adjustment","Board Grade"];
    const csv=[header,...scored.map(row=>[
      row.overallRank??"",row.tier??"",row.positionRank?row.position+" "+row.positionRank:"",row.position,row.name,row.college||"",row.gradeSource,
      row.sourceGrade==null?"":row.sourceGrade.toFixed(2),row.handcuffAdjustment.toFixed(2),row.boardGrade==null?"":row.boardGrade.toFixed(2)
    ])].map(cols=>cols.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="rookie-draft-2027-final-board-"+activeView.key.replace(/[^a-z0-9]+/gi,"-")+".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return <div className="final-board-page">
    <div className="page-head final-board-head">
      <div>
        <div className="ey">2027 Rookie Class</div>
        <h1>Final Draft Board</h1>
        <p className="muted">Grade-driven board built only from prospects currently on the web Scouting tabs. Pre-Draft Grade drives the board until a true Final Draft Grade exists.</p>
      </div>
      <span className="status cloud">● Scouting source of truth</span>
    </div>

    <div className="board-rule-strip">
      <span><b>No manual ordering.</b> Overall and position ranks recalculate from the active board grade.</span>
      <span><b>Formula:</b> current grade × positional multiplier + league handcuff adjustment. Multipliers stay behind the scenes.</span>
    </div>

    <div className="board-view-tabs" role="tablist" aria-label="Draft board view">
      {views.map(view=><button
        type="button"
        role="tab"
        aria-selected={view.key===activeView.key}
        className={view.key===activeView.key?"active":""}
        key={view.key}
        onClick={()=>setViewKey(view.key)}
      >{view.label}</button>)}
    </div>

    <div className="board-toolbar">
      <div className="board-search-wrap">
        <span>⌕</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player or college…"/>
      </div>
      <div className="board-position-filter" aria-label="Position filter">
        {(["ALL",...POSITIONS] as const).map(pos=><button
          key={pos}
          type="button"
          className={(position===pos?"active ":"")+(pos==="ALL"?"":posClass(pos))}
          onClick={()=>setPosition(pos)}
        >{pos}</button>)}
      </div>
      <div className="board-toolbar-options">
        <label className={"board-detail-toggle "+(compactTiers?"active":"")} title="Keep the tier dividers but collapse them to a small tier marker and thin line">
          <input type="checkbox" checked={compactTiers} onChange={e=>setCompactTiers(e.target.checked)}/>
          <span>Compact tiers</span>
        </label>
        <label className={"board-detail-toggle "+(showGradeDetails?"active":"")} title="Show the Pre-Draft or Final Draft grade feeding the board calculation">
          <input type="checkbox" checked={showGradeDetails} onChange={e=>setShowGradeDetails(e.target.checked)}/>
          <span>Show grade details</span>
        </label>
      </div>
      <button type="button" className="ghost board-export" onClick={exportBoard}>Export CSV</button>
    </div>

    {error&&<div className="board-error">{error}</div>}

    <section className="board-card">
      <div className="board-card-head">
        <div>
          <span className="ey">{activeView.label}</span>
          <h2>2027 Big Board</h2>
        </div>
        <div className="board-auto-stack">
          <span className="board-auto-note">Automatically sorted by board grade</span>
          <span className="board-tier-note">Auto tiers · new tier at a {TIER_GAP.toFixed(1)}+ point drop</span>
        </div>
      </div>

      {loading?<div className="board-loading">Building grade-driven board…</div>:<div className="board-table-wrap">
        <table className="final-board-table">
          <thead><tr>
            <th className="rank-col">#</th>
            <th>Pos Rank</th>
            <th>Prospect</th>
            {showGradeDetails&&<th>Grade Used</th>}
            <th>Handcuff</th>
            <th className="board-grade-col">Board Grade</th>
          </tr></thead>
          <tbody>
            {visible.map((row,index)=>{
              const tone=gradeTone(row.boardGrade),previous=visible[index-1];
              const startsTier=row.tier!=null&&(index===0||previous?.tier!==row.tier);
              return <Fragment key={row.id}>
                {startsTier&&<tr className={"board-tier-row "+(compactTiers?"compact":"")}><td colSpan={showGradeDetails?6:5}>
                  <div
                    className={"board-tier-break "+(compactTiers?"compact":"")}
                    title={row.tier===1?"Tier 1 · Top grade cluster":"Tier "+row.tier+(row.tierGapBefore!=null?" · "+fmt(row.tierGapBefore,2)+" point drop from the previous prospect":"")}
                  >
                    <strong>{compactTiers?"T"+row.tier:"Tier "+row.tier}</strong>
                    {compactTiers?<i/>:<span>{row.tier===1?"Top grade cluster":row.tierGapBefore!=null?fmt(row.tierGapBefore,2)+" point drop from the previous prospect":"Automatic grade tier"}</span>}
                  </div>
                </td></tr>}
                <tr>
                  <td className="overall-rank">{row.overallRank??"—"}</td>
                  <td><span className={posClass(row.position)}>{row.position}{row.positionRank??"—"}</span></td>
                  <td>
                    <div className="board-player">
                      <div className="board-player-main">
                        <PlayerName id={row.id} className="board-player-name">{row.name}</PlayerName>
                        <span className="board-college" style={schoolStyle(row.college)}>{row.college||"—"}</span>
                      </div>
                      {row.draftResult&&row.gradeSource==="Final"&&<small>{row.draftResult}</small>}
                    </div>
                  </td>
                  {showGradeDetails&&<td>
                    {row.sourceGrade==null?<span className="board-incomplete">Incomplete scouting</span>:<div className="grade-used">
                      <span className={"grade-source "+(row.gradeSource==="Final"?"final":"pre")}>{row.gradeSource==="Final"?"Final Draft":"Pre-Draft"}</span>
                      <strong>{fmt(row.sourceGrade)}</strong>
                    </div>}
                  </td>}
                  <td className={"formula-cell "+(row.handcuffAdjustment?"boost":"")}>{row.handcuffAdjustment?("+"+fmt(row.handcuffAdjustment)):"—"}</td>
                  <td>
                    {row.boardGrade==null?<span className="board-incomplete">—</span>:<div className={"board-grade "+tone}>
                      <strong>{fmt(row.boardGrade)}</strong>
                      <input
                        className="qb-grade-slider heat board-grade-slider"
                        style={{"--heat":heatColor(row.boardGrade/100)} as any}
                        type="range"
                        min="0"
                        max="100"
                        step=".25"
                        value={Math.max(0,Math.min(100,row.boardGrade))}
                        readOnly
                        tabIndex={-1}
                        aria-label={row.name+" board grade "+fmt(row.boardGrade)}
                      />
                    </div>}
                  </td>
                </tr>
              </Fragment>
            })}
          </tbody>
        </table>
        {!visible.length&&<div className="board-empty">No scouting-tab prospects match this filter.</div>}
      </div>}
    </section>

    <style jsx global>{`
      .final-board-page{max-width:1560px;margin:0 auto}
      .final-board-head{align-items:center;margin-bottom:12px}
      .final-board-head p{max-width:900px;margin:5px 0 0;line-height:1.5}
      .board-rule-strip{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:13px;padding:10px 13px;border:1px solid #20395f;border-radius:10px;background:#0a172a;color:#93a9c7;font-size:11px}
      .board-rule-strip b{color:#dce8f6}
      .board-view-tabs{display:flex;gap:7px;overflow-x:auto;padding:2px 0 11px}
      .board-view-tabs button{flex:0 0 auto;background:#0c1d35;border:1px solid #29476e;color:#9eb2ce;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:900}
      .board-view-tabs button:hover{background:#132a49;color:#fff}
      .board-view-tabs button.active{background:#173e67;border-color:#20e2dd;color:#fff;box-shadow:inset 0 -2px 0 #20e2dd}
      .board-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto auto;gap:10px;align-items:center;margin-bottom:12px}
      .board-search-wrap{position:relative}
      .board-search-wrap>span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#6884a9;font-size:18px;pointer-events:none}
      .board-search-wrap input{height:40px;padding-left:36px;background:#08172a}
      .board-position-filter{display:flex;gap:5px}
      .board-position-filter button{min-width:43px;height:38px;padding:0 10px;background:#10213a;border:1px solid #29476e;color:#9eb2ce}
      .board-position-filter button.active{outline:2px solid #dfeaff;outline-offset:-2px;color:#fff}
      .board-position-filter .board-pos{min-width:43px;border-radius:8px}
      .board-toolbar-options{display:flex;gap:6px;align-items:center}
      .board-detail-toggle{display:flex;align-items:center;gap:7px;height:40px;padding:0 11px;border:1px solid #29476e;border-radius:8px;background:#0c1d35;color:#a8bad2;font-size:10px;font-weight:900;white-space:nowrap;cursor:pointer}
      .board-detail-toggle input{width:14px;height:14px;margin:0;padding:0;accent-color:#20e2dd}
      .board-detail-toggle:hover,.board-detail-toggle.active{background:#132a49;color:#fff;border-color:#3f668f}
      .board-export{height:40px;white-space:nowrap}
      .board-card{overflow:hidden;border:1px solid #20395f;border-radius:14px;background:#081426;box-shadow:0 16px 40px rgba(0,0,0,.16)}
      .board-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;background:linear-gradient(180deg,#10223d,#0b1a30);border-bottom:1px solid #20395f}
      .board-card-head h2{margin:2px 0 0;font-size:20px}
      .board-auto-stack{display:grid;justify-items:end;gap:4px}
      .board-auto-note{color:#7f98ba;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.065em}
      .board-tier-note{color:#58a7ff;font-size:9px;font-weight:850}
      .board-table-wrap{overflow:auto;max-height:calc(100vh - 305px)}
      .final-board-table{width:100%;min-width:930px;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}
      .final-board-table th{position:sticky;top:0;z-index:8;background:#10223d;color:#8fa7c8;padding:10px 12px;border-bottom:1px solid #31527f;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.075em}
      .final-board-table th.rank-col,.final-board-table td.overall-rank{text-align:center;width:62px}
      .final-board-table th.board-grade-col{min-width:175px}
      .final-board-table td{padding:10px 12px;border-bottom:1px solid #172d4d;background:#09172a;color:#dce7f6;vertical-align:middle}
      .final-board-table tbody tr:not(.board-tier-row):nth-child(even) td{background:#0b1b31}
      .final-board-table tbody tr:not(.board-tier-row):hover td{background:#102642}
      .final-board-table tbody tr:last-child td{border-bottom:0}
      .board-tier-row td{padding:0!important;border-bottom:1px solid #31527f!important;background:#071426!important}
      .board-tier-break{display:flex;align-items:center;gap:10px;padding:8px 12px;background:linear-gradient(90deg,rgba(88,167,255,.16),rgba(32,226,221,.04) 45%,transparent);border-left:3px solid #58a7ff}
      .board-tier-break strong{color:#eaf3ff;font-size:10px;font-weight:950;letter-spacing:.09em;text-transform:uppercase}
      .board-tier-break span{color:#7794ba;font-size:9px;font-weight:800}
      .board-tier-row.compact td{border-bottom:0!important;background:#081426!important}
      .board-tier-break.compact{gap:7px;min-height:12px;padding:2px 11px;background:transparent;border-left:0}
      .board-tier-break.compact strong{display:inline-grid;place-items:center;min-width:24px;height:14px;padding:0 4px;border:1px solid #416b98;border-radius:999px;background:#102743;color:#9ccaff;font-size:7px;letter-spacing:.04em}
      .board-tier-break.compact i{display:block;flex:1;height:1px;background:linear-gradient(90deg,#4d82b9,rgba(32,226,221,.32),rgba(49,82,127,.2));border-radius:999px}
      .overall-rank{font-size:20px;font-weight:950;color:#eef5ff!important}
      .board-pos{display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:5px 8px;border-radius:6px;color:#06101e;font-size:11px;font-weight:950}
      .board-pos-qb{background:#fc2b6d;color:#fff!important}
      .board-pos-rb{background:#20ceb7}
      .board-pos-wr{background:#58a7ff}
      .board-pos-te{background:#fead58}
      .board-player{display:grid;gap:4px;min-width:250px}
      .board-player-main{display:flex;align-items:center;gap:9px;min-width:0}
      .board-player-name{font-size:14px!important;font-weight:950!important;color:#f5f8fc!important;white-space:nowrap}
      .board-college{display:inline-flex;align-items:center;min-height:23px;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:900;white-space:nowrap}
      .board-player small{color:#738dac;font-size:10px}
      .grade-used{display:flex;align-items:center;gap:8px}
      .grade-used strong{font-size:14px}
      .grade-source{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;border:1px solid}
      .grade-source.pre{color:#8ff0e9;border-color:#1e817d;background:rgba(32,226,221,.08)}
      .grade-source.final{color:#ffe39a;border-color:#876923;background:rgba(255,209,102,.09)}
      .formula-cell{color:#a8bad2;font-weight:900;white-space:nowrap}
      .formula-cell.boost{color:#62e889}
      .board-grade{display:grid;grid-template-columns:52px minmax(110px,1fr);gap:11px;align-items:center;min-width:185px}
      .board-grade strong{font-size:16px;text-align:right}
      .board-grade-slider{width:100%!important;margin:0!important;pointer-events:none}
      .board-grade.elite strong{color:#62e889}
      .board-grade.plus strong{color:#8ee8b1}
      .board-grade.solid strong{color:#dce8f6}
      .board-grade.fringe strong{color:#ffd166}
      .board-grade.concern strong{color:#ff8e9d}
      .board-incomplete{color:#667f9f;font-size:11px;font-weight:800}
      .board-loading,.board-empty{padding:34px;text-align:center;color:#8fa7c8}
      .board-error{margin:0 0 12px;padding:10px 12px;border:1px solid #7a3341;border-radius:9px;background:#351a23;color:#ffc0c8;font-weight:800}
      @media(max-width:980px){
        .board-toolbar{grid-template-columns:1fr auto auto}
        .board-position-filter{grid-column:1/-1;overflow:auto}
        .board-table-wrap{max-height:none}
      }
      @media(max-width:650px){
        .final-board-head{display:block}
        .final-board-head .status{margin-top:10px}
        .board-toolbar{grid-template-columns:1fr}
        .board-position-filter{grid-column:auto}
        .board-toolbar-options{display:grid;width:100%}
        .board-detail-toggle,.board-export{width:100%}
        .board-detail-toggle{justify-content:center}
        .board-card-head{display:block}
        .board-auto-stack{justify-items:start;margin-top:8px}
        .board-auto-note{display:block}
      }
    `}</style>
  </div>;
}
