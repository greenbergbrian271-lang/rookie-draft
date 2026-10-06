"use client";
import {FormEvent,useEffect,useState} from "react";
import Link from "next/link";
import {ShieldCheck,ShieldX,Link2,Copy} from "lucide-react";

const YEARS=[2022,2023,2024,2025,2026,2027,2028,2029];

export default function AdminPage(){
  const [authenticated,setAuthenticated]=useState(false),[configured,setConfigured]=useState(true),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [shareYears,setShareYears]=useState<number[]>([2026]),[shareDays,setShareDays]=useState(30),[shareTitle,setShareTitle]=useState(""),[shareUrl,setShareUrl]=useState(""),[shareBusy,setShareBusy]=useState(false);
  const check=()=>fetch("/api/auth/status",{cache:"no-store"}).then(r=>r.json()).then(j=>{setAuthenticated(Boolean(j.authenticated));setConfigured(j.configured!==false)}).catch(()=>{});
  useEffect(()=>{void check()},[]);
  async function login(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})}),j=await r.json();if(!r.ok)throw new Error(j.error||"Sign-in failed");setPassword("");setMessage("Owner session unlocked.");await check();window.dispatchEvent(new Event("rookie-draft:auth-changed"));const next=new URLSearchParams(window.location.search).get("next");if(next&&next.startsWith("/"))window.location.href=next}catch(e:any){setMessage(e?.message||"Sign-in failed")}finally{setBusy(false)}}
  async function logout(){setBusy(true);await fetch("/api/auth/logout",{method:"POST"});setAuthenticated(false);setMessage("Owner session locked.");setBusy(false);window.dispatchEvent(new Event("rookie-draft:auth-changed"))}
  function toggleYear(year:number){setShareYears(cur=>cur.includes(year)?cur.filter(x=>x!==year):[...cur,year].sort())}
  async function createShare(){setShareBusy(true);setMessage("");setShareUrl("");try{const r=await fetch("/api/auth/share",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({years:shareYears,days:shareDays,title:shareTitle})}),j=await r.json();if(!r.ok)throw new Error(j.error||"Could not create share link");setShareUrl(j.url)}catch(e:any){setMessage(e?.message||"Could not create share link")}finally{setShareBusy(false)}}
  async function copyShare(){if(!shareUrl)return;await navigator.clipboard.writeText(shareUrl);setMessage("Share link copied.")}

  return <div className="admin-page">
    <div className="page-head"><div><div className="ey">Security</div><h1>Owner Access</h1><p className="muted">The full scouting application is owner-only. Create scoped read-only links when you want to share rankings with someone else.</p></div></div>
    <div className="card admin-card">
      <div className={"admin-shield "+(authenticated?"unlocked":"locked")}>{authenticated?<ShieldCheck size={34}/>:<ShieldX size={34}/>}</div>
      <div><span className="ey">Owner session</span><h2>{authenticated?"Unlocked on this browser":"Sign in required"}</h2><p className="muted">{authenticated?"Your secure owner session stays active for up to 30 days.":"Sign in to open the scouting app or create read-only share links."}</p></div>
      {authenticated?<div className="admin-actions"><Link className="success" href="/">Open app</Link><button className="ghost" disabled={busy} onClick={logout}>Lock session</button></div>:<form onSubmit={login}><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Owner password" disabled={!configured||busy}/><button className="success" disabled={!configured||busy||!password}>{busy?"Signing in…":"Sign in"}</button></form>}
      {!configured&&<div className="notice">Owner authentication has not been configured in the deployment environment.</div>}
      {message&&<div className="notice">{message}</div>}
    </div>
    {authenticated&&<div className="card share-builder">
      <div className="share-builder-head"><div><span className="ey">Read-only sharing</span><h2>Create scoped rankings link</h2><p className="muted">The recipient only sees the draft classes selected below. The shared page has no editing controls and cannot access the rest of the app.</p></div><Link2 size={24}/></div>
      <label className="share-label">Optional title<input value={shareTitle} onChange={e=>setShareTitle(e.target.value)} placeholder="e.g. 2026 Final Rookie Rankings"/></label>
      <div className="share-label">Allowed draft classes<div className="share-years">{YEARS.map(year=><button type="button" key={year} className={shareYears.includes(year)?"active":""} onClick={()=>toggleYear(year)} aria-pressed={shareYears.includes(year)}>{year}</button>)}</div></div>
      <label className="share-label">Link expires<select value={shareDays} onChange={e=>setShareDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
      <button className="success" disabled={shareBusy||!shareYears.length} onClick={createShare}>{shareBusy?"Creating…":"Create read-only link"}</button>
      {shareUrl&&<div className="share-result"><input readOnly value={shareUrl}/><button className="ghost" onClick={copyShare}><Copy size={14}/> Copy</button><a className="ghost" href={shareUrl} target="_blank" rel="noreferrer">Open</a></div>}
    </div>}
  </div>
}
