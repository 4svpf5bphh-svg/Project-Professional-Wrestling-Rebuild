import test from "node:test";
import assert from "node:assert/strict";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {claimOpenAiPreview,settleOpenAiPreview,requestOpenAiEditorialPreview}
 from "../src/db/openai-editorial-preview.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Paid OpenAI comparisons are off unless separately opted in",async()=>{
 const {paidPreviewEnabled}=await import("../src/db/openai-editorial-preview.js");
 assert.equal(paidPreviewEnabled({OPENAI_API_KEY:"fixture"}),false);
 assert.equal(paidPreviewEnabled({PPW_ALLOW_PAID_AI_PREVIEW:"YES"}),false);
 assert.equal(paidPreviewEnabled({PPW_ALLOW_PAID_AI_PREVIEW:"YES",OPENAI_API_KEY:"fixture"}),true);
 let queried=false,called=false;
 const pool={connect:async()=>{queried=true;throw Error("No SQL allowed");}};
 const result=await requestOpenAiEditorialPreview({
  key:"fixture",enabled:false,pool:pool as never,
  body:{max_completion_tokens:400,messages:[]},
  transport:async()=>{called=true;throw Error("No paid API allowed");}
 });
 assert.equal(result.status,403);assert.equal(queried,false);assert.equal(called,false);
});
test("Paid preview caps simultaneous multiplayer calls and never touches Groq usage",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,4);
 try{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]));
  const claims=await Promise.all(Array.from({length:8},
   ()=>claimOpenAiPreview(db.pool,10000)));
  assert.equal(claims.filter(Boolean).length,2,"two paid previews per UTC day");
  await settleOpenAiPreview(db.pool,claims.find(Boolean)!,{
   ok:true,usage:{inputTokens:500,outputTokens:350}});
  const stats=await withSqlClient(db.pool,sql=>sql.query<{
   call_count:number;reserved_tokens:number;input:string;output:string}>(
   "SELECT call_count,reserved_tokens,reported_input_tokens::text AS input,"+
   "reported_output_tokens::text AS output FROM ppw_openai_preview_daily_usage "+
   "WHERE usage_day=timezone('UTC',now())::date",[]));
  assert.deepEqual(stats[0],{
   call_count:2,reserved_tokens:10850,input:"500",output:"350"});
  let invoked=false;
  const blocked=await requestOpenAiEditorialPreview({
   key:"fixture",enabled:true,pool:db.pool,
   body:{max_completion_tokens:500,messages:[]},
   transport:async()=>{invoked=true;return new Response("Unexpected");}});
  assert.equal(blocked.status,429);assert.equal(invoked,false);
 }finally{
  await withSqlClient(db.pool,sql=>sql.query(
   "DELETE FROM ppw_openai_preview_daily_usage WHERE usage_day=timezone('UTC',now())::date",[]))
   .finally(()=>db.close());
 }
});
