import test from "node:test";
import assert from "node:assert/strict";
import {readCanonicalSegmentContexts}
 from "../src/db/canonical-segment-evaluation.js";
import type {TransactionPool} from "../src/db/transaction.js";
function fake(payload:unknown,phase="RESOLVING"){
 const pool:TransactionPool={async connect(){return {
  async query<T extends Record<string,unknown>>(sql:string){
   if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{phase}] as unknown as T[];
   if(sql.includes("FROM ppw_booking_drafts"))return [{draft_id:"s"}] as unknown as T[];
   if(sql.includes("FROM ppw_card_slots"))return [{slot_id:"angle",position:1,
    kind:"SEGMENT",payload}] as unknown as T[];
   if(sql.includes("FROM ppw_people"))return [{person_id:"a",popularity:60,
    presentation:70,momentum:50}] as unknown as T[];
   throw new Error("Unexpected SQL");
  },release(){}};
 }};
 return pool;
}
const scope={worldId:"w",promotionId:"p",showId:"s",year:1,week:1};
const payload={participants:[{personId:"a",contractId:"c"}],
 kind:"DEBUT",actorIds:["a"],targetIds:[],outcome:"HAPPENS"};
test("reads authored segment from canonical submitted card",async()=>{
 const x=await readCanonicalSegmentContexts(fake(payload),scope);
 assert.equal(x[0]!.segment.kind,"DEBUT");
 assert.equal(x[0]!.segment.outcome,"HAPPENS");
 assert.equal(x[0]!.performers[0]!.personId,"a");
});
test("rejects uncontracted actors and missing role declarations",async()=>{
 await assert.rejects(readCanonicalSegmentContexts(fake({...payload,
  actorIds:["stranger"]}),scope),/contracted/);
 await assert.rejects(readCanonicalSegmentContexts(fake({...payload,
  actorIds:undefined}),scope),/contracted/);
});
test("refuses non-resolving world",async()=>{
 await assert.rejects(readCanonicalSegmentContexts(fake(payload,"OPEN"),scope),
  /not resolving/);
});
