"use client";
import {FormEvent,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ShieldCheck,ShieldX,Link2,Copy,ExternalLink,Trash2} from "lucide-react";

const YEARS=[2022,2023,2024,2025,2026,2027,2028,2029];
type ShareLink={id:string;title:string;years:number[];createdAt:string;expiresAt:number;revokedAt:string|null;lastUsedAt:string|null;viewCount:number;status:"active"|"expired"|"revoked";url:string};

function when(value:string|number|null|undefined){if(!value)return "Never";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString([],{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}

export default function AdminPage(){
  const [authenticated,setAuthenticated]=useState(false),[configured,setConfigured]=useState(true),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [shareYears,setShareYears]=useState<number[]>([2026]),[shareDays,setShareDays]=useState(30),[shareTitle,setShareTitle]=useState(""),[shareUrl,setShareUrl]=useState(""),[shareBusy,setShareBusy]=useState(false);
  const [links,setLinks]=useState<ShareLink[]>([]),[linksBusy,setLinksBusy]=useState(false);
  const check=()=>fetch("/api/auth/status",{cache:"no-store"}).then(r=>r.json()).then(j=>{setAuthenticated(Boolean(j.authenticated));setConfigured(j.configured!==false)}).catch(()=>{});
  const loadLinks=async()=>{setLinksBusy(true);try{const r=await fetch("/api/auth/share",{cache:"no-store"}),j=await r.json();if(r.ok)setLinks(Array.isArray(j.links)?j.links:[])}finally{setLinksBusy(false)}};
  useEffect(()=>{void check()},[]);
  useEffect(()=>{if(authenticated)void loadLinks()},[authenticated]);
  async function login(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})}),j=await r.json();if(!r.ok)throw new Error(j.error||"Sign-in failed");setPassword("");setMessage("Owner session unlocked.");await check();window.dispatchEvent(new Event("rookie-draft:auth-changed"));const next=new URLSearchParams(window.location.search).get("next");if(next&&next.startsWith("/"))window.location.href=next}catch(e:any){setMessage(e?.message||"Sign-in failed")}finally{setBusy(false)}}
  async function logout(){setBusy(true);await fetch("/api/auth/logout",{method:"POST"});setAuthenticated(false);setLinks([]);setMessage("Owner session locked.");setBusy(false);window.dispatchEvent(new Event("rookie-draft:auth-changed"))}
  function toggleYear(year:number){setShareYears(cur=>cur.includes(year)?cur.filter(x=>x!==year):[...cur,year].sort())}
  async function createShare(){setShareBusy(true);setMessage("");setShareUrl("");try{const r=await fetch("/api/auth/share",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({years:shareYears,days:shareDays,title:shareTitle})}),j=await r.json();if(!r.ok)throw new Error(j.error||"Could not create share link");setShareUrl(j.url);await loadLinks()}catch(e:any){setMessage(e?.message||"Could not create share link")}finally{setShareBusy(false)}}
  async function copyUrl(url:string){await navigator.clipboard.writeText(url);setMessage("Share link copied.")}
  async function revoke(link:ShareLink){if(!window.confirm("Revoke this share link now? Anyone using it will immediately lose access."))return;setLinksBusy(true);setMessage("");try{const r=await fetch("/api/auth/share?id="+encodeURIComponent(link.id),{method:"DELETE"}),j=await r.json();if(!r.ok)throw new Error(j.error||"Could not revoke link");setMessage("Share link revoked.");await loadLinks()}catch(e:any){setMessage(e?.message||"Could not revoke link");setLinksBusy(false)}}
  const counts=useMemo(()=>links.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a},{active:0,expired:0,revoked:0} as Record<string,number>),[links]);

  return <div className="admin-page">
    <div className="page-head"><div><div className="ey">Security</div><h1>Owner Access</h1><p className="muted">The full scouting application is owner-only. Create and manage scoped read-only links when you want to share rankings and player cards.</p></div></div>
    <div className="card admin-card">
      <div className={"admin-shield "+(authenticated?"unlocked":"locked")}>{authenticated?<ShieldCheck size={34}/>:<ShieldX size={34}/>}</div>
      <div><span className="ey">Owner session</span><h2>{authenticated?"Unlocked on this browser":"Sign in required"}</h2><p className="muted">{authenticated?"Your secure owner session stays active for up to 30 days.":"Sign in to open the scouting app or manage read-only share links."}</p></div>
      {authenticated?<div className="admin-actions"><Link className="success" href="/">Open app</Link><button className="ghost" disabled={busy} onClick={logout}>Lock session</button></div>:<form onSubmit={login}><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Owner password" disabled={!configured||busy}/><button className="success" disabled={!configured||busy||!password}>{busy?"Signing in…":"Sign in"}</button></form>}
      {!configured&&<div className="notice">Owner authentication has not been configured in the deployment environment.</div>}
      {message&&<div className="notice">{message}</div>}
    </div>

    {authenticated&&<div className="card share-builder">
      <div className="share-builder-head"><div><span className="ey">Read-only sharing</span><h2>Create scoped rankings link</h2><p className="muted">Recipients can view only the draft classes selected below and can click prospect names to open read-only player cards. They cannot edit data or access scouting tools.</p></div><Link2 size={24}/></div>
      <label className="share-label">Optional title<input value={shareTitle} onChange={e=>setShareTitle(e.target.value)} placeholder="e.g. 2026 Final Rookie Rankings"/></label>
      <div className="share-label">Allowed draft classes<div className="share-years">{YEARS.map(year=><button type="button" key={year} className={shareYears.includes(year)?"active":""} onClick={()=>toggleYear(year)} aria-pressed={shareYears.includes(year)}>{year}</button>)}</div></div>
      <label className="share-label">Link expires<select value={shareDays} onChange={e=>setShareDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
      <button className="success" disabled={shareBusy||!shareYears.length} onClick={createShare}>{shareBusy?"Creating…":"Create read-only link"}</button>
      {shareUrl&&<div className="share-result"><input readOnly value={shareUrl}/><button className="ghost" onClick={()=>copyUrl(shareUrl)}><Copy size={14}/> Copy</button><a className="ghost" href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open</a></div>}
    </div>}

    {authenticated&&<div className="card share-manager">
      <div className="share-manager-head"><div><span className="ey">Link manager</span><h2>Links in circulation</h2><p className="muted">See every managed share link, when it expires, when it was last opened, and revoke access immediately.</p></div><div className="share-counts"><span><b>{counts.active}</b> Active</span><span><b>{counts.expired}</b> Expired</span><span><b>{counts.revoked}</b> Revoked</span></div></div>
      {linksBusy&&!links.length?<div className="empty">Loading share links…</div>:links.length?<div className="share-link-list">{links.map(link=><article className={"share-link-row "+link.status} key={link.id}>
        <div className="share-link-main"><div className="share-link-title"><strong>{link.title||"Untitled rankings link"}</strong><span className={"share-status "+link.status}>{link.status}</span></div><div className="share-link-years">{link.years.map(y=><b key={y}>{y}</b>)}</div></div>
        <div className="share-link-meta"><span>Created<strong>{when(link.createdAt)}</strong></span><span>Expires<strong>{when(link.expiresAt)}</strong></span><span>Last viewed<strong>{when(link.lastUsedAt)}{link.viewCount?" · "+link.viewCount+" view"+(link.viewCount===1?"":"s"):""}</strong></span></div>
        <div className="share-link-actions">{link.status==="active"&&<><button className="ghost" onClick={()=>copyUrl(link.url)}><Copy size={14}/> Copy</button><a className="ghost" href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open</a><button className="danger-ghost" disabled={linksBusy} onClick={()=>revoke(link)}><Trash2 size={14}/> Revoke</button></>}</div>
      </article>)}</div>:<div className="empty">No managed share links yet. Create one above when you are ready to share a board.</div>}
      <div className="share-manager-note">Links created before this manager is deployed are intentionally retired so that every working share link appears here and can be revoked.</div>
    </div>}
  </div>
}
