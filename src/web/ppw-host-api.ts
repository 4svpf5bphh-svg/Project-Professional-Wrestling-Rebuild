/** Vercel Node function adapter: session and World selection are server-owned.
 * Does NOT create or migrate Worlds, start a scheduler or connect to old Neon.
 * Single small connection pool reused within each warm function instance.
 */
import {postgresPool} from "../db/postgres.js";
import {availablePromotionsAsActor,claimPromotionAsActor,joinWorldAsActor,
 overviewAsActor} from "../api/world-service.js";
import {handleCardHttp} from "./card-http.js";
import {authenticateInvite,clearSessionCookie,readSessionCookie,
 requireInviteConfig,sessionCookie,signPlayerSession,verifyPlayerSession,
 type InviteConfig,type PlayerSession} from "./invite-session.js";
import type {WorldApiContext} from "../api/world-service.js";
import type {TransactionPool} from "../db/transaction.js";

const cache:{pool?:TransactionPool;config?:InviteConfig;dbUrl?:string}={};
function runtime(){
 const cfg=cache.config??requireInviteConfig(process.env);
 const url=process.env.DATABASE_URL;
 if(!url)throw new Error("Missing PPW isolated database connection");
 if(!cache.pool||cache.dbUrl!==url){
  cache.pool=postgresPool(url,3).pool;cache.dbUrl=url;
 }
 cache.config=cfg;
 return {cfg,pool:cache.pool};
}
const json=(code:number,body:unknown,headers?:HeadersInit)=>{
 const h=new Headers(headers);h.set("content-type","application/json; charset=utf-8");
 h.set("cache-control","no-store");h.set("x-content-type-options","nosniff");
 h.set("referrer-policy","no-referrer");
 return new Response(JSON.stringify(body),{status:code,headers:h});
};
const denied=()=>json(401,{error:"Sign in required"});
function sameOrigin(req:Request){
 const origin=req.headers.get("origin"),host=req.headers.get("host");
 if(!origin||!host)return false;
 try{return new URL(origin).origin===new URL(req.url,origin).origin&&
  new URL(origin).host===host;}
 catch{return false;}
}
const ipBuckets=new Map<string,{count:number;until:number}>();
function allow(key:string,limit:number,windowMs:number){
 const now=Date.now(),current=ipBuckets.get(key);
 if(!current||current.until<=now){
  if(ipBuckets.size>2000)ipBuckets.clear();
  ipBuckets.set(key,{count:1,until:now+windowMs});return true;
 }
 current.count++;return current.count<=limit;
}
function session(req:Request,cfg:InviteConfig){
 const token=readSessionCookie(req);
 return token?verifyPlayerSession(cfg,token):null;
}
function csrf(req:Request,user:PlayerSession){
 const supplied=req.headers.get("x-ppw-csrf");
 return !!supplied&&supplied===user.csrfToken;
}
async function limitedBody(req:Request){
 const declared=Number(req.headers.get("content-length")??"0");
 if(!Number.isSafeInteger(declared)||declared>4096)return null;
 const text=await req.text();
 if(Buffer.byteLength(text)>4096)return null;
 try{const body:unknown=JSON.parse(text);
  return body&&typeof body==="object"&&!Array.isArray(body)?
   body as Record<string,unknown>:null;
 }catch{return null;}
}
export async function handlePpwHostApi(req:Request):Promise<Response>{
 let cfg:InviteConfig,pool:TransactionPool;
 try{({cfg,pool}=runtime());}
 catch{return json(503,{error:"Game host not configured"});}
 const path=new URL(req.url,"https://"+(req.headers.get("host")??"localhost")).pathname;
 const get=req.method==="GET",post=req.method==="POST";
 if(!["/api/auth","/api/session","/api/join","/api/claim","/api/card"].includes(path))
  return json(404,{error:"Unknown game route"});
 if(!get&&!post&&!(path==="/api/auth"&&req.method==="DELETE"))
  return json(405,{error:"Method not allowed"});
 if(!get&&!sameOrigin(req))return json(403,{error:"Invalid origin"});
 if(path==="/api/auth"&&post){
  const address=req.headers.get("x-real-ip")??"unknown";
  if(!allow("login:"+address,8,15*60_000))
   return json(429,{error:"Too many sign-in attempts"});
  const body=await limitedBody(req);
  if(!body||typeof body.playerId!=="string"||typeof body.accessCode!=="string")
   return json(400,{error:"Invalid sign-in"});
  if(!authenticateInvite(cfg,body.playerId,body.accessCode))
   return json(401,{error:"Invalid sign-in"});
  const signed=signPlayerSession(cfg,body.playerId);
  return json(200,{ok:true},{ "set-cookie":sessionCookie(signed.token,cfg)});
 }
 const user=session(req,cfg);
 if(!user)return denied();
 if(path==="/api/auth"&&req.method==="DELETE"){
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  return json(200,{ok:true},{"set-cookie":clearSessionCookie(cfg)});
 }
 const actor:WorldApiContext={pool,actor:{playerId:user.playerId}};
 if(path==="/api/card"){
  return handleCardHttp(req,{expectedWorldId:cfg.worldId,authenticate:async()=>({
   context:actor,csrfToken:user.csrfToken
  }),allowRequest:async()=>allow("card:"+user.playerId,180,60_000)});
 }
 if(path==="/api/session"&&get){
  if(!allow("session:"+user.playerId,45,60_000))
   return json(429,{error:"Too many requests"});
  try{
   const overview=await overviewAsActor(actor,cfg.worldId);
   if(!overview)return json(503,{error:"Configured World is unavailable"});
   const options=overview.membership==="ACTIVE"&&!overview.promotion?
    await availablePromotionsAsActor(actor,cfg.worldId,null,40):[];
   return json(200,{worldId:cfg.worldId,playerId:user.playerId,
    csrfToken:user.csrfToken,overview,availablePromotions:options});
  }catch{return json(503,{error:"World data unavailable"});}
 }
 if(path==="/api/join"||path==="/api/claim"){
  if(!post)return json(405,{error:"Method not allowed"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("mutation:"+user.playerId,90,60_000))
   return json(429,{error:"Too many requests"});
  const b=await limitedBody(req);
  if(!b||typeof b.requestId!=="string"||b.requestId.length>200||
   !Number.isSafeInteger(b.expectedRevision)||
   (b.expectedRevision as number)<0)
   return json(400,{error:"Invalid command"});
  try{
   if(path==="/api/join")
    return json(200,await joinWorldAsActor(actor,{worldId:cfg.worldId,
     requestId:b.requestId,expectedRevision:b.expectedRevision as number}));
   if(typeof b.promotionId!=="string"||b.promotionId.length>200||!b.promotionId)
    return json(400,{error:"Invalid promotion"});
   return json(200,await claimPromotionAsActor(actor,{worldId:cfg.worldId,
    promotionId:b.promotionId,requestId:b.requestId,
    expectedRevision:b.expectedRevision as number}));
  }catch(e){
   const message=e instanceof Error?e.message:"";
   return json(/revision|conflict|stale/i.test(message)?409:400,
    {error:"World changed or action unavailable. Refresh and review."});
  }
 }
 return json(405,{error:"Method not allowed"});
}
