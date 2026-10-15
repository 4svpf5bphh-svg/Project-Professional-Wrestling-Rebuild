import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setStaffContinuityAsActor} from "../src/api/world-service.js";
import {lockWorldWeek,beginWorldResolution} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {applyStaffScheduleFallback} from "../src/db/staff-schedule-fallback.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";

const url=process.env.PPW_NEON_TEST_URL;
test("opted-in staff completes only missing venue, while human scripts and contract dates remain unchanged",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="staff-"+id;
 const promos=["human-"+id,"ai-"+id,"other-"+id];
 const players=["owner-"+id,"other-owner-"+id];
 const shows=["staff-draft-"+id,"ai-submitted-"+id,"other-draft-"+id];
 const people=["alice-"+id,"bob-"+id,"cody-"+id,"dan-"+id];
 const contracts=people.map((_,i)=>"contract-"+i+"-"+id);
 const schedule=(promotionId:string,requestId:string,expectedRevision:number)=>
   applyStaffScheduleFallback(db.pool,{worldId,promotionId,requestId,expectedRevision});
 try{
   await withWorldTransaction(db.pool,async tx=>{
     await createWorld(tx,{id:worldId,name:"Staff Test",seed:42,rulesetVersion:"test"});
     for(let i=0;i<3;i++)await addPromotion(tx,worldId,{id:promos[i]!,name:"Promotion "+i,tier:"LOCAL"});
     for(const player of players){
       await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
       await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,player]);
     }
     for(const [i,idx] of [0,2].entries())
       await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",
         [worldId,promos[idx]!,players[i]!]);
     await tx.query("UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1 AND promotion_id=$2",[worldId,promos[1]!]);
     await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'main','Main'),($1,'spare','Spare')",[worldId]);
     for(let i=0;i<people.length;i++){
       await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,$3)",[worldId,people[i]!,"Wrestler "+i]);
       await tx.query(
        `INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
          VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)`,
         [worldId,contracts[i]!,people[i]!,promos[i<2?0:1]!],
       );
     }
     await tx.query(
       `INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
        VALUES($1,$2,$3,1,1,'DRAFT',3,NULL),
              ($1,$4,$5,1,1,'SUBMITTED',3,'main'),
              ($1,$6,$7,1,1,'DRAFT',NULL,NULL)`,
       [worldId,shows[0],promos[0],shows[1],promos[1],shows[2],promos[2]],
     );
     for(let i=0;i<2;i++){
       const participants=(i===0?[0,1]:[2,3]).map(j=>({personId:people[j],contractId:contracts[j]}));
       await tx.query(
         "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb)",
         [worldId,shows[i]!,"match-"+i,JSON.stringify({participants,scriptedWinner:participants[0]!.personId,
            authoredCommentary:"Do not rewrite this finish"})],
       );
     }
   });
   const actor={pool:db.pool,actor:{playerId:players[0]!}};
   assert.equal((await setStaffContinuityAsActor(actor,{worldId,
     promotionId:promos[0]!,allowUnfinishedFallback:true,requestId:"delegate-"+id,expectedRevision:0})).status,"APPLIED");
   await withWorldTransaction(db.pool,tx=>tx.query(
     "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '2 seconds' WHERE world_id=$1",[worldId],
   ));
   assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock-"+id,expectedRevision:1})).status,"APPLIED");
   const checkpoint=await recordWeekContinuity(db.pool,{worldId,requestId:"continuity-"+id,expectedRevision:2});
   assert.equal(checkpoint.status,"APPLIED");
   if(checkpoint.status==="APPLIED")assert.equal(checkpoint.result.counts.STAFF_FALLBACK_ELIGIBLE,1);
   const ready=await finalizePreparedWorldShows(db.pool,{worldId,requestId:"prepared-"+id,expectedRevision:3});
   assert.equal(ready.status,"APPLIED");
   assert.equal((await beginWorldResolution(db.pool,{worldId,requestId:"begin-"+id,expectedRevision:4})).status,"APPLIED");
   await assert.rejects(schedule(promos[2]!,"unapproved-"+id,5),/not delegated/);

   // An invalid current contract cannot get silently booked. All changes roll back.
   await withWorldTransaction(db.pool,tx=>tx.query(
     "UPDATE ppw_contracts SET status='TERMINATED' WHERE world_id=$1 AND contract_id=$2",[worldId,contracts[1]!],
   ));
   await assert.rejects(schedule(promos[0]!,"bad-contract-"+id,5),/eligibility checks/);
   let draft=await withWorldTransaction(db.pool,tx=>tx.query<{status:string;venue_id:string|null}>(
     "SELECT status,venue_id FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2",[worldId,shows[0]!]));
   assert.deepEqual(draft,[{status:"DRAFT",venue_id:null}]);
   await withWorldTransaction(db.pool,tx=>tx.query(
     "UPDATE ppw_contracts SET status='SIGNED' WHERE world_id=$1 AND contract_id=$2",[worldId,contracts[1]!],
   ));
   const mutation=await schedule(promos[0]!,"salvage-"+id,5);
   assert.equal(mutation.status,"APPLIED");
   if(mutation.status==="APPLIED"){
     assert.equal(mutation.result.venueId,"spare");
     assert.equal(mutation.result.day,3);
     assert.equal(mutation.result.authoredCardPreserved,true);
   }
   assert.equal((await schedule(promos[0]!,"salvage-"+id,5)).status,"REPLAYED");
   await assert.rejects(schedule(promos[0]!,"again-"+id,6),/not delegated/);
   const report=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
   assert.ok(!report.blockers.some(b=>b.showIds.includes(shows[0]!)));
   const card=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{scriptedWinner:string;authoredCommentary:string}}>(
     "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",[worldId,shows[0]!],
   ));
   assert.equal(card[0]!.payload.scriptedWinner,people[0]);
   assert.equal(card[0]!.payload.authoredCommentary,"Do not rewrite this finish");
   const remaining=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
     "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId],
   ));
   assert.deepEqual(remaining.map(x=>x.remaining_dates),[2,2,2,2]);
   const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{authority:string;venueId:string}}>(
     "SELECT payload FROM ppw_ledger_events WHERE world_id=$1 AND event_type='DELEGATED_STAFF_SCHEDULE'",[worldId],
   ));
   assert.equal(ledger.length,1);
   assert.equal(ledger[0]!.payload.authority,"PRE_LOCK_OWNER_DELEGATION");
 }finally{
   await withWorldTransaction(db.pool,async tx=>{
     await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_week_prepared_finalizations WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_week_continuity_assessments WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_staff_continuity_settings WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
     for(const player of players)await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
     await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
     await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
   }).finally(()=>db.close());
 }
});
