import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageTagPitches,settleBackstageTagFollowThrough}
 from "../src/db/backstage-tag-pitches.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage tag pitch uses verified chemistry and records authored booking follow-through",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="team-pitch-"+id,promotionId="promo-"+id,
  playerId="owner-"+id,outsiderId="other-"+id,
  a="a-"+id,b="b-"+id;
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 async function record(week:number){
  const showId="show-"+week+"-"+id,matchId="match-"+week+"-"+id;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,80,'{}'::jsonb,$6)",
    [worldId,promotionId,showId,week,"resolution-"+week+"-"+id,"f".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,80,'PIN','A')",
    [worldId,showId,matchId]);
   await tx.query("INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality) VALUES($1,$2,$3,$4,$5,$6,80)",
    [worldId,showId,matchId,a,b,week-1]);
  });
 }
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Tag proposal World",seed:43,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Company",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[worldId,playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale) VALUES($1,$2,'First Wrestler','MEN',50),($1,$3,'Second Wrestler','MEN',50)",[worldId,a,b]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,52)",
    [worldId,"a-deal-"+id,a,promotionId,"b-deal-"+id,b]);
   await tx.query("INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,professional_trust,familiarity) VALUES($1,$2,$3,70,40)",[worldId,a,b]);
  });
  await record(1);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTagPitches(tx,worldId,1))).newPitches,0);
  await record(2);
  await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]));
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTagPitches(tx,worldId,2))).newPitches,1);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTagPitches(tx,worldId,2))).newPitches,0);
  const scope={worldId,promotionId,playerId,personId:a};
  const before=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(before.conversations[0]!.kind,"TAG_TEAM_PITCH");
  assert.equal(before.conversations[0]!.relatedPersonId,b);
  assert.equal(before.conversations[0]!.verifiedTagShows,2);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{...scope,playerId:outsiderId}),/denied/);
  const reply=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "backstageDecision",{worldId,promotionId,showId:"unused",
    conversationId:before.conversations[0]!.conversationId,
    requestId:"reply-"+id,expectedRevision:0,decision:"EXPLORE_TEAM"});
  assert.equal((reply as {status:string}).status,"APPLIED");
  assert.equal((await read<{count:number}>("SELECT count(*)::integer AS count FROM ppw_tag_teams WHERE world_id=$1",[worldId]))[0]!.count,0);
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstageTagFollowThrough(tx,worldId,2))).followedThrough,0);
  await record(4);
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstageTagFollowThrough(tx,worldId,3))).followedThrough,1);
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstageTagFollowThrough(tx,worldId,3))).followedThrough,0);
  const after=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(after.status,"ANSWERED");
  assert.equal(after.followThroughWeekIndex,3);
  assert.equal(after.followThroughKind,"TAG_MATCH_BOOKED");
  assert.equal((await read<{count:number}>("SELECT count(*)::integer AS count FROM ppw_tag_teams WHERE world_id=$1",[worldId]))[0]!.count,0);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_ledger_events",
    "ppw_command_receipts","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[playerId,outsiderId]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
