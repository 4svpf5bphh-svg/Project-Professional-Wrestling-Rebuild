import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";
const url=process.env.PPW_NEON_TEST_URL;
/** One full authoritative World journey larger than a single serverless
 * batch: five different shows, interrupted responses, then a safe Week 2. */
test("five real shows resolve in two bounded batches and overdue World publishes once",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,4),worldId="five-resume-"+randomUUID();
 const resolutionId="recovery-"+worldId;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Five show recovery",seed:431,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[worldId]);
   for(let i=0;i<5;i++){
    const promotionId="promotion-"+i,showId="show-"+i,venueId="venue-"+i;
    await addPromotion(tx,worldId,{id:promotionId,name:"Promotion "+i,tier:"LOCAL"});
    await tx.query("UPDATE ppw_promotions SET media_reach=70 WHERE world_id=$1 AND promotion_id=$2",[worldId,promotionId]);
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,$3)",[worldId,venueId,"Venue "+i]);
    const people=["p"+i+"a","p"+i+"b"];
    for(const personId of people){
     await tx.query(`INSERT INTO ppw_people
       (world_id,person_id,name,booking_division,in_ring_quality,match_craft,
        presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,default_alignment)
       VALUES($1,$2,$2,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')`,
       [worldId,personId]);
     await tx.query(`INSERT INTO ppw_contracts
       (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
       VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',1,52)`,
       [worldId,"deal-"+personId,personId,promotionId]);
    }
    await tx.query(`INSERT INTO ppw_booking_drafts
      (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
      VALUES($1,$2,$3,1,1,'SUBMITTED',$4,$5,70)`,
      [worldId,showId,promotionId,i+1,venueId]);
    const payload={matchType:"SINGLES",participants:people.map(personId=>({
     personId,contractId:"deal-"+personId
    })),scriptedWinner:people[1],intent:"TECHNICAL",
      plannedLengthMinutes:16,plannedFinish:"SUBMISSION"};
    await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
      VALUES($1,$2,'match',0,'MATCH',$3::jsonb)`,
      [worldId,showId,JSON.stringify(payload)]);
   }
   await tx.query("UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '2 days' WHERE world_id=$1",[worldId]);
  });
  assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  const first=await driveWorldResolution(db.pool,{worldId,resolutionId,
   maxStages:6,manualRecovery:true});
  assert.equal(first.status,"LIMIT_REACHED");
  const partial=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1",[worldId]));
  assert.equal(partial[0]?.n,"4");
  const two=await driveWorldResolution(db.pool,{worldId,resolutionId,
   maxStages:1,manualRecovery:true});
  assert.equal(two.steps[0]?.action,"RESOLVE_DETAILED_SHOWS");
  const finished=await driveWorldResolution(db.pool,{worldId,resolutionId,
   maxStages:6,manualRecovery:true});
  assert.equal(finished.status,"PUBLISHED");
  const records=await withWorldTransaction(db.pool,tx=>tx.query<{
   year:number;week:number;phase:string;hours:number;receipts:string
  }>(`SELECT w.year,w.week,w.phase,
   EXTRACT(EPOCH FROM w.next_lock_at-clock_timestamp())/3600 AS hours,
   (SELECT count(*)::text FROM ppw_completed_shows WHERE world_id=$1) AS receipts
   FROM ppw_worlds w WHERE w.world_id=$1`,[worldId]));
  assert.equal(records[0]?.year,1);assert.equal(records[0]?.week,2);
  assert.equal(records[0]?.phase,"OPEN");assert.equal(records[0]?.receipts,"5");
  assert.ok(Number(records[0]?.hours)>23.9);
  assert.equal((await driveWorldResolution(db.pool,{worldId,resolutionId,
   maxStages:1,manualRecovery:true})).status,"BLOCKED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_wrestler_relationship_changes","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationships","ppw_completed_match_report_facts",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_alignment_changes",
    "ppw_card_slots","ppw_booking_drafts",
    "ppw_promotion_talent_trust","ppw_promotion_survival",
    "ppw_contracts","ppw_people","ppw_venues","ppw_promotions","ppw_worlds"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
