import {ensureTursoSchema,rows as dbRows} from "@/lib/turso";
import {historicalCollegeRows} from "@/lib/historical-college-stats";

export const dynamic="force-dynamic";

const norm=(v:any)=>String(v??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
function headerRows(year:number){
  return [
    ["Rank","Team","# of Players to Scout","Players to Scout","Games","Passing Offense",null,null,null,null,null,null,null,null,"Rushing Offense",null,null,null,null,null,"Total Offense",null,null,null,null,"Team YAC","Team Air Yards","Offensive Distribution"],
    ["",null,null,null,null,"Completions","Passing Attempts","Pass Yards","Yards/Attempt","Yards Completion","Touchdowns","Interceptions","Attempts/Game","Yards/Game","Rushes","Rush Yards","Yards/Rush","Touchdowns","Rushes/Game","Yards/Game","Total Yards","Total Plays","Yards/Game","Plays/Game","Yards/Play",null,null,"Passing % of Total","Rushing % of Total"]
  ];
}
const div=(a:number|null,b:number|null)=>a!=null&&b!=null&&b!==0?a/b:null;
const pct=(v:number|null)=>v==null?null:v.toFixed(2)+"%";
export async function GET(req:Request){
  try{
    const u=new URL(req.url),draftClass=Number(u.searchParams.get("draftClass")),level=(String(u.searchParams.get("level")||"FBS").toUpperCase()==="FCS"?"FCS":"FBS") as "FBS"|"FCS";
    if(!Number.isInteger(draftClass)||draftClass<2020||draftClass>=2027)return Response.json({error:"Historical draft class required"},{status:400});
    const db=await ensureTursoSchema(),players=dbRows(await db.execute({sql:"select id,name,position,college from players where draft_class=? and college is not null order by position,coalesce(watch_order,9999),name",args:[draftClass]}));
    const grouped=new Map<string,any[]>();
    for(const p of players){const k=norm(p.college);if(!k)continue;const list=grouped.get(k)||[];list.push(p);grouped.set(k,list)}
    const fbsKeys=new Set(historicalCollegeRows(draftClass,"FBS").map(x=>norm(x.team)));
    let source=historicalCollegeRows(draftClass,level);
    if(level==="FCS"&&!source.length){
      source=[...grouped.entries()].filter(([k])=>!fbsKeys.has(k)).map(([,ps])=>({team:String(ps[0].college),games:null,completions:null,passAttempts:null,passYards:null,passYardsPerAttempt:null,passYardsPerCompletion:null,passTDs:null,passInterceptions:null,rushes:null,rushYards:null,yardsPerRush:null,rushTDs:null,totalYards:null,totalPlays:null,yardsPerGame:null,playsPerGame:null,yardsPerPlay:null,passingPct:null,rushingPct:null,yac:null,airYards:null}));
    }
    const matrix:any[][]=headerRows(draftClass);
    source.forEach((x:any,i:number)=>{
      const prospects=grouped.get(norm(x.team))||[],names=prospects.map((p:any)=>p.name),games=x.games;
      matrix.push([
        i+1,x.team,names.length,names.length?names.join(", "):"None",games,
        x.completions,x.passAttempts,x.passYards,x.passYardsPerAttempt,x.passYardsPerCompletion,x.passTDs,x.passInterceptions,
        div(x.passAttempts,games),div(x.passYards,games),x.rushes,x.rushYards,x.yardsPerRush,x.rushTDs,div(x.rushes,games),div(x.rushYards,games),
        x.totalYards,x.totalPlays,x.yardsPerGame,x.playsPerGame,x.yardsPerPlay,x.yac,x.airYards,pct(x.passingPct),pct(x.rushingPct)
      ]);
    });
    return Response.json({draftClass,season:draftClass-1,level,rows:matrix,programs:source.length,players:players.length});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load historical college stats"},{status:500})}
}
