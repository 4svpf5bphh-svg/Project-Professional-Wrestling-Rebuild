import {test} from "node:test";
import assert from "node:assert/strict";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import type {TransactionPool} from "../src/db/transaction.js";
const scope={worldId:"test-world",playerId:"human",promotionId:"control",showId:"show"};
const review={showHeadline:"A fine evening",opening:"The crowd came alive.",
 closing:"An exciting closer.",slots:[{slotId:"one",headline:"The Main Event",recap:"A clean win."}]};
const fixture=(mode:"ready"|"no-key"|"denied")=>{
 let calls=0;
 const pool:TransactionPool={async connect(){return {
  release(){},async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
   calls++;
   assert.match(sql,/JOIN ppw_promotion_controls/);
   assert.match(sql,/JOIN ppw_memberships/);
   assert.deepEqual(params,[scope.worldId,scope.playerId,scope.promotionId,scope.showId,"ringside-v1"]);
   const result=mode==="denied"?[]:mode==="ready"?
    [{state:"READY",model:"openai/gpt-oss-120b",report_json:review,attempts:1}]:
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
test("no authenticated control: no fallback through cache or Groq",async()=>{
 const x=fixture("denied");
 await assert.rejects(loadRingsideCommentary(x.pool,scope,"fixture"),/unavailable to this controller/);
 assert.equal(x.calls(),1);
});
