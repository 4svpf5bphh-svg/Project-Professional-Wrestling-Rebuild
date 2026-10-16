import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {recordCompletedShow} from "../src/db/completed-show-results.js";
import {canonicalCompletedShowReceipt,type CompletedShowReceipt}
 from "../src/domain/completed-show-receipt.js";
import type {TransactionPool} from "../src/db/transaction.js";
const receipt:CompletedShowReceipt={worldId:"w",promotionId:"p",showId:"s",
 year:1,week:1,resolutionId:"resolve-1",crowdResponse:75,
 matches:[{matchId:"m",position:0,crowdResponse:80,
  actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],
 segments:[{slotId:"angle",position:1,kind:"TURN",
  outcome:"REFUSED",crowdResponse:67}]};
function fake(options:{existing?:boolean;conflict?:boolean;
 failOnSegment?:boolean;phase?:string}={}){
 const calls:string[]=[];
 let writes=0;
 const canonical=canonicalCompletedShowReceipt(receipt);
 const digest=createHash("sha256").update(canonical).digest("hex");
 const pool:TransactionPool={async connect(){
  return {async query<T extends Record<string,unknown>>(sql:string){
   calls.push(sql);if(sql.startsWith("BEGIN")||sql.startsWith("COMMIT")||
    sql.startsWith("ROLLBACK"))return [] as unknown as T[];
   if(sql.includes("FROM ppw_worlds"))return [{year:1,week:1,
    phase:options.phase??"RESOLVING"}] as unknown as T[];
   if(sql.includes("FROM ppw_completed_shows"))return (
    options.existing?[{receipt_digest:options.conflict?"bad":digest,
     receipt_json:JSON.parse(canonical)}]:[]) as unknown as T[];
   if(sql.includes("FROM ppw_card_slots"))return [
    {slot_id:"m",position:0,kind:"MATCH"},
    {slot_id:"angle",position:1,kind:"SEGMENT"}] as unknown as T[];
   if(sql.includes("FROM ppw_booking_drafts"))return [{draft_id:"s"}] as unknown as T[];
   if(sql.startsWith("INSERT")){
    writes++;
    if(options.failOnSegment&&sql.includes("ppw_completed_show_segments"))
     throw new Error("segment insert failed");
    return [] as unknown as T[];
   }
   throw new Error("Unexpected query: "+sql);
  },release(){}};
 }};
 return {pool,calls,get writes(){return writes}};
}
test("first result is inserted as one transaction with both child tables",async()=>{
 const db=fake();
 assert.equal(await recordCompletedShow(db.pool,receipt),"RECORDED");
 assert.equal(db.writes,3);
 assert.equal(db.calls[0],"BEGIN");
 assert.equal(db.calls.at(-1),"COMMIT");
});
test("identical retry writes nothing",async()=>{
 const db=fake({existing:true});
 assert.equal(await recordCompletedShow(db.pool,receipt),"IDENTICAL_RETRY");
 assert.equal(db.writes,0);
 assert.equal(db.calls.at(-1),"COMMIT");
});
test("conflicting retry rejects and rolls back",async()=>{
 const db=fake({existing:true,conflict:true});
 await assert.rejects(recordCompletedShow(db.pool,receipt),/Conflicting/);
 assert.equal(db.writes,0);
 assert.equal(db.calls.at(-1),"ROLLBACK");
});
test("failure inserting a child rolls back all writes",async()=>{
 const db=fake({failOnSegment:true});
 await assert.rejects(recordCompletedShow(db.pool,receipt),/segment insert failed/);
 assert.equal(db.calls.at(-1),"ROLLBACK");
 assert.equal(db.calls.includes("COMMIT"),false);
});
test("non-resolving World cannot record results",async()=>{
 const db=fake({phase:"OPEN"});
 await assert.rejects(recordCompletedShow(db.pool,receipt),/not resolving/);
 assert.equal(db.writes,0);
 assert.equal(db.calls.at(-1),"ROLLBACK");
});
