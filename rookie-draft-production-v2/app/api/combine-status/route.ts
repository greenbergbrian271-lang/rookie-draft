import {ensureTursoSchema,rows} from "@/lib/turso";
import {normalizeCombineName,setCombineStatusForPlayer} from "@/lib/combine-invites";

export const dynamic="force-dynamic";
const SUPPORTED=new Set(["QB","RB","WR","TE"]);
const POSITION_HEADINGS:Record<string,string>={
  "QUARTERBACKS":"QB",
  "RUNNING BACKS":"RB",
  "WIDE RECEIVERS":"WR",
  "TIGHT ENDS":"TE",
  "OFFENSIVE LINEMEN":"OL",
  "DEFENSIVE LINEMEN":"DL",
  "LINEBACKERS":"LB",
  "DEFENSIVE BACKS":"DB",
  "CORNERBACKS":"CB",
  "SAFETIES":"S",
  "KICKERS":"K",
  "PUNTERS":"P",
  "LONG SNAPPERS":"LS",
  "SPECIALISTS":"ST"
};

function decodeHtml(value:string){
  return value
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,"\"")
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&rsquo;|&lsquo;/gi,"'")
    .replace(/&ndash;|&mdash;/gi,"-");
}

function htmlToLines(html:string){
  const withoutNoise=html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi," ");
  const text=decodeHtml(
    withoutNoise
      .replace(/<br\s*\/?\s*>/gi,"\n")
      .replace(/<\/(p|li|h1|h2|h3|h4|div|section|article)>/gi,"\n")
      .replace(/<[^>]+>/g," ")
  );
  return text.split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
}

function titleFromHtml(html:string,lines:string[]){
  const og=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const title=og||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||lines.find(x=>/NFL combine/i.test(x))||"NFL Combine invite list";
  return decodeHtml(String(title).replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
}

function draftClassFrom(title:string,lines:string[]){
  const hay=[title,...lines.slice(0,80)].join(" ");
  const patterns=[
    /invited to (?:the )?(20\d{2}) scouting event/i,
    /(20\d{2}) NFL Scouting Combine/i,
    /(20\d{2}) NFL combine/i,
    /(20\d{2}) NFL Draft/i
  ];
  for(const p of patterns){const m=hay.match(p);if(m)return Number(m[1])}
  return null;
}

function parseInvitees(html:string){
  const lines=htmlToLines(html),title=titleFromHtml(html,lines),draftClass=draftClassFrom(title,lines);
  let position:string|null=null,started=false;
  const invitees:{name:string;school:string;position:string;normalizedName:string}[]=[];
  const seen=new Set<string>();
  for(const raw of lines){
    const heading=raw.toUpperCase().replace(/[:]+$/,"").trim();
    if(POSITION_HEADINGS[heading]){position=POSITION_HEADINGS[heading];started=true;continue}
    if(started&&/^(RELATED CONTENT|LATEST NEWS|AROUND THE NFL|MORE NEWS|EDITOR'S NOTE)/i.test(raw)){position=null;continue}
    if(!position)continue;
    const comma=raw.indexOf(",");
    if(comma<2)continue;
    const name=raw.slice(0,comma).replace(/^[•·*-]\s*/,"").trim();
    const school=raw.slice(comma+1).trim();
    if(!name||!school||name.length>60||school.length>80)continue;
    if(/^(published|updated|programming note|editor's note)/i.test(name))continue;
    const normalizedName=normalizeCombineName(name);
    if(!normalizedName)continue;
    const key=[position,normalizedName].join("|");
    if(seen.has(key))continue;
    seen.add(key);
    invitees.push({name,school,position,normalizedName});
  }
  return {lines,title,draftClass,invitees};
}

function allowedSource(raw:unknown){
  const value=String(raw??"").trim();
  if(!value)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=="https:")return null;
    const host=url.hostname.toLowerCase();
    if(host!=="nfl.com"&&!host.endsWith(".nfl.com"))return null;
    return url.toString();
  }catch{return null}
}

function resultSummary(invitees:any[],players:any[]){
  const keys=new Set(invitees.filter(x=>SUPPORTED.has(x.position)).map(x=>x.normalizedName+"|"+x.position));
  const yes=players.filter((p:any)=>keys.has(normalizeCombineName(p.name)+"|"+String(p.position).toUpperCase()));
  const no=players.filter((p:any)=>!keys.has(normalizeCombineName(p.name)+"|"+String(p.position).toUpperCase()));
  const playerKeys=new Set(players.map((p:any)=>normalizeCombineName(p.name)+"|"+String(p.position).toUpperCase()));
  const inviteesNotOnBoard=invitees.filter(x=>SUPPORTED.has(x.position)&&!playerKeys.has(x.normalizedName+"|"+x.position));
  return {yes,no,inviteesNotOnBoard};
}

export async function GET(req:Request){
  try{
    const q=await ensureTursoSchema(),u=new URL(req.url),draftClass=Number(u.searchParams.get("draftClass")||2027);
    const source=rows(await q.execute({sql:"select * from combine_invite_sources where draft_class=?",args:[draftClass]}))[0] as any;
    if(!source)return Response.json({draftClass,imported:false});
    const counts=rows(await q.execute({
      sql:"select count(*) as total,sum(case when position in ('QB','RB','WR','TE') then 1 else 0 end) as supported from combine_invites where draft_class=?",
      args:[draftClass]
    }))[0] as any;
    return Response.json({
      draftClass,
      imported:true,
      sourceUrl:source.source_url,
      sourceTitle:source.source_title,
      importedAt:source.imported_at,
      totalInvites:Number(counts?.total||0),
      supportedInvites:Number(counts?.supported||0)
    });
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not load combine invite status"},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const body=await req.json(),sourceUrl=allowedSource(body?.url),apply=!!body?.apply;
    if(!sourceUrl)return Response.json({error:"Paste a valid https://www.nfl.com combine invite article URL."},{status:400});
    const response=await fetch(sourceUrl,{cache:"no-store",headers:{"user-agent":"rookie-draft-combine-status/1.0","accept":"text/html,application/xhtml+xml"}});
    if(!response.ok)return Response.json({error:"NFL article returned HTTP "+response.status},{status:502});
    const html=await response.text(),parsed=parseInvitees(html);
    if(!parsed.draftClass)return Response.json({error:"Could not determine the draft class from this NFL article."},{status:422});
    if(parsed.invitees.length<50)return Response.json({error:"The article loaded, but the invite list could not be parsed reliably. Only "+parsed.invitees.length+" names were found."},{status:422});

    const q=await ensureTursoSchema();
    const players=rows(await q.execute({
      sql:"select id,name,position,college,draft_class from players where draft_class=? and position in ('QB','RB','WR','TE')",
      args:[parsed.draftClass]
    }));
    const summary=resultSummary(parsed.invitees,players);
    const payload={
      sourceUrl,
      sourceTitle:parsed.title,
      draftClass:parsed.draftClass,
      totalInvites:parsed.invitees.length,
      supportedInvites:parsed.invitees.filter(x=>SUPPORTED.has(x.position)).length,
      matchedYes:summary.yes.length,
      markedNo:summary.no.length,
      inviteesNotOnBoard:summary.inviteesNotOnBoard.length,
      preview:!apply
    };
    if(!apply)return Response.json({...payload,inviteePreview:parsed.invitees.filter(x=>SUPPORTED.has(x.position)).slice(0,12)});

    const now=new Date().toISOString();
    await q.execute({sql:"delete from combine_invites where draft_class=?",args:[parsed.draftClass]});
    const inserts=parsed.invitees.map(x=>({
      sql:"insert into combine_invites(draft_class,player_name,normalized_name,position,school,source_url,imported_at) values(?,?,?,?,?,?,?)",
      args:[parsed.draftClass,x.name,x.normalizedName,x.position,x.school,sourceUrl,now]
    }));
    for(let i=0;i<inserts.length;i+=50)await q.batch(inserts.slice(i,i+50),"write");
    await q.execute({
      sql:"insert into combine_invite_sources(draft_class,source_url,source_title,total_invites,imported_at) values(?,?,?,?,?) on conflict(draft_class) do update set source_url=excluded.source_url,source_title=excluded.source_title,total_invites=excluded.total_invites,imported_at=excluded.imported_at",
      args:[parsed.draftClass,sourceUrl,parsed.title,parsed.invitees.length,now]
    });

    const invitedKeys=new Set(parsed.invitees.filter(x=>SUPPORTED.has(x.position)).map(x=>x.normalizedName+"|"+x.position));
    for(const p of players){
      const invited=invitedKeys.has(normalizeCombineName(p.name)+"|"+String(p.position).toUpperCase());
      await setCombineStatusForPlayer(q,p.id,invited);
    }
    return Response.json({...payload,preview:false,importedAt:now,message:"Stored "+parsed.invitees.length+" combine invites and updated "+players.length+" current scouting-player statuses."});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Combine invite import failed"},{status:500});
  }
}
