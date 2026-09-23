"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
const nav=[["/","Home"],["/players-to-scout","Players to Scout"],["/scouting","Scouting"],["/post-game-review","Post-Game Review"],["/final-draft-board","Final Draft Board"],["/data-center","Data Center"],["/historical","Historical Rankings"]];
export default function Nav(){const path=usePathname();return <nav className="nav">{nav.map(([h,l])=><Link className={path===h?"active":""} key={h} href={h}>{l}</Link>)}</nav>}
