import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const checks=[
  ["proxy.ts",/Cross-site write blocked/,"same-origin write protection"],
  ["proxy.ts",/Owner authentication required/,"owner authentication protection"],
  ["lib/turso.ts",/create table if not exists audit_log/i,"audit schema"],
  ["lib/turso.ts",/create table if not exists draft_class_context/i,"draft-class season context schema"],
  ["lib/turso.ts",/create table if not exists player_identity_aliases/i,"canonical identity schema"],
  ["lib/turso.ts",/player_uid/i,"stable player UID"],
  ["app/api/data-health/route.ts",/buildBoardGradeRows/,"data health uses centralized grade engine"],
  ["components/PlayerImage.tsx",/player-headshot/,"resilient player image fallback"],
  ["lib/player-comps.ts",/draft capital is NOT a matching feature/,"player comps never match on draft capital"],
  ["lib/player-comps.ts",/e\.draftClass<t\.draftClass/,"player comps only use earlier classes"],
  ["app/scouting-glossary/page.tsx",/<CompWeightsPanel\/>/,"comp weights editor on the scouting glossary"],
  ["app/api/player-comps/weights/route.ts",/Weights must add up to 100%/,"comp weights validated to 100%"],
  ["lib/player-comps.ts",/MISSING_PRIOR/,"comps shrink thin candidates instead of letting them win on fewer features"],
  ["lib/player-comps.ts",/allCompProfiles/,"analytics-only comp profiles feed the comp pool"],
  ["lib/comp-profiles/index.ts",/compProfiles2025/,"2025 analytics-only profiles registered"],
  ["lib/comp-profiles/index.ts",/compProfiles2024/,"2024 analytics-only profiles registered"],
  ["lib/comp-profiles/index.ts",/compProfiles2023/,"2023 analytics-only profiles registered"],
  ["lib/comp-profiles/index.ts",/compProfiles2022/,"2022 analytics-only profiles registered"],
  ["lib/comp-profiles/overlays/index.ts",/compOverlays2022/,"2022 analytics overlay registered (comp-only)"],
  ["lib/player-comps.ts",/overlayIndex/,"comp overlays fill missing labels without overriding site data"],
  ["components/PlayerComps.tsx",/Analytics-only profile/,"analytics-only comps are labeled on the card"],
  ["app/nav.tsx",/\/comps-database/,"Comps Database in the navigation"],
  ["app/comps-database/page.tsx",/<CompsDatabase\/>/,"Comps Database page"],
  ["app/api/comps-database/matches/route.ts",/buildMatches/,"comps database: all possible comps for a player"],
  ["lib/player-comps.ts",/export function findCompsForKey/,"comps for players already in the pool"],
  ["lib/comp-outcomes.ts",/pass_yd:\.04.*rec:1/,"player comp outcomes score standard PPR"],
  ["app/api/player-comps/route.ts",/saveOverride/,"player comp pin/exclude overrides"],
  ["components/PlayerProfile.tsx",/tab==="Pro Comps"&&<div className="profile-pane"><PlayerComps/,"Pro Comps tab on the player card"],
  ["app/globals.css",/Player card: contain everything except the tab bar/,"player card mobile containment (only the tab bar scrolls sideways)"],
  ["components/PlayerProfile.tsx",/profile-tabs button\.active/,"active card tab scrolls into view"],
  ["components/PlayerComps.tsx",/sleepercdn\.com\/content\/nfl\/players/,"NFL headshots next to each comp"],
  ["app/scouting/QBScoutingWorkspace.tsx",/tab==="Comps"&&<PlayerComps/,"player comps tab in QB scouting"],
  ["app/scouting/RBScoutingWorkspace.tsx",/tab==="Comps"&&<PlayerComps/,"player comps tab in RB scouting"],
  ["app/scouting/WRScoutingWorkspace.tsx",/tab==="Comps"&&<PlayerComps/,"player comps tab in WR scouting"],
  ["app/scouting/TEScoutingWorkspace.tsx",/tab==="Comps"&&<PlayerComps/,"player comps tab in TE scouting"],
  ["components/NextInQueueSection.tsx",/Next in Queue by Position/,"homepage next-in-queue section"],
  ["app/page.tsx",/NextInQueueSection/,"homepage renders next-in-queue section"],
  ["app/page.tsx",/Refresh Schedule/,"homepage has live schedule refresh control"],
  ["app/api/college-football/route.ts",/fresh\?null:await cacheGet/,"college-football refresh bypasses schedule cache"],
  ["app/api/college-football/route.ts",/rankings=fresh\?null:await cacheGet/,"college-football refresh bypasses rankings cache"],
  ["components/PlayerProfile.tsx",/Timeline/,"prospect timeline tab"],
  ["components/PlayerProfile.tsx",/Refresh Summary/,"AI summary freshness control"],
  ["app/api/player-profile/route.ts",/buildTimeline/,"player profile timeline backend"],
  ["app/api/player-profile/route.ts",/refresh-summary/,"AI summary refresh backend"],
  ["app/api/data-health/route.ts",/provisional-scouting-grade/,"data health flags provisional zero-game scouting grades"],
  ["app/api/grades/explain/route.ts",/buildBoardGradeRows/,"Explain Grade uses centralized grade engine"],
  ["app/api/grades/explain/route.ts",/Zero-game fallback/,"Explain Grade documents universal zero-game fallback"],
  ["app/scouting/QBScoutingWorkspace.tsx",/zeroGamesOnly/,"QB scouting has zero-games filter"],
  ["app/scouting/RBScoutingWorkspace.tsx",/zeroGamesOnly/,"RB scouting has zero-games filter"],
  ["app/scouting/WRScoutingWorkspace.tsx",/zeroGamesOnly/,"WR scouting has zero-games filter"],
  ["app/scouting/TEScoutingWorkspace.tsx",/zeroGamesOnly/,"TE scouting has zero-games filter"],
  ["app/scouting/ScoutingShared.tsx",/ExplainGradeButton/,"Explain Grade is available on scouting player cards"],
  ["app/scouting/page.tsx",/playerId/,"Scouting supports direct player deep links"],
  ["app/data-health/page.tsx",/Open in Scouting/,"Data Health links issues to scouting players"],
  ["app/api/evaluations/route.ts",/recordAudit/,"evaluation audit"],
  ["app/api/players/route.ts",/syncPlayerIdentity/,"player identity synchronization"],
  ["app/api/players/archive/route.ts",/archive_player/,"archive undo support"],
  ["app/api/draft-class/route.ts",/draft_class_transition/,"draft-class transition undo support"],
  ["app/api/pff-process/route.ts",/player_id/,"PFF canonical player linkage"],
  ["app/api/pff-process/route.ts",/setDraftClassAnalysisSeason/,"PFF analysis-season assignment"],
  ["components/PlayerProfile.tsx",/Explain Grade/,"Explain Grade UI"],
  ["app/nav.tsx",/data-health/,"Data Health navigation"]
];

let passed=0;
for(const [path,re,label] of checks){
  const source=await read(path);
  assert.match(source,re,label+" is missing from "+path);
  passed++;
}

const rawBase=String(process.env.ROOKIE_DRAFT_TEST_BASE_URL||"");
const base=rawBase.endsWith("/")?rawBase.slice(0,-1):rawBase;
if(base){
  const gets=[
    ["/api/auth/status",200],
    ["/api/draft-class",200],
    ["/api/players",200],
    ["/api/grades?draftClass=2027",200],
    ["/api/data-health?draftClass=2027",200],
    ["/data-health",200]
  ];
  for(const [path,status] of gets){
    const response=await fetch(base+path,{redirect:"manual"});
    assert.equal(response.status,status,path+" expected "+status+", got "+response.status);
    passed++;
  }
  const write=await fetch(base+"/api/workflow-tags",{method:"POST",headers:{"content-type":"application/json","origin":"https://example.invalid"},body:JSON.stringify({playerId:0,tag:"REGRESSION_TEST"})});
  assert.ok([401,403].includes(write.status),"unauthenticated/cross-site write must be rejected, got "+write.status);
  passed++;
}
console.log("Regression checks passed: "+passed+(base?" (including HTTP smoke tests)":""));
