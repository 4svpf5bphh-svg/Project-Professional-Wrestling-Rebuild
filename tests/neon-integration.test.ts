import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool, withSqlClient } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { claimPromotion, createWorld, addPromotion } from "../src/db/world-operations.js";

/** Explicit opt-in: never point at production or the archived PPW database.
 * Set PPW_NEON_TEST_URL to the dedicated rebuild development branch URL.
 */
const url = process.env.PPW_NEON_TEST_URL;
test("two players racing for one promotion produce one winner", { skip: !url ? "PPW_NEON_TEST_URL not set" : false }, async () => {
  const pool = postgresPool(url!, 3);
  const id = randomUUID(), world = "concurrency-" + id;
  const p1 = "player-a-" + id, p2 = "player-b-" + id, promo = "promo-" + id;
  try {
    await withWorldTransaction(pool.pool, async db => {
      await createWorld(db, { id: world, name: "Concurrency Fixture", seed: 1, rulesetVersion: "test" });
      await addPromotion(db, world, { id: promo, name: "Test Promotion", tier: "LOCAL" });
      await db.query("INSERT INTO ppw_players(player_id) VALUES ($1),($2)", [p1,p2]);
      await db.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES ($1,$2,'ACTIVE'),($1,$3,'ACTIVE')", [world,p1,p2]);
    });
    const results = await Promise.all([
      withWorldTransaction(pool.pool, tx => claimPromotion(tx,world,p1,promo)),
      withWorldTransaction(pool.pool, tx => claimPromotion(tx,world,p2,promo)),
    ]);
    assert.equal(results.filter(r => r.claimed).length, 1);
    assert.equal(results.filter(r => r.reason === "PROMOTION_TAKEN").length, 1);
    const controls = await withSqlClient(pool.pool, db => db.query<{player_id:string}>(
      "SELECT player_id FROM ppw_promotion_controls WHERE world_id=$1 AND active=true", [world],
    ));
    assert.equal(controls.length, 1);
    assert.ok([p1,p2].includes(controls[0]!.player_id));
  } finally {
    await withWorldTransaction(pool.pool, async db => {
      await db.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1", [world]);
      await db.query("DELETE FROM ppw_memberships WHERE world_id=$1", [world]);
      await db.query("DELETE FROM ppw_promotions WHERE world_id=$1", [world]);
      await db.query("DELETE FROM ppw_players WHERE player_id IN ($1,$2)", [p1,p2]);
      await db.query("DELETE FROM ppw_worlds WHERE world_id=$1", [world]);
    }).finally(() => pool.close());
  }
});
