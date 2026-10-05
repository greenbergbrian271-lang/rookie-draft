import {ensureTursoSchema,rows} from "@/lib/turso";
import {movePlayerToNextDraftClass,ReturningPlayerError} from "@/lib/returning-player";
import {reconcileAutomaticDraftDeclarations} from "@/lib/draft-status-signals";

const STATUSES=["ENTERING_DRAFT","RETURNING_TO_SCHOOL","TRANSFER_PORTAL"] as const;
type DraftStatus=(typeof STATUSES)[number];
const validStatus=(x:unknown):x is DraftStatus=>STATUSES.includes(String(x) as DraftStatus);
const clean=(x:unknown)=>String(x??"").trim()||null;

export async function GET(req:Request){
  try{
    const draftClass=Number(new URL(req.url).searchParams.get("draftClass")||0);
    if(!draftClass)return Response.json({error:"draftClass required"},{status:400});
    const c=await ensureTursoSchema();
    await reconcileAutomaticDraftDeclarations(c,draftClass);
    const players=rows(await c.execute({
      sql:`select p.id as playerId,p.name,p.position,p.college,p.draft_class as draftClass,p.scouting_status as scoutingStatus,
        d.status,d.source_url as sourceUrl,d.source_title as sourceTitle,d.source_type as sourceType,
        d.announcement_date as announcementDate,d.note,d.set_method as setMethod,d.verified_at as verifiedAt,d.updated_at as updatedAt
        from players p left join draft_statuses d on d.player_id=p.id and d.draft_class=p.draft_class
        where p.draft_class=? order by p.position,p.watch_order,p.name`,
      args:[draftClass]
    }));
    const announced=players.filter((p:any)=>p.status),unannounced=players.filter((p:any)=>!p.status);
    return Response.json({draftClass,players,announced,unannounced,counts:{total:players.length,announced:announced.length,unannounced:unannounced.length}});
  }catch(e:any){
    return Response.json({error:e?.message||"Could not load draft statuses"},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json(),playerId=Number(body?.playerId),draftClass=Number(body?.draftClass),status=String(body?.status||"");
    if(!playerId||!draftClass||!validStatus(status))return Response.json({error:"playerId, draftClass and a valid status are required"},{status:400});
    const c=await ensureTursoSchema(),now=new Date().toISOString();
    const player:any=rows(await c.execute({sql:"select * from players where id=?",args:[playerId]}))[0];
    if(!player)return Response.json({error:"Player not found"},{status:404});
    if(Number(player.draft_class)!==draftClass)return Response.json({error:`${player.name} is no longer in the ${draftClass} class. Refresh and try again.`},{status:409});

    const sourceUrl=clean(body?.sourceUrl),sourceTitle=clean(body?.sourceTitle),sourceType=clean(body?.sourceType),announcementDate=clean(body?.announcementDate),note=clean(body?.note);
    const setMethod=String(body?.setMethod||"MANUAL").toUpperCase()==="WEB"?"WEB":"MANUAL";
    const statusStatement={
      sql:`insert into draft_statuses(player_id,draft_class,status,source_url,source_title,source_type,announcement_date,note,set_method,verified_at,updated_at)
        values(?,?,?,?,?,?,?,?,?,?,?)
        on conflict(player_id,draft_class) do update set status=excluded.status,source_url=excluded.source_url,source_title=excluded.source_title,
        source_type=excluded.source_type,announcement_date=excluded.announcement_date,note=excluded.note,set_method=excluded.set_method,
        verified_at=excluded.verified_at,updated_at=excluded.updated_at`,
      args:[playerId,draftClass,status,sourceUrl,sourceTitle,sourceType,announcementDate,note,setMethod,now,now]
    };

    if(status==="ENTERING_DRAFT"){
      await c.batch([
        statusStatement,
        {sql:"insert into workflow_tags(player_id,tag,detail,updated_at) values(?,?,?,?) on conflict(player_id,tag) do update set detail=excluded.detail,updated_at=excluded.updated_at",args:[playerId,"DECLARES","Yes",now]},
        {sql:"insert into evaluations(player_id,category,value,commentary,updated_at) values(?,?,?,?,?) on conflict(player_id,category) do update set value=excluded.value,commentary=excluded.commentary,updated_at=excluded.updated_at",args:[playerId,"Early Declare",null,"Yes",now]}
      ],"write");
      return Response.json({ok:true,status,player,lockedToDraftClass:draftClass});
    }

    const moved=await movePlayerToNextDraftClass(c,playerId,draftClass,{allowDeclared:true});
    await c.execute(statusStatement);
    return Response.json({...moved,status,sourceUrl,sourceTitle});
  }catch(e:any){
    const responseStatus=e instanceof ReturningPlayerError?e.status:500;
    return Response.json({error:e?.message||"Could not update draft status"},{status:responseStatus});
  }
}
