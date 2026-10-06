import {createShareToken} from "@/lib/share-access";

export async function POST(req:Request){
  try{
    const body=await req.json();
    const years=Array.isArray(body?.years)?body.years.map(Number):[];
    const days=Math.max(1,Math.min(365,Number(body?.days)||30));
    const expiresAt=Date.now()+days*86400000;
    const token=createShareToken({years,expiresAt,title:String(body?.title||"")});
    const url=new URL("/api/share/view",req.url);
    url.searchParams.set("token",token);
    return Response.json({url:url.toString(),years,expiresAt:new Date(expiresAt).toISOString()});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not create share link"},{status:400})}
}
