import {getNflDraftPicks} from "@/lib/nfl-draft-results";

export const dynamic="force-dynamic";

export async function GET(){
  const picks=await getNflDraftPicks(2027);
  return Response.json({available:picks.length>0,picks});
}
