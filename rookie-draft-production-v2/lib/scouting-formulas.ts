import {workbookReference as w} from "./workbook-reference";
export type Pos="QB"|"RB"|"WR"|"TE";
const rows:Record<Pos,number[]>={QB:[93,95,97,99,101,103,105,107,109],RB:[126,128,130,132,134,136,138,140,142],WR:[168,170,172,174,176,178,180],TE:[208,210,212,214,216,218,220]};
export function glossaryNumber(row:number){const v=(w.glossary as any[])[row-1]?.[1];const raw=String(v??"");const n=typeof v==="number"?v:Number(raw.replace(/[%,$]/g,"").replace(/,/g,""));return Number.isFinite(n)?(raw.includes("%")?n/100:n):0}
export function scoutingWeightedGrade(position:Pos,grades:number[]){const weights=rows[position];if(grades.length!==weights.length||grades.some(x=>!Number.isFinite(x)))return null;return grades.reduce((sum,g,i)=>sum+g*glossaryNumber(weights[i]),0)}
export function scoutingAdjustments(position:Pos,fields:Record<string,any>){
 let n=0;
 if(fields["Injury Concerns"]==="Short Term")n-=glossaryNumber(241);
 if(fields["Injury Concerns"]==="Long Term")n-=glossaryNumber(242);
 if(fields["Off-Field?"]==="Character")n-=glossaryNumber(244);
 if(fields["Off-Field?"]==="Arrest")n-=glossaryNumber(245);
 if(fields["All Star Game?"]==="Senior Bowl")n+=glossaryNumber(246);
 if(fields["All Star Game?"]==="Shrine Bowl")n+=glossaryNumber(247);
 if(fields["All Star Game?"]==="Hula Bowl")n+=glossaryNumber(248);
 if(fields["Combine Invite?"]==="Yes")n+=glossaryNumber(249);
 if(fields["Combine Invite?"]==="No")n-=glossaryNumber(250);
 if(position!=="QB"&&(fields["Special Teams?"]==="Yes"||fields["Special Teams"]==="Yes"))n+=glossaryNumber(239);
 return n;
}
export function workbookScoutingGrade(position:Pos,grades:number[],fields:Record<string,any>){
 const watched=Number(fields["Games watched"]||0);if(watched<1)return null;
 const base=scoutingWeightedGrade(position,grades);return base==null?null:base+scoutingAdjustments(position,fields);
}
export const scoutingWeightRows=rows;
