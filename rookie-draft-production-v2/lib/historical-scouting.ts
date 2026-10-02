import y2022 from "./historical-scouting-data/2022";
import y2023 from "./historical-scouting-data/2023";
import y2024 from "./historical-scouting-data/2024";
import y2025 from "./historical-scouting-data/2025";
import y2026 from "./historical-scouting-data/2026";

export type HistoricalPosition="QB"|"RB"|"WR"|"TE";
export type HistoricalField={group:string;label:string;value:unknown};
export type HistoricalScoutingSnapshot={
  name:string;college:string|null;grades:Record<string,unknown>;fields:HistoricalField[];
  commentary:string|null;gameLabel:string|null;
};
type YearData=Record<HistoricalPosition,{rows:readonly HistoricalScoutingSnapshot[]}>;
const DATA:Record<number,YearData>={2022:y2022 as unknown as YearData,2023:y2023 as unknown as YearData,2024:y2024 as unknown as YearData,2025:y2025 as unknown as YearData,2026:y2026 as unknown as YearData};
export const HISTORICAL_SCOUTING_YEARS=Object.freeze([2022,2023,2024,2025,2026] as const);
export const normHistoricalName=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
export function getHistoricalScoutingYear(year:number){return DATA[year]||null}
export function getHistoricalScoutingRows(year:number,position:HistoricalPosition){return (DATA[year]?.[position]?.rows||[]) as readonly HistoricalScoutingSnapshot[]}
export function findHistoricalScoutingSnapshot(year:number,position:string,name:string){
  if(!["QB","RB","WR","TE"].includes(position))return null;
  const key=normHistoricalName(name);
  return getHistoricalScoutingRows(year,position as HistoricalPosition).find(x=>normHistoricalName(x.name)===key)||null;
}
const numberOrNull=(v:unknown)=>{const n=Number(v);return v==null||v===""||!Number.isFinite(n)?null:n};
export function historicalGradeData(snapshot:HistoricalScoutingSnapshot|null){
  const grades=snapshot?.grades||{},values:Record<string,unknown>={};
  if(snapshot)for(const field of snapshot.fields)if(values[field.label]===undefined)values[field.label]=field.value;
  for(const [k,v] of Object.entries(grades))values[k]=v;
  return {
    values,
    scouting:numberOrNull(grades["Scouting Grade"]),
    production:numberOrNull(grades["Production Grade"]),
    analytical:numberOrNull(grades["Analytical Grade"]),
    pre:numberOrNull(grades["Pre-Draft Grade"]),
    final:numberOrNull(grades["Draft Adjusted Final Grade"]),
    combine:numberOrNull(grades["Combine/Pro Day Grade"]??grades["Combine/Pro Day Score"])
  };
}
export function historicalEvaluations(snapshot:HistoricalScoutingSnapshot|null){
  if(!snapshot)return [];
  const rows:any[]=[];
  for(const [category,value] of Object.entries(snapshot.grades||{})){
    const n=numberOrNull(value);rows.push({category,value:n,commentary:n==null?String(value??""):null,group:"Grades"});
  }
  for(const field of snapshot.fields){
    const n=numberOrNull(field.value),category=field.group==="Scouting"?field.label:`${field.group} · ${field.label}`;
    rows.push({category,value:n,commentary:n==null?String(field.value??""):null,group:field.group,label:field.label});
  }
  return rows;
}
