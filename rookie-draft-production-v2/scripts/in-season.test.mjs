import assert from "node:assert/strict";
import {buildManagerCards} from "../lib/in-season-managers.ts";
import {buildAlerts,buildLineup,buildRootingGuide,buildStandings,byeSlots,findMine,sortLeagues,playoffFormat,buildPlayoffPicture,NISKAYUNA_LEAGUE_ID,weekKey,effectiveWindow,guillotineStatus,guillotineBoard,irEligible,livePlayerProjection,matchupProjected,projectedOutcome} from "../lib/in-season.ts";

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

// alerts across leagues: one alert per player, Auto-Sub only where the league allows it, best players first, IR respects open slots
const aMine=team("1",5,2,700,{isMine:true,players:["1","2","3","4","5","6","7"],starters:["1","2","0"],reserve:["5"],
  playerDetails:[player("1","QB"),player("2","RB",{injuryStatus:"Questionable",name:"Star RB"}),player("3","WR"),player("4","RB",{name:"Bench RB"}),player("5","TE",{injuryStatus:"IR"}),player("6","WR",{injuryStatus:"IR",name:"Hurt WR"}),player("7","WR",{injuryStatus:"Out",name:"Out WR"})]});
const base={...league,rosterPositions:["QB","RB","FLEX","BN","BN"],teams:[aMine],projections:{"4":{pts:11,opp:"CHI",date:"2026-11-01"},"3":{pts:14,opp:"CHI",date:"2026-11-01"},"2":{pts:18,opp:"CHI",date:"2026-11-01"}},playerSeason:{"2":{pts:150,gp:7}}};
const withSubs={...base,id:"A",name:"With subs",settings:{max_subs:3,reserve_slots:2,reserve_allow_out:1}};
const noSubs={...base,id:"B",name:"No subs",settings:{max_subs:0,reserve_slots:2,reserve_allow_out:1}};
const alerts=buildAlerts([withSubs,noSubs,{...base,id:"E",eliminated:true,settings:{}},{...base,id:"O",status:"pre_draft",settings:{}}]);
assert.equal(alerts.filter(a=>a.playerId==="2").length,1,"one alert per player across leagues");
const star=alerts.find(a=>a.playerId==="2");
assert.deepEqual(star.leagues.map(l=>l.id).sort(),["A","B"]);
assert.equal(star.alternatives.find(x=>x.leagueId==="A").action,"auto-sub");
assert.equal(star.alternatives.find(x=>x.leagueId==="B").action,"swap");
assert.equal(star.alternatives[0].options[0].name,"Bench RB");
assert.ok(alerts.some(a=>a.kind==="empty"&&/Empty FLEX/.test(a.title)));
assert.equal(alerts[0].quality>=alerts[alerts.length-1].quality,true,"sorted by quality, best first");
// IR: IR is full (2 slots, 1 used -> 1 open); a full IR gives no suggestion
const irAlerts=buildAlerts([{...base,settings:{reserve_slots:1,reserve_allow_out:1}}]).filter(a=>a.kind==="ir");
assert.equal(irAlerts.length,0,"no IR move when IR is full");
assert.ok(buildAlerts([withSubs]).some(a=>a.kind==="ir"&&a.playerId==="6"));
assert.equal(irEligible({settings:{reserve_allow_out:0}},{injuryStatus:"Out"}),false);

// Tuesday weekly reset (Eastern)
assert.equal(weekKey(new Date("2026-10-29T15:00:00Z")),"2026-10-27");
assert.equal(weekKey(new Date("2026-11-03T12:00:00Z")),"2026-11-03");
assert.equal(weekKey(new Date("2026-11-03T03:00:00Z")),"2026-10-27");

// declared intent overrides the computed window and clears the "middle" nag
const middle={...league,week:8,playoffWeekStart:15,windows:{"1":{classification:"Stuck in the Middle",windowScore:40,powerRank:5}}};
assert.ok(buildAlerts([middle]).some(a=>a.kind==="intent"));
assert.ok(!buildAlerts([middle],{L:"Rebuild"}).some(a=>a.kind==="intent"));
assert.ok(!buildAlerts([{...middle,week:7}]).some(a=>a.kind==="intent"));
assert.ok(!buildAlerts([{...middle,week:15}]).some(a=>a.kind==="intent"));
assert.equal(effectiveWindow(middle,middle.teams[0],{L:"Contend"}).classification,"Contender");
assert.equal(buildRootingGuide(middle,{L:"Rebuild"}).mode,"rebuilder");

// avg per week from weekly scores; guillotine rank
const withWeeks={...league,weeklyScores:{"1":[100,100,100,100,100,100,100],"2":[50,50]}};
assert.equal(buildStandings(withWeeks).find(r=>r.team.rosterId==="1").avg,100);
const g={...league,type:"Guillotine",teams:[team("1",0,0,0,{isMine:true}),team("2",0,0,0),team("3",0,0,0)],matchups:[{rosterId:"1",matchupId:1,points:0,projected:100},{rosterId:"2",matchupId:2,points:0,projected:90},{rosterId:"3",matchupId:3,points:0,projected:110}]};
const gs=guillotineStatus(g,"1");
assert.equal(gs.rank,2);assert.equal(gs.of,3);assert.equal(gs.zone,"danger");assert.equal(Math.round(gs.marginToLow),10);
assert.equal(findMine({...league,teams:[mine]}).rosterId,"1");

// manager cards: shared leagues, trade tendencies, exposure
const mk=(id,name)=>({...league,id,name,type:"Dynasty",settings:{waiver_budget:100},teams:[
  {...team("1",5,2,700,{isMine:true,ownerId:"me",owner:"me"})},
  {...team("2",4,3,650,{ownerId:"x",owner:"Xavier",teamName:"X Team",players:["9","8"],playerDetails:[player("9","WR",{age:24}),player("8","RB",{age:27})]})}],
  matchups:[{rosterId:"1",matchupId:1,points:0},{rosterId:"2",matchupId:1,points:0}]});
const L1=mk("L1","League One"),L2=mk("L2","League Two");
L1.teams[0].players=["8"];L1.teams[0].playerDetails=[player("8","RB")];
const trade=(n)=>({season:"2026",week:n,created:n,owners:["x","y"],got:{x:["a"]},gave:{x:["b"]},picksIn:{},picksOut:{x:[{season:"2027",round:1}]}});
const tx=[{leagueId:"L1",seasons:["2026","2025"],trades:[trade(1),trade(2),trade(3)],moves:{x:{claims:6,freeAgents:1,faabSpent:70}},players:{a:{name:"Vet",position:"RB",age:30},b:{name:"Kid",position:"WR",age:22}}},{leagueId:"L2",seasons:["2026"],trades:[],moves:{},players:{}}];
const cards=buildManagerCards([L1,L2],tx);
assert.equal(cards.length,1);assert.equal(cards[0].name,"Xavier");assert.equal(cards[0].leagues.length,2);
assert.equal(cards[0].tradeCount,3);assert.equal(cards[0].picksOut,3);
const labels=cards[0].tags.map(t=>t.label);
assert.ok(labels.includes("Active trader"));assert.ok(labels.includes("Sells picks"));assert.ok(labels.includes("Buys veterans"));
assert.ok(cards[0].facingMeThisWeek===undefined&&cards[0].leagues[0].facingMeThisWeek===true);
assert.equal(cards[0].exposure.length,2);assert.deepEqual(cards[0].sharedPlayers.map(p=>p.id),["8"]);

// live projection: finished games count actual points, today's games the higher of actual/projection, future games the projection
const proj={projections:{a:{pts:10,opp:"X",date:"2026-10-29"},b:{pts:10,opp:"X",date:"2026-10-30"},c:{pts:10,opp:"X",date:"2026-11-01"}}};
const noon=new Date("2026-10-30T16:00:00Z");
assert.equal(livePlayerProjection(proj,"a",3,noon),3);
assert.equal(livePlayerProjection(proj,"b",3,noon),10);
assert.equal(livePlayerProjection(proj,"b",14,noon),14);
assert.equal(livePlayerProjection(proj,"c",0,noon),10);
assert.equal(livePlayerProjection(proj,"zz",4,noon),4);
assert.equal(matchupProjected(proj,{starters:["a","c"],startersPoints:{a:25,c:0}},noon),35);

// guillotine zones (Sleeper style): lowest projection = chop, next 3 = danger, everyone above = safe; ranked by projection not points
const mkG=(projs,pts={})=>({...league,type:"Guillotine",teams:projs.map((_,i)=>team(String(i+1),0,0,0,{isMine:i===0})),
  matchups:projs.map((p,i)=>({rosterId:String(i+1),matchupId:i+1,points:pts[i]||0,projected:p}))});
const board=guillotineBoard(mkG([130,100,140,90,120,110,150,80],{3:99}));
assert.deepEqual(board.map(r=>r.rosterId),["7","3","1","5","6","2","4","8"]);
assert.deepEqual(board.map(r=>r.zone),["safe","safe","safe","safe","danger","danger","danger","chop"]);
assert.equal(guillotineStatus(mkG([130,100,140,90,120,110,150,80]),"1").rank,3);

// projected outcome verdicts
const vs=(a,b)=>({...league,matchups:[{rosterId:"1",matchupId:1,points:0,projected:a},{rosterId:"3",matchupId:1,points:0,projected:b}]});
assert.equal(projectedOutcome(vs(120,110),"1").verdict,"win");
assert.equal(projectedOutcome(vs(100,110),"1").verdict,"lose");
assert.equal(projectedOutcome(vs(110.5,110),"1").verdict,"toss-up");
assert.equal(projectedOutcome({...league,matchups:[]},"1").verdict,"none");

// ---- Niskayuna playoff format: 8 of 10 make it; 1-4 double elimination, 5-8 single elimination ----
const recs=[[6,1,1019],[5,2,980],[4,3,1071],[4,3,913],[4,3,882],[3,4,891],[3,4,850],[3,4,834],[2,5,790],[1,6,685]];
const nisk={...league,id:NISKAYUNA_LEAGUE_ID,type:"Redraft",playoffTeams:4,settings:{playoff_teams:4},windows:undefined,
  teams:recs.map(([w,l,pf],i)=>team(String(i+1),w,l,pf,{ownerId:"o"+(i+1),isMine:i===7})),
  matchups:recs.map((_,i)=>({rosterId:String(i+1),matchupId:Math.floor(i/2)+1,points:0}))};
const nf=playoffFormat(nisk);
assert.deepEqual([nf.teams,nf.topTier,nf.kind,nf.custom],[8,4,"niskayuna",true],"Sleeper says 4 teams, the league's own rules say 8");
assert.equal(playoffFormat({...nisk,id:"other"}).teams,4);
const stand=buildStandings(nisk);
const pic=buildPlayoffPicture(stand,nf);
const seeds=(p)=>[p.high.rank,p.low.rank];
assert.deepEqual(pic.upper.map(seeds),[[1,4],[2,3]]);
assert.deepEqual(pic.lower.map(seeds),[[5,8],[6,7]]);
assert.equal(pic.mine.rank,8);assert.equal(pic.mine.tier,"lower");
assert.equal(pic.mine.opponent.rank,5);
assert.equal(pic.mine.winsVsFirstOut,1);   // 3 wins vs 2 wins for the first team out
assert.equal(pic.mine.winsVsTopTier,-1);   // 3 wins vs 4 wins for the last upper-bracket seed
assert.deepEqual([1,4,5,8,9,10].map(pic.tierOf),["upper","upper","lower","lower","out","out"]);
assert.equal(buildPlayoffPicture(stand,playoffFormat({...nisk,id:"x"})),null);
// rooting guide uses the 8-team / top-4 format: a bubble team (seed 8) pays attention to seeds 3-4 above and 9-10 below
const nGuide=buildRootingGuide(nisk);
assert.match(nGuide.detail,/8 teams make the playoffs/);assert.match(nGuide.detail,/double-elimination/);
console.log("in-season unit checks passed");
