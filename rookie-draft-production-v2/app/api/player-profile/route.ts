import {ensureTursoSchema,rows} from "@/lib/turso";
import {findCollegeTeam,teamScheduleWithPlayerStats,resolvePlayerMedia} from "@/lib/college-team";
import {draftAdjustedFinalGrade,preDraftGrade,workbookScoutingGrade} from "@/lib/scouting-formulas";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";
import {findHistoricalScoutingSnapshot,historicalEvaluations,historicalGradeData} from "@/lib/historical-scouting";
type Pos="QB"|"RB"|"WR"|"TE";const FILM:Record<Pos,string[]>={QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]};
function gradeData(p:any,es:any[],glossary:any[][]){const v:Record<string,any>={};for(const e of es)v[e.category]=e.value??e.commentary;const scouting=workbookScoutingGrade(p.position,FILM[p.position as Pos].map(k=>Number(v[k])),v,glossary),early=v["Early Declare"]??v["Early Declare?"]??false,pre=scouting==null?null:preDraftGrade(p.position,scouting,null,null,early,glossary),teamRaw=v["Team Score (10)"],capRaw=v["Draft Capital Score (10)"],team=teamRaw==null||teamRaw===""?NaN:Number(teamRaw),cap=capRaw==null||capRaw===""?NaN:Number(capRaw),draftResult=String(v["Draft Result"]??"").trim(),hasFinal=Boolean(draftResult&&!/^pending$/i.test(draftResult)&&Number.isFinite(team)&&Number.isFinite(cap)),final=pre==null?null:(hasFinal?draftAdjustedFinalGrade(p.position,pre,team,cap,glossary):pre);return {values:v,scouting,production:Number.isFinite(Number(v["Production Grade"]))?Number(v["Production Grade"]):null,analytical:Number.isFinite(Number(v["Analytical Grade"]))?Number(v["Analytical Grade"]):null,final,pre}}
async function appBoardRanks(q:any,draftClass:number){
  try{
    const ps=rows(await q.execute({sql:"select id,name,position,watch_order from players where draft_class=? and position in ('QB','RB','WR','TE')",args:[draftClass]}));
    if(draftClass<2027){
      const out:Record<string,string>={};
      for(const pos of ["QB","RB","WR","TE"]){
        const list=ps.filter((p:any)=>p.position===pos).map((p:any)=>{
          const snapshot=findHistoricalScoutingSnapshot(draftClass,String(p.position),String(p.name)),g=historicalGradeData(snapshot);
          return {...p,rankGrade:g.final??g.pre??g.scouting??null};
        }).filter((p:any)=>draftClass<=2021||p.rankGrade!=null);
        list.sort((a:any,b:any)=>{
          if(a.rankGrade==null&&b.rankGrade==null)return (Number(a.watch_order)||9999)-(Number(b.watch_order)||9999);
          if(a.rankGrade==null)return 1;if(b.rankGrade==null)return-1;
          return b.rankGrade-a.rankGrade||(Number(a.watch_order)||9999)-(Number(b.watch_order)||9999);
        });
        list.forEach((p:any,i:number)=>out[String(p.id)]=pos+(i+1));
      }
      return out;
    }
    const key="final-draft-board-state",stateRow:any=rows(await q.execute({sql:"select value from settings where key=?",args:[key]}))[0];let state:any={order:[]};if(stateRow?.value)try{state=JSON.parse(String(stateRow.value))}catch{}
    const order=Array.isArray(state?.order)?state.order.map(String):[];
    ps.sort((a:any,b:any)=>{const ai=order.indexOf(String(a.id)),bi=order.indexOf(String(b.id));if(ai<0&&bi<0)return String(a.position).localeCompare(String(b.position))||String(a.name).localeCompare(String(b.name));if(ai<0)return 1;if(bi<0)return-1;return ai-bi});
    const counts:Record<string,number>={},out:Record<string,string>={};for(const p of ps){counts[p.position]=(counts[p.position]||0)+1;out[String(p.id)]=String(p.position)+counts[p.position]}return out
  }catch{return {}}
}
async function espnStats(id:string){if(!id)return {categories:[],sourceUrl:""};try{const r=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${id}/stats`,{next:{revalidate:21600},headers:{"user-agent":"Mozilla/5.0 (compatible; RookieDraft/1.0)"}});if(!r.ok)return {categories:[],sourceUrl:`https://www.espn.com/college-football/player/stats/_/id/${id}`};const j=await r.json(),teams=j?.teams||{},teamValues=Object.values(teams) as any[],teamFor=(x:any)=>teams[x?.teamSlug]||teamValues.find((t:any)=>String(t?.id)===String(x?.teamId))||null,logo=(t:any)=>t?.logos?.find?.((x:any)=>x?.rel?.includes?.("default"))?.href||t?.logos?.[0]?.href||"";const categories=(j?.categories||[]).filter((c:any)=>Array.isArray(c?.statistics)&&c.statistics.length).map((c:any)=>({name:c.name,displayName:c.displayName||c.name,labels:Array.isArray(c.labels)?c.labels:[],rows:c.statistics.map((x:any)=>{const t=teamFor(x);return {season:x?.season?.displayName||String(x?.season?.year||""),year:x?.season?.year||null,team:t?.shortDisplayName||t?.location||t?.displayName||x?.teamSlug||"",teamAbbr:t?.abbreviation||"",teamLogo:logo(t),stats:Array.isArray(x?.stats)?x.stats:[]}}),totals:Array.isArray(c?.totals)?c.totals:Array.isArray(c?.totals?.stats)?c.totals.stats:[]}));return {categories,sourceUrl:`https://www.espn.com/college-football/player/stats/_/id/${id}`}}catch{return {categories:[],sourceUrl:`https://www.espn.com/college-football/player/stats/_/id/${id}`}}}
export async function GET(req:Request){
  try{
    const id=new URL(req.url).searchParams.get("id");
    if(!id)return Response.json({error:"id required"},{status:400});
    const q=await ensureTursoSchema(),glossary=await loadScoutingGlossary(q);let p:any=rows(await q.execute({sql:"select * from players where id=?",args:[id]}))[0];
    if(!p)return Response.json({error:"Player not found"},{status:404});
    const historical=Number(p.draft_class)<2027;
    if(historical&&(!p.espn_athlete_id||!p.headshot_url)){
      try{
        const m=await resolvePlayerMedia(String(p.name),String(p.college||""));
        if(m.espnId||m.url||m.jersey){
          const now=new Date().toISOString();
          p={...p,espn_athlete_id:m.espnId||p.espn_athlete_id||null,espn_source:m.espnId?m.source:p.espn_source,headshot_url:m.url||p.headshot_url||null,headshot_source:m.url?m.source:p.headshot_source,jersey_number:m.jersey||p.jersey_number||null};
          await q.execute({sql:"update players set espn_athlete_id=?,espn_source=?,headshot_url=?,headshot_source=?,jersey_number=?,updated_at=? where id=?",args:[p.espn_athlete_id,p.espn_source,p.headshot_url,p.headshot_source,p.jersey_number,now,p.id]});
        }
      }catch{}
    }
    const snapshot=historical?findHistoricalScoutingSnapshot(Number(p.draft_class),String(p.position),String(p.name)):null;
    const es=historical?historicalEvaluations(snapshot):rows(await q.execute({sql:"select category,value,commentary from evaluations where player_id=? order by category",args:[id]}));
    const g=historical?historicalGradeData(snapshot):gradeData(p,es,glossary),rankMap=await appBoardRanks(q,Number(p.draft_class));
    const teamPlayersRaw=p.college?rows(await q.execute({sql:"select id,name,position,college,scouting_status,headshot_url,jersey_number from players where draft_class=? and lower(coalesce(college,''))=lower(?) and id<>? order by position,watch_order,name",args:[p.draft_class,p.college,p.id]})):[];
    const teamPlayers=teamPlayersRaw.map((x:any)=>({...x,positionRank:rankMap[String(x.id)]||x.position})),sessions=rows(await q.execute({sql:"select raw_notes,overall_writeup from scouting_sessions where player_id=? order by created_at desc",args:[id]})),transferHistory=rows(await q.execute({sql:"select id,from_college,to_college,effective_season,recorded_at from player_school_history where player_id=? order by recorded_at desc,id desc",args:[id]}));
    const notes=[historical?snapshot?.commentary:g.values["__COMMENTARY__"],...sessions.flatMap((x:any)=>[x.raw_notes,x.overall_writeup])].filter(Boolean).join("\n"),summary=notes?notes.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,4).join(" "):"No scouting notes were stored for this player.";
    const scheduleSeason=Math.max(2000,Number(p.draft_class)-1),team=p.college?await findCollegeTeam(p.college).catch(()=>null):null,schedule=team?await teamScheduleWithPlayerStats(team.id,String(p.espn_athlete_id||""),String(p.position),scheduleSeason):[],player={...p,positionRank:rankMap[String(p.id)]||p.position};
    return Response.json({player,grades:g,evaluations:es,notesSummary:summary,teamPlayers,schedule,scheduleSeason,teamLogo:team?.logo||"",transferHistory,historicalSnapshot:snapshot,stats:await espnStats(p.espn_athlete_id||"")});
  }catch(e:any){return Response.json({error:"Could not load player profile",detail:e?.message},{status:500})}
}
