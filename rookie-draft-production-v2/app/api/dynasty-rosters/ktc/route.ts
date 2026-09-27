import {ensureTursoSchema} from "@/lib/turso";
import {getIntegrations,type SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,loadKtcDataset,type KtcMatch} from "@/lib/ktc";

type Player={name:string;position:string;team:string;age:string;ktc:string;ktcStatus?:string};
type Item={slot:string;name:string;team:string};
type RosterView={
  key:string;label:string;league:string;leagueId:string;updated:string;source:string;
  ktcUpdatedAt?:string;ktcSource?:string;
  players:Player[];totalKtc:number;avgAge:number;
  starters:Item[];benchPlayers:Item[];startingCoverage:Item[];benchCoverage:Item[];bonus:Item[];
};

async function readSnapshot(){
  const c=await ensureTursoSchema();
  const result=await c.execute({sql:"select value from settings where key=?",args:["dynasty_rosters_live"]});
  if(!result.rows.length)return null;
  try{return JSON.parse(String(result.rows[0]?.value||"null"))}catch{return null}
}

async function saveSnapshot(value:any){
  const c=await ensureTursoSchema();
  await c.execute({
    sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",
    args:["dynasty_rosters_live",JSON.stringify(value),new Date().toISOString()],
  });
}

async function sleeperJson(url:string){
  const res=await fetch(url,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok)throw new Error("Sleeper API returned "+res.status);
  return res.json();
}

function rosterFormat(rosterPositions:any[]){
  const count=(value:string)=>rosterPositions.filter(x=>String(x).toUpperCase()===value).length;
  return {QB:count("QB"),RB:count("RB"),WR:count("WR"),TE:count("TE"),FLEX:count("FLEX"),SUPER:count("SUPER_FLEX")};
}

function startingLineup(players:any[],format:ReturnType<typeof rosterFormat>){
  const starters:any[]=[],rem=[...players].sort((a,b)=>Number(b.ktcValue||0)-Number(a.ktcValue||0));
  const fill=(n:number,test:(p:any)=>boolean,slot:string)=>{
    for(let i=0;i<n;i++){
      const idx=rem.findIndex(test);
      if(idx>=0){starters.push({...rem[idx],slotType:slot});rem.splice(idx,1)}
    }
  };
  fill(format.QB,p=>p.position==="QB","QB");
  fill(format.RB,p=>p.position==="RB","RB");
  fill(format.WR,p=>p.position==="WR","WR");
  fill(format.TE,p=>p.position==="TE","TE");
  fill(format.FLEX,p=>["RB","WR","TE"].includes(p.position),"Flex");
  fill(format.SUPER,p=>["QB","RB","WR","TE"].includes(p.position),"Super");
  return starters;
}

function valueFor(match:KtcMatch|null,league:SleeperLeagueIntegration){
  if(!match)return null;
  return league.tePremium?match.player.tepValue:match.player.value;
}

export async function POST(){
  try{
    const snapshot=await readSnapshot();
    if(!snapshot?.rosters?.length){
      return Response.json({error:"Refresh rosters once before refreshing KTC values."},{status:409});
    }

    const integrations=await getIntegrations();
    const leagueByKey=new Map(integrations.sleeper.leagues.map(l=>[l.key,l]));
    const dataset=await loadKtcDataset(true);
    const matcher=createKtcMatcher(dataset);

    let matched=0,unmatched=0;
    const unmatchedNames:string[]=[];
    const rosters=await Promise.all((snapshot.rosters as RosterView[]).map(async roster=>{
      const league=leagueByKey.get(roster.key);
      if(!league)return roster;

      const valued=roster.players.map(player=>{
        const match=matcher(player.name,player.position);
        const ktcValue=valueFor(match,league);
        if(match)matched++;
        else{unmatched++;unmatchedNames.push(player.name)}
        return {
          ...player,
          ktc:ktcValue==null?"N/A":String(ktcValue),
          ktcStatus:match?.method||"unmatched",
          ktcValue,
        };
      });

      let leagueData:any=null;
      try{leagueData=await sleeperJson("https://api.sleeper.app/v1/league/"+league.leagueId)}catch{}
      const fmt=rosterFormat(Array.isArray(leagueData?.roster_positions)?leagueData.roster_positions:[]);
      const canRebuild=Object.values(fmt).some(Number);
      let starters=roster.starters,benchPlayers=roster.benchPlayers,startingCoverage=roster.startingCoverage,benchCoverage=roster.benchCoverage;

      if(canRebuild){
        const lineup=startingLineup(valued,fmt);
        const starterKeys=new Set(lineup.map(p=>p.name+"|"+p.position));
        const bench=valued.filter(p=>!starterKeys.has(p.name+"|"+p.position)&&Number(p.ktcValue||0)>=2500);
        const coverage:Item[]=[];
        for(const pos of ["QB","RB","WR","TE"]){
          const teams=[...new Set(lineup.filter(p=>p.position===pos).map(p=>p.team).filter(Boolean))];
          if(teams.length)coverage.push({slot:pos,name:teams.join(", "),team:""});
        }
        const benchTeams=[...new Set(bench.map(p=>p.team).filter(Boolean))];
        starters=lineup.map(p=>({slot:p.slotType,name:p.name,team:p.team}));
        benchPlayers=bench.map(p=>({slot:p.position,name:p.name,team:p.team}));
        startingCoverage=coverage;
        benchCoverage=benchTeams.length?[{slot:"Bench",name:benchTeams.join(", "),team:""}]:[];
      }

      const players:Player[]=valued.map(({ktcValue,...p})=>p);
      const totalKtc=valued.reduce((sum,p)=>sum+(Number(p.ktcValue)||0),0);

      return {
        ...roster,
        players,totalKtc,starters,benchPlayers,startingCoverage,benchCoverage,
        ktcUpdatedAt:dataset.fetchedAt,ktcSource:dataset.source,
      };
    }));

    const next={
      ...snapshot,
      rosters,
      ktcUpdatedAt:dataset.fetchedAt,
      ktcSource:dataset.source,
      ktcMatchSummary:{matched,unmatched,unmatchedNames:[...new Set(unmatchedNames)].sort()},
    };
    await saveSnapshot(next);
    return Response.json(next);
  }catch(e:any){
    return Response.json({error:"Could not refresh KTC values",detail:e?.message},{status:500});
  }
}
