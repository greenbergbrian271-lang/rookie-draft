import {getIntegrations} from "@/lib/integrations";

export const dynamic="force-dynamic";

const SLUG_TO_KEY:Record<string,string>={
  "one-league":"one-league",
  "last-man-standing":"last-man-standing",
  "last-minute":"last-minute-dynasty",
  "dr":"drew-ross"
};

type KtcRow={
  name_id:string;
  sleeper_id?:string|null;
  full_name:string;
  position:string;
  sf_trade_value?:number|null;
  trade_value?:number|null;
};

type Asset={
  id?:string;
  name:string;
  position?:string;
  value:number;
  source:string;
  side?:"mine"|"theirs";
};

let ktcCache:{expires:number;rows:KtcRow[]}|null=null;

async function j(url:string){
  const r=await fetch(url,{cache:"no-store",headers:{"user-agent":"RookieDraft/1.0"}});
  if(!r.ok)throw new Error("Request failed "+r.status+" for "+new URL(url).hostname);
  return r.json();
}

async function ktcRows(){
  if(ktcCache&&ktcCache.expires>Date.now())return ktcCache.rows;
  const data=await j("https://dynasty-daddy.com/api/v1/player/all/today");
  const rows=(Array.isArray(data)?data:[]) as KtcRow[];
  ktcCache={rows,expires:Date.now()+60*60*1000};
  return rows;
}

function norm(value:any){
  return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}

function currentOwner(originalRosterId:number,round:number,traded:any[]){
  const matches=traded.filter((p:any)=>Number(p.roster_id)===originalRosterId&&Number(p.round)===round);
  return Number(matches[matches.length-1]?.owner_id||originalRosterId);
}

function slotForPick(pickNo:number,teams:number,type:string){
  const round=Math.floor((pickNo-1)/teams)+1;
  const within=((pickNo-1)%teams)+1;
  return String(type||"").toLowerCase()==="snake"&&round%2===0?teams-within+1:within;
}

function pickBucket(slot:number,teams:number){
  const third=teams/3;
  if(slot<=Math.ceil(third))return "Early";
  if(slot>Math.ceil(third*2))return "Late";
  return "Mid";
}

function valueOf(row:KtcRow|undefined,superflex:boolean){
  if(!row)return null;
  const n=Number(superflex?row.sf_trade_value:row.trade_value);
  return Number.isFinite(n)&&n>0?n:null;
}

function pickAsset(rows:KtcRow[],year:number,round:number,slot:number,teams:number,superflex:boolean):Asset|null{
  const bucket=pickBucket(slot,teams);
  const wanted=norm(`${year} ${bucket} ${round===1?"1st":round===2?"2nd":round===3?"3rd":round+"th"}`);
  let row=rows.find(x=>x.position==="PI"&&norm(x.full_name)===wanted);
  if(!row){
    const roundWord=round===1?"1st":round===2?"2nd":round===3?"3rd":round+"th";
    row=rows.find(x=>x.position==="PI"&&norm(x.full_name)===norm(`${year} ${bucket} ${roundWord}`));
  }
  const value=valueOf(row,superflex);
  if(!row||value==null)return null;
  return {
    id:row.name_id,
    name:row.full_name,
    position:"PICK",
    value,
    source:"KeepTradeCut via Dynasty Daddy"
  };
}

function weightedPackageValue(items:Asset[]){
  if(!items.length)return 0;
  const sorted=[...items].sort((a,b)=>b.value-a.value);
  return sorted.reduce((sum,item,index)=>{
    const weight=index===0?1:index===1?.82:index===2?.72:.65;
    return sum+item.value*weight;
  },0);
}

function gapPct(a:number,b:number){
  return Math.round(Math.abs(a-b)/Math.max(a,b,1)*1000)/10;
}

function assetKey(items:Asset[]){
  return items.map(x=>x.name).sort().join("|");
}

function idea(kind:string,youSend:Asset[],youGet:Asset[]){
  const sendValue=Math.round(youSend.reduce((s,x)=>s+x.value,0));
  const receiveValue=Math.round(youGet.reduce((s,x)=>s+x.value,0));
  const sendAdjusted=Math.round(weightedPackageValue(youSend));
  const receiveAdjusted=Math.round(weightedPackageValue(youGet));
  return {
    kind,youSend,youGet,sendValue,receiveValue,sendAdjusted,receiveAdjusted,
    differencePct:gapPct(sendAdjusted,receiveAdjusted)
  };
}

function buildIdeas(target:Asset,mine:Asset[],theirs:Asset[]){
  const ideas:any[]=[];
  const seen=new Set<string>();
  const add=(kind:string,youSend:Asset[],youGet:Asset[])=>{
    if(!youSend.length||!youGet.length)return;
    const next=idea(kind,youSend,youGet);
    if(next.differencePct>18)return;
    const key=assetKey(youSend)+"=>"+assetKey(youGet);
    if(seen.has(key))return;
    seen.add(key);
    ideas.push(next);
  };

  const mineSorted=[...mine].sort((a,b)=>b.value-a.value);
  const theirsSorted=[...theirs].sort((a,b)=>b.value-a.value);

  for(const p of mineSorted){
    if(p.value>=target.value*.84&&p.value<=target.value*1.18)add("Straight up",[p],[target]);
  }

  const pairPool=mineSorted.filter(p=>p.value<target.value*.9&&p.value>target.value*.15).slice(0,20);
  for(let i=0;i<pairPool.length;i++)for(let k=i+1;k<pairPool.length;k++){
    add("Two-for-one",[pairPool[i],pairPool[k]],[target]);
  }

  for(const p of mineSorted.slice(0,22)){
    if(p.value<=target.value*1.08)continue;
    for(const addon of theirsSorted.slice(0,24)){
      add("Pick + add-on",[p],[target,addon]);
    }
  }

  return ideas.sort((a,b)=>a.differencePct-b.differencePct||a.youSend.length-b.youSend.length).slice(0,6);
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const slug=String(body?.slug||"");
    const pickNo=Number(body?.pickNo||0);
    const boardKey=SLUG_TO_KEY[slug];
    if(!boardKey||!pickNo)return Response.json({error:"League and pick are required"},{status:400});

    const integrations=await getIntegrations();
    const integration=integrations.sleeper.leagues.find(x=>x.key===boardKey);
    if(!integration?.leagueId)return Response.json({error:"Sleeper league is not configured"},{status:400});

    const leagueId=integration.leagueId;
    const [league,drafts,users,rosters,traded,players,market]=await Promise.all([
      j(`https://api.sleeper.app/v1/league/${leagueId}`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/drafts`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`).catch(()=>[]),
      j("https://api.sleeper.app/v1/players/nfl"),
      ktcRows()
    ]);

    const draft=[...drafts].sort((a:any,b:any)=>(b.start_time||0)-(a.start_time||0))[0];
    if(!draft)return Response.json({error:"No Sleeper rookie draft found for this league"},{status:404});

    const teams=Number(league?.total_rosters||rosters.length||12);
    const round=Math.floor((pickNo-1)/teams)+1;
    const slot=slotForPick(pickNo,teams,draft.type);
    const originalRosterId=Number(draft.slot_to_roster_id?.[slot]||slot);
    const ownerRosterId=currentOwner(originalRosterId,round,traded);

    const identity=String(integration.teamIdentity||"").trim().toLowerCase();
    const byUser:Record<string,string>={};
    const mineIds=new Set<number>();
    const matchedUsers=new Set<string>();
    for(const u of users){
      byUser[u.user_id]=u.metadata?.team_name||u.display_name||u.username||u.user_id;
      const candidates=[u.user_id,u.display_name,u.username,u.metadata?.team_name].map((v:any)=>String(v||"").trim().toLowerCase()).filter(Boolean);
      if(identity&&candidates.includes(identity))matchedUsers.add(String(u.user_id));
    }
    for(const r of rosters){
      if((identity&&String(r.roster_id)===identity)||matchedUsers.has(String(r.owner_id)))mineIds.add(Number(r.roster_id));
    }

    const myRoster=rosters.find((r:any)=>mineIds.has(Number(r.roster_id)));
    const ownerRoster=rosters.find((r:any)=>Number(r.roster_id)===ownerRosterId);
    if(!myRoster)return Response.json({error:"Could not identify your Sleeper roster from Integrations"},{status:400});
    if(!ownerRoster)return Response.json({error:"Could not identify the pick owner's roster"},{status:400});
    if(Number(myRoster.roster_id)===ownerRosterId)return Response.json({error:"That pick is already owned by your roster"},{status:400});

    const ownerName=byUser[ownerRoster.owner_id]||`Roster ${ownerRosterId}`;
    const myName=byUser[myRoster.owner_id]||"Your team";
    const superflex=true;

    const bySleeper=new Map(market.filter(x=>x.sleeper_id).map(x=>[String(x.sleeper_id),x]));
    const byName=new Map(market.map(x=>[norm(x.full_name),x]));

    const rosterAssets=(roster:any,side:"mine"|"theirs"):Asset[]=>{
      const ids=[...(roster.starters||[]),...(roster.players||[])].filter((id:any)=>id&&id!=="0");
      return [...new Set(ids)].map(id=>{
        const sleeper=players[id as any];
        const position=String(sleeper?.position||"");
        if(!["QB","RB","WR","TE"].includes(position))return null;
        const name=`${sleeper?.first_name||""} ${sleeper?.last_name||""}`.trim();
        const row=bySleeper.get(String(id))||byName.get(norm(name));
        const value=valueOf(row,superflex);
        if(value==null)return null;
        return {id:String(id),name,position,value,source:"KeepTradeCut via Dynasty Daddy",side};
      }).filter(Boolean) as Asset[];
    };

    const mine=rosterAssets(myRoster,"mine");
    const theirs=rosterAssets(ownerRoster,"theirs");

    const draftYear=Math.max(2027,Number(draft.season||2027));
    const target=pickAsset(market,draftYear,round,slot,teams,superflex);
    if(!target)return Response.json({error:"Could not map this pick to a current KTC future-pick value"},{status:502});

    const ideas=buildIdeas(target,mine,theirs);
    return Response.json({
      pick:{...target,pickNo,round,slot,ownerRosterId,ownerName,displayName:`${draftYear} ${round}.${String(slot).padStart(2,"0")}`},
      owner:{name:ownerName,rosterId:ownerRosterId,valuedPlayers:theirs.length},
      me:{name:myName,rosterId:Number(myRoster.roster_id),valuedPlayers:mine.length},
      ideas,
      source:{
        provider:"Dynasty Daddy",
        basis:"Current KeepTradeCut superflex values. Future numbered picks map to the matching Early/Mid/Late KTC pick bucket.",
        attribution:"KeepTradeCut market values via Dynasty Daddy",
        url:"https://dynasty-daddy.com"
      },
      generatedAt:new Date().toISOString()
    });
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build trade ideas"},{status:500});
  }
}
