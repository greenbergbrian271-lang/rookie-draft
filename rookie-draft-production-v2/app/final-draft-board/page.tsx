"use client";

import {useEffect,useMemo,useState} from "react";
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
};
type HandcuffItem={slot:string;name:string;team?:string};
type RosterView={key:string;label:string;bonus?:HandcuffItem[]};
type League={key:string;name:string;tePremium?:boolean;enabled?:boolean};
type BoardView={key:string;label:string;tePremium:boolean;rosterKey?:string};
type ScoredRow=GradeRow&{
  sourceGrade:number|null;
  multiplier:number;
  handcuffAdjustment:number;
  boardGrade:number|null;
  overallRank:number|null;
  positionRank:number|null;
};

const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const POS_MULTIPLIER_ROW:Record<Pos,number>={QB:4,RB:5,WR:6,TE:7};
const HANDCUFF_ROW:Record<Pos,number>={QB:15,RB:16,WR:17,TE:18};
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
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const fmt=(v:number|null,digits=2)=>v==null?"—":v.toFixed(digits);

function matchBonus(item:HandcuffItem,playerName:string){
  const player=norm(playerName),cell=norm(item?.name);
  return Boolean(player&&cell&&cell.includes(player));
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

export default function Page(){
  const [grades,setGrades]=useState<GradeRow[]>([]);
  const [glossary,setGlossary]=useState<any[][]>([]);
  const [rosters,setRosters]=useState<RosterView[]>([]);
  const [leagues,setLeagues]=useState<League[]>(FALLBACK_LEAGUES);
  const [viewKey,setViewKey]=useState("base");
  const [position,setPosition]=useState<"ALL"|Pos>("ALL");
  const [search,setSearch]=useState("");
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
        const [gradeData,glossaryData,rosterData,integrationData]=await Promise.all([
          gradeRes.json(),glossaryRes.json(),rosterRes.json(),integrationRes.json()
        ]);
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
  const activeView=views.find(x=>x.key===viewKey)||views[0];
  const activeRoster=activeView?.rosterKey?rosters.find(x=>x.key===activeView.rosterKey):undefined;
  const g=(glossary.length?glossary:undefined) as GlossaryRows|undefined;

  const scored=useMemo<ScoredRow[]>(()=>{
    const provisional=grades.map(row=>{
      const sourceGrade=row.finalGrade??row.preDraftGrade??null;
      const multiplierRow=row.position==="TE"&&activeView?.tePremium?8:POS_MULTIPLIER_ROW[row.position];
      const multiplier=glossaryNumber(multiplierRow,g);
      const bonusItems=activeRoster?.bonus||[];
      const positionHit=bonusItems.some(item=>norm(item.slot)===norm(row.position)&&matchBonus(item,row.name));
      const benchHit=bonusItems.some(item=>norm(item.slot)==="bench"&&matchBonus(item,row.name));
      const handcuffAdjustment=(positionHit?glossaryNumber(HANDCUFF_ROW[row.position],g):0)+(benchHit?glossaryNumber(20,g):0);
      const boardGrade=sourceGrade==null?null:sourceGrade*multiplier+handcuffAdjustment;
      return {...row,sourceGrade,multiplier,handcuffAdjustment,boardGrade,overallRank:null,positionRank:null};
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
    let rank=0;
    return sorted.map(row=>{
      const overallRank=row.boardGrade==null?null:++rank;
      return {...row,overallRank,positionRank:positionRanks.get(String(row.id))??null};
    });
  },[grades,activeView,activeRoster,g]);

  const visible=useMemo(()=>{
    const q=norm(search);
    return scored.filter(row=>(position==="ALL"||row.position===position)&&(!q||norm(row.name+" "+(row.college||"")).includes(q)));
  },[scored,position,search]);

  function exportBoard(){
    const header=["Overall Rank","Position Rank","Position","Player","College","Grade Source","Source Grade","Multiplier","Handcuff Adjustment","Board Grade"];
    const csv=[header,...scored.map(row=>[
      row.overallRank??"",row.positionRank?row.position+" "+row.positionRank:"",row.position,row.name,row.college||"",row.gradeSource,
      row.sourceGrade==null?"":row.sourceGrade.toFixed(2),row.multiplier.toFixed(4),row.handcuffAdjustment.toFixed(2),row.boardGrade==null?"":row.boardGrade.toFixed(2)
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
        <p className="muted">Grade-driven board built only from prospects currently on the web Scouting tabs. Pre-Draft Grade remains authoritative until a true Final Draft Grade exists.</p>
      </div>
      <span className="status cloud">● Scouting source of truth</span>
    </div>

    <div className="board-rule-strip">
      <span><b>No manual ordering.</b> Overall and position ranks recalculate from the active board grade.</span>
      <span><b>Formula:</b> current grade × positional multiplier + league handcuff adjustment.</span>
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
      <button type="button" className="ghost board-export" onClick={exportBoard}>Export CSV</button>
    </div>

    {error&&<div className="board-error">{error}</div>}

    <section className="board-card">
      <div className="board-card-head">
        <div>
          <span className="ey">{activeView.label}</span>
          <h2>2027 Big Board</h2>
        </div>
        <span className="board-auto-note">Automatically sorted by board grade</span>
      </div>

      {loading?<div className="board-loading">Building grade-driven board…</div>:<div className="board-table-wrap">
        <table className="final-board-table">
          <thead><tr>
            <th className="rank-col">#</th>
            <th>Pos Rank</th>
            <th>Prospect</th>
            <th>Grade Used</th>
            <th>Multiplier</th>
            <th>Handcuff</th>
            <th className="board-grade-col">Board Grade</th>
          </tr></thead>
          <tbody>
            {visible.map(row=>{
              const tone=gradeTone(row.boardGrade);
              return <tr key={row.id}>
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
                <td>
                  {row.sourceGrade==null?<span className="board-incomplete">Incomplete scouting</span>:<div className="grade-used">
                    <span className={"grade-source "+(row.gradeSource==="Final"?"final":"pre")}>{row.gradeSource==="Final"?"Final Draft":"Pre-Draft"}</span>
                    <strong>{fmt(row.sourceGrade)}</strong>
                  </div>}
                </td>
                <td className="formula-cell">× {row.multiplier.toFixed(4).replace(/0+$/,"").replace(/\.$/,"")}</td>
                <td className={"formula-cell "+(row.handcuffAdjustment?"boost":"")}>{row.handcuffAdjustment?("+"+fmt(row.handcuffAdjustment)):"—"}</td>
                <td>
                  {row.boardGrade==null?<span className="board-incomplete">—</span>:<div className={"board-grade "+tone}>
                    <strong>{fmt(row.boardGrade)}</strong>
                    <div className="board-grade-track"><i style={{width:Math.max(0,Math.min(100,row.boardGrade))+"%"}}/></div>
                  </div>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
        {!visible.length&&<div className="board-empty">No scouting-tab prospects match this filter.</div>}
      </div>}
    </section>

    <style jsx global>{\`
      .final-board-page{max-width:1560px;margin:0 auto}
      .final-board-head{align-items:center;margin-bottom:12px}
      .final-board-head p{max-width:900px;margin:5px 0 0;line-height:1.5}
      .board-rule-strip{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:13px;padding:10px 13px;border:1px solid #20395f;border-radius:10px;background:#0a172a;color:#93a9c7;font-size:11px}
      .board-rule-strip b{color:#dce8f6}
      .board-view-tabs{display:flex;gap:7px;overflow-x:auto;padding:2px 0 11px}
      .board-view-tabs button{flex:0 0 auto;background:#0c1d35;border:1px solid #29476e;color:#9eb2ce;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:900}
      .board-view-tabs button:hover{background:#132a49;color:#fff}
      .board-view-tabs button.active{background:#173e67;border-color:#20e2dd;color:#fff;box-shadow:inset 0 -2px 0 #20e2dd}
      .board-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) auto auto;gap:10px;align-items:center;margin-bottom:12px}
      .board-search-wrap{position:relative}
      .board-search-wrap>span{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#6884a9;font-size:18px;pointer-events:none}
      .board-search-wrap input{height:40px;padding-left:36px;background:#08172a}
      .board-position-filter{display:flex;gap:5px}
      .board-position-filter button{min-width:43px;height:38px;padding:0 10px;background:#10213a;border:1px solid #29476e;color:#9eb2ce}
      .board-position-filter button.active{outline:2px solid #dfeaff;outline-offset:-2px;color:#fff}
      .board-position-filter .board-pos{min-width:43px;border-radius:8px}
      .board-export{height:40px;white-space:nowrap}
      .board-card{overflow:hidden;border:1px solid #20395f;border-radius:14px;background:#081426;box-shadow:0 16px 40px rgba(0,0,0,.16)}
      .board-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;background:linear-gradient(180deg,#10223d,#0b1a30);border-bottom:1px solid #20395f}
      .board-card-head h2{margin:2px 0 0;font-size:20px}
      .board-auto-note{color:#7f98ba;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.065em}
      .board-table-wrap{overflow:auto;max-height:calc(100vh - 305px)}
      .final-board-table{width:100%;min-width:930px;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}
      .final-board-table th{position:sticky;top:0;z-index:8;background:#10223d;color:#8fa7c8;padding:10px 12px;border-bottom:1px solid #31527f;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.075em}
      .final-board-table th.rank-col,.final-board-table td.overall-rank{text-align:center;width:62px}
      .final-board-table th.board-grade-col{min-width:175px}
      .final-board-table td{padding:10px 12px;border-bottom:1px solid #172d4d;background:#09172a;color:#dce7f6;vertical-align:middle}
      .final-board-table tbody tr:nth-child(even) td{background:#0b1b31}
      .final-board-table tbody tr:hover td{background:#102642}
      .final-board-table tbody tr:last-child td{border-bottom:0}
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
      .board-grade{display:grid;grid-template-columns:52px minmax(78px,1fr);gap:9px;align-items:center;min-width:155px}
      .board-grade strong{font-size:16px;text-align:right}
      .board-grade-track{height:6px;background:#162b47;border-radius:999px;overflow:hidden}
      .board-grade-track i{display:block;height:100%;background:#20e2dd;border-radius:999px}
      .board-grade.elite strong{color:#62e889}.board-grade.elite i{background:#62e889}
      .board-grade.plus strong{color:#8ee8b1}.board-grade.plus i{background:#62e889}
      .board-grade.solid strong{color:#dce8f6}.board-grade.solid i{background:#20e2dd}
      .board-grade.fringe strong{color:#ffd166}.board-grade.fringe i{background:#ffd166}
      .board-grade.concern strong{color:#ff8e9d}.board-grade.concern i{background:#ff7184}
      .board-incomplete{color:#667f9f;font-size:11px;font-weight:800}
      .board-loading,.board-empty{padding:34px;text-align:center;color:#8fa7c8}
      .board-error{margin:0 0 12px;padding:10px 12px;border:1px solid #7a3341;border-radius:9px;background:#351a23;color:#ffc0c8;font-weight:800}
      @media(max-width:980px){
        .board-toolbar{grid-template-columns:1fr auto}
        .board-position-filter{grid-column:1/-1;overflow:auto}
        .board-table-wrap{max-height:none}
      }
      @media(max-width:650px){
        .final-board-head{display:block}
        .final-board-head .status{margin-top:10px}
        .board-toolbar{grid-template-columns:1fr}
        .board-position-filter{grid-column:auto}
        .board-export{width:100%}
        .board-card-head{display:block}
        .board-auto-note{display:block;margin-top:7px}
      }
    \`}</style>
  </div>;
}
