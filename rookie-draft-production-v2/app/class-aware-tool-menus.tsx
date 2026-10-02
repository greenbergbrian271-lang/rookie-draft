"use client";
import ToolMenus from "./tool-menus";
import {isHistoricalDraftClass} from "@/lib/historical-archive";
import {useDraftClass} from "@/lib/use-draft-class";
export default function ClassAwareToolMenus(){const draftClass=useDraftClass();if(!isHistoricalDraftClass(draftClass))return <ToolMenus/>;return <div className="tool-menubar" style={{padding:"9px 18px",gap:10,alignItems:"center"}}><span className="status cloud">● Historical snapshot</span><span className="muted" style={{fontSize:11}}>The {draftClass} archive is read-only. Switch to 2027+ to use GM, Scouting and Sheet tools.</span></div>}