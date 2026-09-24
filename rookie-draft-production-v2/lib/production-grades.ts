import {percentRankInc} from "./combine-formulas";
import {glossaryColumnA,glossaryNumber,productionAnalyticalDisabled} from "./scouting-formulas";
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
