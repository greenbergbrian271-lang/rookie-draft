import {workbookReference as w} from "./workbook-reference";

export type GlossaryRows=readonly (readonly any[])[];
export type GlossaryColumn="A"|"B";
export type GlossaryOverrides=Record<string,string>;

const baseRows=w.glossary as unknown as GlossaryRows;
export const scoutingGlossaryRowCount=baseRows.length;

export const glossaryFormulaRefs:Record<number,string>={
  24:"=1-B23",
  27:"=1-B26",
  30:"=1-B29",
  32:"=B29",
  33:"=1-B32",
  45:"=1-(B43+B41+B39+B37)",
  60:"=1-(B52+B54+B56+B58)",
  67:"=1-(B63+B65)",
  74:"=1-(B70+B72)",
  81:"=1-B80",
  90:"=1-(B88+B89)",
  189:"=1-SUM(B182:B188)",
  220:"=1-(B208+B210+B212+B214+B216+B218)",
  229:"=1-SUM(B222:B228)",
  234:"=B233+1.25",
  235:"=B234+1.25",
  236:"=B235+1.25",
  261:"=1-SUM(B258:B260)",
  266:"=1-SUM(B263:B265)",
  272:"=1-SUM(B268:B271)",
  278:"=1-SUM(B274:B277)"
};

export function glossaryCellKey(row:number,column:GlossaryColumn){return `${column}${row}`}
export function isGlossaryFormulaCell(row:number,column:GlossaryColumn){return column==="B"&&Boolean(glossaryFormulaRefs[row])}
export function defaultGlossaryCell(row:number,column:GlossaryColumn){return baseRows[row-1]?.[column==="A"?0:1]??""}

function valueNumber(value:any){
  if(value==null||value==="")return 0;
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  const raw=String(value).trim(),isPct=raw.endsWith("%");
  const n=Number(raw.replace(/[$,%]/g,"").replace(/,/g,"").trim());
  return Number.isFinite(n)?(isPct?n/100:n):0;
}

function formatLike(seed:any,value:number){
  const raw=String(seed??"");
  if(raw.includes("%")){
    const match=raw.match(/\.(\d+)%/),digits=match?match[1].length:0;
    return `${(value*100).toFixed(digits)}%`;
  }
  const decimal=raw.match(/\.(\d+)$/);
  if(decimal)return value.toFixed(decimal[1].length);
  if(/^-?[\d,]+$/.test(raw))return Number.isInteger(value)?String(value):String(Number(value.toFixed(6)));
  return String(Number(value.toFixed(6)));
}

export function normalizeGlossaryInput(row:number,column:GlossaryColumn,value:any){
  const text=String(value??"");
  if(column==="A")return text;
  const seed=String(defaultGlossaryCell(row,"B")??"");
  if(seed.includes("%")){
    const trimmed=text.trim();
    if(!trimmed)return "";
    if(trimmed.endsWith("%")){
      const n=Number(trimmed.slice(0,-1).replace(/,/g,"").trim());
      if(!Number.isFinite(n))return text;
      const match=seed.match(/\.(\d+)%/),digits=match?match[1].length:0;
      return `${n.toFixed(digits)}%`;
    }
    const n=Number(trimmed.replace(/,/g,""));
    if(!Number.isFinite(n))return text;
    const decimal=n>=-1&&n<=1?n:n/100;
    return formatLike(seed,decimal);
  }
  if(seed.toUpperCase()==="TRUE"||seed.toUpperCase()==="FALSE"){
    const upper=text.trim().toUpperCase();
    return upper==="TRUE"||upper==="FALSE"?upper:text;
  }
  return text;
}

export function buildScoutingGlossary(overrides:GlossaryOverrides={}){
  const rows=baseRows.map(r=>[...(r as readonly any[])]);
  for(const [key,value] of Object.entries(overrides)){
    const match=key.match(/^([AB])(\d+)$/);if(!match)continue;
    const column=match[1] as GlossaryColumn,row=Number(match[2]);
    if(row<1||row>rows.length||isGlossaryFormulaCell(row,column))continue;
    rows[row-1][column==="A"?0:1]=value;
  }
  const n=(row:number)=>valueNumber(rows[row-1]?.[1]);
  const set=(row:number,value:number)=>{rows[row-1][1]=formatLike(baseRows[row-1]?.[1],value)};
  set(24,1-n(23));
  set(27,1-n(26));
  set(30,1-n(29));
  set(32,n(29));
  set(33,1-n(32));
  set(45,1-(n(43)+n(41)+n(39)+n(37)));
  set(60,1-(n(52)+n(54)+n(56)+n(58)));
  set(67,1-(n(63)+n(65)));
  set(74,1-(n(70)+n(72)));
  set(81,1-n(80));
  set(90,1-(n(88)+n(89)));
  set(189,1-[182,183,184,185,186,187,188].reduce((sum,row)=>sum+n(row),0));
  set(220,1-[208,210,212,214,216,218].reduce((sum,row)=>sum+n(row),0));
  set(229,1-[222,223,224,225,226,227,228].reduce((sum,row)=>sum+n(row),0));
  set(234,n(233)+1.25);
  set(235,n(234)+1.25);
  set(236,n(235)+1.25);
  set(261,1-[258,259,260].reduce((sum,row)=>sum+n(row),0));
  set(266,1-[263,264,265].reduce((sum,row)=>sum+n(row),0));
  set(272,1-[268,269,270,271].reduce((sum,row)=>sum+n(row),0));
  set(278,1-[274,275,276,277].reduce((sum,row)=>sum+n(row),0));
  return rows;
}
