"use client";

/** NFL / NCAA switch shown at the very top of both player cards. */
export default function NflModeToggle({mode,showNcaa=true,onNfl,onNcaa}:{mode:"nfl"|"ncaa";showNcaa?:boolean;onNfl:()=>void;onNcaa:()=>void}){
  if(!showNcaa)return null;
  return <div className="mode-toggle" role="tablist" aria-label="Player card view">
    <button type="button" role="tab" aria-selected={mode==="nfl"} className={mode==="nfl"?"active":""} onClick={onNfl}>
      <img src="/nfl-logos/nfl.svg" alt="" onError={e=>{e.currentTarget.style.display="none"}}/><span>NFL</span>
    </button>
    <button type="button" role="tab" aria-selected={mode==="ncaa"} className={mode==="ncaa"?"active":""} onClick={onNcaa}>
      <img src="/ncaa-logo.svg" alt="" onError={e=>{e.currentTarget.style.display="none"}}/><span>NCAA</span>
    </button>
    <style jsx global>{`
      .mode-toggle{display:inline-flex;gap:4px;padding:4px;margin:14px 0 0 16px;background:#06101f;border:1px solid #29476e;border-radius:999px;position:relative;z-index:2}
      .mode-toggle button{display:inline-flex;align-items:center;gap:7px;padding:5px 14px 5px 8px;border-radius:999px;border:1px solid transparent;background:transparent;color:#8aa3c4;font-size:12px;font-weight:800;letter-spacing:.04em}
      .mode-toggle button img{width:22px;height:22px;object-fit:contain}
      .mode-toggle button.active{background:#173253;border-color:#31577f;color:#fff;box-shadow:inset 0 0 0 1px rgba(32,226,221,.18)}
    `}</style>
  </div>;
}
