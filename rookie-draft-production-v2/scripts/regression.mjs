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
  ["app/api/grades/explain/route.ts",/buildBoardGradeRows/,"Explain Grade uses centralized grade engine"],
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

const base=String(process.env.ROOKIE_DRAFT_TEST_BASE_URL||"").replace(/\\/$/,"");
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
