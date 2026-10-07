import {ensureTursoSchema,rows} from "@/lib/turso";
import {recordAudit} from "@/lib/audit";

type AnyRow=Record<string,any>;

function qid(value:string){
  return '"'+value.replace(/"/g,'""')+'"';
}

async function tableColumns(c:any,table:string){
  return rows(await c.execute("pragma table_info("+qid(table)+")")).map((x:any)=>String(x.name));
}

async function linkedPlayerTables(c:any){
  const tables=rows(await c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"));
  const linked:{table:string,column:string}[]=[];
  for(const row of tables){
    const table=String(row.name||"");
    if(!table||table==="players"||table==="archived_players")continue;
    try{
      const fks=rows(await c.execute("pragma foreign_key_list("+qid(table)+")"));
      for(const fk of fks){
        if(String(fk.table)==="players"){
          linked.push({table,column:String(fk.from)});
          break;
        }
      }
    }catch{}
  }
  return linked;
}

function insertStatement(table:string,row:AnyRow,columns:string[]){
  const keys=Object.keys(row).filter(key=>columns.includes(key));
  if(!keys.length)return null;
  return {
    sql:"insert into "+qid(table)+"("+keys.map(qid).join(",")+") values("+keys.map(()=>"?").join(",")+")",
    args:keys.map(key=>row[key]??null),
  };
}

export async function GET(){
  try{
    const c=await ensureTursoSchema();
    return Response.json(rows(await c.execute(
      "select original_player_id,player_name,draft_class,position,college,reason,archived_at from archived_players order by archived_at desc,player_name"
    )));
  }catch(e:any){
    return Response.json({error:"Could not load archived players",detail:e?.message},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const id=Number(body.playerId);
    if(!Number.isFinite(id))return Response.json({error:"A valid player is required."},{status:400});
    const c=await ensureTursoSchema();

    if(body.action==="archive"){
      const player=rows(await c.execute({sql:"select * from players where id=?",args:[id]}))[0];
      if(!player)return Response.json({error:"Player not found."},{status:404});

      const existing=rows(await c.execute({sql:"select original_player_id from archived_players where original_player_id=?",args:[id]}))[0];
      if(existing)return Response.json({error:"This player already has an archived snapshot."},{status:409});

      const related:Record<string,AnyRow[]>={};
      for(const link of await linkedPlayerTables(c)){
        try{
          const result=await c.execute({
            sql:"select * from "+qid(link.table)+" where "+qid(link.column)+"=?",
            args:[id],
          });
          const data=rows(result);
          if(data.length)related[link.table]=data;
        }catch{}
      }

      const reason=typeof body.reason==="string"&&body.reason.trim()?body.reason.trim().slice(0,120):null;
      const archivedAt=new Date().toISOString();
      const snapshot=JSON.stringify({version:1,player,related});
      await c.batch([
        {
          sql:"insert into archived_players(original_player_id,player_name,draft_class,position,college,reason,snapshot,archived_at) values(?,?,?,?,?,?,?,?)",
          args:[id,player.name,player.draft_class,player.position,player.college||null,reason,snapshot,archivedAt],
        },
        {sql:"delete from players where id=?",args:[id]},
      ],"write");
      await recordAudit(c,{action:"PLAYER_ARCHIVE",entityType:"player",entityId:id,summary:"Archived "+String(player.name),before:player,after:{archivedAt,reason,relatedTables:Object.keys(related)},undoKind:"archive_player",undoPayload:{playerId:id}});

      return Response.json({
        ok:true,
        action:"archive",
        id,
        name:player.name,
        archivedAt,
        relatedTables:Object.keys(related),
      });
    }

    if(body.action==="restore"){
      const archived=rows(await c.execute({
        sql:"select * from archived_players where original_player_id=?",
        args:[id],
      }))[0];
      if(!archived)return Response.json({error:"Archived player not found."},{status:404});

      let snapshot:any;
      try{snapshot=JSON.parse(String(archived.snapshot||"{}"))}catch{}
      const player=snapshot?.player;
      if(!player?.name)return Response.json({error:"Archived snapshot is invalid."},{status:500});

      const idConflict=rows(await c.execute({sql:"select id,name from players where id=?",args:[id]}))[0];
      if(idConflict)return Response.json({error:"That original player ID is now in use, so this archive cannot be restored automatically."},{status:409});
      const nameConflict=rows(await c.execute({
        sql:"select id from players where lower(name)=lower(?) and draft_class=?",
        args:[player.name,player.draft_class],
      }))[0];
      if(nameConflict)return Response.json({error:"An active player with this name and draft class already exists."},{status:409});

      const statements:any[]=[];
      const playerInsert=insertStatement("players",player,await tableColumns(c,"players"));
      if(!playerInsert)return Response.json({error:"Could not rebuild the player record."},{status:500});
      statements.push(playerInsert);

      const related=snapshot?.related&&typeof snapshot.related==="object"?snapshot.related:{};
      for(const [table,value] of Object.entries(related)){
        if(!Array.isArray(value)||!value.length)continue;
        let columns:string[]=[];
        try{columns=await tableColumns(c,table)}catch{continue}
        if(!columns.length)continue;
        for(const row of value as AnyRow[]){
          const stmt=insertStatement(table,row,columns);
          if(stmt)statements.push(stmt);
        }
      }
      statements.push({sql:"delete from archived_players where original_player_id=?",args:[id]});
      await c.batch(statements,"write");
      await recordAudit(c,{action:"PLAYER_RESTORE",entityType:"player",entityId:id,summary:"Restored "+String(player.name),before:{archivedAt:archived.archived_at,reason:archived.reason},after:player});

      return Response.json({ok:true,action:"restore",id,name:player.name,scouting_status:player.scouting_status||"TO_SCOUT"});
    }

    return Response.json({error:"Unknown archive action."},{status:400});
  }catch(e:any){
    return Response.json({error:"Could not update player archive",detail:e?.message},{status:500});
  }
}
