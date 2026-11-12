/** Vercel Node function adapter: session and World selection are server-owned.
 * Does NOT create or migrate Worlds, start a scheduler or connect to old Neon.
 * Single small connection pool reused within each warm function instance.
 */
import {postgresPool} from "../db/postgres.js";
import {requireIsolatedPreviewHost} from "../domain/preview-host-isolation.js";
import {manualPlaytestEnabled,aiBenchmarkPreviewOperatorEnabled} from "../domain/manual-playtest-permission.js";
import {loadRingsideCommentary,generateGroqReview,RingsideGenerationError} from "../db/ringside-commentary.js";
import {paidPreviewEnabled,OPENAI_PREVIEW_MODEL} from "../db/openai-editorial-preview.js";
import {groqResponseUsage} from "../domain/ai-director.js";
import {getWrestlingBenchmark,assessWrestlingBenchmark,WRESTLING_BENCHMARKS}
 from "../domain/wrestling-ai-benchmark.js";
import {POSTSHOW_VOICE_SCENARIOS,getPostShowVoiceBenchmark}
 from "../domain/postshow-voice-lab.js";
import {generatePostShowVoiceCopy,
 type ShortformVoiceDiagnostic} from "../db/postshow-voice-batches.js";
import {saveShortformVoiceLabRun,readShortformVoiceLabRuns}
 from "../db/postshow-voice-lab.js";
import {DEFAULT_RINGSIDE_SETTINGS} from "../domain/ringside-settings.js";
import {readAiLabDashboard,readAiLabReview,saveAiLabPreview,saveAiLabFeedback,
 saveAiLabFailure,type AiLabErrorCode} from "../db/ai-quality-lab.js";
import {readRingsideMemory} from "../db/ringside-continuity.js";
import {readCompletedShowView} from "../db/show-results-view.js";
import {withSqlClient} from "../db/postgres.js";
import {planNextWorldResolutionAction} from "../db/world-resolution-pipeline.js";
import {readAdminRingsideSettings,changeAdminRingsideSettings,rearmFailedRingsideReport}
 from "../db/admin-ringside-settings.js";
import {validateRingsideSettings} from "../domain/ringside-settings.js";
import {advancePlaytestWeek,extendPlaytestBooking} from "../db/manual-playtest-week.js";
import {postShowVoiceEnabled,publishPostShowVoiceBatches} from "../db/postshow-voice-batches.js";
import {readLegendPilot,armLegendPilot,cancelLegendPilot} from "../db/legend-reveal-pilot.js";
import {hasUnseenLegendReveal} from "../db/legends-vault.js";
import {readPlaytestKp,grantPlaytestKp} from "../db/admin-kp-playtest.js";
import {getOwnerDisplayName,saveOwnerDisplayName,renameOwnedPromotion}
 from "../db/owner-identities.js";
import {readPremiumScrum,answerPremiumScrum,dismissPremiumScrum} from "../db/premium-media-scrum.js";
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
 // Vercel Hobby permits at most twelve function entrypoints.
 // Three protected identity/media routes share one serverless function;
 // its fixed rewrite marker preserves the authoritative original route.
 const routeUrl=new URL(req.url,"https://"+(req.headers.get("host")??"localhost"));
 const sharedRoute=routeUrl.searchParams.get("route");
 const path=routeUrl.pathname==="/api/identity"&&
  (sharedRoute==="profile"||sharedRoute==="promotion-identity"||
   sharedRoute==="media-scrum")
  ?"/api/"+sharedRoute:routeUrl.pathname;
 const get=req.method==="GET",post=req.method==="POST";
 if(!["/api/auth","/api/session","/api/join","/api/claim","/api/card","/api/playtest-week","/api/playtest-booking","/api/results-commentary","/api/admin","/api/admin-preview","/api/profile","/api/promotion-identity","/api/media-scrum"].includes(path))
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
 if(path==="/api/media-scrum"){
  if(!post)return json(405,{error:"POST required"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("media:"+user.playerId,30,60*60_000))
   return json(429,{error:"Press scrum request limit reached"});
  const b=await limitedBody(req);
  if(!b||typeof b.showId!=="string"||typeof b.promotionId!=="string"||
   !b.showId||!b.promotionId||b.showId.length>200||b.promotionId.length>200)
   return json(400,{error:"Invalid premium show"});
  const scope={worldId:cfg.worldId,playerId:user.playerId,
   promotionId:b.promotionId,showId:b.showId};
  try{
   if(b.action==="READ")return json(200,await readPremiumScrum(pool,scope));
   if(b.action==="DISMISS")return json(200,await dismissPremiumScrum(pool,scope));
   if(b.action==="ANSWER"&&typeof b.questionId==="string"&&
    Number.isInteger(b.answerIndex))
    return json(200,await answerPremiumScrum(pool,scope,
     b.questionId,b.answerIndex as number));
   return json(400,{error:"Invalid media scrum request"});
  }catch(e){return json(409,{error:e instanceof Error?e.message:"Media session unavailable"});}
 }
 if(path==="/api/profile"||path==="/api/promotion-identity"){
  if(!post)return json(405,{error:"POST required"});
  if(!csrf(req,user))return json(403,{error:"Invalid session"});
  if(!allow("identity:"+user.playerId,12,60*60_000))
   return json(429,{error:"Too many identity changes"});
  const body=await limitedBody(req);
  if(!body)return json(400,{error:"Invalid identity request"});
  try{
   if(path==="/api/profile"){
    if(body.action!=="SET_NAME")return json(400,{error:"Invalid profile request"});
    return json(200,await saveOwnerDisplayName(pool,user.playerId,body.name));
   }
   if(body.action!=="RENAME"||typeof body.promotionId!=="string")
    return json(400,{error:"Invalid promotion request"});
   return json(200,await renameOwnedPromotion(pool,{
    worldId:cfg.worldId,playerId:user.playerId,
    promotionId:body.promotionId,name:body.name
   }));
  }catch(e){return json(409,{error:e instanceof Error?e.message:"Identity update rejected"});}
 }

 if(path==="/api/admin"||path==="/api/admin-preview"){
  const normalOperator=manualPlaytestEnabled(process.env,cfg.worldId,user.playerId);
  const benchmarkOperator=aiBenchmarkPreviewOperatorEnabled(process.env,
   cfg.worldId,user.playerId);
  if(!normalOperator&&!benchmarkOperator)
   return json(403,{error:"Admin access requires the designated World operator"});
  if(post&&!csrf(req,user))return json(403,{error:"Invalid admin session"});
  if(path==="/api/admin"&&get&&routeUrl.searchParams.get("aiLab")){
   const view=routeUrl.searchParams.get("aiLab");
   try{
    if(view==="summary")return json(200,{
     ...await readAiLabDashboard(pool,cfg.worldId,user.playerId),
     scenarios:WRESTLING_BENCHMARKS,
     shortformScenarios:POSTSHOW_VOICE_SCENARIOS,
     shortformRuns:await readShortformVoiceLabRuns(pool,cfg.worldId,user.playerId),
     providers:{groq:!!process.env.GROQ_API_KEY,
      openai:paidPreviewEnabled(process.env)}
    });
    if(view==="review"){
     const runId=routeUrl.searchParams.get("runId")??"";
     return json(200,{review:await readAiLabReview(pool,cfg.worldId,user.playerId,runId)});
    }
    return json(400,{error:"Unknown AI lab view"});
   }catch(e){return json(503,{error:e instanceof Error&&e.message.includes("unavailable")?
     "That private AI sample is unavailable":"AI test history is unavailable"});}
  }
  if(path==="/api/admin"&&get){
   try{
    const [plan,settings,shows,pilot,testKp,aiUsage]=await Promise.all([
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
       [cfg.worldId,user.playerId])),
     readLegendPilot(pool,cfg.worldId),
     readPlaytestKp(pool,cfg.worldId,user.playerId),
     withSqlClient(pool,tx=>tx.query<{call_count:number;reserved_tokens:number;
      reported_input_tokens:string;reported_output_tokens:string;
      completed_calls:number;failed_calls:number}>(`
       SELECT call_count,reserved_tokens,reported_input_tokens::text,
        reported_output_tokens::text,completed_calls,failed_calls
       FROM ppw_groq_daily_usage
       WHERE usage_day=timezone('UTC',now())::date`,[]))
    ]);
    return json(200,{plan,settings,shows,pilot,testKp,aiUsage:aiUsage[0]??null,
     groqConfigured:!!process.env.GROQ_API_KEY,
     openAiPreviewEnabled:paidPreviewEnabled(process.env)});
   }catch(e){
    console.error("Admin read failed",e instanceof Error?e.message:"unknown");
    return json(503,{error:"Admin status unavailable. No World state was changed."});
   }
  }
  if(!post)return json(405,{error:"Admin requires GET or POST"});
  const body=await limitedBody(req);
  if(!body)return json(400,{error:"Invalid admin request"});
  if(path==="/api/admin"){
   if(benchmarkOperator&&body.action!=="RATE_AI_LAB_RUN")
    return json(403,{error:"Benchmark preview permits AI quality ratings only"});
   if(!allow("admin-settings:"+cfg.worldId,12,60*60_000))
    return json(429,{error:"Admin settings rate limit reached"});
   if(body.action==="GRANT_PLAYTEST_KP"){
    if(!allow("kp-playtest:"+cfg.worldId+":"+user.playerId,2,60*60_000))
     return json(429,{error:"KP test grant retry limit reached"});
    try{return json(200,await grantPlaytestKp(pool,cfg.worldId,user.playerId));}
    catch(e){return json(409,{error:e instanceof Error?e.message:"KP test credit unavailable"});}
   }
   if(body.action==="ARM_LEGEND_PILOT"||body.action==="CANCEL_LEGEND_PILOT"){
    try{return json(200,body.action==="ARM_LEGEND_PILOT"?
     await armLegendPilot(pool,cfg.worldId,user.playerId):
     await cancelLegendPilot(pool,cfg.worldId,user.playerId));}
    catch(e){return json(409,{error:e instanceof Error?e.message:"Legend pilot rejected"});}
   }
   if(body.action==="RATE_AI_LAB_RUN"){
    if(typeof body.runId!=="string"||body.runId.length>100)
     return json(400,{error:"Choose a recorded AI preview"});
    try{return json(200,await saveAiLabFeedback(pool,cfg.worldId,
     user.playerId,body.runId,{rating:body.rating,flags:body.flags,notes:body.notes}));}
    catch(e){return json(409,{error:e instanceof Error?e.message:
      "AI preview feedback was not saved"});}
   }
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
  // A separate fictional 20B voice test is available ONLY to the protected
  // operator of the isolated AI Lab. It never reaches the World publication
  // path, does not create completed shows, and never retries rejected output.
  if(path==="/api/admin-preview"&&body.shortformBenchmarkId!==undefined){
   if(!benchmarkOperator||Object.keys(body).length!==1||
    typeof body.shortformBenchmarkId!=="string"||
    body.shortformBenchmarkId.length>50)
    return json(403,{error:"Protected shortform tests accept fixed fixtures only"});
   if(!allow("admin-preview:"+cfg.worldId,3,60*60_000))
    return json(429,{error:"AI preview limit: three reviews per hour"});
   const fixture=getPostShowVoiceBenchmark(body.shortformBenchmarkId);
   if(!fixture)return json(400,{error:"Unknown fictional voice scenario"});
   const key=process.env.GROQ_API_KEY;
   if(!key)return json(503,{error:"Groq free test key not configured"});
   let providerCalls=0,inputTokens=0,outputTokens=0,reported=true;
   const start=Date.now();
   const meter:typeof fetch=async(url,init)=>{
    providerCalls++;
    let response:Response;
    try{response=await fetch(url,init);}
    catch(e){reported=false;throw e;}
    let usage=null;
    if(response.ok)try{usage=groqResponseUsage(await response.clone().json());}
    catch{/* A provider response need not include usage. */}
    if(usage){inputTokens+=usage.inputTokens;outputTokens+=usage.outputTokens;}
    else reported=false;
    return response;
   };
   let copy=null,code:"NO_ACCEPTED_COPY"|"PROVIDER_ERROR"="NO_ACCEPTED_COPY";
   let diagnostic:ShortformVoiceDiagnostic|null=null;
   try{
    copy=await generatePostShowVoiceCopy(fixture.show,key,meter,pool,
     result=>{diagnostic=result;});
   }catch{
    code="PROVIDER_ERROR";
    diagnostic={category:"PROVIDER_ERROR",news:"MISSING",
     wrestler:"MISSING",roadAgent:"MISSING"};
   }
   const durationMs=Math.min(180000,Date.now()-start);
   const metrics={durationMs,providerCalls,
    inputTokens:providerCalls&&reported?inputTokens:null,
    outputTokens:providerCalls&&reported?outputTokens:null};
   let runId:string|null=null;
   try{
    const saved=await saveShortformVoiceLabRun(pool,{
     worldId:cfg.worldId,playerId:user.playerId,scenarioId:fixture.scenario.id,
     ...metrics,copy,errorCode:copy?undefined:code,diagnostic
    });
    runId=saved.runId;
   }catch{console.warn("Shortform Lab could not save private sample");}
   if(!copy)return json(422,{error:"No verified shortform copy was accepted. "+
    "The existing PPW writing remains the fallback; no World data changed.",
    runId,metrics,code,diagnostic});
   return json(200,{copy,brief:fixture.brief,runId,metrics,diagnostic});
  }
  if(benchmarkOperator&&(typeof body.benchmarkId!=="string"||
    !body.benchmarkId||body.showId!==undefined))
   return json(403,{error:"Benchmark preview permits fixed AI fixtures only"});
  if(!allow("admin-preview:"+cfg.worldId,3,60*60_000))
   return json(429,{error:"AI preview limit: three reviews per hour"});

  const previewProvider=body.previewProvider??"GROQ";
  if(previewProvider!=="GROQ"&&previewProvider!=="OPENAI")
   return json(400,{error:"Unknown AI preview provider"});
  if(previewProvider==="OPENAI"&&!paidPreviewEnabled(process.env))
   return json(403,{error:"Paid API preview is disabled on this server"});
  const providerKey=previewProvider==="OPENAI"?
   process.env.OPENAI_API_KEY:process.env.GROQ_API_KEY;
  if(!providerKey)return json(503,{error:"Selected AI provider is not configured"});
  // Only a named, trusted fixture can bypass completed-show ownership reads.
  // Fixture previews remain guarded by the same operator auth/CSRF/rate limit,
  // AI daily token budget and certified Ringside output validator.
  const fixtureRequested=body.benchmarkId!==undefined;
  if(fixtureRequested&&(typeof body.benchmarkId!=="string"||
   body.benchmarkId.length>80||body.showId!==undefined))
   return json(400,{error:"Choose one recognised wrestling test"});
  const fixture=fixtureRequested?getWrestlingBenchmark(body.benchmarkId as string):null;
  if(fixtureRequested&&!fixture)return json(400,{error:"Unknown wrestling test"});
  if(!fixture&&(typeof body.showId!=="string"||
   body.showId.length>200||!body.showId))
   return json(400,{error:"Choose a completed show"});
  let tracked:null|{
   showId:string;showName:string;model:string;started:number;
   calls:number;input:number;output:number;reported:boolean;
   compatibilityJson:boolean
  }=null;
  try{
   const safeSettings=body.settings?validateRingsideSettings(body.settings):null;
   // Every benchmark uses exactly the same presentation settings except the
   // selected model. Creative settings from a prior playtest cannot bias it.
   const effective=fixture?{...DEFAULT_RINGSIDE_SETTINGS,
    model:safeSettings?.model??DEFAULT_RINGSIDE_SETTINGS.model}:
    safeSettings?{...safeSettings,version:0}:
     await readAdminRingsideSettings(pool,cfg.worldId);
   let show, memory;
   if(fixture){
    show=fixture.show;
   }else{
    const promotion=await withSqlClient(pool,tx=>tx.query<{promotion_id:string}>(`
     SELECT c.promotion_id FROM ppw_completed_shows c
     JOIN ppw_promotion_controls p ON p.world_id=c.world_id
      AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
     WHERE c.world_id=$1 AND c.show_id=$3 LIMIT 1`,
     [cfg.worldId,user.playerId,body.showId]));
    if(promotion.length!==1)return json(404,{error:"Completed show not available"});
    show=await readCompletedShowView(pool,{worldId:cfg.worldId,
     playerId:user.playerId,promotionId:promotion[0]!.promotion_id,
     showId:body.showId as string});
    try{memory=await readRingsideMemory(pool,{worldId:cfg.worldId,
     playerId:user.playerId,promotionId:promotion[0]!.promotion_id,
     showId:body.showId as string},show);}
    catch{console.warn("Ringside history unavailable; previewing card facts");}
   }
   // Capture actual provider attempts, including validation retries, failed
   // HTTP requests, and calls that throw before a response is received.
   tracked={showId:show.showId,showName:show.showName??"Completed show",
    model:previewProvider==="OPENAI"?OPENAI_PREVIEW_MODEL:effective.model,
    started:Date.now(),calls:0,input:0,output:0,reported:true,
    compatibilityJson:false};
   const meter=tracked;
   const instrumentedTransport:typeof fetch=async(url,init)=>{
    meter.calls++;
    // Inspect only our own outbound format marker; never store prompts or keys.
    try{
     const outbound=JSON.parse(String(init?.body)) as {response_format?:{type?:string}};
     if(outbound.response_format?.type==="json_object")
      meter.compatibilityJson=true;
    }catch{/* Unreadable request shape remains an upstream error. */}
    let response:Response;
    try{response=await fetch(url,init);}
    catch(error){meter.reported=false;throw error;}
    let usage=null;
    if(response.ok)try{usage=groqResponseUsage(await response.clone().json());}
    catch{/* Provider omitted or changed usage details. */}
    if(usage){meter.input+=usage.inputTokens;meter.output+=usage.outputTokens;}
    else meter.reported=false;
    return response;
   };
   const review=await generateGroqReview(show,providerKey,instrumentedTransport,
    effective,memory,pool,previewProvider,!!fixture);
   const durationMs=Date.now()-meter.started;
   const benchmark=fixture?assessWrestlingBenchmark(fixture.scenario.id,review):null;
   const recorded=await saveAiLabPreview(pool,{
    worldId:cfg.worldId,playerId:user.playerId,showId:meter.showId,
    showName:meter.showName,provider:previewProvider,model:meter.model,
    durationMs,providerCalls:meter.calls,
    inputTokens:meter.reported?meter.input:null,
    outputTokens:meter.reported?meter.output:null,review
   });
   tracked=null;
   return json(200,{review,preview:true,labRunId:recorded.runId,
    ...(benchmark?{benchmark}:{}),
    metrics:{durationMs,providerCalls:meter.calls,
     inputTokens:meter.reported?meter.input:null,
     outputTokens:meter.reported?meter.output:null,
     compatibilityJson:meter.compatibilityJson}});
  }catch(e){
   // An invalid model response is meaningful evidence. Save ONLY a fixed,
   // safe error code and measured usage, never rejected prose or raw errors.
   if(tracked){
    const audit=tracked;
    const code:AiLabErrorCode=e instanceof RingsideGenerationError?
     e.code==="PROVIDER_LIMIT"||e.code==="PROVIDER_AUTH"||
     e.code==="PROVIDER_ERROR"||e.code==="FACT_VALIDATION"||
     e.code==="INVALID_OUTPUT"||e.code==="OUTPUT_INCOMPLETE"?
      e.code:"UNKNOWN":"UNKNOWN";
    try{await saveAiLabFailure(pool,{
     worldId:cfg.worldId,playerId:user.playerId,showId:audit.showId,
     showName:audit.showName,provider:previewProvider,model:audit.model,
     durationMs:Math.min(180000,Date.now()-audit.started),
     providerCalls:audit.calls,
     inputTokens:audit.reported?audit.input:null,
     outputTokens:audit.reported?audit.output:null,errorCode:code
    });}catch{console.warn("AI Lab could not save failed preview telemetry");}
   }
   console.error("Admin Ringside preview failed",e instanceof Error?e.message:"unknown");
   const safe=e instanceof RingsideGenerationError?e.message:
    "AI editorial failed a factual safety check. No published review was changed.";
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
   // One post-PUBLISH_WEEK batch, outside ALL World Lock transactions.
   // Disabled by default; failures cannot roll back official results or week.
   if(result.status==="PUBLISHED"&&postShowVoiceEnabled(process.env,cfg.worldId)){
    try{
     const voices=await publishPostShowVoiceBatches(pool,{
      worldId:cfg.worldId,year:b.year as number,week:b.week as number},
      process.env.GROQ_API_KEY!);
     console.info("Certified shortform publishing",{
      eligible:voices.eligible,generated:voices.generated,
      failed:voices.failed,skipped:voices.skipped});
    }catch{
     console.warn("Shortform publishing unavailable; certified results remain intact");
    }
   }
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
    process.env.PPW_AI_BENCHMARK_PREVIEW==="YES"?
     undefined:process.env.GROQ_API_KEY);
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
   const [overview,ownerName]=await Promise.all([
    overviewAsActor(actor,cfg.worldId),
    getOwnerDisplayName(pool,user.playerId)
   ]);
   if(!overview)return json(503,{error:"Configured World is unavailable"});
   const options=overview.membership==="ACTIVE"&&!overview.promotion?
    await availablePromotionsAsActor(actor,cfg.worldId,null,40):[];
   // One indexed read at sign-in, never each screen or through a polling
   // loop. The approved, existing Vault ceremony is the only reveal UI.
   const unseenLegendReveal=overview.membership==="ACTIVE"&&overview.promotion?
    await hasUnseenLegendReveal(pool,{worldId:cfg.worldId,
     playerId:user.playerId,promotionId:overview.promotion.id}):false;
   return json(200,{worldId:cfg.worldId,playerId:user.playerId,
    ownerName,csrfToken:user.csrfToken,overview,availablePromotions:options,
    unseenLegendReveal,
    canManualAdvance:manualPlaytestEnabled(process.env,cfg.worldId,user.playerId),
    canAiBenchmark:aiBenchmarkPreviewOperatorEnabled(process.env,
     cfg.worldId,user.playerId)});
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
