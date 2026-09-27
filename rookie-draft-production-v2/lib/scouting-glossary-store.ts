import {randomUUID} from "node:crypto";
import {buildScoutingGlossary,defaultGlossaryCell,glossaryCellKey,glossaryFormulaRefs,isGlossaryFormulaCell,normalizeGlossaryInput,scoutingGlossaryRowCount,type GlossaryColumn,type GlossaryOverrides} from "./scouting-glossary";

const SETTINGS_KEY="scouting_glossary_overrides_v1";
const CUSTOM_ROWS_KEY="scouting_glossary_custom_rows_v1";
const HIDDEN_ROWS_KEY="scouting_glossary_hidden_rows_v1";
const VALID_SCOPES=new Set(["general","qb","rb","wr","te","players","combine","archetypes"]);

export type GlossaryCustomRow={
  id:string;
  scope:string;
  category:string;
  value:string;
  kind:"setting"|"definition";
  createdAt:string;
};

type DbClient={execute:(statement:any)=>Promise<any>};

async function readSetting(c:DbClient,key:string){
  const result=await c.execute({sql:"select value,updated_at from settings where key=?",args:[key]});
  const row=result.rows?.[0] as any;
  return {value:row?.value?String(row.value):"",updatedAt:row?.updated_at?String(row.updated_at):null};
}

function parseOverrides(raw:string){
  if(!raw)return {} as GlossaryOverrides;
  try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as GlossaryOverrides:{}}catch{return {} as GlossaryOverrides}
}
function parseCustomRows(raw:string){
  if(!raw)return [] as GlossaryCustomRow[];
  try{
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((r:any)=>r&&typeof r.id==="string"&&VALID_SCOPES.has(String(r.scope))).map((r:any)=>({
      id:String(r.id),
      scope:String(r.scope),
      category:String(r.category??""),
      value:String(r.value??""),
      kind:r.kind==="definition"?"definition":"setting",
      createdAt:String(r.createdAt??"")
    })) as GlossaryCustomRow[];
  }catch{return []}
}
function parseHiddenRows(raw:string){
  if(!raw)return [] as number[];
  try{
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return [...new Set(parsed.map(Number).filter(n=>Number.isInteger(n)&&n>1&&n<=scoutingGlossaryRowCount&&!glossaryFormulaRefs[n]))].sort((a,b)=>a-b);
  }catch{return []}
}
async function writeSetting(c:DbClient,key:string,value:any){
  const now=new Date().toISOString();
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[key,JSON.stringify(value),now]});
  return now;
}
async function readRecord(c:DbClient){
  const [overrideSetting,customSetting,hiddenSetting]=await Promise.all([readSetting(c,SETTINGS_KEY),readSetting(c,CUSTOM_ROWS_KEY),readSetting(c,HIDDEN_ROWS_KEY)]);
  const updatedAt=[overrideSetting.updatedAt,customSetting.updatedAt,hiddenSetting.updatedAt].filter(Boolean).sort().at(-1)||null;
  return {
    overrides:parseOverrides(overrideSetting.value),
    customRows:parseCustomRows(customSetting.value),
    hiddenRows:parseHiddenRows(hiddenSetting.value),
    updatedAt
  };
}
function withRows(record:Awaited<ReturnType<typeof readRecord>>){
  return {...record,rows:buildScoutingGlossary(record.overrides,record.hiddenRows)};
}

export async function loadScoutingGlossaryRecord(c:DbClient){return withRows(await readRecord(c))}
export async function loadScoutingGlossary(c:DbClient){
  const record=await readRecord(c);
  return buildScoutingGlossary(record.overrides,record.hiddenRows);
}

export async function saveScoutingGlossaryCell(c:DbClient,row:number,column:GlossaryColumn,value:any){
  if(!Number.isInteger(row)||row<1||row>scoutingGlossaryRowCount)throw new Error("Glossary row is out of range");
  if(column!=="A"&&column!=="B")throw new Error("Glossary column must be A or B");
  if(row===1)throw new Error("The glossary header row is fixed");
  if(isGlossaryFormulaCell(row,column))throw new Error("That glossary cell is calculated from other glossary inputs");
  const record=await readRecord(c);
  if(record.hiddenRows.includes(row))throw new Error("Restore that deleted row before editing it");
  const key=glossaryCellKey(row,column),normalized=normalizeGlossaryInput(row,column,value),defaultValue=normalizeGlossaryInput(row,column,defaultGlossaryCell(row,column));
  if(normalized===defaultValue)delete record.overrides[key];else record.overrides[key]=normalized;
  record.updatedAt=await writeSetting(c,SETTINGS_KEY,record.overrides);
  return withRows(record);
}

export async function addScoutingGlossaryRow(c:DbClient,input:{scope:any;category:any;value:any;kind:any}){
  const record=await readRecord(c),scope=String(input.scope||"");
  if(!VALID_SCOPES.has(scope))throw new Error("Choose a valid glossary section");
  const category=String(input.category??"").trim();
  if(!category)throw new Error("Category is required");
  const row:GlossaryCustomRow={
    id:randomUUID(),
    scope,
    category,
    value:String(input.value??""),
    kind:input.kind==="definition"?"definition":"setting",
    createdAt:new Date().toISOString()
  };
  record.customRows.push(row);
  record.updatedAt=await writeSetting(c,CUSTOM_ROWS_KEY,record.customRows);
  return withRows(record);
}

export async function updateScoutingGlossaryCustomRow(c:DbClient,id:any,column:GlossaryColumn,value:any){
  const record=await readRecord(c),target=record.customRows.find(r=>r.id===String(id||""));
  if(!target)throw new Error("Custom glossary row not found");
  if(column==="A")target.category=String(value??"");else if(column==="B")target.value=String(value??"");else throw new Error("Glossary column must be A or B");
  record.updatedAt=await writeSetting(c,CUSTOM_ROWS_KEY,record.customRows);
  return withRows(record);
}

export async function deleteScoutingGlossaryCustomRow(c:DbClient,id:any){
  const record=await readRecord(c),before=record.customRows.length;
  record.customRows=record.customRows.filter(r=>r.id!==String(id||""));
  if(record.customRows.length===before)throw new Error("Custom glossary row not found");
  record.updatedAt=await writeSetting(c,CUSTOM_ROWS_KEY,record.customRows);
  return withRows(record);
}

export async function deleteScoutingGlossaryBaseRow(c:DbClient,row:number){
  if(!Number.isInteger(row)||row<=1||row>scoutingGlossaryRowCount)throw new Error("Glossary row is out of range");
  if(glossaryFormulaRefs[row])throw new Error("Calculated glossary rows cannot be deleted");
  const record=await readRecord(c);
  if(!record.hiddenRows.includes(row))record.hiddenRows.push(row);
  record.hiddenRows.sort((a,b)=>a-b);
  record.updatedAt=await writeSetting(c,HIDDEN_ROWS_KEY,record.hiddenRows);
  return withRows(record);
}

export async function restoreScoutingGlossaryBaseRow(c:DbClient,row:number){
  const record=await readRecord(c),before=record.hiddenRows.length;
  record.hiddenRows=record.hiddenRows.filter(r=>r!==row);
  if(record.hiddenRows.length===before)throw new Error("Deleted glossary row not found");
  record.updatedAt=await writeSetting(c,HIDDEN_ROWS_KEY,record.hiddenRows);
  return withRows(record);
}
