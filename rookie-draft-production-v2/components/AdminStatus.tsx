"use client";
import Link from "next/link";
import {LockKeyhole,ShieldCheck} from "lucide-react";
import {useEffect,useState} from "react";
export default function AdminStatus(){
  const [ok,setOk]=useState<boolean|null>(null);
  const check=()=>fetch("/api/auth/status",{cache:"no-store"}).then(r=>r.json()).then(j=>setOk(Boolean(j.authenticated))).catch(()=>setOk(false));
  useEffect(()=>{void check();const fn=()=>void check();window.addEventListener("rookie-draft:auth-changed",fn);window.addEventListener("focus",fn);return()=>{window.removeEventListener("rookie-draft:auth-changed",fn);window.removeEventListener("focus",fn)}},[]);
  return <Link className={"admin-status "+(ok?"unlocked":"locked")} href="/admin" title={ok?"Admin writes unlocked":"Admin writes locked"}>{ok?<ShieldCheck size={14}/>:<LockKeyhole size={14}/>}<span>{ok?"Admin unlocked":ok===null?"Checking access…":"Admin locked"}</span></Link>
}
