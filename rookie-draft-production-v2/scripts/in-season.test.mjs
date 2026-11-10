import assert from "node:assert/strict";
import {assignLineup,buildWaiverPlan,suggestBid,simulateChop,teamSd} from "../lib/in-season-waivers.ts";
import {buildWeatherAlerts,weatherFlag,hasKickedOff,byeWeeks} from "../lib/in-season-schedule.ts";
import {optimizeLineup,buildLineupAlerts} from "../lib/in-season-optimizer.ts";
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
assert.deepEqual(nf.weeks,{round1:15,round2:16,final:17});assert.equal(nf.regularSeasonEnd,14);
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
// ---- lineup optimizer ----
const NOW=new Date("2026-10-30T16:00:00Z");
const mkP=(id,pos,extra={})=>({id,name:"P"+id,position:pos,team:"BUF",status:"Active",injuryStatus:"",...extra});
const ROSTER=[mkP("q1","QB"),mkP("q2","QB"),mkP("r1","RB"),mkP("r2","RB"),mkP("r3","RB"),mkP("w1","WR"),mkP("w2","WR"),mkP("t1","TE")];
const VAL={q1:20,q2:18,r1:15,r2:14,r3:12,w1:13,w2:11,t1:9};
const optProj=Object.fromEntries(Object.entries(VAL).map(([id,pts])=>[id,{pts,opp:"CHI",date:"2026-11-01"}]));
const optLeague=(starters,over={},projOver={})=>({...league,id:"O",rosterPositions:["QB","RB","WR","FLEX","SUPER_FLEX","BN","BN"],projections:{...optProj,...projOver},
  teams:[team("1",5,2,700,{isMine:true,players:ROSTER.map(p=>p.id),starters,playerDetails:over.details||ROSTER,reserve:[],taxi:[]})],matchups:[{rosterId:"1",matchupId:1,points:0,starters,startersPoints:over.pts||{}}]});
const t1=optLeague(["q1","r1","w1","t1","r3"]);
const res=optimizeLineup(t1,t1.teams[0],t1.matchups[0],NOW);
assert.equal(res.currentTotal,69);assert.equal(res.suggestedTotal,80);assert.equal(res.delta,11);
assert.deepEqual(res.suggested.starters.map(r=>r.id).sort(),["q1","q2","r1","r2","w1"].sort());
assert.equal(res.changes.length,2);assert.ok(res.changes.every(c=>c.delta>0));
assert.equal(res.swaps.length,2);assert.equal(Math.round(res.swaps.reduce((a,x)=>a+x.delta,0)*100)/100,res.delta,"swap deltas add up to the total gain");
assert.equal(res.suggested.starters[0].id,"q1","players keep their current slots where possible");
// already optimal
const best=optLeague(["q1","r1","w1","r2","q2"]);
assert.equal(optimizeLineup(best,best.teams[0],best.matchups[0],NOW).optimal,true);
// every suggested player is eligible for the slot he is in
const SLOT_OK={QB:["QB"],RB:["RB"],WR:["WR"],FLEX:["RB","WR","TE"],SUPER_FLEX:["QB","RB","WR","TE"]};
res.suggested.starters.forEach(r=>assert.ok(SLOT_OK[r.slot].includes(r.player.position),r.slot+" "+r.player.position));
// an Out starter is excluded and counts for nothing
const hurtRoster=ROSTER.map(p=>p.id==="r1"?{...p,injuryStatus:"Out"}:p);
const hurt=optLeague(["q1","r1","w1","r2","q2"],{details:hurtRoster});
const hr=optimizeLineup(hurt,hurt.teams[0],hurt.matchups[0],NOW);
assert.ok(!hr.suggested.starters.some(r=>r.id==="r1"));assert.equal(hr.swaps[0].outFlagged,true);assert.ok(hr.delta>0);
// a player whose game is already over stays put, and a played bench player cannot be started
const lockedLeague=optLeague(["q1","r1","w1","t1","r3"],{pts:{q1:21,r1:10,w1:8,t1:2,r3:0}},{r1:{pts:15,opp:"X",date:"2026-10-29"},r2:{pts:14,opp:"X",date:"2026-10-29"}});
const lk=optimizeLineup(lockedLeague,lockedLeague.teams[0],lockedLeague.matchups[0],NOW);
assert.equal(lk.suggested.starters[1].id,"r1","played starter is locked in his slot");
assert.ok(!lk.suggested.starters.some(r=>r.id==="r2"),"played bench player cannot be started");
assert.equal(lk.lockedCount,1);
// alert only when a non-injury change clears the threshold; hurt-starter swaps are left to the player alert
assert.equal(buildLineupAlerts([t1],1,NOW).length,1);
assert.equal(buildLineupAlerts([best],1,NOW).length,0);
assert.equal(buildLineupAlerts([hurt],1,NOW).length,0);

// ---- waivers: lineup assignment, recommendations, FAAB bids ----
assert.equal(assignLineup(["QB","RB","FLEX"],[{id:"a",position:"QB",value:20},{id:"b",position:"RB",value:10},{id:"c",position:"RB",value:12},{id:"d",position:"WR",value:9},{id:"e",position:"RB",value:5}]).total,42);
const WSLOTS=["QB","RB","RB","WR","WR","TE","FLEX","BN","BN","BN"];
const wRoster=[mkP("q","QB"),mkP("r1","RB"),mkP("r2","RB"),mkP("w1","WR"),mkP("w2","WR"),mkP("t","TE"),mkP("x1","RB"),mkP("x2","WR"),mkP("hurt","WR",{injuryStatus:"Out"}),mkP("kid","WR")];
const wProj={q:[20,20,20],r1:[15,15,15],r2:[12,12,12],w1:[13,13,13],w2:[11,11,11],t:[8,8,8],x1:[7,7,7],x2:[4,4,4],hurt:[0,0,0],kid:[1,1,1]};
const wTeam=(extra={})=>({...team("1",5,2,700,{isMine:true,players:wRoster.map(p=>p.id),playerDetails:wRoster,reserve:[],taxi:[]}),...extra});
const wLeague={...league,rosterPositions:WSLOTS};
const outlook=(over={})=>({leagueId:"L",weeks:[9,10,11],rules:{budget:200,used:50,remaining:150,clearDays:2,daily:false,bidMin:1,tradeDeadlineWeek:11,rosterCapacity:10},processing:null,myProjections:wProj,
  candidates:[{id:"cw",name:"Pickup WR",position:"WR",team:"BUF",age:24,injury:"",proj:[16,16,16],trend:250000},{id:"cs",name:"Scrub RB",position:"RB",team:"CHI",age:30,injury:"",proj:[3,3,3],trend:0}],
  bids:{n:30,median:10,p25:3,p75:25,p90:50,max:90,byPosition:{},recent:[]},...over});
const planFull=buildWaiverPlan(wLeague,wTeam(),outlook());
assert.equal(planFull.openSpots,0);
assert.equal(planFull.recommendations.length,1,"only the pickup who improves the lineup is suggested");
const r0=planFull.recommendations[0];
assert.equal(r0.add.id,"cw");assert.equal(r0.drop.id,"kid","drops the least useful healthy player, never the injured one");
assert.ok(Math.abs(r0.total-27)<0.01,"16 projected replaces the 7-point FLEX for three weeks: +9 x 3 = 27");assert.equal(r0.startsAt,"WR");
assert.ok(r0.bid.low>=25&&r0.bid.high<=50&&r0.bid.affordable,"strong, popular add prices at the 75th-90th percentile");
// open roster spot: nothing needs to be dropped
const planOpen=buildWaiverPlan(wLeague,wTeam(),outlook({rules:{...outlook().rules,rosterCapacity:12}}));
assert.equal(planOpen.recommendations[0].drop,null);assert.equal(planOpen.openSpots,2);
// dynasty: a valued asset on the bench is protected even if he scores nothing
const dyn=buildWaiverPlan(wLeague,wTeam(),outlook({ktc:{kid:4000}}));
assert.notEqual(dyn.recommendations[0].drop.id,"kid");
// nothing worth adding
assert.ok(buildWaiverPlan(wLeague,wTeam(),outlook({candidates:[{id:"cs",name:"Scrub RB",position:"RB",team:"CHI",age:30,injury:"",proj:[3,3,3],trend:0}]})).empty);
// no FAAB left
assert.equal(suggestBid(8,0,"WR",0,{n:30,median:10,p25:3,p75:25,p90:50,max:90,byPosition:{},recent:[]},{...outlook().rules,remaining:0}).affordable,false);
// little bid history falls back to a share of remaining budget
const noHist=suggestBid(8,0,"WR",0,null,outlook().rules);assert.match(noHist.basis,/too little bid history/);assert.ok(noHist.high<=outlook().rules.remaining);
// a priced-out claim is flagged
assert.equal(suggestBid(8,0,"WR",0,{n:30,median:100,p25:80,p75:120,p90:150,max:200,byPosition:{},recent:[]},{...outlook().rules,remaining:20}).affordable,false);

// ---- guillotine chop odds ----
const odds=simulateChop([{id:"a",mean:130,sd:15},{id:"b",mean:120,sd:15},{id:"c",mean:110,sd:15},{id:"d",mean:100,sd:15},{id:"e",mean:90,sd:15}],4000,3);
assert.equal(Math.round(odds.reduce((a,o)=>a+o.lowest,0)*1000)/1000,1,"exactly one team is lowest per simulation");
assert.ok(odds[4].lowest>odds[0].lowest,"the lowest projection is the most likely to be chopped");
assert.deepEqual(simulateChop([{id:"a",mean:130,sd:15},{id:"b",mean:100,sd:15}],500,9),simulateChop([{id:"a",mean:130,sd:15},{id:"b",mean:100,sd:15}],500,9),"same seed, same answer");
assert.equal(teamSd([100,100],18),18);assert.ok(teamSd([90,110,100,120,80])>10);

// ---- schedule: kickoff locks, byes, weather alerts ----
const mkGame=(over={})=>({week:8,kickoff:"2026-11-01T18:00Z",opponent:"CHI",home:true,indoor:false,state:"pre",weather:{text:"Snow showers",temp:28},city:"Orchard Park",...over});
assert.equal(hasKickedOff(mkGame(),new Date("2026-11-01T17:59:00Z")),false);assert.equal(hasKickedOff(mkGame(),new Date("2026-11-01T18:01:00Z")),true);assert.equal(hasKickedOff(mkGame({state:"post"}),new Date("2026-10-31T00:00:00Z")),true);
assert.equal(weatherFlag(mkGame()).severity,"high");assert.equal(weatherFlag(mkGame({indoor:true})),null);assert.equal(weatherFlag(mkGame({weather:{text:"Partly sunny",temp:68}})),null);assert.equal(weatherFlag(mkGame({weather:{text:"Cloudy",temp:20}})).label,"20°F cold");
const sched={BUF:{8:mkGame(),9:null,10:mkGame({week:10})},CHI:{8:mkGame({home:false,opponent:"BUF"})}};
assert.deepEqual(byeWeeks(sched,"BUF",[8,9,10]),[9]);
const wxLeague={...league,id:"W1",name:"Weather League",status:"in_season",rosterPositions:["QB","RB","BN"],projections:{p1:{pts:18,opp:"CHI",date:"2026-11-01"},p2:{pts:12,opp:"CHI",date:"2026-11-01"}},
  teams:[team("1",5,2,700,{isMine:true,players:["p1","p2"],starters:["p1","p2"],playerDetails:[mkP("p1","QB",{team:"BUF"}),mkP("p2","RB",{team:"BUF"})]})],matchups:[{rosterId:"1",matchupId:1,points:0,starters:["p1","p2"],startersPoints:{}}]};
const wx=buildWeatherAlerts([wxLeague,{...wxLeague,id:"W2",name:"Second League"}],sched,8,new Date("2026-10-31T12:00:00Z"));
assert.equal(wx.length,1,"one alert per game, not per player or league");assert.equal(wx[0].leagues.length,2);assert.equal(wx[0].details.length,2);assert.match(wx[0].title,/CHI at BUF/);
assert.equal(buildWeatherAlerts([wxLeague],sched,8,new Date("2026-11-01T19:00:00Z")).length,0,"no weather alert once the game has kicked off");
console.log("in-season unit checks passed");

// ---- guillotine claim sheet: player #2 affordability, manual bids, win vs lands ----
import {buildClaimSheet,orderedPairs,buildMatrix,winAt} from "../lib/in-season-guillotine.ts";
{
  const mk=(id,position,proj)=>({id,name:"P"+id,position,team:"BUF",injury:"",age:25,proj,byeWeeks:[]});
  const info={r1:mk("r1","WR",[10,10,10]),r2:mk("r2","WR",[9,9,9]),r3:mk("r3","WR",[8,8,8]),a:mk("a","WR",[25,25,25]),b:mk("b","WR",[22,22,22]),c:mk("c","WR",[20,20,20])};
  const slots=["WR","WR"],roster=["r1","r2","r3"];
  const curve=[{bid:3,win:.1},{bid:20,win:.3},{bid:50,win:.45},{bid:79,win:.46},{bid:100,win:.46},{bid:150,win:.5},{bid:250,win:.9},{bid:550,win:1}];
  const easy=[{bid:3,win:.5},{bid:20,win:.8},{bid:50,win:.95},{bid:550,win:1}];
  const targets=[{id:"a",curve,p50:150,p75:200,p90:230},{id:"b",curve:easy,p50:20,p75:40,p90:60},{id:"c",curve:easy,p50:5,p75:10,p90:20}];
  const mx=buildMatrix(slots,roster,info,["a","b","c"]);
  const pairs=orderedPairs(mx,["a","b","c"],["r3","r2","r1"],-99);
  const run=(locked)=>buildClaimSheet({slots,roster,info,targets,pairs,budget:82,ladder:true,locked,bidMin:1});
  // #1 takes the whole $82: #2's second claim is impossible and must not appear; #2's first claim and #3 rows stay
  const full=run();
  assert.equal(full.rows.find(r=>r.add==="a"&&r.drop==="r3").bid,82);
  assert.ok(!full.rows.some(r=>r.add==="b"&&r.drop==="r2"));
  assert.ok(full.rows.some(r=>r.add==="b"&&r.drop==="r3"));
  assert.ok(full.rows.some(r=>r.add==="c"&&r.drop==="r2"),"player #3 is not limited by the #2 rule");
  // typing $81 for #1 leaves $1: player #2's second claim returns at $1 and #1's bid is untouched
  const edited=run({"a|r3":81});
  const a=edited.rows.find(r=>r.add==="a"&&r.drop==="r3");
  assert.equal(a.bid,81); assert.ok(a.locked);
  const second=edited.rows.find(r=>r.add==="b"&&r.drop==="r2");
  assert.equal(second.bid,1); assert.equal(second.capped,1);
  // a claim can never land more often than it can win
  edited.rows.forEach(r=>assert.ok(r.hit<=r.win+0.06,`${r.add}/${r.drop} lands ${r.hit} > win ${r.win}`));
  // win % is read off the same curve the Targets table uses
  assert.equal(Math.round(edited.rows.find(r=>r.add==="a"&&r.drop==="r3").win*100),Math.round(winAt(curve,81)*100));
}
