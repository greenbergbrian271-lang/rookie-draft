import {glossaryNumber,type GlossaryRows} from "./scouting-formulas";
export function percentRankInc(values:Array<number|null|undefined>,value:number|null|undefined,significance=3){
 const a=values.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)).sort((x,y)=>x-y);
 if(value==null||!Number.isFinite(value)||!a.length)return null;if(a.length===1)return value===a[0]?1:null;
 if(value<a[0]||value>a[a.length-1])return null;let lo=0;while(lo<a.length&&a[lo]<value)lo++;
 let out:number;
 // Google Sheets / Excel PERCENTRANK.INC returns the lower rank for an exact tied value.
 if(lo<a.length&&a[lo]===value)out=lo/(a.length-1);
 else{const hi=lo,low=lo-1;out=(low+(value-a[low])/(a[hi]-a[low]))/(a.length-1)}
 return Number(out.toFixed(significance));
}
const pr=(vals:number[],v:number|undefined,inverse=false)=>{const x=percentRankInc(vals,v);return x==null?0:(inverse?1-x:x)*100};
export type CombineInput={bmi?:number,forty?:number,speedScore?:number,broadJump?:number,handSize?:number,vertical?:number,benchReps?:number,weight?:number,heightInches?:number};
export type CombinePopulation={forty:number[],speedScore:number[],broadJump:number[],handSize:number[],vertical:number[],benchReps:number[]};
export function combineGrade(position:"QB"|"RB"|"WR"|"TE",x:CombineInput,p:CombinePopulation,glossary?:GlossaryRows){
 const bmi=x.bmi!=null&&x.bmi>=glossaryNumber(254,glossary)&&x.bmi<=glossaryNumber(255,glossary)?100:0;
 if(position==="QB")return bmi*glossaryNumber(258,glossary)+pr(p.forty,x.forty,true)*glossaryNumber(259,glossary)+pr(p.speedScore,x.speedScore)*glossaryNumber(260,glossary)+pr(p.broadJump,x.broadJump)*glossaryNumber(261,glossary);
 if(position==="RB")return bmi*glossaryNumber(263,glossary)+pr(p.forty,x.forty,true)*glossaryNumber(264,glossary)+pr(p.speedScore,x.speedScore)*glossaryNumber(265,glossary)+pr(p.broadJump,x.broadJump)*glossaryNumber(266,glossary);
 if(position==="WR")return Math.max(0,bmi*glossaryNumber(268,glossary)+pr(p.handSize,x.handSize)*glossaryNumber(269,glossary)+pr(p.forty,x.forty,true)*glossaryNumber(270,glossary)+pr(p.speedScore,x.speedScore)*glossaryNumber(271,glossary)+pr(p.vertical,x.vertical)*glossaryNumber(272,glossary)+(x.weight!=null&&x.weight<200?-10:0)+(x.heightInches!=null&&x.heightInches<70?-15:0));
 return bmi*glossaryNumber(274,glossary)+pr(p.handSize,x.handSize)*glossaryNumber(275,glossary)+pr(p.forty,x.forty)*glossaryNumber(276,glossary)+pr(p.speedScore,x.speedScore)*glossaryNumber(277,glossary)+pr(p.benchReps,x.benchReps)*glossaryNumber(278,glossary)+(x.weight!=null&&x.weight>239&&x.weight<261?7.5:0);
}
