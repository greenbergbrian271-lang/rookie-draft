"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef,useState} from "react";
const groups=[
  {label:"Scout",links:[["/players-to-scout","Players to Scout"],["/game-notes","Game Notes"],["/watch-list","Watch List"],["/scouting","Scouting"]]},
  {label:"Evaluate",links:[["/final-draft-board","Final Draft Board"],["/historical","Historical Rankings"],["/scouting-glossary","Scouting Glossary"],["/colleges","Colleges + Stats"],["/all-star-games","College All-Star Games"],["/player-data","Player Data"],["/comps-database","Comps Database"]]},
  {label:"Draft",links:[["/draft-day","Draft Day"],["/nfl-draft-war-room","NFL Draft War Room"],["/dynasty-rosters","Dynasty Rosters"],["/league-intelligence","League Intelligence"]]},
  {label:"In-Season Management",links:[["/in-season-management","Overview"],["/in-season-management/lineups","Lineups & Matchups"],["/in-season-management/league-overview","League Overview"],["/in-season-management/waivers","Waivers & Guillotine"],["/in-season-management/players","Player Intelligence"],["/in-season-management/managers","Manager Cards"]]},
  {label:"Data & Settings",links:[["/integrations","Integrations"],["/data-center","Data Center"],["/data-health","Data Health"],["/admin","Admin Access"]]}
] as const;
// Short labels so all five sections fit in the single mobile toolbar row.
const SHORT:Record<string,string>={"Scout":"Scout","Evaluate":"Eval","Draft":"Draft","In-Season Management":"Season","Data & Settings":"Data"};
const allHrefs=groups.flatMap(g=>g.links.map(l=>l[0] as string));
// Longest matching href wins, so "Overview" is not highlighted while on a deeper In-Season page.
const currentHref=(path:string)=>allHrefs.filter(h=>path===h||path.startsWith(h+"/")).sort((a,b)=>b.length-a.length)[0]||"";
export default function Nav(){
  const path=usePathname();
  return <nav className="nav nav-desktop" aria-label="Primary">{groups.map(group=><div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.links.map(([href,label])=><Link className={path===href||path.startsWith(href+"/")?"active":""} key={href} href={href}>{label}</Link>)}</div>)}</nav>;
}
/** Mobile-only section dropdowns. Rendered inside the tool menubar, between Refresh and the GM/Scouting/Sheet menus. */
export function MobileSections(){
  const path=usePathname(),[open,setOpen]=useState<string|null>(null),box=useRef<HTMLDivElement>(null),here=currentHref(path),openGroup=groups.find(g=>g.label===open);
  useEffect(()=>{setOpen(null)},[path]);
  useEffect(()=>{const closeFromTools=()=>setOpen(null);window.addEventListener("close-section-menus",closeFromTools);return()=>window.removeEventListener("close-section-menus",closeFromTools)},[]);
  useEffect(()=>{
    if(!open)return;
    const away=(e:Event)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(null)},esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(null)};
    document.addEventListener("mousedown",away);document.addEventListener("touchstart",away);document.addEventListener("keydown",esc);
    return()=>{document.removeEventListener("mousedown",away);document.removeEventListener("touchstart",away);document.removeEventListener("keydown",esc)};
  },[open]);
  return <div className="nav-mobile" ref={box} role="group" aria-label="Sections">
    {groups.map(group=>{const current=group.links.some(([href])=>href===here);return <button type="button" key={group.label} className={"nav-mobile-btn"+(open===group.label?" open":"")+(current?" current":"")} aria-haspopup="menu" aria-expanded={open===group.label} aria-label={group.label} onClick={()=>{window.dispatchEvent(new Event("close-tool-menus"));setOpen(open===group.label?null:group.label)}}>{SHORT[group.label]||group.label}</button>})}
    {openGroup&&<div className="nav-mobile-panel" role="menu" aria-label={openGroup.label}><div className="nav-mobile-panel-title">{openGroup.label}</div>{openGroup.links.map(([href,label])=><Link role="menuitem" key={href} href={href} className={href===here?"active":""} aria-current={href===here?"page":undefined}>{label}</Link>)}</div>}
  </div>;
}
