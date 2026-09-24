import {glossaryNumber,productionAnalyticalDisabled} from "./scouting-formulas";
const avg=(...v:Array<number|null|undefined>)=>{const a=v.filter((x):x is number=>typeof x==="number"&&Number.isFinite(x));return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
const term=(v:number|null,w:number)=>v==null?null:v*100*w;
const sum=(parts:Array<number|null>,fallback:number)=>parts.some(v=>v==null)?fallback:parts.reduce((s,v)=>s+(v||0),0);
export function qbAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>){
 if(productionAnalyticalDisabled())return scouting;
 const g=sum([
 term(avg(r.AS,r.BE,r.AT,r.AU,r.AV),glossaryNumber(93)+glossaryNumber(95)),
 term(avg(r.AW,r.AX),glossaryNumber(97)),
 term(avg(r.BA,r.BB,r.BC,r.BD),glossaryNumber(99)),
 term(avg(r.BD,r.BF,r.BG,r.BH,r.BI,r.BJ,r.BO,r.BP),glossaryNumber(101)+glossaryNumber(103)+glossaryNumber(109)),
 term(avg(r.BK,r.BL,r.BM,r.BN,r.BG),glossaryNumber(105)),
 term(avg(r.AY,r.AZ),glossaryNumber(107))
 ],scouting);return g+(Number(r.pressureToSack||0)>.22?-5:0);
}
export function rbAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>){
 if(productionAnalyticalDisabled())return scouting;return sum([
 term(avg(r.BA),glossaryNumber(128)+glossaryNumber(126)/3),
 term(avg(r.BB,r.BC),glossaryNumber(130)),
 term(avg(r.BD,r.BE,r.BF),glossaryNumber(132)+glossaryNumber(126)/3),
 term(avg(r.BG,r.BH),glossaryNumber(134)),
 term(avg(r.BI,r.BJ),glossaryNumber(136)+glossaryNumber(138)+glossaryNumber(126)/3),
 term(avg(r.BK,r.BL,r.BM,r.BN,r.BO),glossaryNumber(140)),
 term(avg(r.BP),glossaryNumber(142))
 ],scouting);
}
export function wrAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>,lowAdotHighContested=false){
 if(productionAnalyticalDisabled())return scouting;const g=sum([
 term(avg(r.AV,r.AW),glossaryNumber(168)),
 term(avg(r.AX,r.AY,r.AZ,r.BA,r.BB,r.BC,r.BD,r.BE),glossaryNumber(170)),
 term(avg(r.BG,r.BH),glossaryNumber(172)),
 term(avg(r.BF,r.BI,r.BJ,r.BK),glossaryNumber(174)),
 term(avg(r.AW,r.BL,r.BG),glossaryNumber(176)+glossaryNumber(178)),
 term(avg(r.BM),glossaryNumber(180))
 ],scouting);return g-(lowAdotHighContested?glossaryNumber(205):0);
}
export function teAnalyticalGrade(scouting:number,r:Record<string,number|null|undefined>){
 if(productionAnalyticalDisabled())return scouting;return sum([
 term(avg(r.AU,r.AV),glossaryNumber(208)),
 term(avg(r.AW,r.AX,r.AY,r.AZ,r.BA,r.BB),glossaryNumber(210)),
 term(avg(r.BK,r.BL),glossaryNumber(212)),
 term(avg(r.BC,r.BD,r.BF),glossaryNumber(214)),
 term(avg(r.AV,r.BG),glossaryNumber(216)+glossaryNumber(218)),
 term(avg(r.BE,r.BH,r.BI,r.BJ),glossaryNumber(220))
 ],scouting);
}
