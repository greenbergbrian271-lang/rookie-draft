import {workbookReference as w} from "./workbook-reference";
type Pos="QB"|"RB"|"WR"|"TE";
const rows:Record<Pos,number[]>={QB:[93,95,97,99,101,103,105,107,109],RB:[126,128,130,132,134,136,138,140,142],WR:[168,170,172,174,176,178,180],TE:[208,210,212,214,216,218,220]};
export function glossaryNumber(row:number){const v=(w.glossary as any[])[row-1]?.[1];const n=typeof v==="number"?v:Number(String(v??"").replace("%",""));return Number.isFinite(n)?(String(v).includes("%")?n/100:n):0}
export function scoutingWeightedGrade(position:Pos,grades:number[]){const weights=rows[position];if(grades.length!==weights.length||grades.some(x=>!Number.isFinite(x)))return null;return grades.reduce((sum,g,i)=>sum+g*glossaryNumber(weights[i]),0)}
export const scoutingWeightRows=rows;
