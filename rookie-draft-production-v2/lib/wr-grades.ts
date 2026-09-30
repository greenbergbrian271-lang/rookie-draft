// @ts-nocheck
import {glossaryColumnA,glossaryNumber,productionAnalyticalDisabled,type GlossaryRows} from "./scouting-formulas";
import {percentRankInc} from "./combine-formulas";

export type WRProductionInput={
  scouting:number|null;
  yardsPerReception?:number|null;
  yardsPerTarget?:number|null;
  targetShare?:number|null;
  catchPct?:number|null;
  yptpa?:number|null;
  weightedDomRtg?:number|null;
  domRtg?:number|null;
  speedScore?:number|null;
  combineScore?:number|null;
  maxFrSophYards?:number|null;
  maxFrSophTds?:number|null;
  isNonFbs?:boolean;
};
export type WRProductionPopulation={
  yardsPerReception:number[];
  yardsPerTarget:number[];
  targetShare:number[];
  catchPct:number[];
  yptpa:number[];
  weightedDomRtg:number[];
  domRtg:number[];
  speedScore:number[];
};
const rank=(values:number[],value:number|null|undefined)=>{
  if(value==null||!Number.isFinite(value))return null;
  const r=percentRankInc(values,value,3);
  return r==null?null:r*100;
};
const boolAt=(row:number,g?:GlossaryRows)=>String(g?.[row-1]?.[1]??"").toUpperCase()==="TRUE";
const approxLookup=(value:number|null|undefined,rows:number[],g?:GlossaryRows)=>{
  if(value==null||!Number.isFinite(value))return 0;
  let out=0,matched=false;
  for(const row of rows){
    const threshold=glossaryColumnA(row,g);
    if(value>=threshold){out=glossaryNumber(row,g);matched=true}
  }
  return matched?out:0;
};

export function wrProductionGrade(x:WRProductionInput,p:WRProductionPopulation,g?:GlossaryRows){
  if(productionAnalyticalDisabled(g))return x.scouting;
  const core=[
    [rank(p.yardsPerReception,x.yardsPerReception),glossaryNumber(182,g)],
    [rank(p.yardsPerTarget,x.yardsPerTarget),glossaryNumber(183,g)],
    [rank(p.targetShare,x.targetShare),glossaryNumber(184,g)],
    [rank(p.catchPct,x.catchPct),glossaryNumber(185,g)],
    [rank(p.weightedDomRtg,x.weightedDomRtg),glossaryNumber(186,g)],
    [rank(p.yptpa,x.yptpa),glossaryNumber(187,g)],
    [rank(p.domRtg,x.domRtg),glossaryNumber(188,g)]
  ] as const;
  // Workbook's outer IFERROR covers the seven core percentiles. Speed Score has its own IFERROR(...,0).
  let weighted=core.some(([v])=>v==null)?0:core.reduce((s,[v,w])=>s+(v||0)*w,0);
  weighted+=(rank(p.speedScore,x.speedScore)??0)*glossaryNumber(189,g);
  weighted+=(x.combineScore??0)*glossaryNumber(253,g);
  // The live sheet then adds raw Speed Score * the combine/pro-day multiplier outside that block.
  weighted+=(x.speedScore??0)*glossaryNumber(253,g);
  if(!boolAt(203,g)){
    weighted+=approxLookup(x.maxFrSophYards,[192,193,194,195,196,197],g);
    weighted+=approxLookup(x.maxFrSophTds,[199,200,201,202],g);
  }
  if(x.isNonFbs)weighted*=glossaryNumber(78,g);
  return weighted;
}
