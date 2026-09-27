import {workbookReference as w} from "./workbook-reference";
export type Pos="QB"|"RB"|"WR"|"TE";
export type GlossaryRows=readonly (readonly any[])[];
const baseGlossary=w.glossary as unknown as GlossaryRows;
const weightRows:Record<Pos,number[]>={QB:[93,95,97,99,101,103,105,107,109],RB:[126,128,130,132,134,136,138,140,142],WR:[168,170,172,174,176,178,180],TE:[208,210,212,214,216,218,220]};
export function glossaryColumnA(row:number,glossary:GlossaryRows=baseGlossary){const v=glossary[row-1]?.[0];const n=Number(String(v??"").replace(/[%,$]/g,"").replace(/,/g,""));return Number.isFinite(n)?n:0}
export function glossaryNumber(row:number,glossary:GlossaryRows=baseGlossary){const v=glossary[row-1]?.[1];const raw=String(v??"");const n=typeof v==="number"?v:Number(raw.replace(/[%,$]/g,"").replace(/,/g,""));return Number.isFinite(n)?(raw.includes("%")?n/100:n):0}
export function scoutingWeightedGrade(position:Pos,grades:number[],glossary:GlossaryRows=baseGlossary){const weights=weightRows[position];if(grades.length!==weights.length||grades.some(x=>!Number.isFinite(x)))return null;return grades.reduce((sum,g,i)=>sum+g*glossaryNumber(weights[i],glossary),0)}
export function scoutingAdjustments(position:Pos,fields:Record<string,any>,glossary:GlossaryRows=baseGlossary){
 let n=0;
 if(fields["Injury Concerns"]==="Short Term")n-=glossaryNumber(241,glossary);
 if(fields["Injury Concerns"]==="Long Term")n-=glossaryNumber(242,glossary);
 if(fields["Off-Field?"]==="Character")n-=glossaryNumber(244,glossary);
 if(fields["Off-Field?"]==="Arrest")n-=glossaryNumber(245,glossary);
 if(fields["All Star Game?"]==="Senior Bowl")n+=glossaryNumber(246,glossary);
 if(fields["All Star Game?"]==="Shrine Bowl")n+=glossaryNumber(247,glossary);
 if(fields["All Star Game?"]==="Hula Bowl")n+=glossaryNumber(248,glossary);
 if(fields["Combine Invite?"]==="Yes")n+=glossaryNumber(249,glossary);
 if(fields["Combine Invite?"]==="No")n-=glossaryNumber(250,glossary);
 if(position!=="QB"&&(fields["Special Teams?"]==="Yes"||fields["Special Teams"]==="Yes"))n+=glossaryNumber(239,glossary);
 if(position==="RB"){const forty=Number(fields["40 Yard Dash"]);if(Number.isFinite(forty)&&forty>0&&forty<glossaryColumnA(151,glossary))n+=glossaryNumber(151,glossary);}
 return n;
}
export function productionWeights(position:Pos,glossary:GlossaryRows=baseGlossary){if(position==="RB")return {yardsPerCarry:glossaryNumber(144,glossary),yardsPerReception:glossaryNumber(145,glossary),yardsPerTouch:glossaryNumber(146,glossary),yptp:glossaryNumber(147,glossary),recShare:glossaryNumber(148,glossary),domRtg:glossaryNumber(149,glossary),speedScore:glossaryNumber(150,glossary)};if(position==="WR")return {yardsPerReception:glossaryNumber(182,glossary),yardsPerTarget:glossaryNumber(183,glossary),targetShare:glossaryNumber(184,glossary),catchPct:glossaryNumber(185,glossary),yptpa:glossaryNumber(186,glossary),weightedDomRtg:glossaryNumber(187,glossary),domRtg:glossaryNumber(188,glossary),speedScore:glossaryNumber(189,glossary)};if(position==="TE")return {yardsPerReception:glossaryNumber(222,glossary),yardsPerTarget:glossaryNumber(223,glossary),targetShare:glossaryNumber(224,glossary),catchPct:glossaryNumber(225,glossary),yptpa:glossaryNumber(226,glossary),weightedDomRtg:glossaryNumber(227,glossary),domRtg:glossaryNumber(228,glossary),speedScore:glossaryNumber(229,glossary)};return {}}
export function productionAnalyticalDisabled(glossary:GlossaryRows=baseGlossary){return glossaryBool(86,glossary)}
export function preDraftGrade(position:Pos,scouting:number,production:number|null,analytical:number|null,earlyDeclare:boolean|string=false,glossary:GlossaryRows=baseGlossary){
 const early=position==="TE"?String(earlyDeclare)==="yes":earlyDeclare===true||String(earlyDeclare)==="Yes";
 if(productionAnalyticalDisabled(glossary))return scouting+(position==="QB"?0:(early?glossaryNumber(251,glossary):0));
 if(position==="QB"){const a=analytical??scouting;return scouting*glossaryNumber(80,glossary)+a*glossaryNumber(81,glossary)+Math.max(0,a-scouting)*glossaryNumber(76,glossary)}
 const p=production??scouting,a=analytical??scouting;
 const rows=position==="TE"?[88,89,90]:[83,84,85];
 const bonus=Math.min(glossaryNumber(77,glossary),Math.max(0,a-scouting)*glossaryNumber(76,glossary));
 return scouting*glossaryNumber(rows[0],glossary)+p*glossaryNumber(rows[1],glossary)+a*glossaryNumber(rows[2],glossary)+bonus+(early?glossaryNumber(251,glossary):0)
}
export function draftAdjustedFinalGrade(position:Pos,preDraft:number,teamScore:number,draftCapitalScore:number,glossary:GlossaryRows=baseGlossary){const r=position==="QB"?[23,24]:position==="RB"?[26,27]:position==="WR"?[29,30]:[32,33];return preDraft+((teamScore-5)*2*glossaryNumber(r[0],glossary))+((draftCapitalScore-5)*2*glossaryNumber(r[1],glossary))}
function glossaryBool(row:number,glossary:GlossaryRows=baseGlossary){return String(glossary[row-1]?.[1]??"").toUpperCase()==="TRUE"}
export function qbCareerAdjustment(starts:any,attempts:any,ypg:any,glossary:GlossaryRows=baseGlossary){
 if(glossaryBool(123,glossary))return 0;
 const threshold=(v:any,pairs:[number,number][])=>{const x=Number(v);if(!Number.isFinite(x))return 0;let out=0;for(const [min,score] of pairs)if(x>=min)out=score;return out};
 return threshold(starts,[[0,glossaryNumber(112,glossary)],[25,glossaryNumber(113,glossary)],[31,glossaryNumber(114,glossary)]])
  +threshold(attempts,[[700,glossaryNumber(116,glossary)],[850,glossaryNumber(117,glossary)],[1000,glossaryNumber(118,glossary)]])
  +threshold(ypg,[[225,glossaryNumber(120,glossary)],[250,glossaryNumber(121,glossary)],[275,glossaryNumber(122,glossary)]])
}
export function workbookScoutingGrade(position:Pos,grades:number[],fields:Record<string,any>,glossary:GlossaryRows=baseGlossary){
 const watched=Number(fields["Games watched"]||fields["Games Watched"]||0);if(watched<1)return null;
 const base=scoutingWeightedGrade(position,grades,glossary);return base==null?null:base+scoutingAdjustments(position,fields,glossary)+(position==="QB"?qbCareerAdjustment(fields["Career Starts"],fields["Career Attempts"],fields["Career Max YPG"],glossary):0);
}
export const scoutingWeightRows=weightRows;
