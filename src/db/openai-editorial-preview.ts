/** Paid-provider quality comparisons are an operator-only, disabled-by-default
 * side path. They NEVER run from World Lock, public results or ordinary players.
 * All generated prose is still validated by the existing Ringside rules.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {estimatedGroqTokens,groqResponseUsage,type GroqUsage} from "../domain/ai-director.js";
export const OPENAI_PREVIEW_MODEL="gpt-4o-mini";
const MAX_DAILY_REQUESTS=2,MAX_DAILY_ESTIMATE=24000,MAX_REQUEST_ESTIMATE=12000;
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
export async function requestOpenAiEditorialPreview(input:{
 key:string;enabled:boolean;body:Record<string,unknown>;
 transport:typeof fetch;pool:TransactionPool;signal?:AbortSignal;
}):Promise<Response>{
 // Even direct accidental calls fail closed. No API calls without both
 // the server-side opt-in and a nonempty key, and no unmetered invocation.
 if(!input.enabled||!input.key.trim())
  return new Response("Paid AI comparisons are disabled",{status:403});
 const {reasoning_effort:_unsupported,model:_groqName,...requestFields}=input.body;
 const body=JSON.stringify({...requestFields,model:OPENAI_PREVIEW_MODEL,store:false});
 const estimate=estimatedGroqTokens(body,Number(input.body.max_completion_tokens));
 if(estimate>MAX_REQUEST_ESTIMATE)
  throw new Error("Paid AI preview exceeds the protected token budget");
 const claim=await claimOpenAiPreview(input.pool,estimate);
 if(!claim)return new Response("Paid AI preview allowance exhausted",{
  status:429,headers:{"retry-after":"3600","x-ppw-budget-exhausted":"true"}});
 let response:Response;
 try{
  response=await input.transport("https://api.openai.com/v1/chat/completions",{
   method:"POST",signal:input.signal,
   headers:{"authorization":"Bearer "+input.key,"content-type":"application/json"},
   body});
 }catch(error){
  try{await settleOpenAiPreview(input.pool,claim,{ok:false,usage:null});}
  catch{console.warn("Paid preview usage accounting unavailable");}
  throw error;
 }
 let usage:GroqUsage|null=null;
 try{if(response.ok)usage=groqResponseUsage(await response.clone().json());}
 catch{/* No provider usage envelope; conserve the full reservation. */}
 try{await settleOpenAiPreview(input.pool,claim,{ok:response.ok,usage});}
 catch{console.warn("Paid preview usage accounting unavailable");}
 return response;
}
