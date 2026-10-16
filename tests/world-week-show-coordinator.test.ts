import test from "node:test";
import assert from "node:assert/strict";
import {resolveWorldWeekShows}
 from "../src/db/world-week-show-coordinator.js";
import type {TransactionPool} from "../src/db/transaction.js";
function fake(options:{phase?:string;duplicate?:boolean;missing?:boolean}={}){
 const calls:string[]=[];
 const pool:TransactionPool={async connect(){return {
  async query<T extends Record<string,unknown>>(sql:string){
   calls.push(sql);
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{
    phase:options.phase??"RESOLVING"}] as unknown as T[];
   if(sql.includes("FROM ppw_booking_drafts")&&
    !sql.includes("LEFT JOIN"))return (
    options.duplicate?[{promotion_id:"p",draft_id:"s"},
     {promotion_id:"p",draft_id:"s2"}]:[]) as unknown as T[];
   if(sql.includes("LEFT JOIN ppw_completed_shows"))return (
    options.missing?[{promotion_id:"p",draft_id:"s",resolution_id:null}]:[]) as unknown as T[];
   throw new Error("Unexpected query: "+sql);
  },release(){}};
 }};
 return {pool,calls};
}
const scope={worldId:"w",year:1,week:1,resolutionId:"resolution-1"};
test("empty submitted-show set completes without inventing shows",async()=>{
 const db=fake();
 assert.deepEqual(await resolveWorldWeekShows(db.pool,scope),
  {year:1,week:1,required:0,recorded:0,retried:0});
});
test("duplicate promotion shows fail before any simulation",async()=>{
 const db=fake({duplicate:true});
 await assert.rejects(resolveWorldWeekShows(db.pool,scope),/Multiple/);
 assert.equal(db.calls.some(x=>x.includes("ppw_people")),false);
});
test("World must be in resolving phase",async()=>{
 const db=fake({phase:"LOCKED"});
 await assert.rejects(resolveWorldWeekShows(db.pool,scope),/must be resolving/);
 assert.equal(db.calls.at(-1),"ROLLBACK");
});
test("invalid scope fails before database work",async()=>{
 const db=fake();
 await assert.rejects(resolveWorldWeekShows(db.pool,{...scope,week:53}),/Invalid/);
 assert.equal(db.calls.length,0);
});
