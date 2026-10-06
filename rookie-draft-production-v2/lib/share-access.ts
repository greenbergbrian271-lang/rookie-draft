import {createHmac,timingSafeEqual} from "node:crypto";

export type ShareSection="rankings"|"player_cards";
export type ShareScope={v:1|2;linkId?:string;years:number[];sections:ShareSection[];expiresAt:number;title?:string};

function secret(){return String(process.env.ROOKIE_DRAFT_AUTH_SECRET||"")}
function signature(body:string){const key=secret();return key?createHmac("sha256",key).update(body).digest("base64url"):""}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
function cleanYears(input:unknown){return [...new Set((Array.isArray(input)?input:[]).map(Number).filter(y=>Number.isInteger(y)&&y>=2022&&y<=2035))].sort()}

export function createShareToken(input:{linkId:string;years:number[];expiresAt:number;title?:string}){
  const years=cleanYears(input.years);
  if(!years.length)throw new Error("Choose at least one draft class.");
  const scope:ShareScope={v:2,linkId:String(input.linkId),years,sections:["rankings","player_cards"],expiresAt:input.expiresAt,title:String(input.title||"").trim().slice(0,80)||undefined};
  const body=Buffer.from(JSON.stringify(scope),"utf8").toString("base64url");
  return body+"."+signature(body);
}
export function verifyShareToken(token:string|null|undefined):ShareScope|null{
  if(!token||!secret())return null;
  const [body,sig,...rest]=String(token).split(".");
  if(!body||!sig||rest.length)return null;
  const expected=signature(body);
  if(!expected||!safeEqual(sig,expected))return null;
  try{
    const scope=JSON.parse(Buffer.from(body,"base64url").toString("utf8")) as ShareScope;
    if(scope?.v!==1&&scope?.v!==2)return null;
    const years=cleanYears(scope.years);
    if(!years.length||!Array.isArray(scope.sections)||!scope.sections.includes("rankings"))return null;
    if(scope.v===2&&!String(scope.linkId||"").trim())return null;
    if(!Number.isFinite(scope.expiresAt)||scope.expiresAt<=Date.now())return null;
    return {...scope,years};
  }catch{return null}
}
