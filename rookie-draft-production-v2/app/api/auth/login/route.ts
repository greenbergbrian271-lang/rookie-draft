import {cookies} from "next/headers";
import {ADMIN_COOKIE,adminCookieOptions,authConfigured,createAdminToken,verifyAdminPassword} from "@/lib/admin-auth";
export async function POST(req:Request){
  if(!authConfigured())return Response.json({error:"Admin authentication is not configured."},{status:503});
  const body=await req.json().catch(()=>({}));
  if(!verifyAdminPassword(String(body?.password||"")))return Response.json({error:"Incorrect admin password."},{status:401});
  const jar=await cookies();jar.set(ADMIN_COOKIE,createAdminToken(),adminCookieOptions);return Response.json({ok:true});
}
