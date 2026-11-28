import {test} from "node:test";
import assert from "node:assert/strict";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import {RINGSIDE_PROMPT_VERSION,RINGSIDE_PREVIOUS_VERSION,RINGSIDE_OLDER_VERSION,RINGSIDE_LEGACY_VERSION}
 from "../src/domain/ringside-editorial.js";
import type {TransactionPool} from "../src/db/transaction.js";
const scope={worldId:"test-world",playerId:"human",promotionId:"control",showId:"show"};
const review={showHeadline:"A fine evening",opening:"The crowd came alive.",
 closing:"An exciting closer.",slots:[{slotId:"one",headline:"The Main Event",recap:"A clean win."}]};
const fixture=(mode:"ready"|"no-key"|"denied"|"cooldown")=>{
 let calls=0;
 const pool:TransactionPool={async connect(){return {
  release(){},async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
   calls++;
   assert.match(sql,/JOIN ppw_promotion_controls/);
   assert.match(sql,/JOIN ppw_memberships/);
   assert.match(sql,/r\.prompt_version=\$5 OR \(\(r\.state='READY' OR r\.model='gpt-6\.1-terra'\) AND/);
   assert.match(sql,/r\.prompt_version LIKE 'ringside-v%'/);
   assert.match(sql,/ORDER BY CASE WHEN r\.state='READY' THEN 0 WHEN r\.model='gpt-6\.1-terra' THEN 1 ELSE 2 END/);
   assert.match(sql,/CASE WHEN r\.prompt_version=\$5 THEN 0 WHEN r\.prompt_version=\$6 THEN 1/);
   assert.deepEqual(params,[scope.worldId,scope.playerId,scope.promotionId,scope.showId,
    RINGSIDE_PROMPT_VERSION,RINGSIDE_PREVIOUS_VERSION,RINGSIDE_OLDER_VERSION,RINGSIDE_LEGACY_VERSION]);
   const result=mode==="denied"?[]:mode==="ready"?
    [{state:"READY",model:"openai/gpt-oss-120b",report_json:review,attempts:1}]:
    mode==="cooldown"?
    [{state:"PENDING",model:"openai/gpt-oss-120b",report_json:null,attempts:1,
      claim_until:new Date(Date.now()+45000).toISOString()}]:
    [{state:null,model:null,report_json:null,attempts:null}];
   return result as unknown as readonly T[];
  }};}};
 return {pool,calls:()=>calls};
};
test("reopening a ready human broadcast makes only one private indexed read",async()=>{
 const x=fixture("ready");
 const result=await loadRingsideCommentary(x.pool,scope,undefined);
 assert.equal(result.status,"ready");
 if(result.status==="ready")assert.deepEqual(result.review,review);
 assert.equal(x.calls(),1);
});
test("Groq not configured: one lightweight private check, never model or expanded-card reads",async()=>{
 const x=fixture("no-key");
 assert.deepEqual(await loadRingsideCommentary(x.pool,scope,undefined),{status:"unavailable"});
 assert.equal(x.calls(),1);
});
test("viewer with a configured provider key still reads only the saved result",async()=>{
 const x=fixture("no-key");
 const never:typeof fetch=async()=>{throw Error("Results must never dispatch editorial");};
 assert.deepEqual(await loadRingsideCommentary(x.pool,scope,"fixture",never),{status:"unavailable"});
 assert.equal(x.calls(),1);
});
test("no authenticated control: no fallback through cache or Groq",async()=>{
 const x=fixture("denied");
 await assert.rejects(loadRingsideCommentary(x.pool,scope,"fixture"),/unavailable to this controller/);
 assert.equal(x.calls(),1);
});

test("malformed cached articles fall back without a second SQL read",async()=>{
 const bad=[
  {...review,showHeadline:""},
  {...review,closing:""},
  {...review,slots:[review.slots[0],review.slots[0]]},
  {...review,slots:[{slotId:"one",headline:"OK",recap:"OK",debug:"unexpected"}]},
  {...review,slots:Array.from({length:31},(_,i)=>({slotId:"id"+i,headline:"h",recap:"r"}))},
  {...review,slots:[]}
 ];
 for(const report of bad){
  let reads=0;
  const pool:TransactionPool={async connect(){return {release(){},
   async query<T extends Record<string,unknown>>(){
    reads++;return [{state:"READY",model:"openai/gpt-oss-120b",
     report_json:report,attempts:1}] as unknown as T[];
   }};}};
  assert.deepEqual(await loadRingsideCommentary(pool,scope,undefined),
   {status:"unavailable"});
  assert.equal(reads,1);
 }
});

test("short-term Groq cooldown avoids repeat card expansion and provider requests",async()=>{
 const x=fixture("cooldown");
 assert.deepEqual(await loadRingsideCommentary(x.pool,scope,"fixture"),{status:"pending"});
 assert.equal(x.calls(),1,"shared cooldown needs only one indexed read");
});

test("Terra live default does not spend Groq when paid access is absent or benchmark host is isolated",async()=>{
 const {liveRingsideProvider}=await import("../src/db/openai-editorial-preview.js");
 const env={OPENAI_API_KEY:"paid-fixture",GROQ_API_KEY:"free-fixture",
  PPW_ALLOW_PAID_AI_PREVIEW:"YES"};
 assert.deepEqual(liveRingsideProvider(env),{provider:"OPENAI",key:"paid-fixture"});
 assert.deepEqual(liveRingsideProvider({GROQ_API_KEY:"free-fixture"}),
  {provider:"OPENAI",key:undefined});
 assert.deepEqual(liveRingsideProvider({...env,PPW_AI_BENCHMARK_PREVIEW:"YES"}),
  {provider:"OPENAI",key:undefined});
 assert.deepEqual(liveRingsideProvider({...env,PPW_RESULTS_PROVIDER:"GROQ"}),
  {provider:"GROQ",key:"free-fixture"});
});
test("Paid report lease and one-shot failure prevent duplicate provider requests on reopen",async()=>{
 for(const [state,remaining,expected] of [
  ["PENDING",180000,"pending"],["PENDING",-1000,"unavailable"],["FAILED",-1000,"unavailable"]
 ] as const){
  let reads=0;
  const pool:TransactionPool={async connect(){return {release(){},
   async query<T extends Record<string,unknown>>(){
    reads++;assert.equal(reads,1,"Never expand the card after a paid attempt");
    return [{state,model:"gpt-6.1-terra",attempts:1,report_json:null,
     claim_until:new Date(Date.now()+remaining).toISOString()}] as unknown as T[];
   }};}};
  const never:typeof fetch=async()=>{throw Error("No duplicate API call");};
  assert.deepEqual(await loadRingsideCommentary(pool,scope,"fixture",never,"OPENAI"),{status:expected});
  reads=0;
  assert.deepEqual(await loadRingsideCommentary(pool,scope,"fixture",never,"GROQ"),{status:expected});
 }
});
test("Existing Groq article survives the Terra default without an API call",async()=>{
 const x=fixture("ready");
 assert.deepEqual(await loadRingsideCommentary(x.pool,scope,"paid-fixture",
  async()=>{throw Error("No paid regeneration");},"OPENAI"),{status:"ready",review});
 assert.equal(x.calls(),1);
});
