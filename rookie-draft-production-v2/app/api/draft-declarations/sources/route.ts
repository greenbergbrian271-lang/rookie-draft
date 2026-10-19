import {ensureTursoSchema,rows} from "@/lib/turso";
import {LEARNED_KEY,hostOf,hostMatches,TRUSTED_HOSTS,SOCIAL_HOSTS} from "@/lib/draft-declarations";

async function read(c:any){
  const r=rows(await c.execute({sql:"select value from settings where key=?",args:[LEARNED_KEY]}))[0] as any;
  try{const v=JSON.parse(String(r?.value||"{}"));return Array.isArray(v?.hosts)?v.hosts:[]}catch{return[]}
}
export async function GET(){
  try{return Response.json({hosts:await read(await ensureTursoSchema())})}
  catch(e:any){return Response.json({error:e?.message||"Could not load sources"},{status:500})}
}
// Body: {urls:string[]} — remembers the host of each source Brian supplies so future scans look there too.
export async function POST(req:Request){
  try{
    const {urls}=await req.json(),c=await ensureTursoSchema(),hosts:any[]=await read(c),now=new Date().toISOString(),added:string[]=[];
    for(const u of Array.isArray(urls)?urls:[]){
      const host=hostOf(String(u));
      // Known outlets are already trusted; a social host is too broad to whitelist wholesale.
      if(!host||hostMatches(host,TRUSTED_HOSTS)||hostMatches(host,SOCIAL_HOSTS)||hosts.some((h:any)=>h.host===host))continue;
      hosts.push({host,example:String(u).slice(0,300),addedAt:now});added.push(host);
    }
    if(added.length)await c.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:[LEARNED_KEY,JSON.stringify({hosts}),now]});
    return Response.json({ok:true,added});
  }catch(e:any){return Response.json({error:e?.message||"Could not save sources"},{status:500})}
}
