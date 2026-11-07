import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld} from "../src/db/world-operations.js";
import {readAiLabDashboard,readAiLabReview,saveAiLabFeedback,
 saveAiLabPreview,saveAiLabFailure,validateLabFeedback} from "../src/db/ai-quality-lab.js";
const url=process.env.PPW_NEON_TEST_URL;
const review={showHeadline:"A dramatic final bell",
 opening:"The crowd was invested.",closing:"A strong end.",
 slots:[{slotId:"one",headline:"A fierce contest",
  recap:"The winner secured a certified pinfall."}]};
test("AI quality assessments reject invented flags and invalid score",()=>{
 assert.deepEqual(validateLabFeedback({rating:5,flags:["TAG_RULES"],notes:"  Great job  "}),
  {rating:5,flags:["TAG_RULES"],notes:"Great job"});
 assert.throws(()=>validateLabFeedback({rating:0,flags:[],notes:""}),/score/);
 assert.throws(()=>validateLabFeedback({rating:3,flags:["PRIVATE_DATA"],notes:""}),/flags/);
 assert.throws(()=>validateLabFeedback({rating:3,flags:["TAG_RULES","TAG_RULES"],notes:""}),/flags/);
});
test("AI Lab saves bounded private comparisons and prevents rival reading or rating",{
 skip:!url?"Disposable PostgreSQL unavailable":false},async()=>{
 const db=postgresPool(url!,4),worldId="ai-lab-"+randomUUID(),user="owner-"+randomUUID(),rival="rival-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"AI Lab fixture",seed:73,rulesetVersion:"test"});
  });
  const run=await saveAiLabPreview(db.pool,{worldId,playerId:user,
   showId:"show-one",showName:"Friday Fire",provider:"GROQ",
   model:"openai/gpt-oss-120b",durationMs:2450,providerCalls:1,
   inputTokens:820,outputTokens:460,review});
  assert.match(run.runId,/^[a-f\d-]{36}$/);
  const listed=await readAiLabDashboard(db.pool,worldId,user);
  assert.equal(listed.runs.length,1);
  assert.equal(listed.runs[0]?.model,"openai/gpt-oss-120b");
  assert.equal(listed.runs[0]?.input_tokens,820);
  assert.equal(listed.runs[0]?.rating,null);
  assert.deepEqual(await readAiLabReview(db.pool,worldId,user,run.runId),review);
  assert.deepEqual((await readAiLabDashboard(db.pool,worldId,rival)).runs,[]);
  await assert.rejects(readAiLabReview(db.pool,worldId,rival,run.runId),/unavailable/);
  await assert.rejects(saveAiLabFeedback(db.pool,worldId,rival,run.runId,
   {rating:1,flags:["WRONG_FINISH"],notes:"Not your show"}),/unavailable/);
  await saveAiLabFeedback(db.pool,worldId,user,run.runId,
   {rating:4,flags:["REPETITION"],notes:"Good match psychology"});
  const updated=await readAiLabDashboard(db.pool,worldId,user);
  assert.equal(updated.runs[0]?.rating,4);
  assert.deepEqual(updated.runs[0]?.flags,["REPETITION"]);
  assert.equal(updated.scores[0]?.reviewed,1);
  assert.equal(updated.scores[0]?.average_score,4);
  const failure=await saveAiLabFailure(db.pool,{
   worldId,playerId:user,showId:"benchmark:i-quit",
   showName:"Ringside Benchmark · I Quit",provider:"GROQ",
   model:"openai/gpt-oss-20b",durationMs:3456,providerCalls:2,
   inputTokens:2500,outputTokens:1100,errorCode:"FACT_VALIDATION"});
  const final=await readAiLabDashboard(db.pool,worldId,user);
  assert.equal(final.runs.length,2);
  assert.equal(final.runs[0]?.status,"FAILED");
  assert.equal(final.runs[0]?.error_code,"FACT_VALIDATION");
  assert.equal(final.runs[0]?.provider_calls,2);
  assert.equal(final.runs[0]?.input_tokens,2500);
  assert.equal(final.scores.find(s=>s.model==="openai/gpt-oss-20b")?.failed,1);
  assert.equal(final.scores.find(s=>s.model==="openai/gpt-oss-20b")?.reviewed,0);
  await assert.rejects(readAiLabReview(db.pool,worldId,user,failure.runId),/unavailable/);
  await assert.rejects(saveAiLabFeedback(db.pool,worldId,user,failure.runId,
   {rating:5,flags:[],notes:"False success"}),/unavailable/);
  assert.deepEqual((await readAiLabDashboard(db.pool,worldId,rival)).runs,[]);
  await assert.rejects(saveAiLabFailure(db.pool,{
   worldId,playerId:user,showId:"test",showName:"Test",
   provider:"GROQ",model:"openai/gpt-oss-20b",durationMs:10,
   providerCalls:0,inputTokens:null,outputTokens:null,
   errorCode:"SECRET_VALUE" as never}),/Unknown AI failure code/);
 }finally{
  await withWorldTransaction(db.pool,tx=>tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]))
   .finally(()=>db.close());
 }
});
