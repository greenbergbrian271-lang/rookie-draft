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
export function productionWeights(position:Pos){if(position==="RB")return {yardsPerCarry:glossaryNumber(145),yardsPerReception:glossaryNumber(146),yardsPerTouch:glossaryNumber(147),yptp:glossaryNumber(148),recShare:glossaryNumber(149),domRtg:glossaryNumber(150),speedScore:glossaryNumber(151)};if(position==="WR")return {yardsPerReception:glossaryNumber(182),yardsPerTarget:glossaryNumber(183),targetShare:glossaryNumber(184),catchPct:glossaryNumber(185),yptpa:glossaryNumber(186),weightedDomRtg:glossaryNumber(187),domRtg:glossaryNumber(188),speedScore:1-[182,183,184,185,186,187,188].reduce((s,r)=>s+glossaryNumber(r),0)};if(position==="TE")return {yardsPerReception:glossaryNumber(222),yardsPerTarget:glossaryNumber(223),targetShare:glossaryNumber(224),catchPct:glossaryNumber(225),yptpa:glossaryNumber(226),weightedDomRtg:glossaryNumber(227),domRtg:glossaryNumber(228),speedScore:1-[222,223,224,225,226,227,228].reduce((s,r)=>s+glossaryNumber(r),0)};return {}}
export function productionAnalyticalDisabled(){return glossaryBool(86)}
export function preDraftGrade(position:Pos,scouting:number,production:number|null,analytical:number|null,earlyDeclare=false){
 if(productionAnalyticalDisabled())return scouting+(position==="QB"?0:(earlyDeclare?glossaryNumber(251):0));
 if(position==="QB"){const a=analytical??scouting;return scouting*glossaryNumber(80)+a*glossaryNumber(81)+Math.max(0,a-scouting)*glossaryNumber(76)}
 const p=production??scouting,a=analytical??scouting;
 const weightRows=position==="TE"?[88,89,90]:[83,84,85];
 const bonus=Math.min(glossaryNumber(77),Math.max(0,a-scouting)*glossaryNumber(76));
 return scouting*glossaryNumber(weightRows[0])+p*glossaryNumber(weightRows[1])+a*glossaryNumber(weightRows[2])+bonus+(earlyDeclare?glossaryNumber(251):0)
}
export function draftAdjustedFinalGrade(position:Pos,preDraft:number,teamScore:number,draftCapitalScore:number){const r=position==="QB"?[23,24]:position==="RB"?[26,27]:position==="WR"?[29,30]:[32,33];return preDraft+((teamScore-5)*2*glossaryNumber(r[0]))+((draftCapitalScore-5)*2*glossaryNumber(r[1]))}
function threshold(value:number,steps:[number,number][],fallback=0){let out=fallback;for(const [min,adj] of steps)if(value>=min)out=adj;return out}
function glossaryBool(row:number){return String((w.glossary as any[])[row-1]?.[1]??"").toUpperCase()==="TRUE"}
\nexport function qbCareerAdjustment(fields:Record<string,any>){if(glossaryBool(123))return 0;const starts=Number(fields["Career Starts"]||0),attempts=Number(fields["Career Attempts"]||0),ypg=Number(fields["Career Max YPG"]||0);return threshold(starts,[[0,glossaryNumber(112)],[25,glossaryNumber(113)],[31,glossaryNumber(114)]])+threshold(attempts,[[0,glossaryNumber(116)],[700,glossaryNumber(116)],[850,glossaryNumber(117)],[1000,glossaryNumber(118)]])+threshold(ypg,[[0,glossaryNumber(120)],[225,glossaryNumber(120)],[250,glossaryNumber(121)],[275,glossaryNumber(122)]])}\nexport function workbookScoutingGrade(position:Pos,grades:number[],fields:Record<string,any>){
 const watched=Number(fields["Games watched"]||0);if(watched<1)return null;
 const base=scoutingWeightedGrade(position,grades);return base==null?null:base+scoutingAdjustments(position,fields)+(position==="QB"?qbCareerAdjustment(fields):0);
}
export const scoutingWeightRows=rows;
