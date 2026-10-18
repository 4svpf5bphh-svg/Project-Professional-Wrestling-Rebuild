import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,requestMatchConsentAsActor,
 saveCardEditorAsActor,markPreparedShowReadyAsActor}
 from "../src/api/world-service.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";
const url=process.env.PPW_NEON_TEST_URL;
test("contractual veto, consent, refusal, rewritten finish and confirmed card are authoritative",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,4);
 const id=randomUUID(),world="creative-"+id,player="owner-"+id;
 const context={pool:db.pool,actor:{playerId:player}};
 const show="weekly",promotion="local";
 const alice={personId:"alice",contractId:"alice-deal"};
 const bob={personId:"bob",contractId:"bob-deal"};
 const match=(finish="CLEAN_PIN")=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
  participants:[alice,bob],scriptedWinnerSide:"A",plannedFinish:finish,
  intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 const info={worldId:world,promotionId:promotion,showId:show};
 const agree=(personId:string,requestId:string,expectedRevision:number)=>
  requestMatchConsentAsActor(context,{
   ...info,slotId:"main",personId,requestId,expectedRevision
  });
 const ready=(revision:number,requestId:string)=>markPreparedShowReadyAsActor(context,{
  ...info,requestId,expectedRevision:revision,confirmReadyToRun:true
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Contract rehearsal",seed:44,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Local",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Hall','home')",[world]);
   for(const [person,control,morale,fatigue] of [
    ["alice","FULL_APPROVAL",85,4],["bob","PROTECTED_FINISHES",2,90]
   ] as const){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,fatigue,contract_priorities) VALUES($1,$2,$3,'MEN',$4,$5,$6::jsonb)",
     [world,person,person,morale,fatigue,JSON.stringify({
      money:40,role:90,prestige:50,schedule:45,loyalty:10,exposure:50})]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index,creative_control,role_expectation) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52,$5,'MAIN_EVENT')",
     [world,person+"-deal",person,promotion,control]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',3,'hall','home','REGULAR')",
    [world,show,promotion]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)",
    [world,show,JSON.stringify(match())]);
  });
