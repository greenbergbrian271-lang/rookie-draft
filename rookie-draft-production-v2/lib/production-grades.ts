import {percentRankInc} from "./combine-formulas";
import {glossaryColumnA,glossaryNumber,productionAnalyticalDisabled} from "./scouting-formulas";
import {workbookReference as w} from "./workbook-reference";
const pct=(a:number[],v:number|null|undefined)=>{const p=percentRankInc(a,v);return p==null?0:p*100};
const raw=(carries:number,receptions:number)=>{
 let carry=0,rec=0;
 if(carries>=glossaryNumber(153))carry=glossaryNumber(159);else if(carries<=glossaryNumber(155))carry=glossaryNumber(161);else if(carries<=glossaryNumber(154))carry=glossaryNumber(160);
 if(receptions>=glossaryNumber(158))rec=glossaryNumber(161);else if(receptions>=glossaryNumber(157))rec=glossaryNumber(160);else if(receptions<=glossaryNumber(156))rec=glossaryNumber(159);
 return carry+rec;
};
export type RBProductionInput={scoutingGrade:number,yardsPerCarry?:number,yardsPerReception?:number,yardsPerTouch?:number,yptp?:number,recShare?:number,domRtg?:number,speedScore?:number,carries?:number,receptions?:number,combineGrade?:number,frSophRushYards?:number,singleSeasonReceptions?:number,careerReceptions?:number,isFbs?:boolean};
export type RBProductionPopulation={yardsPerCarry:number[],yardsPerReception:number[],yardsPerTouch:number[],yptp:number[],recShare:number[],domRtg:number[],speedScore:number[]};
export function rbProductionGrade(x:RBProductionInput,p:RBProductionPopulation){
 if(productionAnalyticalDisabled())return x.scoutingGrade;
 let g=pct(p.yardsPerCarry,x.yardsPerCarry)*glossaryNumber(144)+pct(p.yardsPerReception,x.yardsPerReception)*glossaryNumber(145)+pct(p.yardsPerTouch,x.yardsPerTouch)*glossaryNumber(146)+pct(p.yptp,x.yptp)*glossaryNumber(147)+pct(p.recShare,x.recShare)*glossaryNumber(148)+pct(p.domRtg,x.domRtg)*glossaryNumber(149)+pct(p.speedScore,x.speedScore)*glossaryNumber(150);
 g+=raw(Number(x.carries||0),Number(x.receptions||0));
 g+=(x.combineGrade||0)*glossaryNumber(253);
 if((x.frSophRushYards||0)>glossaryColumnA(163))g+=glossaryNumber(163);
 if((x.singleSeasonReceptions||0)>glossaryColumnA(164))g+=glossaryNumber(164);
 if((x.careerReceptions||0)>glossaryColumnA(165))g+=glossaryNumber(165);
 return x.isFbs===false?g*glossaryNumber(78):g;
}

export type ReceiverProductionInput={scoutingGrade:number,yardsPerReception?:number,yardsPerTarget?:number,targetShare?:number,catchPct?:number,yptpa?:number,weightedDomRtg?:number,domRtg?:number,speedScore?:number,combineGrade?:number,careerYards?:number,careerTDs?:number,maxYardsPerRec?:number,isFbs?:boolean};
export type ReceiverProductionPopulation={yardsPerReception:number[],yardsPerTarget:number[],targetShare:number[],catchPct:number[],yptpa:number[],weightedDomRtg:number[],domRtg:number[],speedScore:number[]};
function lookupGlossary(value:number|undefined,start:number,end:number){if(value==null||!Number.isFinite(value))return 0;let out=0;for(let row=start;row<=end;row++){const min=glossaryColumnA(row);if(value>=min)out=glossaryNumber(row)}return out}
export function receiverProductionGrade(position:"WR"|"TE",x:ReceiverProductionInput,p:ReceiverProductionPopulation){
 if(productionAnalyticalDisabled())return x.scoutingGrade;
 const wr=position==="WR",base=wr?182:222;
 let g=pct(p.yardsPerReception,x.yardsPerReception)*glossaryNumber(base)+pct(p.yardsPerTarget,x.yardsPerTarget)*glossaryNumber(base+1)+pct(p.targetShare,x.targetShare)*glossaryNumber(base+2)+pct(p.catchPct,x.catchPct)*glossaryNumber(base+3)+pct(p.yptpa,x.yptpa)*glossaryNumber(base+4)+pct(p.weightedDomRtg,x.weightedDomRtg)*glossaryNumber(base+5)+pct(p.domRtg,x.domRtg)*glossaryNumber(base+6)+pct(p.speedScore,x.speedScore)*glossaryNumber(base+7);
 g+=(x.combineGrade||0)*glossaryNumber(253);
 // Preserve the live sheet's additional Speed Score × B253 term.
 g+=(x.speedScore||0)*glossaryNumber(253);
 if(wr){if(!String((w.glossary as any[])[202]?.[1]??"").toUpperCase().includes("TRUE"))g+=lookupGlossary(x.careerYards,192,197)+lookupGlossary(x.careerTDs,199,202)}
 else g+=lookupGlossary(x.maxYardsPerRec,231,236);
 return x.isFbs===false?g*glossaryNumber(78):g;
}
