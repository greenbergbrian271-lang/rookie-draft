import {ensureTursoSchema,rows} from "@/lib/turso";
import {ALL_STAR_GAMES,gameDefinition,gameKeyFromLegacy,safeHttpsUrl,normalizePersonName} from "@/lib/all-star-games";
import {historicalAllStarGames} from "@/lib/historical-all-star";

export const dynamic="force-dynamic";
const configFor=(g:any,row:any)=>({
  gameKey:g.key,
  websiteUrl:String(row?.website_url||g.websiteUrl),
  twitterUrl:String(row?.twitter_url||g.twitterUrl),
  rosterAName:String(row?.roster_a_name||g.rosterAName),
  rosterAUrl:String(row?.roster_a_url||""),
  rosterBName:String(row?.roster_b_name||g.rosterBName),
  rosterBUrl:String(row?.roster_b_url||""),
  updatedAt:row?.updated_at||null
});

async function migrateLegacy(q:any){
  const legacy=rows(await q.execute("select w.player_id,w.detail from workflow_tags w join players p on p.id=w.player_id where w.tag='ALL_STAR' and p.draft_class=2027"));
  const now=new Date().toISOString();
  for(const x of legacy){
    const key=gameKeyFromLegacy(String(x.detail||""));
    if(!key)continue;
    await q.execute({sql:"insert into all_star_invites(game_key,player_id,roster_key,source_kind,source_url,source_excerpt,discovered_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(game_key,player_id) do nothing",args:[key,x.player_id,null,"legacy",null,"Migrated from the prior All-Star Game workflow.",now,now]});
  }
}

export async function GET(req:Request){
  try{
    const q=await ensureTursoSchema(),u=new URL(req.url),draftClass=Number(u.searchParams.get("draftClass")||2027);
    if(draftClass<2027){
      const players=rows(await q.execute({sql:"select id,name,position,college,headshot_url from players where draft_class=?",args:[draftClass]}));
      const playerMap=new Map(players.map((p:any)=>[normalizePersonName(p.name),p]));
      const games=historicalAllStarGames(draftClass).map((g:any)=>({
        key:g.key,name:g.name,date:null,dateLabel:g.header,location:g.location,tagline:g.tagline,logoUrl:g.logoUrl,accent:g.accent,accent2:g.accent2,
        config:{gameKey:g.key,websiteUrl:"",twitterUrl:"",rosterAName:g.rosterAName,rosterAUrl:"",rosterBName:g.rosterBName,rosterBUrl:"",updatedAt:null},
        invites:g.invites.map((x:any,i:number)=>{const p=playerMap.get(normalizePersonName(x.name)) as any;return {game_key:g.key,player_id:p?.id||("historical-"+draftClass+"-"+g.key+"-"+i),roster_key:x.rosterKey,source_kind:"historical",source_url:null,source_excerpt:"Imported from the "+draftClass+" rookie-draft workbook.",discovered_at:null,participation_status:x.participationStatus,name:p?.name||x.name,position:p?.position||x.position,college:p?.college||x.college,headshot_url:p?.headshot_url||null}}),
        lastScan:null,historical:true
      }));
      return Response.json({draftClass,historical:true,games});
    }
    if(draftClass===2027)await migrateLegacy(q);
    const settings=rows(await q.execute("select * from all_star_game_settings"));
    const inviteRows=rows(await q.execute({sql:"select a.game_key,a.player_id,a.roster_key,a.source_kind,a.source_url,a.source_excerpt,a.discovered_at,a.participation_status,p.name,p.position,p.college,p.headshot_url from all_star_invites a join players p on p.id=a.player_id where p.draft_class=? order by p.position,p.watch_order,p.name",args:[draftClass]}));
    const scanRows=rows(await q.execute("select key,value,updated_at from settings where key like 'all_star_scan_%'"));
    const scans=new Map(scanRows.map((x:any)=>[String(x.key).replace("all_star_scan_",""),x]));
    return Response.json({draftClass,games:ALL_STAR_GAMES.map(g=>{
      const row=settings.find((x:any)=>x.game_key===g.key);
      const scan=scans.get(g.key) as any;
      let lastScan:any=null;try{lastScan=scan?JSON.parse(String(scan.value||"{}")):null}catch{}
      return {...g,config:configFor(g,row),invites:inviteRows.filter((x:any)=>x.game_key===g.key),lastScan};
    })});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load all-star games."},{status:500})}
}

export async function PATCH(req:Request){
  try{
    const x=await req.json(),g=gameDefinition(String(x?.gameKey||""));
    if(!g)return Response.json({error:"Unknown all-star game."},{status:400});
    const websiteUrl=safeHttpsUrl(x.websiteUrl),twitterUrl=safeHttpsUrl(x.twitterUrl),rosterAUrl=safeHttpsUrl(x.rosterAUrl,true),rosterBUrl=safeHttpsUrl(x.rosterBUrl,true);
    if(!websiteUrl||!twitterUrl||rosterAUrl==null||rosterBUrl==null)return Response.json({error:"All configured links must be public HTTPS URLs."},{status:400});
    const rosterAName=String(x.rosterAName||"").trim(),rosterBName=String(x.rosterBName||"").trim();
    if(!rosterAName||!rosterBName)return Response.json({error:"Both roster names are required."},{status:400});
    const q=await ensureTursoSchema(),now=new Date().toISOString();
    await q.execute({sql:"insert into all_star_game_settings(game_key,website_url,twitter_url,roster_a_name,roster_a_url,roster_b_name,roster_b_url,updated_at) values(?,?,?,?,?,?,?,?) on conflict(game_key) do update set website_url=excluded.website_url,twitter_url=excluded.twitter_url,roster_a_name=excluded.roster_a_name,roster_a_url=excluded.roster_a_url,roster_b_name=excluded.roster_b_name,roster_b_url=excluded.roster_b_url,updated_at=excluded.updated_at",args:[g.key,websiteUrl,twitterUrl,rosterAName,rosterAUrl||null,rosterBName,rosterBUrl||null,now]});
    return Response.json({ok:true,config:{gameKey:g.key,websiteUrl,twitterUrl,rosterAName,rosterAUrl,rosterBName,rosterBUrl,updatedAt:now}});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not save all-star settings."},{status:500})}
}
