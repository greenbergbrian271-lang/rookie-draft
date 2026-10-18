"use client";
import {useNflPlayerCard} from "@/components/NflPlayerCard";

/** Clickable player name that opens the NFL player card (Dynasty Rosters, League Intelligence, War Room). */
export default function NflPlayerName({name,position,team,sleeperId,className}:{name:string;position?:string;team?:string;sleeperId?:string;className?:string}){
  const {openNflPlayer}=useNflPlayerCard();
  return <button type="button" className={"player-name-link "+(className||"")} onClick={e=>{e.stopPropagation();openNflPlayer({name,position,team,sleeperId})}}>{name}</button>;
}
