import {architectureStatus} from "@/lib/data-architecture";export async function GET(){return Response.json(architectureStatus())}
