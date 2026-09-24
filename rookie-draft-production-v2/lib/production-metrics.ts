export type TeamStats={rushYards?:number|null,rushTDs?:number|null,passYards?:number|null,passTDs?:number|null,completions?:number|null,passAttempts?:number|null,plays?:number|null,airYards?:number|null};
const n=(v:any)=>{const x=typeof v==="string"?Number(v.replace("%","")):Number(v);return Number.isFinite(x)?x:null};const div=(a:any,b:any)=>{const x=n(a),y=n(b);return x==null||y==null||y===0?null:x/y};
export function productionMetrics(pos:"QB"|"RB"|"WR"|"TE",r:Record<string,any>,t:TeamStats={}){
 if(pos==="QB")return {rushYdsPerAtt:div(r["Rush Yards"],r["Rush Attempts"]),rushYardShare:div(r["Rush Yards"],t.rushYards)};
 if(pos==="RB"){const rush=n(r["Rush Yards"]),rec=n(r["Rec Yards"]??r["Receiving Yards"]),rtd=n(r["Rush Touchdowns"]),retd=n(r["Rec TDs"]??r["Receiving TDs"]);return {yptp:t.plays?((rush||0)+(rec||0))/t.plays:null,recShare:div(r.Receptions,t.completions),domRtg:t.rushYards&&t.passYards&&t.rushTDs&&t.passTDs?((((rush||0)+(rec||0))/(t.rushYards+t.passYards))+(((rtd||0)+(retd||0))/(t.rushTDs+t.passTDs)))/2:null,targetShare:div(r.Targets,t.passAttempts)}}
 const yards=n(r.Yards),td=n(r.Touchdowns),air=pos==="TE"&&yards!=null?yards-(n(r.YAC)||0):n(r["Air Yards"]);
 return {targetsPerRoute:div(r.Targets,r.Routes),firstDownsPerRoute:div(r["1st Downs"],r.Routes),yptpa:div(yards,t.passAttempts),weightedDomRtg:t.passYards&&t.passTDs?((yards||0)/t.passYards)*.8+((td||0)/t.passTDs)*.2:null,domRtg:t.passYards&&t.passTDs?(((yards||0)/t.passYards)+((td||0)/t.passTDs))/2:null,targetShare:div(r.Targets,t.passAttempts),airYardShare:div(air,t.airYards)};
}
