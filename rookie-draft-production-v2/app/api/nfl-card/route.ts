import {
  availabilityFor,buildRanks,buildTeamRanks,findCollegePlayerId,loadLeagues,loadPlayerDb,loadSchedule,loadSeasonStats,
  loadState,nextGame,resolvePlayer,scoreStats,seasonTotals,teamGames,FANTASY_POSITIONS,type WeekRow,
} from "@/lib/nfl-card";

export const dynamic="force-dynamic";
export const maxDuration=60;

const n=(v:any)=>{const x=Number(v);return Number.isFinite(x)?x:0};

function statLine(position:string,s:Record<string,number>){
  const parts:string[]=[];
  if(n(s.pass_att)>0)parts.push(`${n(s.pass_cmp)}/${n(s.pass_att)}, ${n(s.pass_yd)} pass yds, ${n(s.pass_td)} TD${n(s.pass_int)?`, ${n(s.pass_int)} INT`:""}`);
  if(n(s.rush_att)>0)parts.push(`${n(s.rush_att)} car, ${n(s.rush_yd)} yds${n(s.rush_td)?`, ${n(s.rush_td)} TD`:""}`);
  if(n(s.rec_tgt)>0||n(s.rec)>0)parts.push(`${n(s.rec)}/${n(s.rec_tgt)} rec, ${n(s.rec_yd)} yds${n(s.rec_td)?`, ${n(s.rec_td)} TD`:""}`);
  if(n(s.fum_lost))parts.push(`${n(s.fum_lost)} fum lost`);
  return parts.join(" · ")||(position?"No offensive stats":"");
}

function sumKeys(list:WeekRow[]){
  const keys=["pass_cmp","pass_att","pass_yd","pass_td","pass_int","rush_att","rush_yd","rush_td","rec_tgt","rec","rec_yd","rec_td","fum_lost"];
  const out:Record<string,number>={};
  for(const k of keys)out[k]=list.reduce((s,r)=>s+n(r.stats[k]),0);
  return out;
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const name=url.searchParams.get("name")||"",posParam=url.searchParams.get("position")||"",team=url.searchParams.get("team")||"";
    const sleeperId=url.searchParams.get("sleeperId")||"";
    if(!name&&!sleeperId)return Response.json({error:"Provide a player name or Sleeper id"},{status:400});

    const [resolved,state,leagues]=await Promise.all([resolvePlayer({sleeperId,name,position:posParam,team}),loadState(),loadLeagues()]);
    const leagueMeta=leagues.map(l=>({key:l.integration.key,name:String(l.league.name||l.integration.name)}));
    const collegePlayerId=await findCollegePlayerId(resolved?.name||name,resolved?.position||posParam).catch(()=>null);

    if(!resolved){
      return Response.json({found:false,name,position:posParam,team,collegePlayerId,leagues:leagueMeta});
    }

    const db=await loadPlayerDb();
    const p=resolved.db,id=resolved.id;
    const seasonType=String(state.season_type||"regular");
    const stateSeason=n(state.season)||new Date().getFullYear();
    const currentWeek=Math.max(1,n(state.week)||1);
    const statsSeason=seasonType==="pre"?stateSeason-1:stateSeason;
    const throughWeek=seasonType==="regular"?currentWeek:18;

    const [stats,schedule,statsSchedule]=await Promise.all([
      loadSeasonStats(statsSeason,throughWeek,db),loadSchedule(stateSeason),
      statsSeason===stateSeason?Promise.resolve(null):loadSchedule(statsSeason),
    ]);
    const logSchedule=statsSchedule||schedule;
    const myRows=(stats.byPlayer.get(id)||[]).slice().sort((a,b)=>a.week-b.week);
    const position=resolved.position;
    const teamAbbr=resolved.team;

    // per-league numbers (scoring differs by league)
    const perLeague:Record<string,any>={};
    const teammates:Record<string,any[]>={};
    const rankTables=new Map<string,ReturnType<typeof buildRanks>>();
    for(const l of leagues){
      const ranks=buildRanks(stats,l.scoring,db);
      rankTables.set(l.integration.key,ranks);
      const line=ranks.pts.get(id)||seasonTotals(myRows,l.scoring,position);
      perLeague[l.integration.key]={
        pts:line.pts,ppg:line.ppg,gp:line.gp,
        ovrRank:ranks.overall.get(id)??null,ovrCount:ranks.overallCount,
        posRank:ranks.pos.get(id)??null,posCount:ranks.posCount[position]||0,
      };
      const mates:any[]=[];
      for(const [pid,mp] of Object.entries<any>(db)){
        if(!teamAbbr||mp?.team!==teamAbbr||!(FANTASY_POSITIONS as readonly string[]).includes(String(mp.position)))continue;
        const ml=ranks.pts.get(pid);
        if(!ml&&!(mp.status==="Active"&&n(mp.search_rank)>0&&n(mp.search_rank)<=700))continue;
        mates.push({
          id:pid,name:String(mp.full_name||((mp.first_name||"")+" "+(mp.last_name||"")).trim()),position:String(mp.position),
          pts:ml?.pts??null,ppg:ml?.ppg??null,gp:ml?.gp??0,
          posRank:ranks.pos.get(pid)??null,ovrRank:ranks.overall.get(pid)??null,
          injury:mp.injury_status||null,isSelf:pid===id,
        });
      }
      const order:Record<string,number>={QB:0,RB:1,WR:2,TE:3};
      mates.sort((a,b)=>(order[a.position]-order[b.position])||((b.pts??-1)-(a.pts??-1)));
      teammates[l.integration.key]=mates;
    }

    // game log (weeks 1..throughWeek) with per-league fantasy points
    const myTeamForLog=(w:number)=>myRows.find(r=>r.week===w)?.team||teamAbbr;
    const gameLog=stats.weeks.map(w=>{
      const row=myRows.find(r=>r.week===w);
      const t=myTeamForLog(w);
      const game=t?teamGames(logSchedule,t).find(g=>g.week===w):undefined;
      const home=game?game.home===t:null;
      const opp=row?.opp||(game&&t?(game.home===t?game.away:game.home):null);
      const pts:Record<string,number>={};
      if(row)for(const l of leagues)pts[l.integration.key]=scoreStats(row.stats,l.scoring,position);
      const upcoming=!row&&Boolean(game)&&String(game?.status||"").toLowerCase()!=="complete"&&w>=currentWeek&&seasonType==="regular";
      return {week:w,opp,home,played:Boolean(row),upcoming,bye:!game&&!row&&Boolean(t),line:row?statLine(position,row.stats):null,pts};
    });

    const teamRanks=buildTeamRanks(stats,teamAbbr);
    const upcoming=nextGame(schedule,teamAbbr,seasonType==="pre"?1:currentWeek);

    return Response.json({
      found:true,
      player:{
        id,name:resolved.name,position,team:teamAbbr,number:p.number??null,age:p.age??null,height:p.height||null,weight:p.weight||null,
        yearsExp:p.years_exp??null,college:p.college||null,status:p.status||null,
        injury:p.injury_status?{status:p.injury_status,bodyPart:p.injury_body_part||null}:null,
        headshot:`https://sleepercdn.com/content/nfl/players/${id}.jpg`,
        teamLogo:teamAbbr?`https://sleepercdn.com/images/team_logos/nfl/${teamAbbr.toLowerCase()}.png`:null,
      },
      season:statsSeason,seasonLabel:statsSeason===stateSeason?String(stateSeason):`${statsSeason} (offseason)`,
      currentWeek,throughWeek,seasonType,
      leagues:leagueMeta,perLeague,totals:sumKeys(myRows),teammates,gameLog,teamRanks,
      nextGame:upcoming,
      availability:leagues.map(l=>availabilityFor(l,id)),
      collegePlayerId,
    });
  }catch(e:any){
    return Response.json({error:"Could not load NFL player card",detail:e?.message},{status:500});
  }
}
