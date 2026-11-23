/** Paid-provider quality comparisons are an operator-only, disabled-by-default
 * side path. They NEVER run from World Lock, public results or ordinary players.
 * All generated prose is still validated by the existing Ringside rules.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {estimatedGroqTokens,groqResponseUsage,type GroqUsage} from "../domain/ai-director.js";
export const OPENAI_PREVIEW_MODEL="gpt-6.1-terra";
const MAX_DAILY_REQUESTS=2,MAX_DAILY_ESTIMATE=50000,MAX_REQUEST_ESTIMATE=25000;
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
 usage:GroqUsage|null){
 // Failed/ambiguous provider requests retain their entire conservative charge.
 // Never silently refund a request that may have been billed.
 const cost=usage?usage.inputTokens*2+usage.outputTokens*10:claim.reserved;
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
/** Operator-triggered paid tests only. No public results route calls this. */
export async function requestOpenAiEditorialPreview(input:{
 key:string;enabled:boolean;body:Record<string,unknown>;
 transport:typeof fetch;pool:TransactionPool;signal?:AbortSignal;
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
 let usage:GroqUsage|null=null;
 try{usage=groqResponseUsage(await response.clone().json());}
 catch{/* Unknown usage is charged at reserved upper bound. */}
 await settleMonthlyPreview(input.pool,monthly,usage);
 await settleOpenAiPreview(input.pool,daily,{ok:response.ok,usage});
 return response;
}
