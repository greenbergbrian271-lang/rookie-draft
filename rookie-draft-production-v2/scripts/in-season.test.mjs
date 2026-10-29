import assert from "node:assert/strict";
import {buildAlerts,buildLineup,buildRootingGuide,buildStandings,byeSlots,findMine,sortLeagues} from "../lib/in-season.ts";

const player=(id,position,over={})=>({id,name:"P"+id,position,team:"BUF",status:"Active",injuryStatus:"",...over});
const team=(rosterId,wins,losses,pf,over={})=>({rosterId,owner:"owner"+rosterId,players:["1"],starters:[],points:pf,pointsAgainst:pf-10,maxPoints:pf+100,wins,losses,ties:0,waiverBudget:null,...over});

// league ordering: Dynasty, Redraft, Guillotine; eliminated last within a type
const order=sortLeagues([
  {type:"Guillotine",eliminated:false,name:"G"},{type:"Redraft",eliminated:false,name:"R"},
  {type:"Dynasty",eliminated:true,name:"D2"},{type:"Dynasty",eliminated:false,name:"D1"},{type:"Guillotine",eliminated:true,name:"G2"},
]).map(l=>l.name);
assert.deepEqual(order,["D1","D2","R","G","G2"]);

// bye slots follow bracket size
assert.deepEqual([4,5,6,7,8,12].map(byeSlots),[0,3,2,1,0,4]);

// standings expose PF / PA / Max PF and sort by record then PF
const league={id:"L",type:"Dynasty",eliminated:false,ok:true,name:"League",status:"in_season",week:7,playoffTeams:2,rosterPositions:["QB","RB","FLEX","BN","BN"],fetchedAt:"",
  teams:[team("1",5,2,700,{isMine:true}),team("2",6,1,650),team("3",2,5,500),team("4",2,5,520)],
  windows:{"1":{classification:"Contender",windowScore:80,powerRank:1},"2":{classification:"Stuck in the Middle",windowScore:50,powerRank:2}},
  matchups:[{rosterId:"1",matchupId:1,points:0},{rosterId:"3",matchupId:1,points:0},{rosterId:"2",matchupId:2,points:0},{rosterId:"4",matchupId:2,points:0}]};
const rows=buildStandings(league);
assert.deepEqual(rows.map(r=>r.team.rosterId),["2","1","4","3"]);
assert.equal(rows[1].pf,700);assert.equal(rows[1].pa,690);assert.equal(rows[1].max,800);
assert.equal(rows[0].window.classification,"Stuck in the Middle");

// rooting guide: contender roots for the weaker team, rebuilder for the stronger, no window falls back to the playoff race
const guide=buildRootingGuide(league);
assert.equal(guide.mode,"contender");
assert.equal(guide.items[0].mine,true);
const other=guide.items.find(i=>!i.mine);
assert.equal(other.rootFor,"owner4");assert.equal(other.rootAgainst,"owner2");
const rebuild=buildRootingGuide({...league,windows:{"1":{classification:"Rebuilder",windowScore:20,powerRank:4}}});
assert.equal(rebuild.mode,"rebuilder");assert.equal(rebuild.items.find(i=>!i.mine).rootFor,"owner2");
const noWindow=buildRootingGuide({...league,windows:undefined,windowError:"boom"});
assert.equal(noWindow.mode,"playoff-race");assert.match(noWindow.note,/unavailable/);
assert.equal(buildRootingGuide({...league,type:"Redraft",windows:{"1":{classification:"Rebuilder",windowScore:1,powerRank:4}}}).mode,"playoff-race");

// lineup slots line up with roster_positions and the bench excludes starters, IR and taxi
const mine=team("1",5,2,700,{isMine:true,players:["1","2","3","4","5","6"],starters:["1","2","0"],reserve:["5"],taxi:["6"],
  playerDetails:[player("1","QB"),player("2","RB",{injuryStatus:"Out"}),player("3","WR"),player("4","RB"),player("5","TE",{injuryStatus:"IR"}),player("6","WR")]});
const lineup=buildLineup({...league,teams:[mine]},mine,undefined);
assert.deepEqual(lineup.starters.map(s=>[s.label,s.id]),[["QB","1"],["RB","2"],["FLEX",null]]);
assert.deepEqual(lineup.bench.map(p=>p.id),["4","3"]);
assert.deepEqual(lineup.reserve.map(p=>p.id),["5"]);assert.deepEqual(lineup.taxi.map(p=>p.id),["6"]);

// alerts: injured starter with healthy bench option, empty slot, eliminated and off-season leagues are skipped
const alerts=buildAlerts([{...league,teams:[mine]},{...league,id:"E",eliminated:true,teams:[mine]},{...league,id:"O",status:"pre_draft",teams:[mine]}]);
assert.ok(alerts.every(a=>a.leagueId==="L"));
assert.ok(alerts.some(a=>a.severity==="critical"&&/Empty FLEX/.test(a.title)));
const injured=alerts.find(a=>a.playerId==="2");
assert.match(injured.detail,/P4/);
assert.equal(findMine({...league,teams:[mine]}).rosterId,"1");
console.log("in-season unit checks passed");
