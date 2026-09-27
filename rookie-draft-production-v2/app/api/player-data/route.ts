import {ensureTursoSchema,rows} from "@/lib/turso";
import {qbReference} from "@/lib/qb-reference";

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const number=(v:any)=>{
  if(v==null||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const n=Number(String(v).replace(/[%,$]/g,"").replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
};
function heightInches(v:any){
  const s=String(v??"").trim();
  const m=s.match(/(\d+)\s*['′]\s*(\d+)?\s*([^"″]*)/);
  if(!m)return null;
  let inches=Number(m[1])*12+Number(m[2]||0);
  const frac=String(m[3]||"").trim();
  if(frac.includes("¼"))inches+=.25;
  else if(frac.includes("½"))inches+=.5;
  else if(frac.includes("¾"))inches+=.75;
  else {
    const fm=frac.match(/(\d+)\s*\/\s*(\d+)/);
    if(fm&&Number(fm[2]))inches+=Number(fm[1])/Number(fm[2]);
  }
  return Number.isFinite(inches)?inches:null;
}
function enrichQB(row:any){
  const q:any={...row};
  q.Class??=q["Draft Class"];
  q["Career Starts"]??=q["Games Started"];
  q["Career Attempts"]??=q["Total Attempts"];
  q["Career Max YPG"]??=q["Max YPG"];

  q.Attempts??=q["Passing Attempts"];
  q["Completion %"]??=q["Comp %"];
  q.Yards??=q["Passing Yards"];
  q.Touchdowns??=q["Passing TDs"];
  q.Rushes??=q["Rushing Attempts"];
  q["Rush Yards"]??=q["Rushing Yards"];
  q["Rush Yards/Attempt"]??=q["Rush Yds/Att"];
  q["Rush Touchdowns"]??=q["Rushing TDs"];

  q["Screen %"]??=q["Screen throw %"];
  q["ADJ Comp %"]??=q["Adjusted Comp %"];
  q["Time to Throw"]??=q["Time to throw"];
  q["40 Yard Dash"]??=q["40-YD"];

  const height=heightInches(q.Height),weight=number(q.Weight),forty=number(q["40 Yard Dash"]);
  if(q.BMI==null&&height&&weight)q.BMI=weight*703/(height*height);
  if(q["Speed Score"]==null&&weight&&forty)q["Speed Score"]=weight*200/Math.pow(forty,4);
  return q;
}
function mergeQB(current:any[]){
  const merged=new Map<string,any>();
  for(const row of qbReference as readonly any[])if(row?.Player)merged.set(norm(row.Player),{...row});
  for(const row of current||[]){
    const key=norm(row?.Player);
    if(!key)continue;
    merged.set(key,{...(merged.get(key)||{}),...row});
  }
  return [...merged.values()].map(enrichQB);
}
export async function GET(req:Request){
  try{
    const pos=new URL(req.url).searchParams.get("position"),c=await ensureTursoSchema(),r=rows(await c.execute("select result,imported_at from pff_imports order by imported_at desc limit 1"));
    if(!r.length){
      if(pos==="QB")return Response.json({position:"QB",rows:mergeQB([]),below:[],importedAt:null,referenceSource:"QB Data"});
      return Response.json({position:pos,rows:[],importedAt:null});
    }
    let result:any={};try{result=JSON.parse(String(r[0].result||"{}"))}catch{}
    if(pos&&["QB","RB","WR","TE"].includes(pos)){
      const block=result[pos]||{},above=block.above?.primary||[],below=block.below?.primary||[];
      if(pos==="QB")return Response.json({position:pos,rows:mergeQB([...below,...above]),below,importedAt:r[0].imported_at,referenceSource:"QB Data + latest PFF import"});
      return Response.json({position:pos,rows:above,below,importedAt:r[0].imported_at});
    }
    return Response.json({result,importedAt:r[0].imported_at});
  }catch(e:any){return Response.json({error:e?.message||"Could not load player data"},{status:500})}
}
