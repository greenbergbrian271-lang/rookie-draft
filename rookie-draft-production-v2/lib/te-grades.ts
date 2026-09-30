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
export type TEProductionPercentiles={
  yardsPerReception:number;
  yardsPerTarget:number;
  targetShare:number;
  catchPct:number;
  yptpa:number;
  weightedDomRtg:number;
  domRtg:number;
  speedScore:number;
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
  if(value==null||!Number.isFinite(value))return 0;
  const x=value;
  let bonus=0;
  for(let row=231;row<=236;row++)if(x>=glossaryColumnA(row,glossary))bonus=glossaryNumber(row,glossary);
  return bonus;
}

export function teProductionGrade(x:TEProductionInput,p:TEProductionPopulation,glossary?:GlossaryRows,percentiles?:Partial<TEProductionPercentiles>){
  if(productionAnalyticalDisabled(glossary))return x.scouting;
  const rank=(key:keyof TEProductionPercentiles,values:number[],value:number|null|undefined)=>percentiles?.[key]!=null?Number(percentiles[key])*100:pct(values,value);
  let grade=
    rank("yardsPerReception",p.yardsPerReception,x.yardsPerReception)*glossaryNumber(222,glossary)+
    rank("yardsPerTarget",p.yardsPerTarget,x.yardsPerTarget)*glossaryNumber(223,glossary)+
    rank("targetShare",p.targetShare,x.targetShare)*glossaryNumber(224,glossary)+
    rank("catchPct",p.catchPct,x.catchPct)*glossaryNumber(225,glossary)+
    rank("weightedDomRtg",p.weightedDomRtg,x.weightedDomRtg)*glossaryNumber(226,glossary)+
    rank("yptpa",p.yptpa,x.yptpa)*glossaryNumber(227,glossary)+
    rank("domRtg",p.domRtg,x.domRtg)*glossaryNumber(228,glossary)+
    rank("speedScore",p.speedScore,x.speedScore)*glossaryNumber(229,glossary)+
    (x.combineScore??0)*glossaryNumber(253,glossary)+
    (x.speedScore??0)*glossaryNumber(253,glossary)+
    maxYprBonus(x.maxYardsPerRec,glossary);
  if(x.isNonFbs)grade*=glossaryNumber(78,glossary);
  return grade;
}
