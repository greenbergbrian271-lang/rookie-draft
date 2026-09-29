import {glossaryColumnA,glossaryNumber,productionAnalyticalDisabled,type GlossaryRows} from "./scouting-formulas";
import {percentRankInc} from "./combine-formulas";

export type RBProductionInput={
  scouting:number;
  yardsPerCarry?:number|null;
  yardsPerReception?:number|null;
  yardsPerTouch?:number|null;
  yptp?:number|null;
  recShare?:number|null;
  domRtg?:number|null;
  speedScore?:number|null;
  receptions?:number|null;
  carries?:number|null;
  combineScore?:number|null;
  frSophRushYd?:number|null;
  singleSeasonRec?:number|null;
  careerRec?:number|null;
  isNonFbs?:boolean;
};
export type RBProductionPopulation={
  yardsPerCarry:number[];
  yardsPerReception:number[];
  yardsPerTouch:number[];
  yptp:number[];
  recShare:number[];
  domRtg:number[];
  speedScore:number[];
};
const pct=(values:number[],value:number|null|undefined)=>{
  if(value==null||!Number.isFinite(value))return 0;
  const r=percentRankInc(values,value);
  return r==null?0:r*100;
};
const thresholdBonus=(value:number|null|undefined,glossary:GlossaryRows|undefined)=>{
  if(value==null||!Number.isFinite(value))return 0;
  if(value>=glossaryNumber(158,glossary))return glossaryNumber(161,glossary);
  if(value>=glossaryNumber(157,glossary))return glossaryNumber(160,glossary);
  if(value<=glossaryNumber(156,glossary))return glossaryNumber(159,glossary);
  return 0;
};
const usageBonus=(value:number|null|undefined,glossary:GlossaryRows|undefined)=>{
  if(value==null||!Number.isFinite(value))return 0;
  if(value<=glossaryNumber(155,glossary))return glossaryNumber(161,glossary);
  if(value<=glossaryNumber(154,glossary))return glossaryNumber(160,glossary);
  if(value>=glossaryNumber(153,glossary))return glossaryNumber(159,glossary);
  return 0;
};
export function rbProductionGrade(x:RBProductionInput,p:RBProductionPopulation,glossary?:GlossaryRows){
  if(productionAnalyticalDisabled(glossary))return x.scouting;
  let grade=
    pct(p.yardsPerCarry,x.yardsPerCarry)*glossaryNumber(144,glossary)+
    pct(p.yardsPerReception,x.yardsPerReception)*glossaryNumber(145,glossary)+
    pct(p.yardsPerTouch,x.yardsPerTouch)*glossaryNumber(146,glossary)+
    pct(p.yptp,x.yptp)*glossaryNumber(147,glossary)+
    pct(p.recShare,x.recShare)*glossaryNumber(148,glossary)+
    pct(p.domRtg,x.domRtg)*glossaryNumber(149,glossary)+
    pct(p.speedScore,x.speedScore)*glossaryNumber(150,glossary)+
    thresholdBonus(x.receptions,glossary)+
    usageBonus(x.carries,glossary)+
    (x.combineScore??0)*glossaryNumber(253,glossary)+
    ((x.frSophRushYd??0)>glossaryColumnA(163,glossary)?glossaryNumber(163,glossary):0)+
    ((x.singleSeasonRec??0)>glossaryColumnA(164,glossary)?glossaryNumber(164,glossary):0)+
    ((x.careerRec??0)>glossaryColumnA(165,glossary)?glossaryNumber(165,glossary):0);
  if(x.isNonFbs)grade*=glossaryNumber(78,glossary);
  return grade;
}
