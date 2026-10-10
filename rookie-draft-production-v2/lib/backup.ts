import {Bucket} from "@upstash/blob";
export async function storeBackup(payload:any,folder:"daily"|"imports"="daily"){if(!process.env.UPSTASH_BLOB_TOKEN)return null;const bucket=Bucket.fromEnv();const stamp=new Date().toISOString().replace(/[:.]/g,"-");return bucket.put(`rookie-draft/${folder}/${stamp}.json`,JSON.stringify(payload),{contentType:"application/json",cache:"no-store"})}
