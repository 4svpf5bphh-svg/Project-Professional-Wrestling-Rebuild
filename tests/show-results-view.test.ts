import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import type {TransactionPool} from "../src/db/transaction.js";
const scope={worldId:"world",promotionId:"prom",showId:"show",playerId:"owner"};
const receipt={worldId:"world",promotionId:"prom",showId:"show",year:1,week:1,
 resolutionId:"res",crowdResponse:77,
 matches:[{matchId:"m",position:0,crowdResponse:85,actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],
 segments:[{slotId:"a",position:1,kind:"PROMO",outcome:"REFUSED",crowdResponse:64}]};
function fake(authorized=true){
 let calls=0;
 const pool:TransactionPool={async connect(){return {release(){},
  async query<T extends Record<string,unknown>>(sql:string){
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   calls++;
   if(sql.includes("FROM ppw_completed_shows"))return (authorized?[{receipt_json:receipt}]:[]) as unknown as T[];
   if(sql.includes("FROM ppw_card_slots"))return [
    {slot_id:"m",kind:"MATCH",position:0,payload:{participants:[{personId:"a",contractId:"c"}]}},
    {slot_id:"a",kind:"SEGMENT",position:1,payload:{participants:[{personId:"a",contractId:"c"}]}},
   ] as unknown as T[];
   if(sql.includes("FROM ppw_people"))return [{person_id:"a",name:"Star"}] as unknown as T[];
   if(sql.includes("FROM ppw_completed_show_segments"))return [{
    slot_id:"a",story_json:{slotId:"a",position:1,kind:"PROMO",outcome:"REFUSED",
     headline:"In-ring promo",summary:"The wrestler refuses the promo.",
     actorIds:["a"],targetIds:[],intent:null},
   }] as unknown as T[];
   throw new Error("Unexpected SQL: "+sql);
  }};}};
 return {pool,calls:()=>calls};
}
test("published card is ordered, named, scored and does not change authored outcomes",async()=>{
 const {pool,calls}=fake();
 const result=await readCompletedShowView(pool,scope);
 assert.equal(result.entries.length,2);
 assert.equal(result.entries[0]!.crowdResponse,85);
 assert.equal(result.entries[1]!.outcome,"REFUSED");
 assert.equal(result.entries[1]!.headline,"In-ring promo");
 assert.equal(calls(),4);
 assert.equal(result.entries[0]!.matchContext,undefined); // Legacy slot without sides is tolerated.
 assert.equal(result.entries[1]!.segmentKind,"PROMO");
});
test("foreign player cannot read another promotion's private broadcast",async()=>{
 const {pool,calls}=fake(false);
 await assert.rejects(readCompletedShowView(pool,scope),/unavailable/);
 assert.equal(calls(),1);
});

test("completed match narrative is derived from the actual finish",async()=>{
 const result=await readCompletedShowView(fake().pool,scope);
 assert.match(result.entries[0]!.summary,/clean pinfall/);
 assert.equal(result.entries[1]!.intent,null);
});
