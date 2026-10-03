import {workbookReference} from "./workbook-reference";
import {getHistoricalScoutingRows} from "./historical-scouting";
import {earlyHistoricalNflDraft} from "./historical-nfl-draft-early";

export type NflDraftPosition="QB"|"RB"|"WR"|"TE";
export type NflDraftPick={overall:number;round?:number;result?:string;pos:NflDraftPosition;name:string;team:string;college:string;teamScore:number;draftCapitalScore:number};

const teams=["49ers","Bears","Bengals","Bills","Broncos","Browns","Buccaneers","Cardinals","Chargers","Chiefs","Colts","Commanders","Cowboys","Dolphins","Eagles","Falcons","Giants","Jaguars","Jets","Lions","Packers","Panthers","Patriots","Raiders","Rams","Ravens","Saints","Seahawks","Steelers","Texans","Titans","Vikings"];
const teamAliases:Record<string,string>={
  SF:"49ers","SAN FRANCISCO 49ERS":"49ers","JAGS":"Jaguars","JAGUARS":"Jaguars","BUCS":"Buccaneers","BUCCANEERS":"Buccaneers","PATS":"Patriots","PATRIOTS":"Patriots","WFT":"Commanders","WASHINGTON FOOTBALL TEAM":"Commanders",CHI:"Bears","CHICAGO BEARS":"Bears",CIN:"Bengals","CINCINNATI BENGALS":"Bengals",BUF:"Bills","BUFFALO BILLS":"Bills",DEN:"Broncos","DENVER BRONCOS":"Broncos",CLE:"Browns","CLEVELAND BROWNS":"Browns",TB:"Buccaneers","TAMPA BAY BUCCANEERS":"Buccaneers",ARI:"Cardinals","ARIZONA CARDINALS":"Cardinals",LAC:"Chargers","LOS ANGELES CHARGERS":"Chargers",KC:"Chiefs","KANSAS CITY CHIEFS":"Chiefs",IND:"Colts","INDIANAPOLIS COLTS":"Colts",WSH:"Commanders",WAS:"Commanders","WASHINGTON COMMANDERS":"Commanders",DAL:"Cowboys","DALLAS COWBOYS":"Cowboys",MIA:"Dolphins","MIAMI DOLPHINS":"Dolphins",PHI:"Eagles","PHILADELPHIA EAGLES":"Eagles",ATL:"Falcons","ATLANTA FALCONS":"Falcons",NYG:"Giants","NEW YORK GIANTS":"Giants",JAX:"Jaguars","JACKSONVILLE JAGUARS":"Jaguars",NYJ:"Jets","NEW YORK JETS":"Jets",DET:"Lions","DETROIT LIONS":"Lions",GB:"Packers","GREEN BAY PACKERS":"Packers",CAR:"Panthers","CAROLINA PANTHERS":"Panthers",NE:"Patriots","NEW ENGLAND PATRIOTS":"Patriots",LV:"Raiders","LAS VEGAS RAIDERS":"Raiders",LAR:"Rams","LOS ANGELES RAMS":"Rams",BAL:"Ravens","BALTIMORE RAVENS":"Ravens",NO:"Saints","NEW ORLEANS SAINTS":"Saints",SEA:"Seahawks","SEATTLE SEAHAWKS":"Seahawks",PIT:"Steelers","PITTSBURGH STEELERS":"Steelers",HOU:"Texans",HST:"Texans","HOUSTON TEXANS":"Texans",TEN:"Titans","TENNESSEE TITANS":"Titans",MIN:"Vikings","MINNESOTA VIKINGS":"Vikings"
};
const norm=(s:any)=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const first=(...vals:any[])=>vals.find(v=>typeof v==="string"&&v.trim())||"";

function teamFromFeed(obj:any){
  if(!obj)return "";
  const candidates=typeof obj==="string"?[obj]:[obj.abbreviation,obj.shortDisplayName,obj.displayName,obj.name,obj.location&&obj.name?obj.location+" "+obj.name:""];
  for(const c of candidates){
    if(!c)continue;
    const key=String(c).trim().toUpperCase();
    if(teamAliases[key])return teamAliases[key];
    const found=teams.find(t=>norm(t)===norm(c));
    if(found)return found;
  }
  return "";
}
const warRoom=workbookReference.warRoom as readonly (readonly any[])[];
const capitalIndex:Record<NflDraftPosition,number>={QB:9,RB:10,WR:11,TE:12};
const teamIndex:Record<NflDraftPosition,number>={QB:14,RB:22,WR:28,TE:32};

function capitalScore(pos:NflDraftPosition,overall:number){
  const direct=warRoom[overall+1]?.[capitalIndex[pos]];
  const n=Number(direct);
  return Number.isFinite(n)?n:5;
}
function teamScore(pos:NflDraftPosition,team:string){
  const row=warRoom.slice(2).find((r:readonly any[])=>norm(r?.[13])===norm(team));
  const n=Number(row?.[teamIndex[pos]]);
  return Number.isFinite(n)?n:5;
}
function canonicalHistoricalTeam(value:any){
  const raw=String(value??"").trim(),key=raw.toUpperCase();
  if(teamAliases[key])return teamAliases[key];
  const direct=teams.find(t=>norm(t)===norm(raw)||norm(raw).endsWith(norm(t))||norm(raw).includes(norm(t)));
  return direct||raw;
}
function historicalWorkbookPicks(draftYear:number):NflDraftPick[]{
  const out:NflDraftPick[]=[];
  if(draftYear>=2022&&draftYear<=2026){
    for(const pos of ["QB","RB","WR","TE"] as NflDraftPosition[]){
      for(const row of getHistoricalScoutingRows(draftYear,pos)){
        const raw=String(row.fields.find((f:any)=>String(f.label||"").trim()==="Draft Result")?.value??"").trim();
        const m=raw.match(/^(\d+)\.(\d+)\s*,\s*([^,]+)$/);
        if(!m)continue;
        const round=Number(m[1]),overall=Number(m[2]),team=canonicalHistoricalTeam(m[3]);
        if(!Number.isFinite(overall)||overall<1||!team)continue;
        out.push({overall,round,result:raw,pos,name:row.name,team,college:row.college||"",teamScore:5,draftCapitalScore:5});
      }
    }
  }else{
    for(const row of earlyHistoricalNflDraft[draftYear]||[]){
      const team=canonicalHistoricalTeam(row.team);
      out.push({overall:row.overall,round:row.round,result:row.result,pos:row.pos,name:row.name,team,college:"",teamScore:5,draftCapitalScore:5});
    }
  }
  const unique=[...new Map(out.map(p=>[p.overall+"|"+norm(p.name),p])).values()];
  return unique.sort((a,b)=>a.overall-b.overall);
}

function extract(root:any){
  const out:any[]=[],seen=new Set<string>();
  function walk(node:any){
    if(Array.isArray(node)){node.forEach(walk);return}
    if(!node||typeof node!=="object")return;
    const athlete=node.athlete||node.player||node.person||node.pick?.person||node.selection?.athlete||node.draftPick?.athlete;
    const name=first(athlete?.displayName,athlete?.fullName,node.pick?.person?.displayName,node.pick?.athlete?.displayName,node.selection?.athlete?.displayName);
    const pos=first(athlete?.position?.abbreviation,athlete?.position?.name,node.position?.abbreviation,typeof node.position==="string"?node.position:"",node.pos,node.pick?.position?.abbreviation).toUpperCase() as NflDraftPosition;
    const overall=Number(node.overallPick??node.overall??node.overallSelection??node.pickNumber??node.selectionNumber??node.pick?.overall??node.pick?.number);
    const team=teamFromFeed(node.team||node.nflTeam||node.pick?.team||node.selection?.team);
    const college=first(athlete?.college?.name,athlete?.college?.displayName,node.college?.name,node.college);
    if(name&&Number.isFinite(overall)&&overall>0&&["QB","RB","WR","TE"].includes(pos)){
      const key=overall+"|"+norm(name);
      if(!seen.has(key)){seen.add(key);out.push({overall,pos,name,team,college})}
    }
    Object.values(node).forEach(walk);
  }
  walk(root);
  return out;
}

export async function getNflDraftPicks(draftYear=2027):Promise<NflDraftPick[]>{
  const archived=historicalWorkbookPicks(draftYear);
  if(draftYear<2027&&archived.length)return archived;
  try{
    const calls=Array.from({length:7},(_,i)=>fetch("https://site.web.api.espn.com/apis/v2/scoreboard/header?draft_year="+draftYear+"&draft_round="+(i+1),{next:{revalidate:60}}).then(r=>r.ok?r.json():null).catch(()=>null));
    const payloads=(await Promise.all(calls)).filter(Boolean);
    if(!payloads.length)return [];
    const raw=payloads.flatMap(extract);
    const unique=[...new Map(raw.map((p:any)=>[p.overall+"|"+norm(p.name),p])).values()] as any[];
    return unique.sort((a,b)=>a.overall-b.overall).map(p=>({...p,teamScore:teamScore(p.pos,p.team),draftCapitalScore:capitalScore(p.pos,p.overall)}));
  }catch{return []}
}

export function normalizeDraftName(value:any){return norm(value)}
