import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld,addPromotion } from "../src/db/world-operations.js";
import { listTalentAvailability } from "../src/db/talent-availability.js";

const url=process.env.PPW_NEON_TEST_URL;
test("shared talent can have overlapping nonexclusive contracts but one exclusive contract",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="talent-"+id;
  const person="wrestler-"+id,first="a-"+id,second="b-"+id;
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Talent World",seed:2,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:first,name:"First",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:second,name:"Second",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES ($1,$2,$3)",[worldId,person,"Test Wrestler"]);
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES ($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',3,12),($1,$5,$3,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',2,14)",[worldId,"non-a-"+id,person,first,"non-b-"+id,second]);
    });
    let talent=await listTalentAvailability(db.pool,worldId);
    assert.equal(talent.length,1);
    assert.equal(talent[0]!.signedNonExclusiveContracts,2);
    assert.equal(talent[0]!.exclusiveToPromotionId,null);
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES ($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,20)",[worldId,"exclusive-"+id,person,first]);
    });
    talent=await listTalentAvailability(db.pool,worldId);
    assert.equal(talent[0]!.exclusiveToPromotionId,first);
    await assert.rejects(withWorldTransaction(db.pool,async tx=>{
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES ($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,20)",[worldId,"exclusive-other-"+id,person,second]);
    }),/duplicate key/);
    assert.equal((await listTalentAvailability(db.pool,worldId,"Test Wrestler",person)).length,0);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
