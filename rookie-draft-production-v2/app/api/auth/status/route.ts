import {cookies} from "next/headers";
import {ADMIN_COOKIE,authConfigured,verifyAdminToken} from "@/lib/admin-auth";
export async function GET(){const jar=await cookies();return Response.json({configured:authConfigured(),authenticated:verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)})}
