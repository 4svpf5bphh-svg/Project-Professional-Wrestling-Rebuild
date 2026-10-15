import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool, withSqlClient } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { applyWorldCommand } from "../src/db/world-commands.js";
import { createWorld, addPromotion } from "../src/db/world-operations.js";

const url = process.env.PPW_NEON_TEST_URL;
test("concurrent commands, retry receipts and failed-write rollback", {skip: !url ? "No disposable database configured" : false}, async () => {
  const db = postgresPool(url!, 3);
  const suffix = randomUUID();
  const worldId = "commands-" + suffix;
  const promotionId = "promo-" + suffix;
  const playerId = "player-" + suffix;
  try {
    await withWorldTransaction(db.pool, async tx => {
      await createWorld(tx, {id:worldId,name:"Commands Fixture",seed:1,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promotionId,name:"Fixture",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_players(player_id) VALUES ($1)",[playerId]);
      await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES ($1,$2,'ACTIVE')",[worldId,playerId]);
    });
    const command = (requestId:string) => ({
      worldId,playerId,requestId,commandType:"CASH_INCREMENT",expectedRevision:0,
      async execute(tx: import("../src/db/world-operations.js").SqlRows) {
        await tx.query("UPDATE ppw_promotions SET cash=cash+1 WHERE world_id=$1 AND promotion_id=$2",[worldId,promotionId]);
        return {ok:true};
      },
    });
    const a=command("a-"+suffix), b=command("b-"+suffix);
    const outcomes=await Promise.all([applyWorldCommand(db.pool,a),applyWorldCommand(db.pool,b)]);
    assert.equal(outcomes.filter(x=>x.status==="APPLIED").length,1);
    assert.equal(outcomes.filter(x=>x.status==="STALE").length,1);
    const winner=outcomes[0]!.status==="APPLIED" ? a : b;
    assert.equal((await applyWorldCommand(db.pool,winner)).status,"REPLAYED");
    await assert.rejects(applyWorldCommand(db.pool,{
      worldId,playerId,requestId:"failed-"+suffix,commandType:"FAIL",expectedRevision:1,
      async execute(tx) {
        await tx.query("UPDATE ppw_promotions SET cash=cash+50 WHERE world_id=$1 AND promotion_id=$2",[worldId,promotionId]);
        throw new Error("deliberate failure");
      },
    }),/deliberate failure/);
    const cash=await withSqlClient(db.pool,tx=>tx.query<{cash:string}>("SELECT cash FROM ppw_promotions WHERE world_id=$1 AND promotion_id=$2",[worldId,promotionId]));
    assert.equal(Number(cash[0]!.cash),1);
    const receipts=await withSqlClient(db.pool,tx=>tx.query<{request_id:string}>("SELECT request_id FROM ppw_command_receipts WHERE world_id=$1",[worldId]));
    assert.equal(receipts.length,1);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
