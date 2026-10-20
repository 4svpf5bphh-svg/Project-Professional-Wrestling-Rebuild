import {randomUUID} from "node:crypto";
import type {WorldApiContext} from "../api/world-service.js";
import {dispatchCardRpc} from "./card-rpc.js";
import {bookingErrorCode} from "./card-error-feedback.js";
export interface VerifiedCardSession {
 context:WorldApiContext;
 csrfToken:string;
}
export interface CardHttpDependencies {
 expectedWorldId?:string;
 authenticate(request:Request):Promise<VerifiedCardSession|null>;
 allowRequest(session:VerifiedCardSession):Promise<boolean>;
}
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"no-store","x-content-type-options":"nosniff"}});
/** Framework-independent HTTP boundary: caller supplies real session verification and rate limit. */
export async function handleCardHttp(request:Request,deps:CardHttpDependencies):Promise<Response>{
 if(request.method!=="POST")return json(405,{error:"Method not allowed"});
 const origin=request.headers.get("origin");
 const host=request.headers.get("host");
 if(!origin||!host)return json(403,{error:"Forbidden"});
 try{
  const url=new URL(origin);
  if(url.origin!==new URL(request.url,origin).origin||url.host!==host)
   return json(403,{error:"Forbidden"});
 }catch{return json(403,{error:"Forbidden"});}
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return json(415,{error:"JSON required"});
 const declared=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(declared)||declared>131072)return json(413,{error:"Request too large"});
 const session=await deps.authenticate(request);
 if(!session)return json(401,{error:"Sign in required"});
 if(!session.csrfToken||request.headers.get("x-ppw-csrf")!==session.csrfToken)
  return json(403,{error:"Forbidden"});
 if(!await deps.allowRequest(session))return json(429,{error:"Too many requests"});
 try{
  const body=await request.text();
  if(new TextEncoder().encode(body).length>131072)return json(413,{error:"Request too large"});
  const parsed:unknown=JSON.parse(body);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return json(400,{error:"Invalid request"});
  const data=parsed as Record<string,unknown>;
  if(typeof data.method!=="string")return json(400,{error:"Invalid request"});
  if(deps.expectedWorldId&&data.worldId!==deps.expectedWorldId)
   return json(403,{error:"World not available"});
  return json(200,await dispatchCardRpc(session.context,data.method,parsed));
 }catch(error){
  const message=error instanceof Error?error.message:"";
  if(/revision|stale|conflict/i.test(message))return json(409,{error:"Card changed. Reload to continue"});
  const code=bookingErrorCode(message);
  if(code)return json(400,{error:"Booking request rejected",code});
  // A single opaque support reference connects the player's screenshot to
  // a server diagnostic. Never log SQL text, raw exception messages, player
  // identity, booking participants, contract prices or entire payloads.
  const reference=randomUUID().slice(0,12);
  const kind=error instanceof Error?error.name:"UNKNOWN";
  const candidate=error&&typeof error==="object"&&"code" in error?
   (error as {code?:unknown}).code:null;
  const dbCode=typeof candidate==="string"&&/^[A-Z0-9]{5}$/.test(candidate)?
   candidate:null;
  console.warn("PPW card action rejected",{
   reference,action:"booking-or-desk",exceptionClass:kind,dbCode});
  return json(400,{error:"Booking request rejected",reference});
 }
}
