import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool, withSqlClient } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld } from "../src/db/world-operations.js";
import { joinWorld } from "../src/db/membership-operations.js";

const url=process.env.PPW_NEON_TEST_URL;
test("late join is atomic, retry-safe and does not assign a promotion",{skip:!url?"No disposable database configured":false},async()=>{
  const db=postgresPool(url!,3), suffix=randomUUID(),worldId="join-"+suffix,playerId="joiner-"+suffix;
  try {
    await withWorldTransaction(db.pool,tx=>createWorld(tx,{id:worldId,name:"Late Join",seed:7,rulesetVersion:"test"}));
    const input={worldId,playerId,requestId:"join-"+suffix,expectedRevision:0};
    assert.deepEqual(await joinWorld(db.pool,input),{status:"APPLIED",revision:1,result:{joined:true}});
    assert.deepEqual(await joinWorld(db.pool,input),{status:"REPLAYED",revision:1,result:{joined:true}});
    const membership=await withSqlClient(db.pool,tx=>tx.query<{status:string}>(
      "SELECT status FROM ppw_memberships WHERE world_id=$1 AND player_id=$2",[worldId,playerId]));
    assert.equal(membership.length,1);
    assert.equal(membership[0]!.status,"ACTIVE");
    const claims=await withSqlClient(db.pool,tx=>tx.query(
      "SELECT promotion_id FROM ppw_promotion_controls WHERE world_id=$1",[worldId]));
    assert.equal(claims.length,0);
    assert.deepEqual(await joinWorld(db.pool,{...input,requestId:"join-again-"+suffix,expectedRevision:1}),
      {status:"APPLIED",revision:2,result:{joined:false}});
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
