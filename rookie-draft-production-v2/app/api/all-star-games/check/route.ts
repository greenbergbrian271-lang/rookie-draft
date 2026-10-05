import {ensureTursoSchema,rows} from "@/lib/turso";
import {ALL_STAR_GAMES,fetchAllStarSource,gameDefinition,sourceHasPlayer,excerptAround} from "@/lib/all-star-games";
import {markPlayerDeclaredFromSignal} from "@/lib/draft-status-signals";

export const dynamic="force-dynamic";
type Source={kind:"website"|"twitter"|"roster_a"|"roster_b";url:string;rosterKey:"A"|"B"|null};

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({})),requested=String(body?.gameKey||"");
    if(requested&&!gameDefinition(requested))return Response.json({error:"Unknown all-star game."},{status:400});
    const q=await ensureTursoSchema(),players=rows(await q.execute("select id,name,position,college from players where draft_class=2027 and position in ('QB','RB','WR','TE') order by position,watch_order,name"));
    const settings=rows(await q.execute("select * from all_star_game_settings")),games=requested?ALL_STAR_GAMES.filter(g=>g.key===requested):ALL_STAR_GAMES;
    const results:any[]=[];
    for(const g of games){
      const row=settings.find((x:any)=>x.game_key===g.key);
      const config={websiteUrl:String(row?.website_url||g.websiteUrl),twitterUrl:String(row?.twitter_url||g.twitterUrl),rosterAName:String(row?.roster_a_name||g.rosterAName),rosterAUrl:String(row?.roster_a_url||""),rosterBName:String(row?.roster_b_name||g.rosterBName),rosterBUrl:String(row?.roster_b_url||"")};
      const sources:Source[]=[
        {kind:"website",url:config.websiteUrl,rosterKey:null},
        {kind:"twitter",url:config.twitterUrl,rosterKey:null},
        ...(config.rosterAUrl?[{kind:"roster_a" as const,url:config.rosterAUrl,rosterKey:"A" as const}]:[]),
        ...(config.rosterBUrl?[{kind:"roster_b" as const,url:config.rosterBUrl,rosterKey:"B" as const}]:[])
      ];
      const fetched=await Promise.all(sources.map(async s=>{try{return {source:s,...await fetchAllStarSource(s.url),error:null}}catch(e:unknown){return {source:s,text:"",url:s.url,error:e instanceof Error?e.message:String(e)}}}));
      const found=new Map<number,{player:any;rosterKey:"A"|"B"|null;kind:string;url:string;excerpt:string}>();
      for(const f of fetched){
        if(f.error)continue;
        for(const p of players){
          if(!sourceHasPlayer(f.text,String(p.name),f.source.kind,[config.rosterAName,config.rosterBName]))continue;
          const prev=found.get(Number(p.id)),priority=f.source.rosterKey?2:1,prevPriority=prev?.rosterKey?2:1;
          if(!prev||priority>=prevPriority)found.set(Number(p.id),{player:p,rosterKey:f.source.rosterKey,kind:f.source.kind,url:f.url,excerpt:excerptAround(f.text,String(p.name))});
        }
      }
      const existing=rows(await q.execute({sql:"select player_id from all_star_invites where game_key=?",args:[g.key]})),existingSet=new Set(existing.map((x:any)=>Number(x.player_id)));
      const now=new Date().toISOString();let added=0,updated=0;
      for(const hit of found.values()){
        if(existingSet.has(Number(hit.player.id)))updated++;else added++;
        await q.execute({sql:"insert into all_star_invites(game_key,player_id,roster_key,source_kind,source_url,source_excerpt,discovered_at,updated_at) values(?,?,?,?,?,?,?,?) on conflict(game_key,player_id) do update set roster_key=coalesce(excluded.roster_key,all_star_invites.roster_key),source_kind=excluded.source_kind,source_url=excluded.source_url,source_excerpt=excluded.source_excerpt,updated_at=excluded.updated_at",args:[g.key,hit.player.id,hit.rosterKey,hit.kind,hit.url,hit.excerpt||null,now,now]});
        await q.execute({sql:"insert into workflow_tags(player_id,tag,detail,updated_at) values(?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",args:[hit.player.id,"ALL_STAR",g.legacyName,now]});
        await markPlayerDeclaredFromSignal(q,hit.player.id,2027,"ALL_STAR_GAME",{url:hit.url,title:g.name});
      }
      const sourceSummary=fetched.map(f=>({kind:f.source.kind,url:f.url,ok:!f.error,error:f.error}));
      const scan={checkedAt:now,matched:found.size,added,updated,sourceSummary};
      await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:["all_star_scan_"+g.key,JSON.stringify(scan),now]});
      results.push({gameKey:g.key,name:g.name,...scan});
    }
    return Response.json({checkedAt:new Date().toISOString(),results,totalAdded:results.reduce((n,x)=>n+x.added,0),totalMatched:results.reduce((n,x)=>n+x.matched,0)});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"All-star invite scan failed."},{status:500})}
}
