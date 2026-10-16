import test from "node:test";
import assert from "node:assert/strict";
import {resolveCanonicalShow} from "../src/db/resolve-canonical-show.js";
import type {TransactionPool} from "../src/db/transaction.js";
function fake(options:{existing?:string;phase?:string;fail?:boolean}={}){
 const calls:string[]=[];
 const pool:TransactionPool={async connect(){return {
  async query<T extends Record<string,unknown>>(sql:string){
   calls.push(sql);
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{
    year:1,week:1,phase:options.phase??"RESOLVING"}] as unknown as T[];
   if(sql.includes("FROM ppw_completed_shows"))return (
    options.existing?[{resolution_id:options.existing}]:[]) as unknown as T[];
   if(options.fail)throw new Error("scoring failed");
   throw new Error("Unexpected query: "+sql);
  },release(){}};
 }};
 return {pool,calls};
}
const input={worldId:"w",promotionId:"p",showId:"s",year:1,week:1,
 resolutionId:"resolution-1"};
test("same resolution retry returns without rescoring",async()=>{
 const db=fake({existing:"resolution-1"});
 assert.equal(await resolveCanonicalShow(db.pool,input),"IDENTICAL_RETRY");
 assert.equal(db.calls.at(-1),"COMMIT");
 assert.equal(db.calls.some(x=>x.includes("ppw_booking_drafts")),false);
});
test("different resolution identifier cannot replace completed show",async()=>{
 const db=fake({existing:"other"});
 await assert.rejects(resolveCanonicalShow(db.pool,input),/Conflicting/);
 assert.equal(db.calls.at(-1),"ROLLBACK");
});
test("non-resolving World rejects even an existing result",async()=>{
 const db=fake({existing:"resolution-1",phase:"OPEN"});
 await assert.rejects(resolveCanonicalShow(db.pool,input),/not resolving/);
 assert.equal(db.calls.at(-1),"ROLLBACK");
});
test("failure during scoring rolls back before any completion write",async()=>{
 const db=fake({fail:true});
 await assert.rejects(resolveCanonicalShow(db.pool,input),/scoring failed/);
 assert.equal(db.calls.at(-1),"ROLLBACK");
 assert.equal(db.calls.some(x=>x.startsWith("INSERT")),false);
});
