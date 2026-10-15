import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld,addPromotion } from "../src/db/world-operations.js";
import { joinWorldAsActor,claimPromotionAsActor,overviewAsActor } from "../src/api/world-service.js";

const url=process.env.PPW_NEON_TEST_URL;
test("trusted actor identity owns join and promotion claim",{skip:!url?"No disposable database":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="actor-"+id,playerId="trusted-"+id,promotionId="promotion-"+id;
  const context={pool:db.pool,actor:{playerId}};
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Actor Fixture",seed:3,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promotionId,name:"Available",tier:"LOCAL"});
    });
    await joinWorldAsActor(context,{worldId,requestId:"join-"+id,expectedRevision:0});
    const result=await claimPromotionAsActor(context,{worldId,promotionId,requestId:"claim-"+id,expectedRevision:1});
    assert.equal(result.status,"APPLIED");
    assert.equal((await overviewAsActor(context,worldId))?.promotion?.id,promotionId);
    assert.equal((await overviewAsActor({pool:db.pool,actor:{playerId:"stranger-"+id}},worldId))?.promotion,null);
    await assert.rejects(joinWorldAsActor(context,{worldId,requestId:"",expectedRevision:2}),/Invalid request/);
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
