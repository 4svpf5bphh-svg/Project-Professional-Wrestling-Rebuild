import assert from "node:assert/strict";
import test from "node:test";
import { MeasuredQuerySession } from "../src/db/query-meter.js";

test("query meter records real calls and encoded result sizes", async () => {
  const meter = new MeasuredQuerySession("home");
  const result = await meter.execute(async () => [{ id: "one" }, { id: "two" }]);
  assert.equal(result.length, 2);
  const sample = meter.assertBudget({ maxQueries: 1, maxResultBytes: 100 });
  assert.equal(sample.queryCount, 1);
  assert.equal(sample.resultRows, 2);
  assert.equal(sample.encodedResultBytes, Buffer.byteLength(JSON.stringify(result), "utf8"));
});

test("query meter enforces budgets", async () => {
  const meter = new MeasuredQuerySession("roster");
  await meter.execute(async () => [{ name: "wrestler" }]);
  assert.throws(() => meter.assertBudget({ maxQueries: 0, maxResultBytes: 100 }));
  assert.throws(() => meter.assertBudget({ maxQueries: 1, maxResultBytes: 1 }));
});

test("failed queries still count as attempted database operations", async () => {
  const meter = new MeasuredQuerySession("contract");
  await assert.rejects(meter.execute(async (): Promise<never[]> => {
    throw new Error("query failed");
  }));
  assert.equal(meter.sample().queryCount, 1);
});
