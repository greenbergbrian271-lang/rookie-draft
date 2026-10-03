import {getNflDraftPicks} from "@/lib/nfl-draft-results";

export const dynamic="force-dynamic";

export async function GET(req:Request){
  const u=new URL(req.url);
  const draftClass=Number(u.searchParams.get("draftClass")||2027);
  if(!Number.isInteger(draftClass)||draftClass<2000||draftClass>2100)return Response.json({error:"Invalid draft class"},{status:400});
  const picks=await getNflDraftPicks(draftClass);
  return Response.json({draftClass,available:picks.length>0,picks});
}
