import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {previewLegacyShowMatchStyles} from "../src/db/legacy-match-projection.js";
import {deriveArchivedMatchEvidence} from "../src/simulation/derive-archived-match-evidence.js";
import {assembleArchivedShowResolution} from "../src/simulation/assemble-archived-show-resolution.js";
import {recordCompletedShowInTransaction} from "../src/db/completed-show-results.js";
const url=process.env.PPW_NEON_TEST_URL;
test("PostgreSQL canonical 2v2: four contracted athletes, team chemistry, result evidence and retry-safe completed show",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),worldId="tag-verified-"+randomUUID();
 const promotionId="tag-promotion",showId="tag-show";
 const ids=["alfa","bravo","charlie","delta"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Two-side tag",seed:14,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Teams",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'hall','Hall')",[worldId]);
   for(let i=0;i<4;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,
     popularity,recognition,momentum)
     VALUES($1,$2,$2,'MEN',78,82,75,85,91,14,11,65,70,73)`,[worldId,ids[i]!]);
    await tx.query(`INSERT INTO ppw_contracts
     (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)`,
     [worldId,"deal-"+ids[i],ids[i]!,promotionId]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
     VALUES($1,$2,$3,1,1,'SUBMITTED',3,'hall',70)`,[worldId,showId,promotionId]);
   const people=ids.map(personId=>({personId,contractId:"deal-"+personId}));
   const card={matchType:"TAG",family:"TEAMS",participants:people,
    sides:[{sideId:"A",participants:people.slice(0,2)},
      {sideId:"B",participants:people.slice(2,4)}],
    scriptedWinnerSide:"B",intent:"COMPETITIVE",plannedFinish:"CLEAN_PIN",
    plannedLengthMinutes:18};
   await tx.query(`INSERT INTO ppw_card_slots
     (world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,'tag-main',0,'MATCH',$3::jsonb)`,
    [worldId,showId,JSON.stringify(card)]);
   await tx.query(`INSERT INTO ppw_working_chemistry
     (world_id,person_a_id,person_b_id,context,compatibility,familiarity,matches_together)
     VALUES($1,'alfa','bravo','TAG',10,40,8),
           ($1,'charlie','delta','TAG',6,20,4)`,[worldId]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',injury_rate_multiplier=1
     WHERE world_id=$1`,[worldId]);
   await tx.query(`INSERT INTO ppw_week_resource_clearances
     (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
     VALUES($1,1,1,1,1,'fixture')`,[worldId]);
  });
  const input={worldId,promotionId,showId};
  const adapted=await previewLegacyShowMatchStyles(db.pool,input);
  assert.equal(adapted.matchCount,1);
  assert.equal(adapted.projections[0]!.status,"READY");
  assert.ok("family" in adapted.projections[0]!);
  const projection=await previewArchivedShowMatchScores(db.pool,input);
  assert.equal(projection.projections.length,1);
  const tag=projection.projections[0]!.tag;
  assert.ok(tag);
  assert.equal(tag?.result.members.length,4);
  assert.equal(projection.projections[0]!.chemistryModifier,10*.55+40*.04+6*.55+20*.04);
  assert.equal(projection.projections[0]!.score.stage,"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW");
  assert.equal(projection.projections[0]!.interferencePreview?.plannedWinnerId,"charlie");
  assert.equal(projection.showAlignmentPreview,null);
  const scored=deriveArchivedMatchEvidence(projection);
  assert.equal(scored.length,1);
  assert.equal(scored[0]!.receipt.actualWinnerSide,"B");
  assert.ok("family" in scored[0]!.evidence.booking);
  const result=assembleArchivedShowResolution(projection,[],"world-tag-resolve");
  assert.equal(result.evidence.length,1);
  assert.equal(result.receipt.matches[0]!.actualWinnerSide,"B");
  const first=await withWorldTransaction(db.pool,tx=>
   recordCompletedShowInTransaction(tx,result.receipt,result.evidence));
  assert.equal(first,"RECORDED");
  const again=await withWorldTransaction(db.pool,tx=>
   recordCompletedShowInTransaction(tx,result.receipt,result.evidence));
  assert.equal(again,"IDENTICAL_RETRY");
  const stored=await withWorldTransaction(db.pool,tx=>tx.query<{evidence_json:{
   booking:{family:string;sides:{participants:string[]}[]}}}>(`
   SELECT evidence_json FROM ppw_completed_match_evidence
   WHERE world_id=$1 AND show_id=$2`,[worldId,showId]));
  assert.equal(stored.length,1);
  assert.equal(stored[0]!.evidence_json.booking.family,"TEAMS");
  assert.deepEqual(stored[0]!.evidence_json.booking.sides.map(s=>s.participants),
   [["alfa","bravo"],["charlie","delta"]]);
  const contracts=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(`
   SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id`,[worldId]));
  assert.deepEqual(contracts.map(x=>x.remaining_dates),[5,5,5,5],
   "Show scoring and result recording do not themselves spend contract dates");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_completed_match_evidence","ppw_completed_show_matches",
     "ppw_completed_shows","ppw_working_chemistry","ppw_week_resource_clearances",
     "ppw_card_slots","ppw_booking_drafts","ppw_contracts",
     "ppw_people","ppw_venues","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
