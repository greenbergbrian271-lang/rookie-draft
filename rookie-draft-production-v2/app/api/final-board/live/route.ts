import {GET as getGrades} from "@/app/api/grades/route";
import {GET as getGlossary} from "@/app/api/scouting-glossary/route";
import {GET as getRosters} from "@/app/api/dynasty-rosters/route";
import {getIntegrations} from "@/lib/integrations";
import {buildFinalBoardRows,type FinalBoardGradeRow,type FinalBoardRoster} from "@/lib/final-board";
import {type GlossaryRows} from "@/lib/scouting-formulas";

const SHORT_LABELS:Record<string,string>={
  "one-league":"One League",
  "drew-ross":"D+R",
  "last-man-standing":"Last Man Standing",
  "last-minute-dynasty":"Last Minute"
};

export const dynamic="force-dynamic";

function historicalBoardRows(grades:FinalBoardGradeRow[]){
  const base=(grades as any[]).map((row:any)=>({
    ...row,
    sourceGrade:row.finalGrade??row.preDraftGrade??null,
    multiplier:1,
    handcuffAdjustment:0,
    boardGrade:row.finalGrade??row.preDraftGrade??null,
    overallRank:null,
    positionRank:null,
    tier:null,
    tierGapBefore:null
  }));
  const posRank=new Map<string,number>();
  for(const pos of ["QB","RB","WR","TE"]){
    base.filter((x:any)=>x.position===pos).sort((a:any,b:any)=>{
      if(a.boardGrade==null&&b.boardGrade==null)return (Number(a.historicalOrder)||9999)-(Number(b.historicalOrder)||9999);
      if(a.boardGrade==null)return 1;if(b.boardGrade==null)return -1;
      return b.boardGrade-a.boardGrade;
    }).forEach((x:any,i:number)=>posRank.set(String(x.id),i+1));
  }
  const sorted=[...base].sort((a:any,b:any)=>{
    if(a.boardGrade==null&&b.boardGrade==null)return (Number(a.historicalOrder)||9999)-(Number(b.historicalOrder)||9999);
    if(a.boardGrade==null)return 1;if(b.boardGrade==null)return -1;
    return b.boardGrade-a.boardGrade||(Number(a.historicalOrder)||9999)-(Number(b.historicalOrder)||9999);
  });
  let tier=1,previous:number|null=null;
  return sorted.map((row:any,index:number)=>{
    const overallRank=index+1;
    let rowTier:number|null=null,gap:number|null=null;
    if(row.boardGrade!=null){if(previous!=null&&previous-row.boardGrade>=2.5){tier++;gap=previous-row.boardGrade}rowTier=tier;previous=row.boardGrade}
    return {...row,overallRank,positionRank:posRank.get(String(row.id))??null,tier:rowTier,tierGapBefore:gap};
  });
}



async function json(res:Response){
  const body=await res.json();
  if(!res.ok)throw new Error(body?.error||"Final Draft Board source failed");
  return body;
}

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const viewKey=url.searchParams.get("view")||"base";
    const draftClass=Number(url.searchParams.get("draftClass")||2027);
    if(draftClass<2027){
      const gradesData=await json(await getGrades(new Request("http://internal/api/grades?draftClass="+encodeURIComponent(String(draftClass)))));
      const historicalGrades=(Array.isArray(gradesData)?gradesData:[]) as FinalBoardGradeRow[];
      return Response.json({view:{key:"base",label:"Base",tePremium:false,draftClass,historical:true},rows:historicalBoardRows(historicalGrades)});
    }
    const integrations=await getIntegrations();
    let tePremium=false,rosterKey:string|undefined,label="Base";
    if(viewKey==="tep"){tePremium=true;label="TE Premium"}
    else if(viewKey.startsWith("league:")){
      rosterKey=viewKey.slice("league:".length);
      const league=integrations.sleeper.leagues.find(x=>x.key===rosterKey);
      if(!league)return Response.json({error:"League board not found"},{status:404});
      tePremium=Boolean(league.tePremium);
      label=SHORT_LABELS[league.key]||league.name;
    }

    const [gradesData,glossaryData,rosterData]=await Promise.all([
      json(await getGrades(new Request("http://internal/api/grades?draftClass="+encodeURIComponent(String(draftClass))))),
      json(await getGlossary()),
      json(await getRosters())
    ]);
    const grades=(Array.isArray(gradesData)?gradesData:[]) as FinalBoardGradeRow[];
    const glossary=(Array.isArray(glossaryData?.rows)?glossaryData.rows:undefined) as GlossaryRows|undefined;
    const rosters=(Array.isArray(rosterData?.rosters)?rosterData.rosters:[]) as (FinalBoardRoster&{key:string})[];
    const roster=rosterKey?rosters.find(x=>x.key===rosterKey):undefined;
    const rows=buildFinalBoardRows(grades,{tePremium},roster,glossary);
    return Response.json({view:{key:viewKey,label,tePremium,rosterKey,draftClass},rows});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build Final Draft Board"},{status:500});
  }
}
