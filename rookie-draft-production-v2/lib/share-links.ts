import {randomUUID} from "node:crypto";
import {ensureTursoSchema,rows} from "@/lib/turso";
import {createShareToken,verifyShareToken,type ShareScope,type ShareSection} from "@/lib/share-access";

export type ManagedShareLink={
  id:string;title:string;years:number[];sections:ShareSection[];createdAt:string;expiresAt:number;revokedAt:string|null;lastUsedAt:string|null;viewCount:number;
};

function parseArray<T=unknown>(value:unknown,fallback:T[]=[]):T[]{try{const v=JSON.parse(String(value||""));return Array.isArray(v)?v as T[]:fallback}catch{return fallback}}
function fromRow(row:any):ManagedShareLink{return {
  id:String(row.id),title:String(row.title||""),years:parseArray<number>(row.years).map(Number).filter(Number.isFinite),
  sections:parseArray<ShareSection>(row.sections),createdAt:String(row.created_at||""),expiresAt:Number(row.expires_at||0),
  revokedAt:row.revoked_at?String(row.revoked_at):null,lastUsedAt:row.last_used_at?String(row.last_used_at):null,viewCount:Number(row.view_count||0)
}}
export function shareLinkStatus(link:ManagedShareLink){return link.revokedAt?"revoked":link.expiresAt<=Date.now()?"expired":"active"}
export function shareTokenFor(link:ManagedShareLink){return createShareToken({linkId:link.id,years:link.years,expiresAt:link.expiresAt,title:link.title})}

export async function createManagedShareLink(input:{years:number[];expiresAt:number;title?:string}){
  const q=await ensureTursoSchema(),id=randomUUID(),createdAt=new Date().toISOString(),title=String(input.title||"").trim().slice(0,80);
  const sections:ShareSection[]=["rankings","player_cards"],years=[...new Set(input.years.map(Number).filter(y=>Number.isInteger(y)&&y>=2022&&y<=2035))].sort();
  if(!years.length)throw new Error("Choose at least one draft class.");
  await q.execute({sql:"insert into share_links(id,title,years,sections,created_at,expires_at) values(?,?,?,?,?,?)",args:[id,title,JSON.stringify(years),JSON.stringify(sections),createdAt,input.expiresAt]});
  const link:ManagedShareLink={id,title,years,sections,createdAt,expiresAt:input.expiresAt,revokedAt:null,lastUsedAt:null,viewCount:0};
  return {link,token:shareTokenFor(link)};
}

export async function listManagedShareLinks(){
  const q=await ensureTursoSchema();
  return rows(await q.execute("select * from share_links order by created_at desc")).map(fromRow);
}
export async function revokeManagedShareLink(id:string){
  const q=await ensureTursoSchema(),now=new Date().toISOString();
  await q.execute({sql:"update share_links set revoked_at=coalesce(revoked_at,?) where id=?",args:[now,id]});
  const row=rows(await q.execute({sql:"select * from share_links where id=?",args:[id]}))[0];
  return row?fromRow(row):null;
}
export async function resolveManagedShareToken(token:string|null|undefined,{touch=false}:{touch?:boolean}={}):Promise<ShareScope|null>{
  const signed=verifyShareToken(token);
  // Version 1 links predate the link manager and are intentionally retired so every live link is revocable.
  if(!signed||signed.v!==2||!signed.linkId)return null;
  const q=await ensureTursoSchema(),row=rows(await q.execute({sql:"select * from share_links where id=?",args:[signed.linkId]}))[0];
  if(!row)return null;
  const link=fromRow(row);
  if(link.revokedAt||link.expiresAt<=Date.now())return null;
  const years=link.years.filter(y=>signed.years.includes(y));
  const sections=link.sections.filter(x=>signed.sections.includes(x));
  if(!years.length||!sections.includes("rankings"))return null;
  if(touch){
    const now=new Date().toISOString();
    await q.execute({sql:"update share_links set last_used_at=?,view_count=view_count+1 where id=?",args:[now,link.id]});
  }
  return {v:2,linkId:link.id,years,sections,expiresAt:link.expiresAt,title:link.title||undefined};
}
