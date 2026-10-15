import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool, withSqlClient } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { addPromotion, createWorld } from "../src/db/world-operations.js";
import { joinWorld } from "../src/db/membership-operations.js";
import { submitPromotionClaim } from "../src/db/promotion-commands.js";

const url=process.env.PPW_NEON_TEST_URL;
test("join then claim is retry-safe, enforces one promotion per player", {skip:!url?"No disposable database":false}, async()=>{
  const db=postgresPool(url!,3), id=randomUUID(),worldId="claim-"+id;
  const playerId="player-"+id, first="first-"+id, second="second-"+id;
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Claim Fixture",seed:1,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:first,name:"First",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:second,name:"Second",tier:"LOCAL"});
    });
    const joined=await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+id,expectedRevision:0});
    assert.equal(joined.status,"APPLIED");
    const claim={worldId,playerId,promotionId:first,requestId:"claim-"+id,expectedRevision:1};
    const success=await submitPromotionClaim(db.pool,claim);
    assert.deepEqual(success,{status:"APPLIED",revision:2,result:{claimed:true}});
    assert.deepEqual(await submitPromotionClaim(db.pool,claim),{status:"REPLAYED",revision:2,result:{claimed:true}});
    const duplicate=await submitPromotionClaim(db.pool,{
      ...claim,promotionId:second,requestId:"claim-second-"+id,expectedRevision:2,
    });
    assert.deepEqual(duplicate,{status:"APPLIED",revision:3,result:{claimed:false,reason:"PLAYER_HAS_PROMOTION"}});
    const controls=await withSqlClient(db.pool,tx=>tx.query<{promotion_id:string}>(
      "SELECT promotion_id FROM ppw_promotion_controls WHERE world_id=$1 AND active=true",[worldId]));
    assert.deepEqual(controls.map(x=>x.promotion_id),[first]);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
