import {NextResponse,type NextRequest} from "next/server";
import {ADMIN_COOKIE,verifyAdminToken} from "@/lib/admin-auth";

function sameOrigin(req:NextRequest){const origin=req.headers.get("origin");if(!origin)return true;try{return new URL(origin).host===req.nextUrl.host}catch{return false}}
function cronAuthorized(req:NextRequest){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get("authorization")===`Bearer ${secret}`)}

export function proxy(req:NextRequest){
  const path=req.nextUrl.pathname;
  const publicApi=path==="/api/auth/login"||path==="/api/auth/logout"||path==="/api/auth/status"||path==="/api/share/view";
  if(publicApi)return NextResponse.next();
  if(path==="/admin")return NextResponse.next();

  const cron=path.startsWith("/api/cron/");
  if(cron&&cronAuthorized(req))return NextResponse.next();

  const token=req.cookies.get(ADMIN_COOKIE)?.value,admin=verifyAdminToken(token);
  if(!admin){
    if(path.startsWith("/api/"))return Response.json({error:"Owner authentication required.",authRequired:true},{status:401});
    const url=req.nextUrl.clone();url.pathname="/admin";url.search="";url.searchParams.set("next",path+req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if(path.startsWith("/api/")&&!["GET","HEAD","OPTIONS"].includes(req.method)&&!sameOrigin(req))return Response.json({error:"Cross-site write blocked."},{status:403});
  return NextResponse.next();
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)"]};
