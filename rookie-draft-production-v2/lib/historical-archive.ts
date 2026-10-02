import y2020 from "./historical-data/2020";
import y2021 from "./historical-data/2021";
import y2022 from "./historical-data/2022";
import y2023 from "./historical-data/2023";
import y2024 from "./historical-data/2024";
import y2025 from "./historical-data/2025";
import y2026 from "./historical-data/2026";

export type HistoricalPosition="QB"|"RB"|"WR"|"TE";
export type HistoricalBoardRow={rank:number;position:HistoricalPosition|null;positionRank:string|null;grade:number|null;name:string;college:string|null};
export type HistoricalBoard={key:string;label:string;rows:HistoricalBoardRow[]};
export type HistoricalScoutRow={position:HistoricalPosition;positionRank:string|null;name:string;college:string|null;finalGrade:number|null;preDraftGrade:number|null;scoutingGrade:number|null;productionGrade:number|null;analyticalGrade:number|null;draftResult:string|null;expectedRole:string|null;draftProjection:string|null};
export type HistoricalDraftPick={pick:string;team:string;player:string};
export type HistoricalDraftDay={key:string;label:string;note:string|null;picks:HistoricalDraftPick[]};
export type HistoricalPlayer={id:string;name:string;position:HistoricalPosition;college:string|null;positionRank:string|null};
export type HistoricalArchive={draftClass:number;boards:HistoricalBoard[];scouting:HistoricalScoutRow[];draftDays:HistoricalDraftDay[];players:HistoricalPlayer[]};

const RAW:Record<number,unknown>={2020:y2020,2021:y2021,2022:y2022,2023:y2023,2024:y2024,2025:y2025,2026:y2026};
export const HISTORICAL_DRAFT_CLASSES=[2020,2021,2022,2023,2024,2025,2026] as const;
export const isHistoricalDraftClass=(year:number)=>HISTORICAL_DRAFT_CLASSES.includes(year as any);
const posFromRank=(rank:unknown):HistoricalPosition|null=>{const m=String(rank??"").match(/^(QB|RB|WR|TE)/i);return (m?.[1]?.toUpperCase() as HistoricalPosition|undefined)||null};
const slug=(value:string)=>value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export function getHistoricalArchive(year:number):HistoricalArchive|null{
  const raw=(RAW as Record<number,any>)[year];
  if(!raw)return null;
  const boards:HistoricalBoard[]=(raw.b||[]).map((board:any[])=>({
    key:String(board[0]),label:String(board[1]),rows:(board[2]||[]).map((r:any[])=>({rank:Number(r[0]),position:posFromRank(r[1]),positionRank:r[1]==null?null:String(r[1]),grade:r[2]==null?null:Number(r[2]),name:String(r[3]),college:r[4]==null?null:String(r[4])}))
  }));
  const scouting:HistoricalScoutRow[]=(raw.s||[]).map((r:any[])=>({position:String(r[0]) as HistoricalPosition,positionRank:r[1]==null?null:String(r[1]),name:String(r[2]),college:r[3]==null?null:String(r[3]),finalGrade:r[4]==null?null:Number(r[4]),preDraftGrade:r[5]==null?null:Number(r[5]),scoutingGrade:r[6]==null?null:Number(r[6]),productionGrade:r[7]==null?null:Number(r[7]),analyticalGrade:r[8]==null?null:Number(r[8]),draftResult:r[9]==null?null:String(r[9]),expectedRole:r[10]==null?null:String(r[10]),draftProjection:r[11]==null?null:String(r[11])}));
  const draftDays:HistoricalDraftDay[]=(raw.d||[]).map((d:any[])=>({key:String(d[0]),label:String(d[1]),note:d[2]==null?null:String(d[2]),picks:(d[3]||[]).map((p:any[])=>({pick:String(p[0]),team:String(p[1]),player:String(p[2])}))}));
  const players=new Map<string,HistoricalPlayer>();
  for(const row of scouting){const key=slug(row.name);players.set(key,{id:`hist-${year}-${key}`,name:row.name,position:row.position,college:row.college,positionRank:row.positionRank})}
  for(const row of boards.find(x=>x.key==="base")?.rows||[]){if(!row.position)continue;const key=slug(row.name);if(!players.has(key))players.set(key,{id:`hist-${year}-${key}`,name:row.name,position:row.position,college:row.college,positionRank:row.positionRank})}
  return {draftClass:Number(raw.y||year),boards,scouting,draftDays,players:[...players.values()]};
}