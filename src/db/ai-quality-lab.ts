/** Small, operator-only AI quality lab. No raw requests, provider keys or
 * prompts are persisted. Saved comparison text is bounded and owner-scoped.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import type {RingsideCopy} from "../domain/ringside-editorial.js";
import {validateCachedRingsideCopy} from "../domain/ringside-editorial.js";
export type LabProvider="GROQ"|"OPENAI";
export const AI_LAB_ERROR_CODES=[
 "FACT_VALIDATION","PROVIDER_LIMIT","PROVIDER_AUTH",
 "PROVIDER_ERROR","INVALID_OUTPUT","OUTPUT_INCOMPLETE","UNKNOWN"
] as const;
export type AiLabErrorCode=typeof AI_LAB_ERROR_CODES[number];
export const AI_LAB_FLAGS=[
 "WRONG_FINISH","TAG_RULES","INVENTED_FACT","REPETITION",
 "CHARACTER_VOICE","FLAT_WRITING","OTHER"
] as const;
export type LabFlag=typeof AI_LAB_FLAGS[number];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertScope(world:string,player:string){
 if(!world||world.length>200||!player||player.length>200)
  throw new Error("Invalid AI lab scope");
}
export function validateLabFeedback(input:{rating:unknown;flags:unknown;notes:unknown}){
 const rating=input.rating;
 if(!Number.isSafeInteger(rating)||typeof rating!=="number"||rating<1||rating>5)
  throw new Error("Choose a quality score from 1 to 5");
 const flags=input.flags;
 if(!Array.isArray(flags)||flags.length>AI_LAB_FLAGS.length||!flags.every(
  (x:unknown)=>typeof x==="string"&&(AI_LAB_FLAGS as readonly string[]).includes(x))||
  new Set(flags).size!==flags.length)
  throw new Error("Unrecognised AI quality flags");
 if(typeof input.notes!=="string"||input.notes.length>500)
  throw new Error("Feedback must be 500 characters or fewer");
 return {rating,flags:flags as LabFlag[],notes:input.notes.trim()};
}
export interface AiLabPreviewInput{
 worldId:string;playerId:string;showId:string;showName:string;
 provider:LabProvider;model:string;durationMs:number;providerCalls:number;
 inputTokens:number|null;outputTokens:number|null;review:RingsideCopy;
}
function validateRunMetrics(input:Omit<AiLabPreviewInput,"review">,failed=false){
 assertScope(input.worldId,input.playerId);
 if(!input.showId||input.showId.length>200||input.showName.length>200||
  input.model.length>100||!["GROQ","OPENAI"].includes(input.provider)||
  !Number.isSafeInteger(input.durationMs)||input.durationMs<0||input.durationMs>180000||
  !Number.isSafeInteger(input.providerCalls)||
  input.providerCalls<(failed?0:1)||input.providerCalls>2||
  [input.inputTokens,input.outputTokens].some(n=>
   n!==null&&(!Number.isSafeInteger(n)||n<0||n>100000)))
  throw new Error("Invalid AI lab preview metrics");
}
async function pruneAiLabHistory(pool:TransactionPool,world:string,player:string){
 // At most 40 operator-triggered samples, successful OR failed, without
 // touching the shared World or other players' records.
 await withSqlClient(pool,db=>db.query(`
  DELETE FROM ppw_ai_lab_runs WHERE world_id=$1 AND player_id=$2
   AND run_id NOT IN(
    SELECT run_id FROM ppw_ai_lab_runs WHERE world_id=$1 AND player_id=$2
    ORDER BY created_at DESC,run_id DESC LIMIT 40)`,[world,player]));
}
export async function saveAiLabPreview(pool:TransactionPool,input:AiLabPreviewInput){
 validateRunMetrics(input);
 const review=validateCachedRingsideCopy(input.review);
 const json=JSON.stringify(review);
 if(json.length>40000)throw new Error("AI lab preview exceeds safe storage limit");
 const runId=randomUUID();
 await withSqlClient(pool,db=>db.query(`
  INSERT INTO ppw_ai_lab_runs(run_id,world_id,player_id,show_id,show_name,
   provider,model,duration_ms,provider_calls,input_tokens,output_tokens,review_json)
  VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[
  runId,input.worldId,input.playerId,input.showId,input.showName,
  input.provider,input.model,input.durationMs,input.providerCalls,
  input.inputTokens,input.outputTokens,json
 ]));
 await pruneAiLabHistory(pool,input.worldId,input.playerId);
 return {runId};
}
/** Failed generation is still meaningful benchmark evidence, but raw model
 * responses and untrusted provider errors are deliberately never persisted. */
export async function saveAiLabFailure(pool:TransactionPool,
 input:Omit<AiLabPreviewInput,"review">&{errorCode:AiLabErrorCode}){
 validateRunMetrics(input,true);
 if(!(AI_LAB_ERROR_CODES as readonly string[]).includes(input.errorCode))
  throw new Error("Unknown AI failure code");
 const runId=randomUUID();
 await withSqlClient(pool,db=>db.query(`
  INSERT INTO ppw_ai_lab_runs(run_id,world_id,player_id,show_id,show_name,
   provider,model,duration_ms,provider_calls,input_tokens,output_tokens,
   status,error_code)
  VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'FAILED',$12)`,
  [runId,input.worldId,input.playerId,input.showId,input.showName,
   input.provider,input.model,input.durationMs,input.providerCalls,
   input.inputTokens,input.outputTokens,input.errorCode]));
 await pruneAiLabHistory(pool,input.worldId,input.playerId);
 return {runId};
}
export async function readAiLabDashboard(pool:TransactionPool,worldId:string,playerId:string){
 assertScope(worldId,playerId);
 const [usage,runs,scores]=await Promise.all([
  withSqlClient(pool,db=>db.query<{
   day:string;provider:LabProvider;calls:number;reserved:number;
   input:string;output:string;failed:number;
   provider_rpd_limit:number|null;provider_rpd_remaining:number|null;
   provider_tpm_limit:number|null;provider_tpm_remaining:number|null;
   provider_last_model:string|null;provider_limit_observed_at:string|null}>(`
    SELECT usage_day::text AS day,'GROQ' AS provider,
     call_count AS calls,reserved_tokens AS reserved,
     reported_input_tokens::text AS input,reported_output_tokens::text AS output,
     failed_calls AS failed,
     provider_rpd_limit,provider_rpd_remaining,provider_tpm_limit,
     provider_tpm_remaining,provider_last_model,
     provider_limit_observed_at::text
    FROM ppw_groq_daily_usage
    WHERE usage_day>=timezone('UTC',now())::date-6
    UNION ALL
    SELECT usage_day::text AS day,'OPENAI' AS provider,
     call_count AS calls,reserved_tokens AS reserved,
     reported_input_tokens::text AS input,reported_output_tokens::text AS output,
     failed_calls AS failed,
     NULL::integer AS provider_rpd_limit,
     NULL::integer AS provider_rpd_remaining,
     NULL::integer AS provider_tpm_limit,
     NULL::integer AS provider_tpm_remaining,
     NULL::text AS provider_last_model,
     NULL::text AS provider_limit_observed_at
    FROM ppw_openai_preview_daily_usage
    WHERE usage_day>=timezone('UTC',now())::date-6
    ORDER BY day DESC,provider LIMIT 14`,[])),
  withSqlClient(pool,db=>db.query<{
   run_id:string;show_id:string;show_name:string;provider:LabProvider;
   model:string;duration_ms:number;provider_calls:number;
   input_tokens:number|null;output_tokens:number|null;rating:number|null;
   flags:LabFlag[];notes:string;created_at:string;
   status:"READY"|"FAILED";error_code:AiLabErrorCode|null}>(`
    SELECT run_id::text,show_id,show_name,provider,model,duration_ms,
     provider_calls,input_tokens,output_tokens,rating,flags,notes,
     created_at::text,status,error_code FROM ppw_ai_lab_runs
    WHERE world_id=$1 AND player_id=$2
    ORDER BY created_at DESC,run_id DESC LIMIT 40`,
   [worldId,playerId])),
  withSqlClient(pool,db=>db.query<{
   provider:LabProvider;model:string;total:number;reviewed:number;
   successful:number;failed:number;average_score:number|null}>(`
    SELECT provider,model,count(*)::integer AS total,
     count(rating)::integer AS reviewed,
     count(*) FILTER (WHERE status='READY')::integer AS successful,
     count(*) FILTER (WHERE status='FAILED')::integer AS failed,
     round(avg(rating)::numeric,1)::double precision AS average_score
    FROM ppw_ai_lab_runs
    WHERE world_id=$1 AND player_id=$2 AND created_at>=now()-interval '30 days'
    GROUP BY provider,model ORDER BY total DESC LIMIT 12`,
   [worldId,playerId]))
 ]);
 return {usage,runs,scores};
}
export async function readAiLabReview(pool:TransactionPool,
 worldId:string,playerId:string,runId:string){
 assertScope(worldId,playerId);
 if(!uuid.test(runId))throw new Error("Invalid lab sample");
 const rows=await withSqlClient(pool,db=>db.query<{review_json:unknown}>(`
  SELECT review_json FROM ppw_ai_lab_runs
  WHERE world_id=$1 AND player_id=$2 AND run_id=$3::uuid LIMIT 1`,
 [worldId,playerId,runId]));
 if(!rows.length||rows[0]!.review_json===null)
  throw new Error("AI lab sample unavailable to this operator");
 return validateCachedRingsideCopy(rows[0]!.review_json);
}
export async function saveAiLabFeedback(pool:TransactionPool,
 worldId:string,playerId:string,runId:string,input:{
 rating:unknown;flags:unknown;notes:unknown}){
 assertScope(worldId,playerId);
 if(!uuid.test(runId))throw new Error("Invalid lab sample");
 const feedback=validateLabFeedback(input);
 const rows=await withSqlClient(pool,db=>db.query<{run_id:string}>(`
  UPDATE ppw_ai_lab_runs SET rating=$4,flags=$5::text[],notes=$6
  WHERE world_id=$1 AND player_id=$2 AND run_id=$3::uuid
   AND status='READY'
  RETURNING run_id::text`,
 [worldId,playerId,runId,feedback.rating,feedback.flags,feedback.notes]));
 if(rows.length!==1)throw new Error("AI lab sample unavailable to this operator");
 return {saved:true,runId,feedback};
}
