import {Redis} from "@upstash/redis";
let redis:Redis|null=null;function client(required=false){if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN){if(required)throw new Error("Upstash Redis is not configured");return null}return redis||=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN})}
export async function cacheGet<T>(key:string):Promise<T|null>{try{return await client()?.get<T>(key)??null}catch{return null}}
export async function cacheSet(key:string,value:any,ttl=21600){try{await client()?.set(key,value,{ex:ttl})}catch{}}
export async function cacheSetStrict(key:string,value:any,ttl=21600){const c=client(true)!;await c.set(key,value,{ex:ttl})}
export async function cacheDelete(key:string){try{await client()?.del(key)}catch{}}
export async function cacheDeleteStrict(key:string){const c=client(true)!;await c.del(key)}
