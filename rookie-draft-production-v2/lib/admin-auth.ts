import {createHash,createHmac,timingSafeEqual} from "node:crypto";

export const ADMIN_COOKIE="rookie_draft_admin";
const SESSION_SECONDS=60*60*24*30;

function secret(){return String(process.env.ROOKIE_DRAFT_AUTH_SECRET||"")}
function password(){return String(process.env.ROOKIE_DRAFT_ADMIN_PASSWORD||"")}
function sign(payload:string){const key=secret();return key?createHmac("sha256",key).update(payload).digest("base64url"):""}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}

export function authConfigured(){return Boolean(secret()&&password())}
export function verifyAdminPassword(candidate:string){
  const expected=password();
  if(!expected||!candidate)return false;
  const a=createHash("sha256").update(candidate).digest("hex");
  const b=createHash("sha256").update(expected).digest("hex");
  return safeEqual(a,b);
}
export function createAdminToken(){const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS,payload="v1."+expires;return payload+"."+sign(payload)}
export function verifyAdminToken(token?:string|null){
  if(!token||!secret())return false;
  const [version,expiresRaw,signature]=token.split(".");
  if(version!=="v1"||!expiresRaw||!signature)return false;
  const expires=Number(expiresRaw);
  if(!Number.isFinite(expires)||expires<=Math.floor(Date.now()/1000))return false;
  const payload=version+"."+expiresRaw,expected=sign(payload);
  return Boolean(expected&&safeEqual(signature,expected));
}
export const adminCookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,path:"/",maxAge:SESSION_SECONDS};
