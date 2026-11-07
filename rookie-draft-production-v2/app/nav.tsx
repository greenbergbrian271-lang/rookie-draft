"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef,useState} from "react";
import {ChevronDown} from "lucide-react";
const groups=[
  {label:"Scout",links:[["/players-to-scout","Players to Scout"],["/game-notes","Game Notes"],["/watch-list","Watch List"],["/scouting","Scouting"]]},
  {label:"Evaluate",links:[["/final-draft-board","Final Draft Board"],["/historical","Historical Rankings"],["/scouting-glossary","Scouting Glossary"],["/colleges","Colleges + Stats"],["/all-star-games","College All-Star Games"],["/player-data","Player Data"],["/comps-database","Comps Database"]]},
  {label:"Draft",links:[["/draft-day","Draft Day"],["/nfl-draft-war-room","NFL Draft War Room"],["/dynasty-rosters","Dynasty Rosters"],["/league-intelligence","League Intelligence"]]},
  {label:"In-Season Management",links:[["/in-season-management","Overview"],["/in-season-management/lineups","Lineups & Matchups"],["/in-season-management/league-overview","League Overview"],["/in-season-management/waivers","Waivers & Guillotine"],["/in-season-management/players","Player Intelligence"],["/in-season-management/managers","Manager Cards"]]},
  {label:"Data & Settings",links:[["/integrations","Integrations"],["/data-center","Data Center"],["/data-health","Data Health"],["/admin","Admin Access"]]}
] as const;
// Short labels so all five sections fit on one row of a phone.
const SHORT:Record<string,string>={"In-Season Management":"In-Season","Data & Settings":"Data"};
const allHrefs=groups.flatMap(g=>g.links.map(l=>l[0] as string));
// Longest matching href wins, so "Overview" is not highlighted while on a deeper In-Season page.
const currentHref=(path:string)=>allHrefs.filter(h=>path===h||path.startsWith(h+"/")).sort((a,b)=>b.length-a.length)[0]||"";
export default function Nav(){
  const path=usePathname(),[open,setOpen]=useState<string|null>(null),box=useRef<HTMLElement>(null),here=currentHref(path),openGroup=groups.find(g=>g.label===open);
  useEffect(()=>{setOpen(null)},[path]);
  useEffect(()=>{
    if(!open)return;
    const away=(e:Event)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(null)},esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(null)};
    document.addEventListener("mousedown",away);document.addEventListener("touchstart",away);document.addEventListener("keydown",esc);
    return()=>{document.removeEventListener("mousedown",away);document.removeEventListener("touchstart",away);document.removeEventListener("keydown",esc)};
  },[open]);
  return <>
    <nav className="nav nav-desktop" aria-label="Primary">{groups.map(group=><div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.links.map(([href,label])=><Link className={path===href||path.startsWith(href+"/")?"active":""} key={href} href={href}>{label}</Link>)}</div>)}</nav>
    <nav className="nav-mobile" aria-label="Primary" ref={box}>
      <div className="nav-mobile-bar">{groups.map(group=>{const current=group.links.some(([href])=>href===here);return <button type="button" key={group.label} className={"nav-mobile-btn"+(open===group.label?" open":"")+(current?" current":"")} aria-haspopup="menu" aria-expanded={open===group.label} aria-label={group.label} onClick={()=>setOpen(open===group.label?null:group.label)}><span>{SHORT[group.label]||group.label}</span><ChevronDown size={12} strokeWidth={2.6} aria-hidden="true"/></button>})}</div>
      {openGroup&&<div className="nav-mobile-panel" role="menu" aria-label={openGroup.label}><div className="nav-mobile-panel-title">{openGroup.label}</div>{openGroup.links.map(([href,label])=><Link role="menuitem" key={href} href={href} className={href===here?"active":""} aria-current={href===here?"page":undefined}>{label}</Link>)}</div>}
    </nav>
  </>;
}
