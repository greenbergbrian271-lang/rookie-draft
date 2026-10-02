import Papa from "papaparse";
import {ensureTursoSchema,rows} from "@/lib/turso";

type StoredGrade={
  playerName:string;
  normalizedName:string;
  position:string|null;
  teamName:string|null;
  normalizedTeam:string;
  offense:number|null;
  passBlock:number|null;
  runBlock:number|null;
};

const norm=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const num=(v:unknown)=>{if(typeof v==="number")return Number.isFinite(v)?v:null;const s=String(v??"").replace(/[%,$]/g,"").replace(/,/g,"").trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null};
const header=(v:unknown)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases={
  player:["player","playername","name"],
  position:["position","pos"],
  team:["teamname","team","tm","franchise"],
  offense:["gradesoffense","offensegrade","offense","gradeoffense"],
  passBlock:["gradespassblock","passblockgrade","passblock","gradepassblock"],
  runBlock:["gradesrunblock","runblockgrade","runblock","graderunblock"],
} as const;

function readField(raw:Record<string,unknown>,keys:readonly string[]){
  const map=new Map(Object.entries(raw).map(([k,v])=>[header(k),v]));
  for(const key of keys)if(map.has(key))return map.get(key);
  return null;
}
function parseGradeRows(text:string){
  const parsed=Papa.parse<Record<string,unknown>>(text,{header:true,dynamicTyping:true,skipEmptyLines:"greedy"});
  const out:StoredGrade[]=[];
  for(const raw of parsed.data){
    const playerName=String(readField(raw,aliases.player)??"").trim();
    if(!playerName)continue;
    const offense=num(readField(raw,aliases.offense)),passBlock=num(readField(raw,aliases.passBlock)),runBlock=num(readField(raw,aliases.runBlock));
    if(offense==null&&passBlock==null&&runBlock==null)continue;
    const positionRaw=String(readField(raw,aliases.position)??"").trim().toUpperCase();
    const teamName=String(readField(raw,aliases.team)??"").trim();
    out.push({
      playerName,
      normalizedName:norm(playerName),
      position:positionRaw||null,
      teamName:teamName||null,
      normalizedTeam:norm(teamName),
      offense,
      passBlock,
      runBlock,
    });
  }
  return out;
}

export async function GET(req:Request){
  try{
    const q=await ensureTursoSchema();
    const url=new URL(req.url),seasonParam=url.searchParams.get("season"),season=seasonParam?Number(seasonParam):null;
    const chosen=rows(await q.execute(season!=null?{
      sql:"select id,season,source_files,row_count,imported_at from nfl_grade_imports where season=? order by id desc limit 1",
      args:[season]
    }:"select id,season,source_files,row_count,imported_at from nfl_grade_imports order by season desc,id desc limit 1"));
    const history=rows(await q.execute("select id,season,source_files,row_count,imported_at from nfl_grade_imports order by season desc,id desc limit 20")).map((x:any)=>({
      importId:Number(x.id),season:Number(x.season),rowCount:Number(x.row_count||0),importedAt:x.imported_at,
      sourceFiles:(()=>{try{return JSON.parse(String(x.source_files||"[]"))}catch{return []}})()
    }));
    if(!chosen.length)return Response.json({dataset:null,rows:[],history});
    const meta:any=chosen[0],importId=Number(meta.id);
    const gradeRows=rows(await q.execute({sql:"select player_name,normalized_name,position,team_name,normalized_team,offense,pass_block,run_block from nfl_player_grades where import_id=? order by team_name,position,player_name",args:[importId]})).map((x:any)=>({
      playerName:String(x.player_name),normalizedName:String(x.normalized_name),position:x.position?String(x.position):null,
      teamName:x.team_name?String(x.team_name):null,normalizedTeam:String(x.normalized_team||""),
      offense:x.offense==null?null:Number(x.offense),passBlock:x.pass_block==null?null:Number(x.pass_block),runBlock:x.run_block==null?null:Number(x.run_block)
    }));
    let sourceFiles:any[]=[];try{sourceFiles=JSON.parse(String(meta.source_files||"[]"))}catch{}
    return Response.json({dataset:{importId,season:Number(meta.season),rowCount:Number(meta.row_count||0),importedAt:meta.imported_at,sourceFiles},rows:gradeRows,history});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not load NFL player grades"},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const q=await ensureTursoSchema(),fd=await req.formData();
    const files=fd.getAll("files").filter((x:any)=>x&&typeof x==="object"&&"text" in x&&Number(x.size)>0) as File[];
    const season=Number(fd.get("season"));
    if(!Number.isInteger(season)||season<2000||season>2100)return Response.json({error:"Choose a valid NFL season."},{status:400});
    if(!files.length)return Response.json({error:"Upload at least one PFF CSV file."},{status:400});

    const merged=new Map<string,StoredGrade>(),sourceFiles:string[]=[];
    for(const file of files){
      sourceFiles.push(file.name);
      for(const row of parseGradeRows(await file.text())){
        const key=[row.normalizedName,row.normalizedTeam,row.position||""].join("|"),prev=merged.get(key);
        merged.set(key,prev?{...prev,playerName:row.playerName||prev.playerName,teamName:row.teamName||prev.teamName,position:row.position||prev.position,
          offense:row.offense??prev.offense,passBlock:row.passBlock??prev.passBlock,runBlock:row.runBlock??prev.runBlock}:row);
      }
    }
    const gradeRows=[...merged.values()];
    if(!gradeRows.length)return Response.json({error:"No usable grade rows were found. Expected player plus grades_offense, grades_pass_block and/or grades_run_block columns."},{status:400});

    const inserted=await q.execute({sql:"insert into nfl_grade_imports(season,source_files,row_count,imported_at) values(?,?,?,current_timestamp) returning id,imported_at",args:[season,JSON.stringify(sourceFiles),gradeRows.length]});
    const importId=Number(inserted.rows[0]?.id);
    for(let i=0;i<gradeRows.length;i+=100){
      await q.batch(gradeRows.slice(i,i+100).map(r=>({sql:"insert into nfl_player_grades(import_id,player_name,normalized_name,position,team_name,normalized_team,offense,pass_block,run_block) values(?,?,?,?,?,?,?,?,?)",args:[importId,r.playerName,r.normalizedName,r.position,r.teamName,r.normalizedTeam,r.offense,r.passBlock,r.runBlock]})),"write");
    }
    return Response.json({ok:true,importId,season,rowCount:gradeRows.length,sourceFiles,importedAt:inserted.rows[0]?.imported_at??null});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"NFL grade import failed"},{status:500});
  }
}
