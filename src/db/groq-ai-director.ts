/** One safe outbound Groq boundary and one row of shared usage per UTC day.
 * No provider calls during World Lock or from untrusted browser state.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {chooseGroqModel,estimatedGroqTokens,groqResponseUsage,
 type AiTask,type GroqModel,type GroqUsage} from "../domain/ai-director.js";
const DAILY_CALLS=40,DAILY_TOKENS=160000;
export type AiAllowanceClaim={day:string;estimate:number};
export async function claimAiAllowance(pool:TransactionPool,estimate:number):
 Promise<AiAllowanceClaim|null>{
 if(!Number.isSafeInteger(estimate)||estimate<1||estimate>35000)
  throw new Error("AI request exceeds the per-call safety limit");
 const rows=await withSqlClient(pool,db=>db.query<{day:string}>(`
  INSERT INTO ppw_groq_daily_usage(usage_day,call_count,reserved_tokens)
  VALUES(timezone('UTC',now())::date,1,$1)
  ON CONFLICT (usage_day) DO UPDATE
  SET call_count=ppw_groq_daily_usage.call_count+1,
   reserved_tokens=ppw_groq_daily_usage.reserved_tokens+EXCLUDED.reserved_tokens
  WHERE ppw_groq_daily_usage.call_count<${DAILY_CALLS}
   AND ppw_groq_daily_usage.reserved_tokens+EXCLUDED.reserved_tokens<=${DAILY_TOKENS}
  RETURNING usage_day::text AS day`,[estimate]));
 return rows[0]?{day:rows[0].day,estimate}:null;
}
export async function recordAiAllowance(pool:TransactionPool,claim:AiAllowanceClaim,
 response:{ok:boolean;usage:GroqUsage|null}):Promise<void>{
 const usage=response.usage;
 const spent=usage?usage.inputTokens+usage.outputTokens:
  response.ok?claim.estimate:0;
 await withSqlClient(pool,db=>db.query(`
  UPDATE ppw_groq_daily_usage SET
   reserved_tokens=GREATEST(0,reserved_tokens-$2+$3),
   reported_input_tokens=reported_input_tokens+$4,
   reported_output_tokens=reported_output_tokens+$5,
   completed_calls=completed_calls+$6,
   failed_calls=failed_calls+$7
   WHERE usage_day=$1::date`,[
  claim.day,claim.estimate,spent,usage?.inputTokens??0,usage?.outputTokens??0,
  response.ok?1:0,response.ok?0:1]));
}
/** Routes existing strict-JSON requests without changing their schema, tone,
 * retry policy or validator. Future tasks can reuse this same budget and key.
 */
export async function requestGroqEditorial(input:{
 task:AiTask;preferredModel?:GroqModel;key:string;
 body:Record<string,unknown>;transport:typeof fetch;
 signal?:AbortSignal;pool?:TransactionPool;
}):Promise<Response>{
 const body=JSON.stringify({...input.body,model:chooseGroqModel(input.task,input.preferredModel)});
 const estimated=estimatedGroqTokens(body,Number(input.body.max_completion_tokens));
 let claim:AiAllowanceClaim|null=null;
 if(input.pool){
  claim=await claimAiAllowance(input.pool,estimated);
  if(!claim)return new Response("PPW free editorial allowance exhausted",{
   status:429,headers:{"retry-after":"1800","x-ppw-budget-exhausted":"true"}});
 }
 let response:Response;
 try{response=await input.transport("https://api.groq.com/openai/v1/chat/completions",{
  method:"POST",signal:input.signal,
  headers:{"authorization":"Bearer "+input.key,"content-type":"application/json"},
  body});
 }catch(e){
  if(claim&&input.pool){
   try{await recordAiAllowance(input.pool,claim,{ok:false,usage:null});}
   catch{console.warn("Groq usage reconciliation unavailable");}
  }
  throw e;
 }
 if(claim&&input.pool){
  let usage:GroqUsage|null=null;
  if(response.ok){
   try{usage=groqResponseUsage(await response.clone().json());}
   catch{/* Older provider envelopes may not expose usage. */}
  }
  try{await recordAiAllowance(input.pool,claim,{ok:response.ok,usage});}
  catch{console.warn("Groq usage reconciliation unavailable");}
 }
 return response;
}
