"use client";
import {useEffect,useState,type CSSProperties} from "react";

type PlayerLike={id?:string|number;name?:string;headshot_url?:string|null};
export default function PlayerImage({player,fallbackUrl="",className="",initialsClassName="",style,alt=""}:{player:PlayerLike;fallbackUrl?:string;className?:string;initialsClassName?:string;style?:CSSProperties;alt?:string}){
  const [src,setSrc]=useState(String(player?.headshot_url||"")),[fallback,setFallback]=useState(fallbackUrl),[refreshTried,setRefreshTried]=useState(false),[fallbackFailed,setFallbackFailed]=useState(false);
  const initials=String(player?.name||"").split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join("").toUpperCase();
  useEffect(()=>{setSrc(String(player?.headshot_url||""));setFallback(fallbackUrl);setRefreshTried(false);setFallbackFailed(false)},[player?.id,player?.headshot_url,fallbackUrl]);
  async function fail(){
    if(!refreshTried&&player?.id){
      setRefreshTried(true);
      try{const r=await fetch("/api/player-headshot?id="+encodeURIComponent(String(player.id))+"&refresh=1",{cache:"no-store"}),j=await r.json();const next=String(j?.url||""),logo=String(j?.logo||"");if(next&&next!==src){setSrc(next);if(logo)setFallback(logo);return}if(logo&&logo!==src){setSrc("");setFallback(logo);return}}catch{}
    }
    if(fallback&&fallback!==src&&!fallbackFailed){setSrc("");return}
    setSrc("");setFallbackFailed(true);
  }
  if(src)return <img src={src} alt={alt} className={className} style={style} onError={()=>void fail()}/>;
  if(fallback&&!fallbackFailed)return <img src={fallback} alt={alt} className={className} style={style} onError={()=>setFallbackFailed(true)}/>;
  return <span className={initialsClassName||className} style={style} aria-label={alt||String(player?.name||"Player")}>{initials||"—"}</span>;
}
