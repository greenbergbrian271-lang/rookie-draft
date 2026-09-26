import {architectureStatus} from "@/lib/data-architecture";
import {turso,ensureTursoSchema} from "@/lib/turso";
import {cacheSet,cacheGet,cacheDelete} from "@/lib/cache";
export async function GET(){
 const status:any=architectureStatus();
 try{const c=await ensureTursoSchema();const r=await c.execute("select count(*) as count from players");status.primary.health="ok";status.primary.players=Number(r.rows[0]?.count||0)}catch(e:any){status.primary.health="error";status.primary.error=e?.message||"connection failed"}
 try{const key="architecture-health-"+Date.now();await cacheSet(key,"ok",60);const v=await cacheGet<string>(key);await cacheDelete(key);status.cache.health=v==="ok"?"ok":"error"}catch(e:any){status.cache.health="error";status.cache.error=e?.message||"connection failed"}
 return Response.json(status)
}
