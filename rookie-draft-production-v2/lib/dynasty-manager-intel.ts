import type {SleeperLeagueIntegration} from "@/lib/integrations";
import {createKtcMatcher,getKtcPickValue,type KtcDataset} from "@/lib/ktc";
import {ensureTursoSchema} from "@/lib/turso";
import {INTEL_POSITIONS,intelNumber,intelOwnerName,loadIntelBase,resolveIntelRoster,sleeperJson} from "@/lib/dynasty-intelligence-core";

async function cacheGet(key:string,maxAgeMs:number){
  const c=await ensureTursoSchema(),r=await c.execute({sql:"select value,updated_at from settings where key=?",args:[key]});
  if(!r.rows.length)return null;
  const updated=Date.parse(String(r.rows[0]?.updated_at||""));
  if(!Number.isFinite(updated)||Date.now()-updated>maxAgeMs)return null;
  try{return JSON.parse(String(r.rows[0]?.value||"null"))}catch{return null}
}

async function cachePut(key:string,value:any){
  const c=await ensureTursoSchema(),now=new Date().toISOString();
  await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[key,JSON.stringify(value),now]});
}

async function seasonTransactions(leagueId:string){
  const key="dynasty_tx_cache_v3:"+leagueId,cached=await cacheGet(key,6*60*60*1000);
  if(cached)return cached;
  const root="https://api.sleeper.app/v1/league/"+leagueId;
  const [meta,rosters,users,weeks]=await Promise.all([
    sleeperJson(root),sleeperJson(root+"/rosters"),sleeperJson(root+"/users"),
    Promise.all(Array.from({length:19},(_,week)=>sleeperJson(root+"/transactions/"+week).catch(()=>[]))),
  ]);
  const value={meta,rosters,users,transactions:weeks.flat()};
  await cachePut(key,value).catch(()=>{});
  return value;
}

async function historySeasons(leagueId:string,max=3){
  const out:any[]=[];let current=leagueId;
  for(let i=0;i<max&&current;i++){
    const season=await seasonTransactions(current);out.push(season);
    const prev=String(season?.meta?.previous_league_id||"");
    if(!prev||prev===current)break;current=prev;
  }
  return out;
}

function assetValuePlayer(id:string,playerDb:any,matcher:ReturnType<typeof createKtcMatcher>,league:SleeperLeagueIntegration){
  const p=playerDb?.[id],position=String(p?.position||"").toUpperCase();
  if(!p||!INTEL_POSITIONS.includes(position as any))return null;
  const name=((p.first_name||"")+" "+(p.last_name||"")).trim()||String(p.full_name||id),match=matcher(name,position),value=match?(league.tePremium?match.player.tepValue:match.player.value):0;
  return {id,name,position,team:String(p.team||"FA"),value};
}

function analyze(seasons:any[],playerDb:any,dataset:KtcDataset,league:SleeperLeagueIntegration,currentUsers:any[],myOwnerId:string,activeOwnerIds:Set<string>){
  const matcher=createKtcMatcher(dataset),currentNames=new Map<string,string>(currentUsers.map((u:any)=>[String(u.user_id),intelOwnerName(u)] as [string,string])),profiles=new Map<string,any>(),feed:any[]=[];
  const ensure=(ownerId:string,name:string)=>{
    if(!profiles.has(ownerId))profiles.set(ownerId,{ownerId,name,isMine:ownerId===myOwnerId,trades:0,waivers:0,freeAgentAdds:0,picksIn:0,picksOut:0,faabSpent:0,faabReceived:0,positionIn:{QB:0,RB:0,WR:0,TE:0},positionOut:{QB:0,RB:0,WR:0,TE:0},incomingValue:0,outgoingValue:0,tradeRatios:[],positionRatios:{QB:[],RB:[],WR:[],TE:[]}});
    const row=profiles.get(ownerId);
    if(row){row.name=name||row.name;row.isMine=ownerId===myOwnerId}
    return row;
  };
  for(const user of currentUsers){
    const ownerId=String(user?.user_id||"");
    if(ownerId&&activeOwnerIds.has(ownerId))ensure(ownerId,intelOwnerName(user));
  }
  for(const season of seasons){
    const rosterToOwner=new Map<number,string>((season.rosters||[]).map((r:any)=>[Number(r.roster_id),String(r.owner_id||"")] as [number,string])),usersById=new Map<string,any>((season.users||[]).map((u:any)=>[String(u.user_id),u] as [string,any]));
    for(const tx of season.transactions||[]){
      const type=String(tx?.type||""),created=Number(tx?.created||0),involved:number[]=[...new Set<number>((tx?.roster_ids||[]).map((r:any)=>Number(r)))];
      const sides=new Map<number,any>();
      const side=(rid:number)=>{if(!sides.has(rid))sides.set(rid,{playersIn:[],playersOut:[],picksIn:[],picksOut:[],valueIn:0,valueOut:0});return sides.get(rid)};
      for(const [pid,ridRaw] of Object.entries(tx?.adds||{})){const rid=Number(ridRaw),asset=assetValuePlayer(String(pid),playerDb,matcher,league);if(asset){side(rid).playersIn.push(asset);side(rid).valueIn+=asset.value}}
      for(const [pid,ridRaw] of Object.entries(tx?.drops||{})){const rid=Number(ridRaw),asset=assetValuePlayer(String(pid),playerDb,matcher,league);if(asset){side(rid).playersOut.push(asset);side(rid).valueOut+=asset.value}}
      for(const pick of tx?.draft_picks||[]){
        const sy=Number(pick?.season),round=Number(pick?.round),value=getKtcPickValue(dataset,sy,round,"Mid")||0,asset={season:sy,round,value,name:String(sy)+" "+(round===1?"1st":round===2?"2nd":round===3?"3rd":round+"th")};
        const owner=Number(pick?.owner_id),previous=Number(pick?.previous_owner_id);
        if(owner){side(owner).picksIn.push(asset);side(owner).valueIn+=value}
        if(previous){side(previous).picksOut.push(asset);side(previous).valueOut+=value}
      }
      if(type==="trade"){
        for(const [rid,s] of sides){
          const ownerId=rosterToOwner.get(rid)||"";if(!ownerId)continue;
          const name=currentNames.get(ownerId)||intelOwnerName(usersById.get(ownerId),{roster_id:rid}),p=ensure(ownerId,name);
          p.trades++;p.picksIn+=s.picksIn.length;p.picksOut+=s.picksOut.length;p.incomingValue+=s.valueIn;p.outgoingValue+=s.valueOut;
          for(const a of s.playersIn){p.positionIn[a.position]++;if(s.valueIn>0&&s.valueOut>0)p.positionRatios[a.position].push(s.valueOut/s.valueIn)}
          for(const a of s.playersOut)p.positionOut[a.position]++;
          if(s.valueIn>0&&s.valueOut>0)p.tradeRatios.push(s.valueIn/s.valueOut);
        }
        const feedSides=[...sides.entries()].map(([rid,s])=>{const ownerId=rosterToOwner.get(rid)||"",name=currentNames.get(ownerId)||intelOwnerName(usersById.get(ownerId),{roster_id:rid});return {rosterId:rid,ownerId,name,...s}}).filter(x=>x.ownerId);
        if(feedSides.length>=2)feed.push({id:String(tx?.transaction_id||created),created,season:Number(season?.meta?.season)||0,sides:feedSides,valueGap:feedSides.length===2?Math.abs(feedSides[0].valueIn-feedSides[1].valueIn):0});
      }else{
        for(const rid of involved){
          const ownerId=rosterToOwner.get(rid)||"";if(!ownerId)continue;
          const p=ensure(ownerId,currentNames.get(ownerId)||intelOwnerName(usersById.get(ownerId),{roster_id:rid}));
          if(type==="waiver")p.waivers++;if(type==="free_agent")p.freeAgentAdds++;
        }
      }
      for(const faab of tx?.waiver_budget||[]){
        const sender=rosterToOwner.get(Number(faab?.sender)),receiver=rosterToOwner.get(Number(faab?.receiver)),amount=intelNumber(faab?.amount);
        if(sender)ensure(sender,currentNames.get(sender)||sender).faabSpent+=amount;
        if(receiver)ensure(receiver,currentNames.get(receiver)||receiver).faabReceived+=amount;
      }
    }
  }
  const rows=[...profiles.values()].filter(p=>activeOwnerIds.has(String(p.ownerId))),leaguePositionTotals={QB:0,RB:0,WR:0,TE:0};let leagueIncoming=0;
  for(const p of rows)for(const pos of INTEL_POSITIONS){leaguePositionTotals[pos]+=p.positionIn[pos];leagueIncoming+=p.positionIn[pos]}
  const leagueShares=Object.fromEntries(INTEL_POSITIONS.map(pos=>[pos,leagueIncoming?leaguePositionTotals[pos]/leagueIncoming:.25]));
  for(const p of rows){
    const totalIn=INTEL_POSITIONS.reduce((s,pos)=>s+p.positionIn[pos],0);
    p.positionBias=Object.fromEntries(INTEL_POSITIONS.map(pos=>{const share=totalIn?p.positionIn[pos]/totalIn:0,ratios=p.positionRatios[pos]||[],payRatio=ratios.length?ratios.reduce((a:number,b:number)=>a+b,0)/ratios.length:1;return [pos,{share,leagueShare:leagueShares[pos],bias:share-leagueShares[pos],payRatio}]}));
    p.valueRatio=p.tradeRatios.length?p.tradeRatios.reduce((a:number,b:number)=>a+b,0)/p.tradeRatios.length:1;
    const tags:string[]=[],topPos=INTEL_POSITIONS.map(pos=>({pos,...p.positionBias[pos]})).sort((a,b)=>b.bias-a.bias)[0];
    if(topPos&&topPos.bias>=.08)tags.push(topPos.pos+" Aggressive");
    if(topPos&&topPos.bias>=.05&&topPos.payRatio>1.05)tags.push("Overvalues "+topPos.pos);
    if(p.picksIn-p.picksOut>=2)tags.push("Pick Collector");if(p.picksOut-p.picksIn>=2)tags.push("Pick Seller");
    if(p.valueRatio<.94&&p.trades>=2)tags.push("Pays Up");if(p.valueRatio>1.06&&p.trades>=2)tags.push("Value Seeker");
    if(p.trades>=Math.max(4,seasons.length*2))tags.push("Active Trader");if(p.waivers+p.freeAgentAdds>=12)tags.push("Waiver Hawk");
    p.tags=tags.slice(0,4);
  }
  feed.sort((a,b)=>b.created-a.created);
  return {profiles:rows.sort((a,b)=>Number(b.isMine)-Number(a.isMine)||b.trades-a.trades||a.name.localeCompare(b.name)),feed:feed.slice(0,80)};
}

export async function managerIntelMode(league:SleeperLeagueIntegration){
  const base=await loadIntelBase(league),seasons=await historySeasons(league.leagueId,3),mine=resolveIntelRoster(base.rosters,base.users,league.teamIdentity||""),myOwnerId=String(mine?.owner_id||""),activeOwnerIds=new Set<string>((base.rosters||[]).map((r:any)=>String(r?.owner_id||"")).filter(Boolean)),analysis=analyze(seasons,base.playerDb,base.dataset,league,base.users,myOwnerId,activeOwnerIds),c=await ensureTursoSchema();
  let draftTendencies:any[]=[];
  try{const r=await c.execute({sql:"select owner_name,owner_key,count(*) as sample_size from mock_draft_history where league_key=? group by owner_name,owner_key",args:[league.key]});draftTendencies=r.rows.map((x:any)=>({ownerName:String(x.owner_name),ownerKey:String(x.owner_key),sampleSize:Number(x.sample_size)||0}))}catch{}
  return {league:{key:league.key,name:String(base.leagueData?.name||league.name)},...analysis,draftTendencies,seasons:seasons.map(s=>Number(s?.meta?.season)).filter(Boolean)};
}
