import {ensureTursoSchema,rows} from "@/lib/turso";
import {normalizePlayerIdentity} from "@/lib/player-identity";
import {getDraftClassContext} from "@/lib/draft-context";
import {loadScoutingGlossary} from "@/lib/scouting-glossary-store";
import {buildBoardGradeRows,type BoardPlayer} from "@/lib/scouting-board-grades";

type Severity="error"|"warning"|"info";
type Issue={severity:Severity;code:string;title:string;detail:string;playerId?:number;playerName?:string;position?:string};

const issue=(severity:Severity,code:string,title:string,detail:string,extra:Partial<Issue>={}):Issue=>({severity,code,title,detail,...extra});
const parse=(value:unknown)=>{try{return value?JSON.parse(String(value)):null}catch{return null}};

async function imageHealth(url:string){
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
    const response=await fetch(url,{method:"HEAD",redirect:"follow",cache:"no-store",signal:controller.signal});
    clearTimeout(timer);
    return response.ok;
  }catch{return false}
}

export async function GET(req:Request){
  try{
    const u=new URL(req.url),draftClass=Number(u.searchParams.get("draftClass")||2027),deep=u.searchParams.get("deep")==="1",c=await ensureTursoSchema();
    const [players,context,activeRows,aliases,tags,earlyRows]=await Promise.all([
      c.execute({sql:"select * from players where draft_class=? and position in ('QB','RB','WR','TE') order by position,watch_order,name",args:[draftClass]}).then(rows),
      getDraftClassContext(c,draftClass),
      c.execute({sql:"select a.position,a.import_id,r.season from pff_active_datasets a join pff_dataset_registry r on r.import_id=a.import_id where a.draft_class=? order by a.position",args:[draftClass]}).then(rows).catch(()=>[]),
      c.execute({sql:"select a.player_id,a.alias_type,a.normalized_value from player_identity_aliases a join players p on p.id=a.player_id where p.draft_class=?",args:[draftClass]}).then(rows),
      c.execute({sql:"select w.player_id,w.tag,w.detail from workflow_tags w join players p on p.id=w.player_id where p.draft_class=?",args:[draftClass]}).then(rows),
      c.execute({sql:"select e.player_id,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? and e.category='Early Declare'",args:[draftClass]}).then(rows)
    ]);
    const ps=players as any[],issues:Issue[]=[];
    const active=(activeRows as any[]),activeSeasons=[...new Set(active.map(x=>Number(x.season)).filter(Number.isFinite))];
    if(context.analysisSeason==null)issues.push(issue("warning","analysis-season-unassigned","Analysis season is not assigned","Draft Class "+draftClass+" does not have an explicit analysis season yet."));
    if(activeSeasons.length>1)issues.push(issue("error","mixed-active-seasons","Active PFF positions use different seasons","Active positions currently span seasons "+activeSeasons.join(", ")+". A draft class should resolve to one analysis season."));
    if(context.analysisSeason!=null&&activeSeasons.length&&activeSeasons.some(s=>s!==Number(context.analysisSeason)))issues.push(issue("error","context-season-mismatch","Draft Class / Stat Season mismatch","Draft Class "+draftClass+" is mapped to "+context.analysisSeason+", but active PFF data includes "+activeSeasons.join(", ")+"."));
    const normGroups=new Map<string,any[]>();
    for(const p of ps){const k=normalizePlayerIdentity(p.name),arr=normGroups.get(k)||[];arr.push(p);normGroups.set(k,arr)}
    for(const group of normGroups.values())if(group.length>1)issues.push(issue("error","duplicate-canonical-player","Possible duplicate player identity",group.map(x=>x.name+" #"+x.id).join(" · ")));
    const espnGroups=new Map<string,any[]>();
    for(const p of ps)if(p.espn_athlete_id){const k=String(p.espn_athlete_id),arr=espnGroups.get(k)||[];arr.push(p);espnGroups.set(k,arr)}
    for(const [espn,group] of espnGroups)if(group.length>1)issues.push(issue("error","duplicate-espn-id","ESPN identity is attached to multiple players","ESPN ID "+espn+" is used by "+group.map(x=>x.name).join(", ")+"."));
    const nameAlias=new Set((aliases as any[]).filter(x=>String(x.alias_type)==="NAME").map(x=>Number(x.player_id)));
    for(const p of ps){
      if(!p.player_uid)issues.push(issue("error","missing-player-uid","Stable player ID missing",p.name+" is missing a permanent player UID.",{playerId:Number(p.id),playerName:p.name,position:p.position}));
      if(!nameAlias.has(Number(p.id)))issues.push(issue("warning","missing-name-alias","Canonical name alias missing",p.name+" is not represented in the identity alias table.",{playerId:Number(p.id),playerName:p.name,position:p.position}));
      if(p.headshot_url&&!/^https?:\/\//i.test(String(p.headshot_url)))issues.push(issue("error","invalid-headshot-url","Invalid headshot URL",p.name+" has a non-http(s) headshot override.",{playerId:Number(p.id),playerName:p.name,position:p.position}));
    }
    const early=new Map((earlyRows as any[]).map(x=>[Number(x.player_id),String(x.commentary||"")]));
    const tagMap=new Map<number,Set<string>>();
    for(const t of tags as any[]){const id=Number(t.player_id),set=tagMap.get(id)||new Set<string>();set.add(String(t.tag));tagMap.set(id,set)}
    for(const p of ps){
      const set=tagMap.get(Number(p.id))||new Set<string>(),decision=early.get(Number(p.id))||"";
      if(/^no$/i.test(decision)&&(set.has("DECLARES")||set.has("COMBINE")||set.has("ALL_STAR")))issues.push(issue("error","contradictory-draft-status","Draft status signals conflict",p.name+" is marked as returning while declaration/combine/all-star evidence also exists.",{playerId:Number(p.id),playerName:p.name,position:p.position}));
    }

    const watched=ps.filter(p=>p.scouting_status==="WATCHED") as BoardPlayer[];
    if(watched.length){
      const [glossary,evaluations,sessions]=await Promise.all([
        loadScoutingGlossary(c),
        c.execute({sql:"select e.player_id,e.category,e.value,e.commentary from evaluations e join players p on p.id=e.player_id where p.draft_class=? and p.scouting_status='WATCHED'",args:[draftClass]}).then(rows),
        c.execute({sql:"select s.player_id,count(*) as game_count from scouting_sessions s join players p on p.id=s.player_id where p.draft_class=? group by s.player_id",args:[draftClass]}).then(rows)
      ]);
      const grades=await buildBoardGradeRows({db:c,draftClass,players:watched,evaluations,sessions,glossary});
      for(const g of grades as any[]){
        const extra={playerId:Number(g.id),playerName:String(g.name),position:String(g.position)};
        if(g.authoritativeGrade==null)issues.push(issue("error","missing-authoritative-grade","Watched player has no usable grade",g.name+" cannot currently produce a board grade.",extra));
        if(g.position!=="QB"&&g.productionGrade==null)issues.push(issue("warning","missing-production-grade","Production grade is missing",g.name+" has no production grade. Check Player Data match, threshold population, and required inputs.",extra));
        if(g.analyticalGrade==null)issues.push(issue("warning","missing-analytical-grade","Analytical grade is missing",g.name+" has no analytical grade. Check Player Data percentiles and required inputs.",extra));
        const vals=[g.scoutingGrade,g.productionGrade,g.analyticalGrade,g.preDraftGrade,g.finalGrade].map(Number).filter(Number.isFinite);
        if(vals.some(v=>v<-25||v>150))issues.push(issue("error","grade-outlier","Grade is outside the expected safety range",g.name+" has a computed grade outside -25 to 150. Use Explain Grade to trace the dependency chain.",extra));
      }
      if(active.length){
        for(const a of active){
          const pos=String(a.position),importId=Number(a.import_id),ids=watched.filter(p=>p.position===pos).map(p=>Number(p.id));
          if(!ids.length)continue;
          const recs=rows(await c.execute({sql:"select player_id,percentiles_json,player_name from pff_player_records where import_id=? and position=? and player_id is not null",args:[importId,pos]})) as any[];
          const byId=new Map(recs.map(r=>[Number(r.player_id),r]));
          for(const p of watched.filter(p=>p.position===pos)){
            const r=byId.get(Number(p.id));
            if(!r)issues.push(issue("warning","player-data-unmatched","Watched player is not linked to active Player Data",p.name+" has no canonical identity match in the active "+pos+" dataset.",{playerId:Number(p.id),playerName:p.name,position:pos}));
            else if(Object.keys(parse(r.percentiles_json)||{}).length===0)issues.push(issue("warning","missing-percentiles","Active Player Data has no percentiles",p.name+" matched the active dataset but its percentile set is empty.",{playerId:Number(p.id),playerName:p.name,position:pos}));
          }
        }
      }
    }

    if(deep){
      const candidates=ps.filter(p=>p.headshot_url).slice(0,24);
      const results=await Promise.all(candidates.map(async p=>({p,ok:await imageHealth(String(p.headshot_url))})));
      for(const {p,ok} of results)if(!ok)issues.push(issue("warning","headshot-unreachable","Headshot could not be reached",p.name+" returned an error or timed out during the deep image check.",{playerId:Number(p.id),playerName:p.name,position:p.position}));
    }

    const rank={error:0,warning:1,info:2};issues.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.title.localeCompare(b.title));
    const counts={errors:issues.filter(x=>x.severity==="error").length,warnings:issues.filter(x=>x.severity==="warning").length,info:issues.filter(x=>x.severity==="info").length};
    return Response.json({draftClass,analysisSeason:context.analysisSeason,activeSeasons,playerCount:ps.length,watchedCount:watched.length,identityCoverage:ps.length?Math.round(ps.filter(p=>p.player_uid&&nameAlias.has(Number(p.id))).length/ps.length*100):100,deep,counts,status:counts.errors?"red":counts.warnings?"yellow":"green",issues,scannedAt:new Date().toISOString()});
  }catch(e:any){return Response.json({error:e?.message||"Data health scan failed"},{status:500})}
}
