import {glossaryNumber} from "./scouting-formulas";
export function percentRankInc(values:Array<number|null|undefined>,value:number|null|undefined){
 const a=values.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)).sort((x,y)=>x-y);
 if(value==null||!Number.isFinite(value)||!a.length)return null;if(a.length===1)return value===a[0]?1:null;
 if(value<a[0]||value>a[a.length-1])return null;let lo=0;while(lo<a.length&&a[lo]<value)lo++;
 if(lo<a.length&&a[lo]===value){let hi=lo;while(hi+1<a.length&&a[hi+1]===value)hi++;return ((lo+hi)/2)/(a.length-1)}
 const hi=lo,low=lo-1;return (low+(value-a[low])/(a[hi]-a[low]))/(a.length-1);
}
const pr=(vals:number[],v:number|undefined,inverse=false)=>{const x=percentRankInc(vals,v);return x==null?0:(inverse?1-x:x)*100};
export type CombineInput={bmi?:number,forty?:number,speedScore?:number,broadJump?:number,handSize?:number,vertical?:number,benchReps?:number,weight?:number,heightInches?:number};
export type CombinePopulation={forty:number[],speedScore:number[],broadJump:number[],handSize:number[],vertical:number[],benchReps:number[]};
export function combineGrade(position:"QB"|"RB"|"WR"|"TE",x:CombineInput,p:CombinePopulation){
 const bmi=x.bmi!=null&&x.bmi>=glossaryNumber(254)&&x.bmi<=glossaryNumber(255)?100:0;
 if(position==="QB")return bmi*glossaryNumber(258)+pr(p.forty,x.forty,true)*glossaryNumber(259)+pr(p.speedScore,x.speedScore)*glossaryNumber(260)+pr(p.broadJump,x.broadJump)*glossaryNumber(261);
 if(position==="RB")return bmi*glossaryNumber(263)+pr(p.forty,x.forty,true)*glossaryNumber(264)+pr(p.speedScore,x.speedScore)*glossaryNumber(265)+pr(p.broadJump,x.broadJump)*glossaryNumber(266);
 if(position==="WR")return Math.max(0,bmi*glossaryNumber(268)+pr(p.forty,x.forty,true)*glossaryNumber(270)+pr(p.speedScore,x.speedScore)*glossaryNumber(269)+pr(p.vertical,x.vertical)*glossaryNumber(271)+pr(p.handSize,x.handSize)*glossaryNumber(272)+(x.weight!=null&&x.weight<200?-10:0)+(x.heightInches!=null&&x.heightInches<70?-15:0));
 return bmi*glossaryNumber(274)+pr(p.forty,x.forty)*glossaryNumber(275)+pr(p.speedScore,x.speedScore)*glossaryNumber(276)+pr(p.benchReps,x.benchReps)*glossaryNumber(277)+pr(p.handSize,x.handSize)*glossaryNumber(278)+(x.weight!=null&&x.weight>239&&x.weight<261?7.5:0);
}
