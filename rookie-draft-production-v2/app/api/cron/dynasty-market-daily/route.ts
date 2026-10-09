import {loadKtcDataset} from "@/lib/ktc";

export const dynamic="force-dynamic";

export async function GET(req:Request){
  try{
    const auth=req.headers.get("authorization");
    if(process.env.CRON_SECRET&&auth!==`Bearer ${process.env.CRON_SECRET}`)return new Response("Unauthorized",{status:401});
    const dataset=await loadKtcDataset(true);
    return Response.json({ok:true,players:dataset.players.length,fetchedAt:dataset.fetchedAt});
  }catch(e:unknown){
    return Response.json({error:e instanceof Error?e.message:"Could not snapshot dynasty market"},{status:500});
  }
}
