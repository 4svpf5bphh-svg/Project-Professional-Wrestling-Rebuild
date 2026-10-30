import {test} from "node:test";
import assert from "node:assert/strict";
import {readRingsideMemory} from "../src/db/ringside-continuity.js";
import type {TransactionPool} from "../src/db/transaction.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";

const show:CompletedShowView={showId:"new",year:1,week:3,crowdResponse:80,
 matchCount:1,angleCount:0,entries:[{
  slotId:"m",type:"MATCH",position:0,headline:"Winner",
  summary:"Clean finish",crowdResponse:80,outcome:"CLEAN_PIN",
  actorIds:["omega"],targetIds:[],performerIdentities:[{
   personId:"omega",ringName:"Kenny Omega",character:"Cleaner",
   style:"ALL_ROUNDER",signatureMoves:[],finishingMoves:[],source:"WORLD_RECORD"
  }]
 }]};
const scope={worldId:"w",promotionId:"player-promo",playerId:"controller",showId:"new"};
test("Ringside history is a few certified earlier, owner-scoped facts",async()=>{
 const queries:{sql:string;params:readonly unknown[]}[]=[];
 const pool:TransactionPool={async connect(){return {
  release(){},
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]):Promise<readonly T[]>{
   queries.push({sql,params});
   if(sql.includes("ppw_completed_show_matches")){
    assert.match(sql,/JOIN ppw_promotion_controls/);
    assert.match(sql,/JOIN ppw_memberships/);
    assert.match(sql,/c.promotion_id=\$2/);
    assert.match(sql,/c.show_id<>\$4/);
    assert.match(sql,/\)<\$5/);
    assert.deepEqual(params,["w","player-promo","controller","new",2]);
    return [
     {promotion_id:"player-promo",year:1,week:1,actual_finish:"FLASH_PIN",actual_winner_side:"B",
      payload:{participants:[
       {personId:"omega",contractId:"c1"},
       {personId:"opponent",contractId:"c2"}],scriptedWinner:"opponent"}},
     {promotion_id:"player-promo",year:1,week:2,actual_finish:"CLEAN_PIN",actual_winner_side:"A",
      payload:{participants:[{personId:"other",contractId:"c3"},
       {personId:"unrelated",contractId:"c4"}],scriptedWinner:"other"}}
    ] as unknown as readonly T[];
   }
   if(sql.includes("SELECT person_id,name FROM ppw_people")){
    assert.deepEqual(params,["w",["omega","opponent"]]);
    return [{person_id:"omega",name:"Kenny Omega"},
     {person_id:"opponent",name:"Rival"}] as unknown as readonly T[];
   }
   throw Error("Unexpected query");
  }
 };}};
 const result=await readRingsideMemory(pool,scope,show);
 assert.equal(queries.length,2,"Programme context is already in the completed show; no extra history query");
 assert.deepEqual(result.priorMatches,[{
  when:"Y1 W1",wrestlers:["Kenny Omega","Rival"],winners:["Rival"],
  finish:"FLASH_PIN"
 }]);
 assert.deepEqual(result.programmes,[]);
});
test("Ringside never queries history for a show with no identified talent",async()=>{
 let queries=0;
 const pool:TransactionPool={async connect(){queries++;throw Error("should not read");}};
 const data=await readRingsideMemory(pool,scope,{...show,entries:[{
  ...show.entries[0]!,actorIds:[],targetIds:[],performerIdentities:[]}]});
 assert.equal(queries,0);
 assert.deepEqual(data,{priorMatches:[],programmes:[]});
});
test("history rejects cross-show scope before any database operation",async()=>{
 const pool:TransactionPool={async connect(){throw Error("unexpected access");}};
 await assert.rejects(readRingsideMemory(pool,{...scope,showId:"forged"},show),
  /history scope/);
});

test("Ringside discards future and another promotion's receipts even if an unexpected query supplied them",async()=>{
 let seen=0;
 const pool:TransactionPool={async connect(){return{
  release(){},
  async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]):Promise<readonly T[]>{
   seen++;
   if(sql.includes("ppw_completed_show_matches")){
    assert.match(sql,/c.promotion_id=\$2/);
    assert.match(sql,/SELECT old.promotion_id/);
    return [
     {promotion_id:"rival-promo",year:1,week:1,actual_finish:"CLEAN_PIN",
      actual_winner_side:"B",payload:{participants:[{personId:"omega",contractId:"c1"},
       {personId:"opponent",contractId:"c2"}],scriptedWinner:"opponent"}},
     {promotion_id:"player-promo",year:1,week:4,actual_finish:"CLEAN_PIN",
      actual_winner_side:"B",payload:{participants:[{personId:"omega",contractId:"c1"},
       {personId:"opponent",contractId:"c2"}],scriptedWinner:"opponent"}}
    ] as unknown as readonly T[];
   }
   throw Error("Unexpected leakage-prone query: "+sql);
  }
 };}};
 const history=await readRingsideMemory(pool,scope,show);
 assert.equal(seen,1,"No extra programme or name lookup for unsafe historical rows");
 assert.deepEqual(history,{priorMatches:[],programmes:[]});
});
