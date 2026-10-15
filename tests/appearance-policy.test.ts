import assert from "node:assert/strict";
import test from "node:test";
import { uniqueShowAppearances } from "../src/domain/appearance-policy.js";
test("multiple matches and segments cost only one date per wrestler per show",()=>{
  assert.deepEqual(uniqueShowAppearances([
    {personId:"a",contractId:"ca"},
    {personId:"b",contractId:"cb"},
    {personId:"a",contractId:"ca"},
  ]),[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}]);
});
test("ambiguous contract assignments are rejected before resolving",()=>{
  assert.throws(()=>uniqueShowAppearances([
    {personId:"a",contractId:"ca"},{personId:"a",contractId:"other"},
  ]),/Multiple contracts/);
});
