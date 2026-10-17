import test from "node:test";
import assert from "node:assert/strict";
import {readCanonicalSegmentContexts} from "../src/db/canonical-segment-evaluation.js";
import type {TransactionPool} from "../src/db/transaction.js";
const scope={worldId:"w",promotionId:"p",showId:"s",year:1,week:1};
test("only explicit active links provide segment feud heat and repetition",async()=>{
 const pool:TransactionPool={async connect(){return {
  release(){},
  async query<T extends Record<string,unknown>>(sql:string){
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{phase:"RESOLVING"}] as unknown as T[];
   if(sql.includes("FROM ppw_booking_drafts"))return [{draft_id:"s"}] as unknown as T[];
   if(sql.includes("FROM ppw_card_slots"))return [{
    slot_id:"angle",position:0,kind:"SEGMENT",
    payload:{kind:"PROMO",outcome:"HAPPENS",actorIds:["a"],targetIds:[],
     participants:[{personId:"a",contractId:"c"}]}
   }] as unknown as T[];
   if(sql.includes("FROM ppw_programme_match_activities"))return [
    {slot_id:"angle",programme_id:"rivalry",status:"ACTIVE",heat:90,repetition:4},
    {slot_id:"angle",programme_id:"ended",status:"COMPLETED",heat:100,repetition:20},
   ] as unknown as T[];
   if(sql.includes("FROM ppw_people"))return [{
    person_id:"a",name:"Wrestler A",popularity:65,presentation:60,momentum:60,
   }] as unknown as T[];
   throw new Error("Unexpected SQL");
  }};}};
 const result=await readCanonicalSegmentContexts(pool,scope);
 assert.equal(result[0]!.storylineHeat,90);
 assert.equal(result[0]!.repetitionCount,4);
});
