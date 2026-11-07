/** Small, operator-only AI quality lab. No raw requests, provider keys or
 * prompts are persisted. Saved comparison text is bounded and owner-scoped.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import type {RingsideCopy} from "../domain/ringside-editorial.js";
import {validateCachedRingsideCopy} from "../domain/ringside-editorial.js";
export type LabProvider="GROQ"|"OPENAI";
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
export async function saveAiLabPreview(pool:TransactionPool,input:AiLabPreviewInput){
 assertScope(input.worldId,input.playerId);
 if(!input.showId||input.showId.length>200||input.showName.length>200||
  input.model.length>100||!["GROQ","OPENAI"].includes(input.provider)||
  !Number.isSafeInteger(input.durationMs)||input.durationMs<0||input.durationMs>180000||
  !Number.isSafeInteger(input.providerCalls)||input.providerCalls<1||input.providerCalls>2)
  throw new Error("Invalid AI lab preview");
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
 // Keep at most 40 manually requested samples per operator; no unrelated World
 // data is changed. This is not per-match or per-show background logging.
 await withSqlClient(pool,db=>db.query(`
  DELETE FROM ppw_ai_lab_runs WHERE world_id=$1 AND player_id=$2
   AND run_id NOT IN(
    SELECT run_id FROM ppw_ai_lab_runs WHERE world_id=$1 AND player_id=$2
    ORDER BY created_at DESC,run_id DESC LIMIT 40)`,
  [input.worldId,input.playerId]));
 return {runId};
}
export async function readAiLabDashboard(pool:TransactionPool,worldId:string,playerId:string){
 assertScope(worldId,playerId);
 const [usage,runs,scores]=await Promise.all([
  withSqlClient(pool,db=>db.query<{
   day:string;provider:LabProvider;calls:number;reserved:number;
   input:string;output:string;failed:number}>(`
    SELECT usage_day::text AS day,'GROQ' AS provider,
     call_count AS calls,reserved_tokens AS reserved,
     reported_input_tokens::text AS input,reported_output_tokens::text AS output,
     failed_calls AS failed FROM ppw_groq_daily_usage
    WHERE usage_day>=timezone('UTC',now())::date-6
    UNION ALL
    SELECT usage_day::text AS day,'OPENAI' AS provider,
     call_count AS calls,reserved_tokens AS reserved,
     reported_input_tokens::text AS input,reported_output_tokens::text AS output,
     failed_calls AS failed FROM ppw_openai_preview_daily_usage
    WHERE usage_day>=timezone('UTC',now())::date-6
    ORDER BY day DESC,provider LIMIT 14`,[])),
  withSqlClient(pool,db=>db.query<{
   run_id:string;show_id:string;show_name:string;provider:LabProvider;
   model:string;duration_ms:number;provider_calls:number;
   input_tokens:number|null;output_tokens:number|null;rating:number|null;
   flags:LabFlag[];notes:string;created_at:string}>(`
    SELECT run_id::text,show_id,show_name,provider,model,duration_ms,
     provider_calls,input_tokens,output_tokens,rating,flags,notes,
     created_at::text FROM ppw_ai_lab_runs
    WHERE world_id=$1 AND player_id=$2
    ORDER BY created_at DESC,run_id DESC LIMIT 40`,
   [worldId,playerId])),
  withSqlClient(pool,db=>db.query<{
   provider:LabProvider;model:string;total:number;reviewed:number;
   average_score:number|null}>(`
    SELECT provider,model,count(*)::integer AS total,
     count(rating)::integer AS reviewed,
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
 if(!rows.length)throw new Error("AI lab sample unavailable to this operator");
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
  RETURNING run_id::text`,
 [worldId,playerId,runId,feedback.rating,feedback.flags,feedback.notes]));
 if(rows.length!==1)throw new Error("AI lab sample unavailable to this operator");
 return {saved:true,runId,feedback};
}
