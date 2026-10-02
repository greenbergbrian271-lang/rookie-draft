"use client";
import {usePathname} from "next/navigation";
import {isHistoricalDraftClass} from "@/lib/historical-archive";
import {useDraftClass} from "@/lib/use-draft-class";
import {HistoricalClassOverview,HistoricalDraftDay,HistoricalFinalBoard,HistoricalPlayers,HistoricalScouting,HistoricalUnavailable} from "@/components/HistoricalArchiveViews";

const unavailable:Record<string,string>={"/game-notes":"Game Notes","/watch-list":"Watch List","/all-star-games":"College All-Star Games","/player-data":"Player Data","/nfl-draft-war-room":"NFL Draft War Room","/colleges":"Colleges + Stats","/historical":"Historical Rankings"};
export default function ClassContextGate({children}:{children:React.ReactNode}){const path=usePathname(),draftClass=useDraftClass();if(!isHistoricalDraftClass(draftClass))return <>{children}</>;if(path==="/")return <HistoricalClassOverview draftClass={draftClass}/>;if(path==="/players-to-scout")return <HistoricalPlayers draftClass={draftClass}/>;if(path==="/scouting")return <HistoricalScouting draftClass={draftClass}/>;if(path==="/final-draft-board")return <HistoricalFinalBoard draftClass={draftClass}/>;if(path==="/draft-day"||path==="/draft-day-board")return <HistoricalDraftDay draftClass={draftClass}/>;if(unavailable[path])return <HistoricalUnavailable draftClass={draftClass} title={unavailable[path]}/>;return <>{children}</>}