import Papa from "papaparse";
import {ensureTursoSchema,rows} from "@/lib/turso";

export const dynamic="force-dynamic";
const SOURCE="https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv";
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\b(jr|sr|ii|iii|iv)\b/g,"").replace(/[^a-z0-9]/g,"");
const number=(v:any)=>{if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};
function heightText(v:any){
  if(v==null||v==="")return null;
  const s=String(v).trim();
  const dash=s.match(/^(\d)\s*[-']\s*(\d{1,2})(?:\s+(\d+\/\d+))?$/);
  if(dash)return dash[1]+"'"+dash[2]+(dash[3]?" "+dash[3]:"")+'"';
  const n=Number(s);
  if(Number.isFinite(n)&&n>=60&&n<=90){const ft=Math.floor(n/12),inch=n-ft*12;return ft+"'"+inch+'"'}
  return s;
}
export async function GET(){
  try{
    const q=await ensureTursoSchema();
    const rs=rows(await q.execute({sql:"select value,updated_at from settings where key=?",args:["combine_refresh_2027"]}));
    if(!rs.length)return Response.json({updated:0,unmatched:0,refreshedAt:null,source:SOURCE});
    let value:any={};try{value=JSON.parse(String(rs[0].value||"{}"))}catch{}
    return Response.json({...value,refreshedAt:value.refreshedAt||rs[0].updated_at||null,source:value.source||SOURCE});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load combine refresh status"},{status:500})}
}
export async function POST(){
  try{
    const q=await ensureTursoSchema();
    const response=await fetch(SOURCE,{cache:"no-store",headers:{"user-agent":"rookie-draft-combine-refresh/1.0"}});
    if(!response.ok)throw new Error("Combine source returned HTTP "+response.status);
    const parsed=Papa.parse(await response.text(),{header:true,dynamicTyping:true,skipEmptyLines:true});
    if(parsed.errors?.length&&!(parsed.data as any[])?.length)throw new Error(parsed.errors[0]?.message||"Could not parse combine data");
    const combine=(parsed.data as any[]).filter(r=>Number(r.season??r.draft_year)===2027&&["QB","RB","WR","TE"].includes(String(r.pos||"").toUpperCase()));
    if(!combine.length)return Response.json({updated:0,unmatched:[],message:"No 2027 combine data is available yet.",source:SOURCE});
    const players:any[]=rows(await q.execute("select id,name,position,college from players where draft_class=2027"));
    const playerMap=new Map<string,any>(players.map((p:any)=>[norm(p.name),p]));
    const now=new Date().toISOString(),unmatched:string[]=[];let updated=0;
    for(const r of combine){
      const p=playerMap.get(norm(r.player_name));
      if(!p||String(p.position)!==String(r.pos).toUpperCase()){unmatched.push(String(r.player_name||"Unknown"));continue}
      await q.execute({sql:`insert into combine_results(player_id,season,player_name,position,school,height,weight,forty,bench,vertical,broad_jump,cone,shuttle,source,refreshed_at)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        on conflict(player_id) do update set season=excluded.season,player_name=excluded.player_name,position=excluded.position,school=excluded.school,height=excluded.height,weight=excluded.weight,forty=excluded.forty,bench=excluded.bench,vertical=excluded.vertical,broad_jump=excluded.broad_jump,cone=excluded.cone,shuttle=excluded.shuttle,source=excluded.source,refreshed_at=excluded.refreshed_at`,
        args:[Number(r.season??r.draft_year),String(r.player_name),String(r.pos).toUpperCase(),r.school?String(r.school):null,heightText(r.ht),number(r.wt),number(r.forty),number(r.bench),number(r.vertical),number(r.broad_jump),number(r.cone),number(r.shuttle),SOURCE,now]});
      updated++;
    }
    await q.execute({sql:"insert into settings(key,value,updated_at) values(?,?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at",args:["combine_refresh_2027",JSON.stringify({updated,unmatched:unmatched.length,refreshedAt:now,source:SOURCE}),now]});
    return Response.json({updated,unmatched,unmatchedCount:unmatched.length,refreshedAt:now,message:`Updated combine data for ${updated} players.`,source:SOURCE});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Combine refresh failed"},{status:500})}
}
