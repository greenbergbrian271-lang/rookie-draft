import {glossaryNumber,productionAnalyticalDisabled,type GlossaryRows} from "./scouting-formulas";
const avg=(...v:Array<number|null|undefined>)=>{const a=v.filter((x):x is number=>typeof x==="number"&&Number.isFinite(x));return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
const term=(v:number|null,w:number)=>v==null?null:v*100*w;
const sum=(parts:Array<number|null>,fallback:number)=>parts.some(v=>v==null)?fallback:parts.reduce<number>((s,v)=>s+(v||0),0);
export function qbAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>,glossary?:GlossaryRows){
 if(productionAnalyticalDisabled(glossary))return scouting;
 const g=sum([
 term(avg(r.AS,r.BE,r.AT,r.AU,r.AV),glossaryNumber(93,glossary)+glossaryNumber(95,glossary)),
 term(avg(r.AW,r.AX),glossaryNumber(97,glossary)),
 term(avg(r.BA,r.BB,r.BC,r.BD),glossaryNumber(99,glossary)),
 term(avg(r.BD,r.BF,r.BG,r.BH,r.BI,r.BJ,r.BO,r.BP),glossaryNumber(101,glossary)+glossaryNumber(103,glossary)+glossaryNumber(109,glossary)),
 term(avg(r.BK,r.BL,r.BM,r.BN,r.BG),glossaryNumber(105,glossary)),
 term(avg(r.AY,r.AZ),glossaryNumber(107,glossary))
 ],scouting);return g+(Number(r.pressureToSack||0)>.22?-5:0);
}
export function rbAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>,glossary?:GlossaryRows){
 if(productionAnalyticalDisabled(glossary))return scouting;return sum([
 term(avg(r.BA),glossaryNumber(128,glossary)+glossaryNumber(126,glossary)/3),
 term(avg(r.BB,r.BC),glossaryNumber(130,glossary)),
 term(avg(r.BD,r.BE,r.BF),glossaryNumber(132,glossary)+glossaryNumber(126,glossary)/3),
 term(avg(r.BG,r.BH),glossaryNumber(134,glossary)),
 term(avg(r.BI,r.BJ),glossaryNumber(136,glossary)+glossaryNumber(138,glossary)+glossaryNumber(126,glossary)/3),
 term(avg(r.BK,r.BL,r.BM,r.BN,r.BO),glossaryNumber(140,glossary)),
 term(avg(r.BP),glossaryNumber(142,glossary))
 ],scouting);
}
export function wrAnalyticalGrade(scouting:number|null,r:Record<string,number|null|undefined>,lowAdotHighContested=false,glossary?:GlossaryRows){
 const fallback=scouting??0;if(productionAnalyticalDisabled(glossary))return scouting;
 const g=sum([
 term(avg(r.dropPct??r.AV,r.catchTrafficPct??r.AW),glossaryNumber(168,glossary)),
 term(avg(r.firstDowns??r.AX,r.firstDownsPerTarget??r.AY,r.targetsPerRoute??r.AZ,r.firstDownsPerRoute??r.BA,r.yrr??r.BB,r.yrrMan??r.BC,r.yrrZone??r.BD,r.contestedPct??r.BE),glossaryNumber(170,glossary)),
 term(avg(r.yacPerRec??r.BG,r.mtfs??r.BH),glossaryNumber(172,glossary)),
 term(avg(r.airYardsPct??r.BF,r.yardsPerRec??r.BI,r.adot??r.BJ,r.screenPct??r.BK),glossaryNumber(174,glossary)),
 term(avg(r.catchTrafficPct??r.AW,r.catchesInTraffic??r.BL,r.yacPerRec??r.BG),glossaryNumber(176,glossary)+glossaryNumber(178,glossary)),
 term(avg(r.runBlockGrade??r.BM),glossaryNumber(180,glossary))
 ],fallback);return g-(lowAdotHighContested?glossaryNumber(205,glossary):0);
}
export function teAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>,glossary?:GlossaryRows){
 if(productionAnalyticalDisabled(glossary))return scouting;return sum([
 term(avg(r.AU,r.AV),glossaryNumber(208,glossary)),
 term(avg(r.AW,r.AX,r.AY,r.AZ,r.BA,r.BB),glossaryNumber(210,glossary)),
 term(avg(r.BK,r.BL),glossaryNumber(212,glossary)),
 term(avg(r.BC,r.BD,r.BF),glossaryNumber(214,glossary)),
 term(avg(r.AV,r.BG),glossaryNumber(216,glossary)+glossaryNumber(218,glossary)),
 term(avg(r.BE,r.BH,r.BI,r.BJ),glossaryNumber(220,glossary))
 ],scouting);
}
