import {buildScoutingGlossary,defaultGlossaryCell,glossaryCellKey,isGlossaryFormulaCell,normalizeGlossaryInput,scoutingGlossaryRowCount,type GlossaryColumn,type GlossaryOverrides} from "./scouting-glossary";

const SETTINGS_KEY="scouting_glossary_overrides_v1";

type DbClient={execute:(statement:any)=>Promise<any>};

async function readRecord(c:DbClient){
  const result=await c.execute({sql:"select value,updated_at from settings where key=?",args:[SETTINGS_KEY]});
  const row=result.rows?.[0] as any;
  let overrides:GlossaryOverrides={};
  if(row?.value){try{const parsed=JSON.parse(String(row.value));if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))overrides=parsed}catch{overrides={}}}
  return {overrides,updatedAt:row?.updated_at?String(row.updated_at):null};
}

export async function loadScoutingGlossaryRecord(c:DbClient){
  const record=await readRecord(c);
  return {...record,rows:buildScoutingGlossary(record.overrides)};
}

export async function loadScoutingGlossary(c:DbClient){return (await loadScoutingGlossaryRecord(c)).rows}

export async function saveScoutingGlossaryCell(c:DbClient,row:number,column:GlossaryColumn,value:any){
  if(!Number.isInteger(row)||row<1||row>scoutingGlossaryRowCount)throw new Error("Glossary row is out of range");
  if(column!=="A"&&column!=="B")throw new Error("Glossary column must be A or B");
  if(row===1)throw new Error("The glossary header row is fixed");
  if(isGlossaryFormulaCell(row,column))throw new Error("That glossary cell is calculated from other glossary inputs");
  const record=await readRecord(c),key=glossaryCellKey(row,column),normalized=normalizeGlossaryInput(row,column,value),defaultValue=normalizeGlossaryInput(row,column,defaultGlossaryCell(row,column));
  if(normalized===defaultValue)delete record.overrides[key];else record.overrides[key]=normalized;
  const now=new Date().toISOString();
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[SETTINGS_KEY,JSON.stringify(record.overrides),now]});
  return {overrides:record.overrides,updatedAt:now,rows:buildScoutingGlossary(record.overrides)};
}
