import {NextResponse,type NextRequest} from "next/server";
import {ADMIN_COOKIE,verifyAdminToken} from "@/lib/admin-auth";

const SAFE=new Set(["GET","HEAD","OPTIONS"]);
function sameOrigin(req:NextRequest){const origin=req.headers.get("origin");if(!origin)return true;try{return new URL(origin).host===req.nextUrl.host}catch{return false}}
function cronAuthorized(req:NextRequest){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get("authorization")===`Bearer ${secret}`)}

export function proxy(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(path.startsWith("/api/auth/"))return NextResponse.next();
  const cron=path.startsWith("/api/cron/");
  if(cron&&cronAuthorized(req))return NextResponse.next();
  const protectedRead=path==="/api/backup/export"||cron;
  if(SAFE.has(req.method)&&!protectedRead)return NextResponse.next();
  if(!SAFE.has(req.method)&&!sameOrigin(req))return Response.json({error:"Cross-site write blocked."},{status:403});
  const token=req.cookies.get(ADMIN_COOKIE)?.value;
  if(!verifyAdminToken(token))return Response.json({error:"Admin authentication required.",authRequired:true},{status:401});
  return NextResponse.next();
}
export const config={matcher:"/api/:path*"};
