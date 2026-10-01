import {getIntegrations} from "@/lib/integrations";

export const dynamic="force-dynamic";

const SLUG_TO_KEY:Record<string,string>={
  "one-league":"one-league",
  "last-man-standing":"last-man-standing",
  "last-minute":"last-minute-dynasty",
  "dr":"drew-ross"
};

const cache=new Map<string,{expires:number,data:any}>();

async function j(url:string){
  const r=await fetch(url,{cache:"no-store",headers:{"user-agent":"RookieDraft/1.0"}});
  if(!r.ok)throw new Error("Request failed "+r.status+" for "+new URL(url).hostname);
  return r.json();
}

function norm(value:any){
  return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
}

function playerSlug(name:string,position:string){
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/['’]/g,"").replace(/\./g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")+"-"+position.toLowerCase();
}

function numberFrom(value:any){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:null;
}

function findKtc(node:any,depth=0):number|null{
  if(node==null||depth>8)return null;
  if(Array.isArray(node)){
    for(const item of node){const hit=findKtc(item,depth+1);if(hit)return hit}
    return null;
  }
  if(typeof node!=="object")return null;
  const label=String(node.name||node.label||node.source||node.provider||"");
  if(/keep\s*trade\s*cut|ktc/i.test(label)){
    for(const key of ["rawValue","raw_value","raw","value","score"]){
      const n=numberFrom(node[key]);
      if(n)return n;
    }
  }
  for(const [key,value] of Object.entries(node)){
    if(/keep.?trade.?cut|\bktc\b/i.test(key)){
      if(typeof value==="number"){const n=numberFrom(value);if(n)return n}
      if(value&&typeof value==="object"){
        for(const child of ["rawValue","raw_value","raw","value","score"]){
          const n=numberFrom((value as any)[child]);
          if(n)return n;
        }
      }
    }
  }
  for(const value of Object.values(node)){
    const hit=findKtc(value,depth+1);
    if(hit)return hit;
  }
  return null;
}

function findComposite(node:any,depth=0):number|null{
  if(node==null||depth>6)return null;
  if(Array.isArray(node)){
    for(const item of node){const hit=findComposite(item,depth+1);if(hit)return hit}
    return null;
  }
  if(typeof node!=="object")return null;
  for(const key of ["composite","tradyrValue","tradyr_value"]){
    const n=numberFrom(node[key]);
    if(n)return n;
  }
  for(const value of Object.values(node)){
    const hit=findComposite(value,depth+1);
    if(hit)return hit;
  }
  return null;
}

function marketValue(payload:any){
  const root=payload?.data??payload;
  const ktc=findKtc(root);
  if(ktc)return{value:ktc,ktcRaw:ktc,composite:findComposite(root),source:"KTC via Tradyr"};
  const composite=findComposite(root);
  if(composite)return{value:Math.round(composite*10),ktcRaw:null,composite,source:"Tradyr composite"};
  return null;
}

async function tradyrPlayer(name:string,position:string){
  const slug=playerSlug(name,position);
  const key="player:"+slug;
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now())return saved.data;
  try{
    const payload=await j("https://api.tradyr.app/v1/players/"+encodeURIComponent(slug));
    const value=marketValue(payload);
    const data=value?{name,position,slug,...value}:null;
    cache.set(key,{expires:Date.now()+6*60*60*1000,data});
    return data;
  }catch{
    cache.set(key,{expires:Date.now()+30*60*1000,data:null});
    return null;
  }
}

function collectObjects(node:any,out:any[]=[],depth=0){
  if(node==null||depth>8)return out;
  if(Array.isArray(node)){for(const item of node)collectObjects(item,out,depth+1);return out}
  if(typeof node!=="object")return out;
  out.push(node);
  for(const value of Object.values(node))collectObjects(value,out,depth+1);
  return out;
}

async function tradyrPick(year:number,round:number,slot:number,numTeams:number){
  const key=`picks:${numTeams}`;
  let payload:any;
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now())payload=saved.data;
  else{
    payload=await j(`https://api.tradyr.app/v1/picks?numQbs=2&numTeams=${numTeams}`);
    cache.set(key,{expires:Date.now()+6*60*60*1000,data:payload});
  }
  const exactIds=[
    `pick_${year}_${round}_${String(slot).padStart(2,"0")}`,
    `${year}_${round}_${String(slot).padStart(2,"0")}`
  ];
  const objects=collectObjects(payload?.data??payload);
  let match=objects.find(obj=>exactIds.includes(String(obj.id||obj.pickId||obj.pick_id||"").toLowerCase()));
  if(!match){
    match=objects.find(obj=>
      Number(obj.year||obj.season)===year&&
      Number(obj.round)===round&&
      Number(obj.pick||obj.slot||obj.pickNumber||obj.pick_number)===slot
    );
  }
  if(!match)return null;
  const value=marketValue(match)||(()=>{
    const direct=numberFrom(match.value||match.tradeValue||match.trade_value);
    return direct?{value:direct,ktcRaw:null,composite:direct,source:"Tradyr pick value"}:null;
  })();
  return value?{name:`${year} ${round}.${String(slot).padStart(2,"0")}`,id:String(match.id||exactIds[0]),...value}:null;
}

async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>){
  const out:R[]=new Array(items.length);
  let next=0;
  async function worker(){
    while(true){
      const i=next++;
      if(i>=items.length)return;
      out[i]=await fn(items[i]);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return out;
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

function balance(send:number,get:number){
  return Math.round(Math.abs(send-get)/Math.max(send,get,1)*1000)/10;
}

function assetKey(items:any[]){
  return items.map(x=>x.name).sort().join("|");
}

function buildIdeas(target:any,mine:any[],theirs:any[]){
  const ideas:any[]=[];
  const seen=new Set<string>();
  const add=(kind:string,youSend:any[],youGet:any[])=>{
    if(!youSend.length||!youGet.length)return;
    const sendValue=Math.round(youSend.reduce((s,x)=>s+x.value,0));
    const receiveValue=Math.round(youGet.reduce((s,x)=>s+x.value,0));
    const diff=balance(sendValue,receiveValue);
    if(diff>26)return;
    const key=assetKey(youSend)+"=>"+assetKey(youGet);
    if(seen.has(key))return;
    seen.add(key);
    ideas.push({kind,youSend,youGet,sendValue,receiveValue,differencePct:diff});
  };

  const mineSorted=[...mine].sort((a,b)=>b.value-a.value);
  const theirsSorted=[...theirs].sort((a,b)=>b.value-a.value);

  for(const p of mineSorted){
    if(p.value>=target.value*.78&&p.value<=target.value*1.24)add("Straight up",[p],[target]);
  }

  const pairPool=mineSorted.filter(p=>p.value<target.value*.9&&p.value>target.value*.12).slice(0,18);
  for(let i=0;i<pairPool.length;i++)for(let k=i+1;k<pairPool.length;k++){
    const sum=pairPool[i].value+pairPool[k].value;
    if(sum>=target.value*.82&&sum<=target.value*1.22)add("Two-for-one",[pairPool[i],pairPool[k]],[target]);
  }

  for(const p of mineSorted.slice(0,18)){
    if(p.value<=target.value*1.12)continue;
    const need=p.value-target.value;
    for(const addon of theirsSorted){
      if(addon.value<need*.68||addon.value>need*1.35)continue;
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
    const [league,drafts,users,rosters,traded,players]=await Promise.all([
      j(`https://api.sleeper.app/v1/league/${leagueId}`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/drafts`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
      j(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`).catch(()=>[]),
      j("https://api.sleeper.app/v1/players/nfl")
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

    const rosterAssets=(roster:any)=>{
      const ids=[...(roster.starters||[]),...(roster.players||[])].filter((id:any)=>id&&id!=="0");
      const unique=[...new Set(ids)].slice(0,28);
      return unique.map(id=>{
        const p=players[id as any];
        const position=String(p?.position||"");
        if(!["QB","RB","WR","TE"].includes(position))return null;
        return {id:String(id),name:`${p?.first_name||""} ${p?.last_name||""}`.trim(),position,team:p?.team||"FA"};
      }).filter(Boolean);
    };

    const mineRaw=rosterAssets(myRoster) as any[];
    const theirsRaw=rosterAssets(ownerRoster) as any[];
    const valued=await mapLimit([...mineRaw.map(x=>({...x,side:"mine"})),...theirsRaw.map(x=>({...x,side:"theirs"}))],6,async asset=>{
      const value=await tradyrPlayer(asset.name,asset.position);
      return value?{...asset,...value}:null;
    });
    const mine=valued.filter((x:any)=>x?.side==="mine") as any[];
    const theirs=valued.filter((x:any)=>x?.side==="theirs") as any[];

    const draftYear=Math.max(2027,Number(draft.season||2027));
    const pick=await tradyrPick(draftYear,round,slot,teams);
    if(!pick)return Response.json({error:"Could not find a current market value for this rookie pick"},{status:502});

    const ideas=buildIdeas(pick,mine,theirs);
    return Response.json({
      pick:{...pick,pickNo,round,slot,ownerRosterId,ownerName},
      owner:{name:ownerName,rosterId:ownerRosterId,valuedPlayers:theirs.length},
      me:{name:myName,rosterId:Number(myRoster.roster_id),valuedPlayers:mine.length},
      ideas,
      source:{
        provider:"Tradyr Public API",
        basis:"KTC raw value when Tradyr exposes it; Tradyr composite fallback otherwise",
        attribution:"Powered by Tradyr · includes KeepTradeCut as a component source",
        url:"https://tradyr.app"
      },
      generatedAt:new Date().toISOString()
    });
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build trade ideas"},{status:500});
  }
}
