import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld,addPromotion } from "../src/db/world-operations.js";
import { joinWorld } from "../src/db/membership-operations.js";
import { submitPromotionClaim } from "../src/db/promotion-commands.js";
import { readRosterContracts } from "../src/db/roster-contracts.js";

const url=process.env.PPW_NEON_TEST_URL;
test("roster contracts enforce ownership and display booking eligibility",{skip:!url?"No disposable database":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="roster-"+id,playerId="owner-"+id;
  const promotionId="promotion-"+id,personId="person-"+id;
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Roster Fixture",seed:3,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promotionId,name:"Roster Promotion",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Roster Wrestler')",[worldId,personId]);
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',0,20)",[worldId,"contract-"+id,personId,promotionId]);
    });
    await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+id,expectedRevision:0});
    await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,requestId:"claim-"+id,expectedRevision:1});
    const roster=await readRosterContracts(db.pool,worldId,playerId,promotionId,10);
    assert.equal(roster.length,1);
    assert.equal(roster[0]!.availableForBooking,false);
    assert.equal(roster[0]!.reason,"NO_DATES");
    assert.equal((await readRosterContracts(db.pool,worldId,playerId,promotionId,21))[0]!.reason,"EXPIRED");
    await assert.rejects(readRosterContracts(db.pool,worldId,"stranger-"+id,promotionId,10),/access denied/);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
