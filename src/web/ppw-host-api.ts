/** Vercel Node function adapter: session and World selection are server-owned.
 * Does NOT create or migrate Worlds, start a scheduler or connect to old Neon.
 * Single small connection pool reused within each warm function instance.
 */
import {postgresPool} from "../db/postgres.js";
import {requireIsolatedPreviewHost} from "../domain/preview-host-isolation.js";
import {manualPlaytestEnabled} from "../domain/manual-playtest-permission.js";
import {loadRingsideCommentary,generateGroqReview,RingsideGenerationError} from "../db/ringside-commentary.js";
import {readRingsideMemory} from "../db/ringside-continuity.js";
import {readCompletedShowView} from "../db/show-results-view.js";
import {withSqlClient} from "../db/postgres.js";
import {planNextWorldResolutionAction} from "../db/world-resolution-pipeline.js";
import {readAdminRingsideSettings,changeAdminRingsideSettings,rearmFailedRingsideReport}
 from "../db/admin-ringside-settings.js";
import {validateRingsideSettings} from "../domain/ringside-settings.js";
import {advancePlaytestWeek,extendPlaytestBooking} from "../db/manual-playtest-week.js";
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
 requireIsolatedPreviewHost(process.env,url,cfg.worldId);
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
 if(!["/api/auth","/api/session","/api/join","/api/claim","/api/card","/api/playtest-week","/api/playtest-booking","/api/results-commentary","/api/admin","/api/admin-preview"].includes(path))
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
 if(path==="/api/admin"||path==="/api/admin-preview"){
  if(!manualPlaytestEnabled(process.env,cfg.worldId,user.playerId))
   return json(403,{error:"Admin access requires the designated World operator"});
  if(post&&!csrf(req,user))return json(403,{error:"Invalid admin session"});
  if(path==="/api/admin"&&get){
   try{
    const [plan,settings,shows]=await Promise.all([
     planNextWorldResolutionAction(pool,cfg.worldId),
     readAdminRingsideSettings(pool,cfg.worldId),
     withSqlClient(pool,tx=>tx.query<{show_id:string;show_name:string|null;year:number;week:number}>(`
       SELECT c.show_id,d.show_name,c.year,c.week,
        r.state AS editorial_state,r.attempts AS editorial_attempts
       FROM ppw_completed_shows c
       JOIN ppw_promotion_controls p ON p.world_id=c.world_id
        AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
       LEFT JOIN ppw_booking_drafts d ON d.world_id=c.world_id
        AND d.draft_id=c.show_id
       LEFT JOIN ppw_ringside_reports r ON r.world_id=c.world_id
        AND r.promotion_id=c.promotion_id AND r.show_id=c.show_id
        AND r.prompt_version='ringside-v4'
       WHERE c.world_id=$1 ORDER BY c.year DESC,c.week DESC,c.completed_at DESC LIMIT 6`,
       [cfg.worldId,user.playerId]))
    ]);
    return json(200,{plan,settings,shows,groqConfigured:!!process.env.GROQ_API_KEY});
   }catch(e){
    console.error("Admin read failed",e instanceof Error?e.message:"unknown");
    return json(503,{error:"Admin status unavailable. No World state was changed."});
   }
  }
  if(!post)return json(405,{error:"Admin requires GET or POST"});
  const body=await limitedBody(req);
  if(!body)return json(400,{error:"Invalid admin request"});
  if(path==="/api/admin"){
   if(!allow("admin-settings:"+cfg.worldId,12,60*60_000))
    return json(429,{error:"Admin settings rate limit reached"});
   if(body.action==="RETRY_FAILED_RINGSIDE"){
    if(typeof body.showId!=="string"||body.showId.length>200)
     return json(400,{error:"Select a completed show"});
    try{return json(200,await rearmFailedRingsideReport(pool,cfg.worldId,
      user.playerId,body.showId));}
    catch(e){return json(409,{error:e instanceof Error?e.message:
      "Failed review retry was not permitted"});}
   }
   if(body.action!=="SAVE_RINGSIDE"||
      !Number.isSafeInteger(body.expectedVersion)||
      typeof body.settings!=="object")
    return json(400,{error:"Invalid settings update"});
   try{
    const saved=await changeAdminRingsideSettings(pool,cfg.worldId,user.playerId,
     body.settings,body.expectedVersion as number);
    return json(200,{settings:saved});
   }catch(e){return json(409,{error:e instanceof Error?e.message:"Settings rejected"});}
  }
  if(!allow("admin-preview:"+cfg.worldId,3,60*60_000))
   return json(429,{error:"AI preview limit: three reviews per hour"});
  if(!process.env.GROQ_API_KEY)return json(503,{error:"Groq is not configured"});
  if(typeof body.showId!=="string"||body.showId.length>200||!body.showId)
   return json(400,{error:"Choose a completed show"});
  try{
   const promotion=await withSqlClient(pool,tx=>tx.query<{promotion_id:string}>(`
     SELECT c.promotion_id FROM ppw_completed_shows c
     JOIN ppw_promotion_controls p ON p.world_id=c.world_id
      AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
     WHERE c.world_id=$1 AND c.show_id=$3 LIMIT 1`,
     [cfg.worldId,user.playerId,body.showId]));
   if(promotion.length!==1)return json(404,{error:"Completed show not available"});
   const effective=body.settings?{
    ...validateRingsideSettings(body.settings),version:0
   }:await readAdminRingsideSettings(pool,cfg.worldId);
   const show=await readCompletedShowView(pool,{worldId:cfg.worldId,
    playerId:user.playerId,promotionId:promotion[0]!.promotion_id,
    showId:body.showId});
   let memory;
   try{memory=await readRingsideMemory(pool,{worldId:cfg.worldId,
    playerId:user.playerId,promotionId:promotion[0]!.promotion_id,
    showId:body.showId},show);}
   catch{console.warn("Ringside history unavailable; previewing card facts");}
   const review=await generateGroqReview(show,process.env.GROQ_API_KEY,fetch,effective,memory);
   return json(200,{review,preview:true});
  }catch(e){
   console.error("Admin Ringside preview failed",e instanceof Error?e.message:"unknown");
   const safe=e instanceof RingsideGenerationError?e.message:
    "Groq's report failed a factual safety check. No published review was changed.";
   return json(e instanceof RingsideGenerationError&&
    e.code==="PROVIDER_LIMIT"?429:422,{error:safe,
    code:e instanceof RingsideGenerationError?e.code:"FACT_VALIDATION",
    ...(e instanceof RingsideGenerationError&&e.retryAfterSeconds?
      {retryAfterSeconds:e.retryAfterSeconds}:{})});
  }
 }
 if(path==="/api/playtest-booking"){
  if(!manualPlaytestEnabled(process.env,cfg.worldId,user.playerId))
   return json(403,{error:"Only the designated playtest operator can reopen booking"});
  if(!post)return json(405,{error:"POST required"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("reopen:"+cfg.worldId,4,10*60_000))
   return json(429,{error:"Booking extension rate limit reached"});
  const b=await limitedBody(req);
  if(!b||b.confirm!=="EXTEND_SHARED_BOOKING"||
   !Number.isSafeInteger(b.year)||!Number.isSafeInteger(b.week))
   return json(400,{error:"Confirm the exact shared week"});
  try{return json(200,await extendPlaytestBooking(pool,cfg.worldId,b.year as number,b.week as number));}
  catch{return json(409,{error:"The World must still be open for this week. Refresh Home."});}
 }
 if(path==="/api/playtest-week"){
  if(!manualPlaytestEnabled(process.env,cfg.worldId,user.playerId))
   return json(403,{error:"Only the designated preview operator can advance the test World"});
  if(!post)return json(405,{error:"Only explicit manual action may advance the World"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("manual:"+cfg.worldId,40,10*60_000))
   return json(429,{error:"Wait before continuing World resolution"});
  const b=await limitedBody(req);
  if(!b||b.confirm!=="ADVANCE_SHARED_WORLD"||
   !Number.isSafeInteger(b.year)||!Number.isSafeInteger(b.week))
   return json(400,{error:"Confirm the exact shared World week before advancing"});
  try{
   const result=await advancePlaytestWeek(pool,cfg.worldId,b.year as number,b.week as number);
   return json(200,result);
  }catch(e){
   const message=e instanceof Error?e.message:"";
   return json(409,{error:/must confirm its regular show/i.test(message)?
    "A human manager has an unfinished current-week show. Review the card before advancing.":
    /already progressed/i.test(message)?
    "The World has moved on. Refresh Home to see the new week.":
    (message?"Resolution halted: "+message.slice(0,220):"Unable to continue the World. Review Admin diagnostics.")});
  }
 }
 if(path==="/api/results-commentary"){
  if(!post)return json(405,{error:"POST required"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("ringside:"+user.playerId,10,60*60_000))
   return json(429,{error:"Ringside quota reached"});
  const body=await limitedBody(req);
  if(!body||body.worldId!==cfg.worldId||
   typeof body.promotionId!=="string"||!body.promotionId||
   body.promotionId.length>200||typeof body.showId!=="string"||
   !body.showId||body.showId.length>200)return json(400,{error:"Invalid show scope"});
  try{
   const result=await loadRingsideCommentary(pool,{
    worldId:cfg.worldId,playerId:user.playerId,
    promotionId:body.promotionId,showId:body.showId},
    process.env.GROQ_API_KEY);
   return json(result.status==="pending"?202:200,result);
  }catch{return json(404,{error:"No completed show available"});}
 }
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
    csrfToken:user.csrfToken,overview,availablePromotions:options,
    canManualAdvance:manualPlaytestEnabled(process.env,cfg.worldId,user.playerId)});
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
