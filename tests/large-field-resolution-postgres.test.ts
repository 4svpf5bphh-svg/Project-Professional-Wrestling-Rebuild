import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {resolveCanonicalShow} from "../src/db/resolve-canonical-show.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {previewLegacyShowMatchStyles} from "../src/db/legacy-match-projection.js";
import {sideIdAt} from "../src/domain/match-sides.js";
const url=process.env.PPW_NEON_TEST_URL;
for(const kind of ["ROYAL","MULTI_TEAM"] as const){
 test(kind+" is a complete World-scoped resolution with every entrant persisted",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),worldId=kind+"-"+randomUUID();
 const promotionId="arena",showId="event",count=kind==="ROYAL"?30:6;
 const ids=Array.from({length:count},(_,i)=>"w-"+i);
 const teams=kind==="ROYAL"?30:3,size=kind==="ROYAL"?1:2;
 const participants=ids.map(personId=>({personId,contractId:"deal-"+personId}));
 const sides=Array.from({length:teams},(_,i)=>({
  sideId:sideIdAt(i),participants:participants.slice(i*size,(i+1)*size)}));
 const winner=kind==="ROYAL"?"AD":"C";
 const eliminationOrder=sides.filter(x=>x.sideId!==winner).map(x=>x.sideId);
 const payload={matchType:kind==="ROYAL"?"BATTLE_ROYAL":"TAG",
  family:kind==="ROYAL"?"INDIVIDUAL":"TEAMS",participants,sides,
  scriptedWinnerSide:winner,scriptedWinner:ids.at(-1),
  ruleset:"ELIMINATION",eliminationOrder,
  intent:"COMPETITIVE",plannedFinish:kind==="ROYAL"?
   "OVER_THE_TOP_ROPE":"CLEAN_PIN",plannedLengthMinutes:25};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Big match integration",seed:99,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Arena",tier:"LOCAL"});
   await tx.query("UPDATE ppw_promotions SET media_reach=90 WHERE world_id=$1",
    [worldId]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'hall','Hall')",
    [worldId]);
   for(const id of ids){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,
      booking_division,in_ring_quality,match_craft,presentation,
      stamina,safety,fatigue,wear,popularity,recognition,momentum)
      VALUES($1,$2,$2,'MEN',80,79,78,90,96,10,9,70,70,75)`,[worldId,id]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,
      person_id,promotion_id,family,status,remaining_dates,expires_week_index)
      VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',4,52)`,
      [worldId,"deal-"+id,id,promotionId]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts(
    world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
    VALUES($1,$2,$3,1,1,'SUBMITTED',3,'hall',88)`,
    [worldId,showId,promotionId]);
   await tx.query(`INSERT INTO ppw_card_slots
    (world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
    [worldId,showId,JSON.stringify(payload)]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',
    injury_rate_multiplier=0 WHERE world_id=$1`,[worldId]);
   await tx.query(`INSERT INTO ppw_week_resource_clearances(
    world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
    VALUES($1,1,1,1,1,'large-field')`,[worldId]);
  });
  const scope={worldId,promotionId,showId};
  const readiness=await previewLegacyShowMatchStyles(db.pool,scope);
  assert.equal(readiness.matchCount,1);
  assert.equal(readiness.projections[0]!.status,"READY");
  if(!("performers" in readiness.projections[0]!))
   throw new Error("Missing full field readiness projection");
  assert.equal(readiness.projections[0]!.performers.length,count);
  const projected=await previewArchivedShowMatchScores(db.pool,scope);
  assert.equal((kind==="ROYAL"?projected.projections[0]!.multi?.result.members:
   projected.projections[0]!.tag?.result.members)?.length,count);
  assert.equal(await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
   resolutionId:"large-field-result"}),"RECORDED");
  assert.equal(await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
   resolutionId:"large-field-result"}),"IDENTICAL_RETRY");
  const evidence=await withWorldTransaction(db.pool,tx=>tx.query<{
   evidence_json:{booking:{eliminationOrder:string[]};
    resolution:{completedEliminationOrder:string[]}}}>(`
    SELECT evidence_json FROM ppw_completed_match_evidence
    WHERE world_id=$1 AND show_id=$2`,[worldId,showId]));
  assert.deepEqual(evidence[0]!.evidence_json.booking.eliminationOrder,eliminationOrder);
  assert.deepEqual(evidence[0]!.evidence_json.resolution.completedEliminationOrder,
   eliminationOrder);
  const table=kind==="ROYAL"?"ppw_individual_field_career_effects":
   "ppw_tag_match_career_effects";
  const effects=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;won:boolean;performer_side:string}>(`
    SELECT person_id,won,performer_side FROM ${table}
    WHERE world_id=$1 ORDER BY person_id`,[worldId]));
  assert.equal(effects.length,count);
  assert.equal(effects.filter(x=>x.won).length,size);
  assert.equal(new Set(effects.map(x=>x.person_id)).size,count);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_individual_field_career_effects",
    "ppw_tag_match_career_effects","ppw_ledger_events",
    "ppw_completed_match_evidence","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_week_resource_clearances",
    "ppw_card_slots","ppw_booking_drafts","ppw_contracts",
    "ppw_people","ppw_venues","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
 });
}
