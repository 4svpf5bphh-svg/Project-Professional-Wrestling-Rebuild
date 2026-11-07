import test from "node:test";
import assert from "node:assert/strict";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {claimAiAllowance,recordAiAllowance,requestGroqEditorial} from "../src/db/groq-ai-director.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Groq daily allowance atomically caps concurrent multiplayer calls",{
 skip:!url?"Disposable PostgreSQL unavailable":false
},async()=>{
 const db=postgresPool(url!,4);
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
  const accepted=await Promise.all(Array.from({length:24},
   ()=>claimAiAllowance(db.pool,8000)));
  assert.equal(accepted.filter(Boolean).length,20);
  const claim=accepted.find(Boolean)!;
  await recordAiAllowance(db.pool,claim,{ok:true,
   usage:{inputTokens:1000,outputTokens:200},
   model:"openai/gpt-oss-120b",
   limits:{dailyRequestLimit:1000,dailyRequestRemaining:977,
    minuteTokenLimit:8000,minuteTokenRemaining:4600}});
  const totals=await withSqlClient(db.pool,sql=>sql.query<{
   call_count:number;reserved_tokens:number;input:string;output:string;
   rpd_limit:number;rpd_remaining:number;tpm_limit:number;tpm_remaining:number;
   model:string}>(
   "SELECT call_count,reserved_tokens,reported_input_tokens::text AS input,"+
   "reported_output_tokens::text AS output,"+
   "provider_rpd_limit AS rpd_limit,provider_rpd_remaining AS rpd_remaining,"+
   "provider_tpm_limit AS tpm_limit,provider_tpm_remaining AS tpm_remaining,"+
   "provider_last_model AS model FROM ppw_groq_daily_usage "+
   "WHERE usage_day=timezone('UTC',now())::date",[]));
  assert.deepEqual(totals[0],{call_count:20,reserved_tokens:153200,
   input:"1000",output:"200",
   rpd_limit:1000,rpd_remaining:977,tpm_limit:8000,tpm_remaining:4600,
   model:"openai/gpt-oss-120b"});
  let invoked=false;
  const response=await requestGroqEditorial({task:"RINGSIDE",key:"unused",
   pool:db.pool,body:{max_completion_tokens:8000,messages:[]},
   transport:async()=>{invoked=true;return new Response("Not called");}});
  assert.equal(response.status,429);
  assert.equal(response.headers.get("x-ppw-budget-exhausted"),"true");
  assert.equal(invoked,false);
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_groq_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]))
   .finally(()=>db.close());
 }
});
