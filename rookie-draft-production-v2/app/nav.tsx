"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
const groups=[
  {label:"Scout",links:[["/","Home"],["/players-to-scout","Players to Scout"],["/game-notes","Game Notes"],["/watch-list","Watch List"],["/scouting","Scouting"]]},
  {label:"Evaluate",links:[["/final-draft-board","Final Draft Board"],["/historical","Historical Rankings"],["/scouting-glossary","Scouting Glossary"],["/colleges","Colleges + Stats"],["/all-star-games","College All-Star Games"],["/player-data","Player Data"]]},
  {label:"Draft",links:[["/draft-day","Draft Day"],["/nfl-draft-war-room","NFL Draft War Room"],["/dynasty-rosters","Dynasty Rosters"]]},
  {label:"Data & Settings",links:[["/integrations","Integrations"],["/data-center","Data Center"],["/data-health","Data Health"],["/admin","Admin Access"]]}
] as const;
export default function Nav(){const path=usePathname();return <nav className="nav" aria-label="Primary">{groups.map(group=><div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.links.map(([href,label])=><Link className={path===href||(href!=="/"&&path.startsWith(href+"/"))?"active":""} key={href} href={href}>{label}</Link>)}</div>)}</nav>}
