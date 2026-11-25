/** Shared metered Terra editorial transport for private comparisons and
 * authenticated, certified player show reports. Never runs in World Lock.
 * All generated prose is validated by the existing Ringside rules.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {estimatedGroqTokens,groqResponseUsage,type GroqUsage} from "../domain/ai-director.js";
import {classifyOpenAiProviderError,refundKnownProviderRejection}
 from "../domain/openai-error-diagnostics.js";
export const OPENAI_PREVIEW_MODEL="gpt-6.1-terra";
import {TERRA_DAILY_PREVIEW_ATTEMPTS,TERRA_DAILY_TOKEN_BUDGET,
 TERRA_PER_REQUEST_TOKEN_BUDGET} from "../domain/paid-editorial-policy.js";
const MAX_DAILY_REQUESTS=TERRA_DAILY_PREVIEW_ATTEMPTS,
 MAX_DAILY_ESTIMATE=TERRA_DAILY_TOKEN_BUDGET,
 MAX_REQUEST_ESTIMATE=TERRA_PER_REQUEST_TOKEN_BUDGET;
// Pessimistic GBP valuation: double the $1/$5 per-MTok standard Terra
// rates and treat $1 as £1. The over-reservation covers normal FX/VAT
// fluctuations, prompt-token uncertainty and retries that never run.
export const OPENAI_MONTHLY_CAP_MICROPOUNDS=3_000_000;
export function estimateTerraPreviewMicropounds(body:string,completionTokens:number){
 if(!Number.isSafeInteger(completionTokens)||completionTokens<1||completionTokens>8000)
  throw new Error("Invalid paid completion budget");
 // One token cannot encode less than one UTF-8 byte. An extra 5k tokens
 // covers provider message framing and prevents understated reservations.
 const inputBound=Buffer.byteLength(body,"utf8")+5000;
 return inputBound*2+completionTokens*10;
}
type BudgetClaim={day:string;estimate:number};
export function paidPreviewEnabled(env:Record<string,string|undefined>):boolean{
 return env.PPW_ALLOW_PAID_AI_PREVIEW==="YES"&&!!env.OPENAI_API_KEY;
}
/** Terra is the live default, using the existing explicit paid opt-in.
 * Missing credentials or disabled billing never silently spend Groq's quota.
 * The isolated benchmark host must never publish an article. */
export function liveRingsideProvider(env:Record<string,string|undefined>):
 {provider:"GROQ"|"OPENAI";key:string|undefined}{
 const provider=env.PPW_RESULTS_PROVIDER==="GROQ"?"GROQ":"OPENAI";
 if(env.PPW_AI_BENCHMARK_PREVIEW==="YES")return {provider,key:undefined};
 return {provider,key:provider==="GROQ"?env.GROQ_API_KEY:
  paidPreviewEnabled(env)?env.OPENAI_API_KEY:undefined};
}
export async function claimOpenAiPreview(pool:TransactionPool,estimate:number):
 Promise<BudgetClaim|null>{
 if(!Number.isSafeInteger(estimate)||estimate<1||estimate>MAX_REQUEST_ESTIMATE)
  throw new Error("Paid AI preview request exceeds the per-call limit");
 const rows=await withSqlClient(pool,db=>db.query<{day:string}>(`
  INSERT INTO ppw_openai_preview_daily_usage(usage_day,call_count,reserved_tokens)
  VALUES(timezone('UTC',now())::date,1,$1)
  ON CONFLICT(usage_day) DO UPDATE SET
   call_count=ppw_openai_preview_daily_usage.call_count+1,
   reserved_tokens=ppw_openai_preview_daily_usage.reserved_tokens+EXCLUDED.reserved_tokens
  WHERE ppw_openai_preview_daily_usage.call_count<${MAX_DAILY_REQUESTS}
   AND ppw_openai_preview_daily_usage.reserved_tokens+EXCLUDED.reserved_tokens<=${MAX_DAILY_ESTIMATE}
  RETURNING usage_day::text AS day`,[estimate]));
 return rows[0]?{day:rows[0].day,estimate}:null;
}
export async function settleOpenAiPreview(pool:TransactionPool,claim:BudgetClaim,
 result:{ok:boolean;usage:GroqUsage|null}):Promise<void>{
 const used=result.usage?result.usage.inputTokens+result.usage.outputTokens:
  result.ok?claim.estimate:0;
 await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_openai_preview_daily_usage SET
   reserved_tokens=GREATEST(0,reserved_tokens-$2+$3),
   reported_input_tokens=reported_input_tokens+$4,
   reported_output_tokens=reported_output_tokens+$5,
   completed_calls=completed_calls+$6,failed_calls=failed_calls+$7
  WHERE usage_day=$1::date`,[
   claim.day,claim.estimate,used,
   result.usage?.inputTokens??0,result.usage?.outputTokens??0,
   result.ok?1:0,result.ok?0:1]));
}
type MonthlyClaim={month:string;reserved:number};
export async function claimOpenAiMonthlyPreview(pool:TransactionPool,reserved:number):
 Promise<MonthlyClaim|null>{
 if(!Number.isSafeInteger(reserved)||reserved<1||reserved>300000)
  throw new Error("Paid AI preview exceeds the per-call money limit");
 const rows=await withSqlClient(pool,db=>db.query<{month:string}>(
  "INSERT INTO ppw_openai_preview_monthly_usage(usage_month,call_count,reserved_micropounds) "+
  "VALUES(date_trunc('month',timezone('UTC',now()))::date,1,$1) "+
  "ON CONFLICT(usage_month) DO UPDATE SET "+
  "call_count=ppw_openai_preview_monthly_usage.call_count+1,"+
  "reserved_micropounds=ppw_openai_preview_monthly_usage.reserved_micropounds+EXCLUDED.reserved_micropounds "+
  "WHERE ppw_openai_preview_monthly_usage.spent_micropounds+"+
  "ppw_openai_preview_monthly_usage.reserved_micropounds+EXCLUDED.reserved_micropounds<=$2 "+
  "RETURNING usage_month::text AS month",
  [reserved,OPENAI_MONTHLY_CAP_MICROPOUNDS]));
 return rows[0]?{month:rows[0].month,reserved}:null;
}
async function releaseMonthlyPreview(pool:TransactionPool,claim:MonthlyClaim){
 await withSqlClient(pool,db=>db.query(
  "UPDATE ppw_openai_preview_monthly_usage SET "+
  "reserved_micropounds=GREATEST(0,reserved_micropounds-$2),"+
  "call_count=GREATEST(0,call_count-1) WHERE usage_month=$1::date",
  [claim.month,claim.reserved]));
}
async function settleMonthlyPreview(pool:TransactionPool,claim:MonthlyClaim,
 usage:GroqUsage|null,definiteRejection=false){
 // Confirmed provider-side 4xx rejection: no model output, so release the
 // reserved allowance. Ambiguous transport failures/unknown 429s retain
 // the conservative charge; we never pretend an invoice has been checked.
 const cost=usage?usage.inputTokens*2+usage.outputTokens*10:
  definiteRejection?0:claim.reserved;
 await withSqlClient(pool,db=>db.query(
  "UPDATE ppw_openai_preview_monthly_usage SET "+
  "reserved_micropounds=GREATEST(0,reserved_micropounds-$2),"+
  "spent_micropounds=spent_micropounds+$3,"+
  "reported_input_tokens=reported_input_tokens+$4,"+
  "reported_output_tokens=reported_output_tokens+$5 "+
  "WHERE usage_month=$1::date",
  [claim.month,claim.reserved,cost,
   usage?.inputTokens??0,usage?.outputTokens??0]));
}
/** One metered request; caller must authenticate and claim its certified show
 * or explicitly authorize a private comparison before invoking this transport. */
export async function requestOpenAiEditorialPreview(input:{
 key:string;enabled:boolean;body:Record<string,unknown>;
 transport:typeof fetch;pool:TransactionPool;signal?:AbortSignal;
 feature?:"RINGSIDE"|"PREVIEW"|"WEEKLY_MEDIA"|"STAFF_CONSULTATION";
}):Promise<Response>{
 if(!input.enabled||!input.key.trim())
  return new Response("Paid AI comparisons are disabled",{status:403});
 const {temperature:_unsupported,reasoning_effort:requestedEffort,
  model:_groqName,...requestFields}=input.body;
 // Terra with reasoning effort cannot accept custom temperature, but
 // honours the AI Lab's explicit low/medium/high reasoning selection.
 const effort=requestedEffort==="medium"||requestedEffort==="high"?
  requestedEffort:"low";
 const body=JSON.stringify({...requestFields,model:OPENAI_PREVIEW_MODEL,
  reasoning_effort:effort,store:false});
 const completion=Number(input.body.max_completion_tokens);
 const estimate=estimatedGroqTokens(body,completion);
 if(estimate>MAX_REQUEST_ESTIMATE)
  throw new Error("Paid AI preview exceeds the protected token budget");
 const reservation=estimateTerraPreviewMicropounds(body,completion);
 const monthly=await claimOpenAiMonthlyPreview(input.pool,reservation);
 if(!monthly)return new Response("PPW's £3 monthly paid AI budget is exhausted",{
  status:429,headers:{"retry-after":"3600","x-ppw-budget-exhausted":"true"}});
 let daily:BudgetClaim|null=null;
 try{daily=await claimOpenAiPreview(input.pool,estimate);}
 catch(e){await releaseMonthlyPreview(input.pool,monthly);throw e;}
 if(!daily){
  await releaseMonthlyPreview(input.pool,monthly);
  return new Response("Paid AI daily preview limit reached",{
   status:429,headers:{"retry-after":"3600","x-ppw-budget-exhausted":"true"}});
 }
 if(input.signal?.aborted){
  // No HTTP call was made: release money. Keep the daily attempt counted.
  await settleMonthlyPreview(input.pool,monthly,null,true);
  await settleOpenAiPreview(input.pool,daily,{ok:false,usage:null});
  throw input.signal.reason??new Error("Paid preview deadline expired");
 }
 let response:Response;
 try{
  response=await input.transport("https://api.openai.com/v1/chat/completions",{
   method:"POST",signal:input.signal,
   headers:{"authorization":"Bearer "+input.key,"content-type":"application/json"},
   body});
 }catch(error){
  // Network ambiguity: reserve the entire worst-case charge for safety.
  await settleMonthlyPreview(input.pool,monthly,null);
  await settleOpenAiPreview(input.pool,daily,{ok:false,usage:null});
  throw error;
 }
 let usage:GroqUsage|null=null,parsed:unknown=null;
 try{parsed=await response.clone().json();usage=groqResponseUsage(parsed);}
 catch{/* Unknown usage is conservatively reserved unless rejection is definite. */}
 const diagnosis=response.ok?null:classifyOpenAiProviderError(response.status,parsed);
 const definitelyRejected=refundKnownProviderRejection(
  response.ok,usage!==null,diagnosis);
 await settleMonthlyPreview(input.pool,monthly,usage,definitelyRejected);
 await settleOpenAiPreview(input.pool,daily,{ok:response.ok,usage});
 // Feature-labelled token telemetry, no extra database writes, prompts,
 // private identifiers or generated dialogue in the application logs.
 console.info("PPW Terra usage",{feature:input.feature??"PREVIEW",status:response.status,
  inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null,
  estimatedUsd:usage?(usage.inputTokens+5*usage.outputTokens)/1_000_000:null});
 if(!diagnosis)return response;
 // Do not log or display the arbitrary provider error.message: it can echo
 // user data and private prompts. Only safe allowlisted fields are retained.
 console.warn("PPW Terra provider rejected preview",{
  status:response.status,kind:diagnosis.kind,code:diagnosis.code??"unclassified",
  chargedAllowance:definitelyRejected?0:"conservative"
 });
 const headers=new Headers(response.headers);
 headers.set("x-ppw-openai-error-kind",diagnosis.kind);
 if(diagnosis.code)headers.set("x-ppw-openai-error-code",diagnosis.code);
 return new Response(response.body,{
  status:response.status,statusText:response.statusText,headers});
}
