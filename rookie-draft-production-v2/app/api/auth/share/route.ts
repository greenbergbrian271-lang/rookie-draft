import {createManagedShareLink,listManagedShareLinks,revokeManagedShareLink,shareLinkStatus,shareTokenFor,type ManagedShareLink} from "@/lib/share-links";

function urlFor(req:Request,token:string){const url=new URL("/api/share/view",req.url);url.searchParams.set("token",token);return url.toString()}

export async function GET(req:Request){
  try{
    const links=await listManagedShareLinks();
    return Response.json({links:links.map((link:ManagedShareLink)=>({...link,status:shareLinkStatus(link),url:urlFor(req,shareTokenFor(link))}))});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not load share links"},{status:500})}
}
export async function POST(req:Request){
  try{
    const body=await req.json(),years=Array.isArray(body?.years)?body.years.map(Number):[],days=Math.max(1,Math.min(365,Number(body?.days)||30)),expiresAt=Date.now()+days*86400000;
    const {link,token}=await createManagedShareLink({years,expiresAt,title:String(body?.title||"")});
    return Response.json({...link,status:"active",url:urlFor(req,token),expiresAt:new Date(expiresAt).toISOString()});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not create share link"},{status:400})}
}
export async function DELETE(req:Request){
  try{
    const id=new URL(req.url).searchParams.get("id");
    if(!id)return Response.json({error:"id required"},{status:400});
    const link=await revokeManagedShareLink(id);
    if(!link)return Response.json({error:"Share link not found"},{status:404});
    return Response.json({...link,status:"revoked"});
  }catch(e:unknown){return Response.json({error:e instanceof Error?e.message:"Could not revoke share link"},{status:500})}
}
