import assert from "node:assert/strict";
import test from "node:test";
import { withWorldTransaction, type TransactionPool } from "../src/db/transaction.js";

function fixture(failOn?: string) {
  const calls: string[] = [];
  let releases = 0;
  const pool: TransactionPool = {
    async connect() {
      return {
        async query<T extends Record<string, unknown>>(sql: string) {
          calls.push(sql);
          if (sql === failOn) throw new Error("database failure");
          return [] as T[];
        },
        release() { releases++; },
      };
    },
  };
  return { pool, calls, releases: () => releases };
}

test("success commits on one connection and releases it", async () => {
  const f = fixture();
  const result = await withWorldTransaction(f.pool, async tx => {
    await tx.query("UPDATE ppw_worlds SET revision=revision+1", []);
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(f.calls, ["BEGIN", "UPDATE ppw_worlds SET revision=revision+1", "COMMIT"]);
  assert.equal(f.releases(), 1);
});

test("failed work rolls back and releases connection", async () => {
  const f = fixture("BROKEN");
  await assert.rejects(withWorldTransaction(f.pool, async tx => {
    await tx.query("BROKEN", []);
  }), /database failure/);
  assert.deepEqual(f.calls, ["BEGIN", "BROKEN", "ROLLBACK"]);
  assert.equal(f.releases(), 1);
});

test("commit failure triggers rollback", async () => {
  const f = fixture("COMMIT");
  await assert.rejects(withWorldTransaction(f.pool, async () => 1), /database failure/);
  assert.deepEqual(f.calls, ["BEGIN", "COMMIT", "ROLLBACK"]);
  assert.equal(f.releases(), 1);
});

test("begin failure releases without rollback", async () => {
  const f = fixture("BEGIN");
  await assert.rejects(withWorldTransaction(f.pool, async () => 1), /database failure/);
  assert.deepEqual(f.calls, ["BEGIN"]);
  assert.equal(f.releases(), 1);
});
