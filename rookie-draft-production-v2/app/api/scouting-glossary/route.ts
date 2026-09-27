import {ensureTursoSchema} from "@/lib/turso";
import {glossaryFormulaRefs,scoutingGlossaryRowCount,type GlossaryColumn} from "@/lib/scouting-glossary";
import {loadScoutingGlossaryRecord,saveScoutingGlossaryCell} from "@/lib/scouting-glossary-store";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const c=await ensureTursoSchema(),record=await loadScoutingGlossaryRecord(c);
    return Response.json({rows:record.rows,formulaRefs:glossaryFormulaRefs,rowCount:scoutingGlossaryRowCount,updatedAt:record.updatedAt});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load scouting glossary"},{status:500})}
}

export async function POST(req:Request){
  try{
    const body=await req.json(),row=Number(body?.row),column=String(body?.column||"").toUpperCase() as GlossaryColumn;
    const c=await ensureTursoSchema(),record=await saveScoutingGlossaryCell(c,row,column,body?.value);
    return Response.json({rows:record.rows,formulaRefs:glossaryFormulaRefs,rowCount:scoutingGlossaryRowCount,updatedAt:record.updatedAt});
  }catch(e:unknown){
    const message=e instanceof Error?e.message:"Could not save scouting glossary";
    const bad=/out of range|column must|fixed|calculated/i.test(message);
    return Response.json({error:message},{status:bad?400:500});
  }
}
