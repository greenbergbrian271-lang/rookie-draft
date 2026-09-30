import {ensureTursoSchema,rows} from "@/lib/turso";
import {draftAdjustedFinalGrade,preDraftGrade,workbookScoutingGrade} from "@/lib/scouting-formulas";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";

type Pos="QB"|"RB"|"WR"|"TE";
const POSITIONS:Pos[]=["QB","RB","WR","TE"];
const film:Record<Pos,string[]>={
  QB:["Arm Strength","Arm Velocity","Accuracy","Decision Making","Poise + OOS","Mechanics","Mobility","Leadership","Size"],
  RB:["Ball Carrier Vision","Carrying","Elusiveness","Big Play Speed","Patience","Contact Balance","Effort","Receiving Skills","Pass Blocking"],
  WR:["Catching","Route Running","Elusiveness","Game Speed","Competitiveness","Size","Blocking"],
  TE:["Catching","Route Running","Blocking","Athleticism","Competitiveness","Size","Versatility"]
};

const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const numeric=(v:any)=>{
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const n=Number(String(v).replace(/[%,$]/g,"").replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
};
const yes=(v:any)=>["yes","true","1"].includes(String(v??"").trim().toLowerCase());

async function loadPlayerData(req:Request,position:Pos){
  try{
    const url=new URL(req.url);
    url.pathname="/api/player-data";
    url.search="?position="+position;
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok)return [];
    const data=await res.json();
    return Array.isArray(data?.rows)?data.rows:[];
  }catch{return []}
}

function earlyDeclare(position:Pos,vals:Record<string,any>,imported:any){
  if(position==="QB")return false;
  if(position==="RB"){
    const override=String(vals["Early Declare"]??"").trim();
    if(/^yes$/i.test(override))return true;
    if(/^no$/i.test(override))return false;
    const classLabel=String(imported?.Class??imported?.["Draft Class"]??"").trim();
    const token=classLabel.toUpperCase().replace(/[^A-Z0-9]/g,"");
    return /(JR|SO|FR)$/.test(token);
  }
  if(position==="WR"){
    const value=vals["Early Declare?"]??imported?.["Early Declare?"]??false;
    return yes(value);
  }
  return yes(vals["Early Declare"]);
}

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||2027);
    const q=await ensureTursoSchema();
    const glossary=await loadScoutingGlossary(q);

    const [playersRaw,evaluationsRaw,sessionsRaw,importsByPos]=await Promise.all([
      q.execute({
        sql:"select id,name,position,college,draft_class,scouting_status,watch_order,headshot_url from players where draft_class=? and scouting_status='WATCHED' order by position,watch_order,name",
        args:[draftClass]
      }),
      q.execute({
        sql:"select e.player_id,e.category,e.value,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? and p.scouting_status='WATCHED'",
        args:[draftClass]
      }),
      q.execute({
        sql:"select s.player_id,count(*) as game_count from scouting_sessions s join players p on p.id=s.player_id where p.draft_class=? and p.scouting_status='WATCHED' group by s.player_id",
        args:[draftClass]
      }),
      Promise.all(POSITIONS.map(async position=>[position,await loadPlayerData(req,position)] as const))
    ]);

    const players=rows(playersRaw);
    const evaluations=rows(evaluationsRaw);
    const sessions=rows(sessionsRaw);

    const evalMap=new Map<string,Record<string,any>>();
    for(const e of evaluations){
      const id=String(e.player_id),target=evalMap.get(id)||{};
      target[String(e.category)]=e.value??e.commentary;
      evalMap.set(id,target);
    }
    const sessionMap=new Map<string,number>(sessions.map((s:any)=>[String(s.player_id),Number(s.game_count)||0] as [string,number]));
    const importMaps=new Map<Pos,Map<string,any>>(importsByPos.map(([position,data])=>[
      position,
      new Map<string,any>((data||[]).map((row:any)=>[norm(row?.Player??String(row?.["Player, College"]||"").split(",")[0]),row] as [string,any]))
    ] as [Pos,Map<string,any>]));

    const out=[];
    for(const p of players){
      const position=p.position as Pos;
      if(!POSITIONS.includes(position))continue;
      const vals=evalMap.get(String(p.id))||{};
      const imported=importMaps.get(position)?.get(norm(p.name))||{};
      const liveGames=sessionMap.get(String(p.id))||0;
      const legacy=String(vals["__COMMENTARY__"]??"").trim();
      const gamesWatched=liveGames>0?liveGames:(legacy?1:0);
      const fields:Record<string,any>={...imported,...vals,"Games watched":gamesWatched,"Games Watched":gamesWatched};

      const grades=film[position].map(key=>numeric(vals[key])??NaN);
      const scoutingGrade=workbookScoutingGrade(position,grades,fields,glossary);
      const early=earlyDeclare(position,vals,imported);
      const preDraftGradeValue=scoutingGrade==null?null:preDraftGrade(position,scoutingGrade,null,null,early,glossary);

      const teamScore=numeric(vals["Team Score (10)"]);
      const draftCapitalScore=numeric(vals["Draft Capital Score (10)"]);
      const draftResult=String(vals["Draft Result"]??"").trim();
      const hasDraftInputs=teamScore!=null&&draftCapitalScore!=null&&draftResult!==""&&!/^pending$/i.test(draftResult);
      const finalGrade=preDraftGradeValue==null||!hasDraftInputs?null:draftAdjustedFinalGrade(position,preDraftGradeValue,teamScore,draftCapitalScore,glossary);

      out.push({
        ...p,
        gamesWatched,
        scoutingGrade,
        preDraftGrade:preDraftGradeValue,
        finalGrade,
        authoritativeGrade:finalGrade??preDraftGradeValue,
        gradeSource:finalGrade==null?"Pre-Draft":"Final",
        draftResult:draftResult||null
      });
    }
    return Response.json(out);
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not calculate grades"},{status:500});
  }
}
