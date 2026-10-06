import {cookies} from "next/headers";
import {ADMIN_COOKIE} from "@/lib/admin-auth";
export async function POST(){const jar=await cookies();jar.set(ADMIN_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});return Response.json({ok:true})}
