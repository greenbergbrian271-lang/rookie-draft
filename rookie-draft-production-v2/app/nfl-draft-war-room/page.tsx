"use client";
import {useDraftClass} from "@/lib/use-draft-class";

export default function Page(){
  const draftClass=useDraftClass();
  return <div style={{margin:"-26px",height:"calc(100vh - 49px)",minHeight:720,overflow:"hidden",background:"#080b10"}}>
    <iframe key={draftClass} src={"/nfl-draft.html?draftClass="+encodeURIComponent(String(draftClass))} title={draftClass+" NFL Draft"} style={{width:"100%",height:"100%",border:0,display:"block",background:"#080b10"}}/>
  </div>
}
