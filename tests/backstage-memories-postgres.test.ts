import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageMemories} from "../src/db/backstage-memories.js";
import {publishBackstageRequests} from "../src/db/backstage-conversations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("living wrestler memories are idempotent, real, promoter-private and alter conversation eligibility",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),db=postgresPool(url!,3);
 const worldId="living-memory-"+id,promotionId="mine-"+id,
  rivalId="rival-"+id,owner="owner-"+id,rival="rival-player-"+id,
  person="talent-"+id,broken="broken-"+id,character="character-"+id;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Private Wrestler Memory",seed:71,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Home Office",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Independent rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[owner,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,owner,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3),($1,$4,$5)",
    [worldId,owner,promotionId,rival,rivalId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,morale,momentum,recognition,booking_division) VALUES($1,$2,'Injured Veteran',70,60,60,'MEN')",
    [worldId,person]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$3,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
    [worldId,"mine-deal-"+id,person,promotionId,"rival-deal-"+id,rivalId]);
   await tx.query("INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,kind,created_week_index,status,decision,responded_week_index,due_week_index,assessment_reason,trust_delta) VALUES($1,$2,$3,$4,'MORALE',1,'BROKEN','PROMISE_APPEARANCE',1,3,'UNFULFILLED_COMMITMENT',-3)",
    [worldId,broken,promotionId,person]);
   await tx.query("INSERT INTO ppw_persona_change_requests(world_id,request_id,person_id,promotion_id,requested_gimmick_id,submitted_week_index,status,reason,assessed_resistance) VALUES($1,$2,$3,$4,'fresh-character',2,'DECLINED','CREATIVE_APPROVAL_WITHHELD',40)",
    [worldId,character,person,promotionId]);
   const show="injury-show-"+id;
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,7)",
    [worldId,show,promotionId]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,7,$4,65,'{}'::jsonb,$5)",
    [worldId,promotionId,show,"injury-resolution-"+id,"a".repeat(64)]);
   await tx.query("INSERT INTO ppw_medical_absences(world_id,person_id,show_id,match_id,injured_week_index,cleared_week_index,weeks_out,severity,status) VALUES($1,$2,$3,$4,6,10,4,'MODERATE','ACTIVE')",
    [worldId,person,show,"injury-match-"+id]);
   await tx.query("UPDATE ppw_worlds SET week=8 WHERE world_id=$1",[worldId]);
  });
  const projection=await withWorldTransaction(db.pool,tx=>publishBackstageMemories(tx,worldId,7));
  assert.equal(projection.remembered,3,"real missed promise, rejected persona and medical absence");
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageMemories(tx,worldId,7))).remembered,0,
   "publication retry creates no duplicate memories");
  const ours=await readPortablePersonaWorkspace(db.pool,{worldId,promotionId,playerId:owner,personId:person});
  assert.deepEqual(new Set(ours.memories.map(m=>m.kind)),
   new Set(["PROMISE_BROKEN","CHARACTER_DECLINED","MEDICAL_ABSENCE"]));
  const rivals=await readPortablePersonaWorkspace(db.pool,{worldId,promotionId:rivalId,playerId:rival,personId:person});
  assert.equal(rivals.memories.length,0,"another contracted employer learns no private conversations");
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   worldId,promotionId,playerId:rival,personId:person}),/access denied/);
  const created=await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,7));
  assert.equal(created.newMessages,1,"owner's active medical absence creates an authentic check-in");
  const updated=await readPortablePersonaWorkspace(db.pool,{worldId,promotionId,playerId:owner,personId:person});
  assert.equal(updated.conversations.at(-1)?.kind,"MEDICAL_SUPPORT");
  assert.equal(updated.conversations.at(-1)?.status,"PENDING");
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,7))).newMessages,0,
   "one request per promotion per World week");
  const unmodified=await withWorldTransaction(db.pool,tx=>tx.query<{status:string}>(
   "SELECT status FROM ppw_medical_absences WHERE world_id=$1 AND person_id=$2",
   [worldId,person]));
  assert.equal(unmodified[0]?.status,"ACTIVE","conversation cannot author medical clearance");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_memories","ppw_medical_absences",
    "ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_persona_change_requests",
    "ppw_completed_show_matches","ppw_completed_show_segments","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[owner,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
