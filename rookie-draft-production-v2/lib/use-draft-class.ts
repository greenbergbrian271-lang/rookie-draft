"use client";
import {useEffect,useState} from "react";

export const DEFAULT_DRAFT_CLASS=2027;
export type DraftClassStatePayload={activeDraftClass:number;lockedDraftClasses:number[]};

const valid=(value:unknown,fallback=DEFAULT_DRAFT_CLASS)=>{
  const n=Number(value);
  return Number.isInteger(n)&&n>=2000&&n<=2100?n:fallback;
};
const normalizeLocked=(value:unknown)=>Array.isArray(value)?value.map(Number).filter(n=>Number.isInteger(n)&&n>=2000&&n<=2100):[];

export function setDraftClass(year:number){
  if(typeof window==="undefined")return;
  const next=valid(year);
  localStorage.setItem("rookie-draft.class",String(next));
  window.dispatchEvent(new CustomEvent("rookie-class",{detail:String(next)}));
}

export function useDraftClassState(){
  const [state,setState]=useState({draftClass:DEFAULT_DRAFT_CLASS,activeDraftClass:DEFAULT_DRAFT_CLASS,lockedDraftClasses:[] as number[],loading:true});
  useEffect(()=>{
    let alive=true;
    const selectForActive=(active:number,force=false)=>{
      const savedActive=localStorage.getItem("rookie-draft.active-default");
      const savedClass=localStorage.getItem("rookie-draft.class");
      const shouldReset=force||!savedClass||savedActive!==String(active);
      const selected=shouldReset?active:valid(savedClass,active);
      if(shouldReset)localStorage.setItem("rookie-draft.class",String(selected));
      localStorage.setItem("rookie-draft.active-default",String(active));
      return selected;
    };
    const apply=(payload:Partial<DraftClassStatePayload>,forceDefault=false)=>{
      if(!alive)return;
      setState(cur=>{
        const active=valid(payload.activeDraftClass,cur.activeDraftClass);
        const locked=payload.lockedDraftClasses?normalizeLocked(payload.lockedDraftClasses):cur.lockedDraftClasses;
        const draftClass=selectForActive(active,forceDefault);
        return {draftClass,activeDraftClass:active,lockedDraftClasses:locked,loading:false};
      });
    };
    const onClass=(event:Event)=>setState(cur=>{
      const draftClass=valid((event as CustomEvent).detail??localStorage.getItem("rookie-draft.class"),cur.activeDraftClass);
      return {...cur,draftClass};
    });
    const onState=(event:Event)=>{
      const payload=(event as CustomEvent).detail as Partial<DraftClassStatePayload>|undefined;
      if(payload)apply(payload,true);
    };
    window.addEventListener("rookie-class",onClass as EventListener);
    window.addEventListener("rookie-class-state",onState as EventListener);
    fetch("/api/draft-class",{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error("Draft class state unavailable");
      apply(await response.json());
    }).catch(()=>{
      if(!alive)return;
      const active=valid(localStorage.getItem("rookie-draft.active-default"),DEFAULT_DRAFT_CLASS);
      setState(cur=>({...cur,draftClass:valid(localStorage.getItem("rookie-draft.class"),active),activeDraftClass:active,loading:false}));
    });
    return()=>{alive=false;window.removeEventListener("rookie-class",onClass as EventListener);window.removeEventListener("rookie-class-state",onState as EventListener)};
  },[]);
  return {...state,isLocked:state.lockedDraftClasses.includes(state.draftClass)};
}

export function useDraftClass(){
  return useDraftClassState().draftClass;
}
