import {ensureTursoSchema} from "@/lib/turso";
import {glossaryFormulaRefs,scoutingGlossaryRowCount,type GlossaryColumn} from "@/lib/scouting-glossary";
import {addScoutingGlossaryRow,deleteScoutingGlossaryBaseRow,deleteScoutingGlossaryCustomRow,loadScoutingGlossaryRecord,restoreScoutingGlossaryBaseRow,saveScoutingGlossaryCell,updateScoutingGlossaryCustomRow} from "@/lib/scouting-glossary-store";

export const dynamic="force-dynamic";

function payload(record:any){
  return {rows:record.rows,formulaRefs:glossaryFormulaRefs,rowCount:scoutingGlossaryRowCount,customRows:record.customRows,hiddenRows:record.hiddenRows,updatedAt:record.updatedAt};
}

export async function GET(){
  try{
    const c=await ensureTursoSchema(),record=await loadScoutingGlossaryRecord(c);
    return Response.json(payload(record));
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load scouting glossary"},{status:500})}
}

export async function POST(req:Request){
  try{
    const body=await req.json(),action=String(body?.action||"saveCell"),c=await ensureTursoSchema();
    let record:any;
    if(action==="addRow")record=await addScoutingGlossaryRow(c,{scope:body?.scope,category:body?.category,value:body?.value,kind:body?.kind});
    else if(action==="updateCustomRow")record=await updateScoutingGlossaryCustomRow(c,String(body?.id||""),String(body?.column||"").toUpperCase() as GlossaryColumn,body?.value);
    else if(action==="deleteCustomRow")record=await deleteScoutingGlossaryCustomRow(c,String(body?.id||""));
    else if(action==="deleteBaseRow")record=await deleteScoutingGlossaryBaseRow(c,Number(body?.row));
    else if(action==="restoreBaseRow")record=await restoreScoutingGlossaryBaseRow(c,Number(body?.row));
    else record=await saveScoutingGlossaryCell(c,Number(body?.row),String(body?.column||"").toUpperCase() as GlossaryColumn,body?.value);
    return Response.json(payload(record));
  }catch(e:unknown){
    const message=e instanceof Error?e.message:"Could not save scouting glossary";
    const bad=/out of range|column must|fixed|calculated|not found|required|valid glossary|restore/i.test(message);
    return Response.json({error:message},{status:bad?400:500});
  }
}
