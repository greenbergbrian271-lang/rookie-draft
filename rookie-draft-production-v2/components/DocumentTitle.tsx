"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
const TITLES:Record<string,string>={"/":"Scouting Command Center","/players-to-scout":"Players to Scout","/game-notes":"Game Notes","/watch-list":"Watch List","/scouting":"Scouting","/final-draft-board":"Final Draft Board","/draft-day":"Draft Day","/scouting-glossary":"Scouting Glossary","/nfl-draft-war-room":"NFL Draft War Room","/colleges":"Colleges + Stats","/all-star-games":"College All-Star Games","/player-data":"Player Data","/dynasty-rosters":"Dynasty Rosters","/integrations":"Integrations","/data-center":"Data Center","/historical":"Historical Rankings","/admin":"Admin Access"};
export default function DocumentTitle(){const path=usePathname();useEffect(()=>{document.title=(TITLES[path]||"Rookie Draft")+" · Rookie Draft"},[path]);return null}
