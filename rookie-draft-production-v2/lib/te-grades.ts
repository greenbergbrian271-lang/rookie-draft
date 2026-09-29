// @ts-nocheck
import {glossaryColumnA,glossaryNumber,productionAnalyticalDisabled,type GlossaryRows} from "./scouting-formulas";
import {percentRankInc} from "./combine-formulas";

export type TEProductionInput={
  scouting:number;
  yardsPerReception?:number|null;
  yardsPerTarget?:number|null;
  targetShare?:number|null;
  catchPct?:number|null;
  yptpa?:number|null;
  weightedDomRtg?:number|null;
  domRtg?:number|null;
  speedScore?:number|null;
  combineScore?:number|null;
  maxYardsPerRec?:number|null;
  isNonFbs?:boolean;
};
export type TEProductionPopulation={
  yardsPerReception:number[];
  yardsPerTarget:number[];
  targetShare:number[];
  catchPct:number[];
  yptpa:number[];
  weightedDomRtg:number[];
  domRtg:number[];
  speedScore:number[];
};

const pct=(values:number[],value:number|null|undefined)=>{
  if(value==null||!Number.isFinite(value))return 0;
  const r=percentRankInc(values,value);
  return r==null?0:r*100;
};
function maxYprBonus(value:number|null|undefined,glossary?:GlossaryRows){
  const x=value==null||!Number.isFinite(value)?0:value;
  let bonus=0;
  for(let row=231;row<=236;row++)if(x>=glossaryColumnA(row,glossary))bonus=glossaryNumber(row,glossary);
  return bonus;
}

export function teProductionGrade(x:TEProductionInput,p:TEProductionPopulation,glossary?:GlossaryRows){
  if(productionAnalyticalDisabled(glossary))return x.scouting;
  let grade=
    pct(p.yardsPerReception,x.yardsPerReception)*glossaryNumber(222,glossary)+
    pct(p.yardsPerTarget,x.yardsPerTarget)*glossaryNumber(223,glossary)+
    pct(p.targetShare,x.targetShare)*glossaryNumber(224,glossary)+
    pct(p.catchPct,x.catchPct)*glossaryNumber(225,glossary)+
    pct(p.yptpa,x.yptpa)*glossaryNumber(226,glossary)+
    pct(p.weightedDomRtg,x.weightedDomRtg)*glossaryNumber(227,glossary)+
    pct(p.domRtg,x.domRtg)*glossaryNumber(228,glossary)+
    pct(p.speedScore,x.speedScore)*glossaryNumber(229,glossary)+
    (x.combineScore??0)*glossaryNumber(253,glossary)+
    (x.speedScore??0)*glossaryNumber(253,glossary)+
    maxYprBonus(x.maxYardsPerRec,glossary);
  if(x.isNonFbs)grade*=glossaryNumber(78,glossary);
  return grade;
}
