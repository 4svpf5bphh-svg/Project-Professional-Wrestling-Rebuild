import {test} from "node:test";
import {strict as assert} from "node:assert";
import type {TransactionPool} from "../src/db/transaction.js";
import {readCompletedShowArchive} from "../src/db/completed-show-archive.js";
const scope={worldId:"world",playerId:"owner",promotionId:"promotion"};
function fixture(all:number,authorized=true){
 const calls:{sql:string;params:unknown[]}[]=[];
 const pool:TransactionPool={async connect(){return {release(){},
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   calls.push({sql,params:params??[]});
   return (!authorized?[]:Array.from({length:all},(_,i)=>({
    show_id:"show-"+(20-i),year:1,week:20-i,crowd_response:"71.5",
    match_count:3,angle_count:2,
   }))) as unknown as T[];
  }};}};
 return {pool,calls};
}
test("results archive returns only 12 lightweight items and a stable keyset cursor",async()=>{
 const {pool,calls}=fixture(13);
 const page=await readCompletedShowArchive(pool,scope);
 assert.equal(page.items.length,12);
 assert.deepEqual(page.nextCursor,{showId:"show-9",year:1,week:9});
 assert.equal(page.items[0]!.crowdResponse,71.5);
 assert.equal(page.items[0]!.angleCount,2);
 assert.equal(calls.length,1);
 assert.match(calls[0]!.sql,/LIMIT 13/);
 assert.match(calls[0]!.sql,/ppw_promotion_controls/);
 assert.match(calls[0]!.sql,/ORDER BY c.year DESC,c.week DESC,c.show_id DESC/);
 assert.doesNotMatch(calls[0]!.sql,/SELECT c.receipt_json/);
});
test("cursor is passed as typed SQL arguments and malformed input fails before SQL",async()=>{
 const {pool,calls}=fixture(3);
 const cursor={year:2,week:3,showId:"abc"};
 const page=await readCompletedShowArchive(pool,{...scope,cursor});
 assert.equal(page.nextCursor,null);
 assert.deepEqual(calls[0]!.params.slice(3),[2,3,"abc"]);
 await assert.rejects(readCompletedShowArchive(pool,{...scope,cursor:{...cursor,week:53}}),
  /Invalid results cursor/);
 await assert.rejects(readCompletedShowArchive(pool,{...scope,playerId:""}),
  /Invalid results archive scope/);
 assert.equal(calls.length,1);
});
test("non-controller cannot learn show history",async()=>{
 const {pool,calls}=fixture(13,false);
 assert.deepEqual(await readCompletedShowArchive(pool,scope),
  {items:[],nextCursor:null});
 assert.equal(calls.length,1);
});
