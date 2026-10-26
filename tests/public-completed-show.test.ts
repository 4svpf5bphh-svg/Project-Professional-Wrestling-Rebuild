import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,assignPerformer,buildBookedMatch} from "../src/ui/card-editor-model.js";
import {readPublicCompletedShow} from "../src/db/public-completed-show.js";
import type {TransactionPool} from "../src/db/transaction.js";

test("a fellow human manager sees only the completed canonical winner, star rating and card",async()=>{
 let match=newEditorMatch("bout","SINGLES");
 match=assignPerformer(match,0,0,{personId:"a",contractId:"ca"});
 match=assignPerformer(match,1,0,{personId:"b",contractId:"cb"});
 const sealed={worldId:"world",promotionId:"rival",showId:"show",year:1,week:4,
  resolutionId:"sealed",crowdResponse:83,matches:[{matchId:"bout",position:0,
   crowdResponse:88,actualFinish:"SUBMISSION",actualWinnerSide:"B"}],segments:[]};
 const queries:string[]=[];
 const pool:TransactionPool={async connect(){return {
  release(){},
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]):Promise<readonly T[]>{
   queries.push(sql);
   if(sql.includes("FROM ppw_completed_shows c")){
    assert.deepEqual(params,["world","owner","my-promotion","rival","show"]);
    return [{receipt_json:sealed,show_name:"Saturday Slam",
     promotion_name:"Fellow Booker",year:1,week:4,crowd_response:83}] as unknown as T[];
   }
   if(sql.includes("FROM ppw_card_slots slot"))
    return [{slot_id:"bout",kind:"MATCH",position:0,
     payload:buildBookedMatch(match),rating_stars:4.25,story_json:null}] as unknown as T[];
   if(sql.includes("FROM ppw_people"))
    return [{person_id:"a",name:"Samoa Joe"},{person_id:"b",name:"Matt Riddle"}] as unknown as T[];
   throw Error("Unexpected SQL");
  }
 };}};
 const result=await readPublicCompletedShow(pool,{
  worldId:"world",playerId:"owner",viewerPromotionId:"my-promotion",
  targetPromotionId:"rival",showId:"show"});
 assert.equal(result.promotionName,"Fellow Booker");
 assert.equal(result.entries.length,1);
 assert.equal(result.entries[0]!.headline,"Samoa Joe vs Matt Riddle");
 assert.equal(result.entries[0]!.winner,"Matt Riddle");
 assert.equal(result.entries[0]!.outcome,"SUBMISSION");
 assert.equal(result.entries[0]!.ratingStars,4.25);
 assert.equal(queries.length,3);
 assert.match(queries[0]!,/ppw_completed_shows/);
 assert.match(queries[0]!,/ppw_promotion_controls rival/);
 assert.match(queries[0]!,/ppw_memberships member/);
 assert.ok(queries.every(sql=>!/ppw_staff_show_reports|ppw_gorilla_show_logs|ppw_contracts/.test(sql)));
 assert.ok(!("staffReport" in result)&&!("commentary" in result));
});

test("a rival spectator cannot select their own promotion or unpublished and AI-only results",async()=>{
 let queries=0;
 const pool:TransactionPool={async connect(){return {release(){},
  async query<T extends Record<string,unknown>>(_sql:string,_params:readonly unknown[]):Promise<readonly T[]>{
   queries++;return [];
  }
 };}};
 const input={worldId:"w",playerId:"p",viewerPromotionId:"owned",targetPromotionId:"owned",showId:"show"};
 await assert.rejects(readPublicCompletedShow(pool,input),/rival/);
 assert.equal(queries,0);
 await assert.rejects(readPublicCompletedShow(pool,{...input,targetPromotionId:"AI"}),/unavailable/);
 assert.equal(queries,1,"Reject missing human ownership before reading any card slots");
});
