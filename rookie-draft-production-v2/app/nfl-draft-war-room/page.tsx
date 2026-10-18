"use client";
import {useDraftClass} from "@/lib/use-draft-class";

export default function Page(){
  const draftClass=useDraftClass();
  return <div className="nfl-war-room-frame">
    <iframe key={draftClass} src={"/nfl-draft.html?draftClass="+encodeURIComponent(String(draftClass))} title={draftClass+" NFL Draft"} className="nfl-war-room-iframe"/>
  </div>
}
