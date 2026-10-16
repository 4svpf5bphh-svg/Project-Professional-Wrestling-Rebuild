import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewLegacyShowMatchStyles} from "../src/db/legacy-match-projection.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {resolveCanonicalShow} from "../src/db/resolve-canonical-show.js";
const url=process.env.PPW_NEON_TEST_URL;
for(const teamSize of [3,4,5]){
 test(`World resolves a ${teamSize}v${teamSize} team bout with ${teamSize*2} individual career records and safe retry`,
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),worldId="teams-"+teamSize+"-"+randomUUID();
 const promotionId="teams",showId="large-team-show";
 const ids=Array.from({length:teamSize*2},(_,i)=>"member-"+i);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Large teams CI",seed:97,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Teams",tier:"LOCAL"});
   await tx.query("UPDATE ppw_promotions SET media_reach=85 WHERE world_id=$1",
    [worldId]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'hall','Hall')",
    [worldId]);
   for(let i=0;i<ids.length;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,
     booking_division,in_ring_quality,match_craft,presentation,stamina,safety,
     fatigue,wear,popularity,recognition,momentum)
     VALUES($1,$2,$2,'MEN',$3,80,74,88,96,12,8,65,70,73)`,
     [worldId,ids[i]!,70+i]);
    await tx.query(`INSERT INTO ppw_contracts
     (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)`,
     [worldId,"deal-"+ids[i],ids[i]!,promotionId]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
    VALUES($1,$2,$3,1,1,'SUBMITTED',3,'hall',80)`,
    [worldId,showId,promotionId]);
   const members=ids.map(personId=>({personId,contractId:"deal-"+personId}));
   const payload={matchType:"TAG",family:"TEAMS",participants:members,
    sides:[{sideId:"A",participants:members.slice(0,teamSize)},
      {sideId:"B",participants:members.slice(teamSize)}],
    scriptedWinnerSide:"B",intent:"COMPETITIVE",plannedFinish:"CLEAN_PIN",
    plannedLengthMinutes:22};
   await tx.query(`INSERT INTO ppw_card_slots
    (world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
    [worldId,showId,JSON.stringify(payload)]);
   await tx.query(`INSERT INTO ppw_working_chemistry
    (world_id,person_a_id,person_b_id,context,compatibility,familiarity,matches_together)
    VALUES($1,'member-0','member-1','TAG',9,40,8)`,[worldId]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',injury_rate_multiplier=0
    WHERE world_id=$1`,[worldId]);
   await tx.query(`INSERT INTO ppw_week_resource_clearances
    (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
    VALUES($1,1,1,1,1,'teams-fixture')`,[worldId]);
  });
  const scope={worldId,promotionId,showId};
  const adapted=await previewLegacyShowMatchStyles(db.pool,scope);
  assert.equal(adapted.matchCount,1);
  assert.equal(adapted.projections[0]!.status,"READY");
  if(!("teamSize" in adapted.projections[0]!))
   throw new Error("Missing full team readiness");
  assert.equal(adapted.projections[0]!.teamSize,teamSize);
  assert.equal(adapted.projections[0]!.performers.length,teamSize*2);
  const projection=await previewArchivedShowMatchScores(db.pool,scope);
  const result=projection.projections[0]!.tag?.result;
  assert.ok(result);
  assert.equal(result.members.length,teamSize*2);
  assert.equal(result.actualWinnerSide,"B");
  assert.equal(result.members.filter(p=>p.won).length,teamSize);
  const first=await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
   resolutionId:"resolve-teams"});
  assert.equal(first,"RECORDED");
  const replay=await resolveCanonicalShow(db.pool,{...scope,year:1,week:1,
   resolutionId:"resolve-teams"});
  assert.equal(replay,"IDENTICAL_RETRY");
  const evidence=await withWorldTransaction(db.pool,tx=>tx.query<{
   evidence_json:{booking:{family:string;sides:{sideId:string;participants:string[]}[]};
    resolution:{actualWinnerSide:string}}}>(`
    SELECT evidence_json FROM ppw_completed_match_evidence
     WHERE world_id=$1 AND show_id=$2`,[worldId,showId]));
  assert.equal(evidence.length,1);
  assert.equal(evidence[0]!.evidence_json.booking.family,"TEAMS");
  assert.equal(evidence[0]!.evidence_json.resolution.actualWinnerSide,"B");
  assert.deepEqual(evidence[0]!.evidence_json.booking.sides.map(x=>x.participants.length),
   [teamSize,teamSize]);
  const career=await withWorldTransaction(db.pool,tx=>tx.query<{
    person_id:string;won:boolean;performer_side:string;
    before_stats:{fatigue:number;momentum:number};
    after_stats:{fatigue:number;momentum:number}}>(`
   SELECT person_id,won,performer_side,before_stats,after_stats
   FROM ppw_tag_match_career_effects
   WHERE world_id=$1 ORDER BY person_id`,[worldId]));
  assert.equal(career.length,teamSize*2);
  assert.equal(new Set(career.map(x=>x.person_id)).size,teamSize*2);
  assert.equal(career.filter(x=>x.won).length,teamSize);
  assert.ok(career.every(x=>x.after_stats.fatigue>x.before_stats.fatigue));
  const persisted=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;fatigue:number;momentum:number}>(`
   SELECT person_id,fatigue,momentum FROM ppw_people
   WHERE world_id=$1 ORDER BY person_id`,[worldId]));
  assert.deepEqual(persisted.map(x=>x.fatigue),
   career.map(x=>x.after_stats.fatigue));
  assert.deepEqual(persisted.map(x=>x.momentum),
   career.map(x=>x.after_stats.momentum));
  const titles=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(`
   SELECT count(*)::text AS n FROM ppw_championship_contests WHERE world_id=$1`,
   [worldId]));
  assert.equal(titles[0]!.n,"0");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_tag_match_career_effects","ppw_ledger_events",
    "ppw_completed_match_evidence","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_working_chemistry",
    "ppw_week_resource_clearances","ppw_card_slots","ppw_booking_drafts",
    "ppw_contracts","ppw_people","ppw_venues","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
 });
}
