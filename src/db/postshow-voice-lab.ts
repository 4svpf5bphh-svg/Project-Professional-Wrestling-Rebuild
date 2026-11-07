/** Private operator-only quality history for immutable fictional 20B fixtures.
 * Separate from Ringside's strictly typed preview records, never a World event.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
import {getPostShowVoiceBenchmark} from "../domain/postshow-voice-lab.js";
import {readPostShowVoiceCopy,type PostShowVoiceCopy}
 from "../domain/postshow-voice-batch.js";
import type {ShortformVoiceDiagnostic} from "./postshow-voice-batches.js";

type Failure="NO_ACCEPTED_COPY"|"PROVIDER_ERROR"|"UNKNOWN";
type Input={
 worldId:string;playerId:string;scenarioId:string;
 durationMs:number;providerCalls:number;inputTokens:number|null;
 outputTokens:number|null;copy:PostShowVoiceCopy|null;errorCode?:Failure;
 diagnostic?:ShortformVoiceDiagnostic|null;
};
function scope(worldId:string,playerId:string){
 if(!worldId||worldId.length>200||!playerId||playerId.length>200)
  throw new Error("Invalid private voice lab scope");
}
export async function saveShortformVoiceLabRun(pool:TransactionPool,input:Input){
 scope(input.worldId,input.playerId);
 const fixture=getPostShowVoiceBenchmark(input.scenarioId);
 if(!fixture)throw new Error("Invalid fictional voice scenario");
 if(!Number.isSafeInteger(input.durationMs)||input.durationMs<0||
  input.durationMs>180000||!Number.isSafeInteger(input.providerCalls)||
  input.providerCalls<0||input.providerCalls>1||
  [input.inputTokens,input.outputTokens].some(v=>
   v!==null&&(!Number.isSafeInteger(v)||v<0||v>100000)))
  throw new Error("Invalid voice lab metrics");
 const copy=input.copy?readPostShowVoiceCopy(fixture.show,input.copy):null;
 if(input.copy&&!copy)throw new Error("Voice lab facts did not match immutable fixture");
 const raw=copy?JSON.stringify(copy):null;
 if(raw&&raw.length>3600)throw new Error("Voice lab sample too large");
 const status=copy?"READY":"FAILED";
 const errorCode=copy?null:input.errorCode??"NO_ACCEPTED_COPY";
 if(!copy&&!["NO_ACCEPTED_COPY","PROVIDER_ERROR","UNKNOWN"].includes(errorCode!))
  throw new Error("Invalid safe voice lab failure code");
 const categories=[
  "ACCEPTED","PARTIAL","ALL_REJECTED","WRONG_SHAPE","HTTP_REJECTED",
  "INVALID_ENVELOPE","EMPTY_CONTENT","INVALID_JSON","TRUNCATED",
  "OVERSIZED","PROVIDER_ERROR"
 ];
 const labels=["ACCEPTED","REJECTED","MISSING"];
 const d=input.diagnostic;
 if(d&&(!categories.includes(d.category)||!labels.includes(d.news)||
  !labels.includes(d.wrestler)||!labels.includes(d.roadAgent)))
  throw new Error("Invalid categorical voice diagnostic");
 const diagnostics=d?JSON.stringify({
  category:d.category,news:d.news,wrestler:d.wrestler,roadAgent:d.roadAgent
 }):null;
 const runId=randomUUID();
 await withSqlClient(pool,db=>db.query(`
  INSERT INTO ppw_shortform_ai_lab_runs(
   run_id,world_id,player_id,scenario_id,model,status,error_code,
   duration_ms,provider_calls,input_tokens,output_tokens,copy_json,
   diagnostics_json)
  VALUES($1::uuid,$2,$3,$4,'openai/gpt-oss-20b',$5,$6,$7,$8,$9,$10,
   $11::jsonb,$12::jsonb)`,
 [runId,input.worldId,input.playerId,input.scenarioId,status,errorCode,
  input.durationMs,input.providerCalls,input.inputTokens,input.outputTokens,
  raw,diagnostics]));
 await withSqlClient(pool,db=>db.query(`
  DELETE FROM ppw_shortform_ai_lab_runs
  WHERE world_id=$1 AND player_id=$2 AND run_id NOT IN(
   SELECT run_id FROM ppw_shortform_ai_lab_runs
   WHERE world_id=$1 AND player_id=$2 ORDER BY created_at DESC,run_id DESC
   LIMIT 20)`,[input.worldId,input.playerId]));
 return {runId,status,errorCode};
}
export async function readShortformVoiceLabRuns(pool:TransactionPool,
 worldId:string,playerId:string){
 scope(worldId,playerId);
 const rows=await withSqlClient(pool,db=>db.query<{
  run_id:string;scenario_id:string;model:string;status:"READY"|"FAILED";
  error_code:Failure|null;duration_ms:number;provider_calls:number;
  input_tokens:number|null;output_tokens:number|null;
  created_at:string;copy_json:unknown;diagnostics_json:unknown}>(`
  SELECT run_id::text,scenario_id,model,status,error_code,duration_ms,
   provider_calls,input_tokens,output_tokens,created_at::text,copy_json,
   diagnostics_json
  FROM ppw_shortform_ai_lab_runs WHERE world_id=$1 AND player_id=$2
  ORDER BY created_at DESC,run_id DESC LIMIT 12`,[worldId,playerId]));
 return rows.map(row=>{
  const fixture=getPostShowVoiceBenchmark(row.scenario_id);
  const copy=fixture&&row.status==="READY"?
   readPostShowVoiceCopy(fixture.show,row.copy_json):null;
  return {runId:row.run_id,scenarioId:row.scenario_id,
   scenarioName:fixture?.scenario.name??"Unknown fictional test",
   model:row.model,status:row.status,errorCode:row.error_code,
   durationMs:row.duration_ms,providerCalls:row.provider_calls,
   inputTokens:row.input_tokens,outputTokens:row.output_tokens,
   createdAt:row.created_at,copy,
   diagnostic:row.diagnostics_json as ShortformVoiceDiagnostic|null};
 });
}
