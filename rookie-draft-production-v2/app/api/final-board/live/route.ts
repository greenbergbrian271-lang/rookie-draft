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

async function json(res:Response){
  const body=await res.json();
  if(!res.ok)throw new Error(body?.error||"Final Draft Board source failed");
  return body;
}

export async function GET(req:Request){
  try{
    const viewKey=new URL(req.url).searchParams.get("view")||"base";
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
      json(await getGrades(new Request("http://internal/api/grades?draftClass=2027"))),
      json(await getGlossary()),
      json(await getRosters())
    ]);
    const grades=(Array.isArray(gradesData)?gradesData:[]) as FinalBoardGradeRow[];
    const glossary=(Array.isArray(glossaryData?.rows)?glossaryData.rows:undefined) as GlossaryRows|undefined;
    const rosters=(Array.isArray(rosterData?.rosters)?rosterData.rosters:[]) as (FinalBoardRoster&{key:string})[];
    const roster=rosterKey?rosters.find(x=>x.key===rosterKey):undefined;
    const rows=buildFinalBoardRows(grades,{tePremium},roster,glossary);
    return Response.json({view:{key:viewKey,label,tePremium,rosterKey},rows});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not build Final Draft Board"},{status:500});
  }
}
