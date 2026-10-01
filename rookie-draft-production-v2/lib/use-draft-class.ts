"use client";
import {useEffect,useState} from "react";

export const DEFAULT_DRAFT_CLASS=2027;
const valid=(value:unknown)=>{
  const n=Number(value);
  return Number.isInteger(n)&&n>=2000&&n<=2100?n:DEFAULT_DRAFT_CLASS;
};

export function setDraftClass(year:number){
  if(typeof window==="undefined")return;
  const next=valid(year);
  localStorage.setItem("rookie-draft.class",String(next));
  window.dispatchEvent(new CustomEvent("rookie-class",{detail:String(next)}));
}

export function useDraftClass(){
  const [draftClass,setCurrent]=useState(DEFAULT_DRAFT_CLASS);
  useEffect(()=>{
    const read=()=>setCurrent(valid(localStorage.getItem("rookie-draft.class")||DEFAULT_DRAFT_CLASS));
    const onClass=(event:Event)=>setCurrent(valid((event as CustomEvent).detail??localStorage.getItem("rookie-draft.class")));
    read();
    window.addEventListener("rookie-class",onClass as EventListener);
    return()=>window.removeEventListener("rookie-class",onClass as EventListener);
  },[]);
  return draftClass;
}
