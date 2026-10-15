import assert from "node:assert/strict";
import test from "node:test";
import { addPromotion, claimPromotion, createWorld, type SqlRows } from "../src/db/world-operations.js";

test("world and promotion creation use only narrow inserts", async () => {
  const queries: string[] = [];
  const db: SqlRows = { async query<T extends Record<string, unknown>>(sql: string) {
    queries.push(sql);
    return [] as T[];
  }};
  await createWorld(db, { id: "world-a", name: "Genesis", seed: 123, rulesetVersion: "1" });
  await addPromotion(db, "world-a", { id: "promo-a", name: "Indies", tier: "LOCAL" });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.startsWith("INSERT INTO")));
});

test("claim requires active World membership and performs no write otherwise", async () => {
  const queries: string[] = [];
  const db: SqlRows = { async query<T extends Record<string, unknown>>(sql: string) {
    queries.push(sql);
    if (sql.includes("FOR UPDATE")) return [{ world_id: "w" }] as unknown as T[];
    return [] as T[];
  }};
  assert.deepEqual(await claimPromotion(db, "w", "p", "promo"), { claimed:false, reason:"NOT_MEMBER" });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.startsWith("SELECT")));
});

test("claim checks both player and promotion before writing", async () => {
  const queries: string[] = [];
  const db: SqlRows = { async query<T extends Record<string, unknown>>(sql: string) {
    queries.push(sql);
    if (sql.includes("FOR UPDATE")) return [{ world_id: "w" }] as unknown as T[];
    if (sql.includes("FROM ppw_memberships")) return [{ player_id: "p" }] as unknown as T[];
    if (sql.includes("FROM ppw_promotion_controls")) return [] as T[];
    if (sql.includes("RETURNING promotion_id")) return [{ promotion_id: "promo" }] as unknown as T[];
    return [] as T[];
  }};
  assert.deepEqual(await claimPromotion(db, "w", "p", "promo"), { claimed:true });
  assert.equal(queries.length, 4);
  assert.equal(queries.filter(query => query.startsWith("INSERT")).length, 1);
});
