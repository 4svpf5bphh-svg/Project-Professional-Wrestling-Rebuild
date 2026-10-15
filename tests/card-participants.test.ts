import assert from "node:assert/strict";
import test from "node:test";
import { appearancesFromSlots } from "../src/domain/card-participants.js";
import { uniqueShowAppearances } from "../src/domain/appearance-policy.js";

test("card slots produce unique wrestler appearances",()=>{
  const participants=appearancesFromSlots([
    {participants:[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}]},
    {participants:[{personId:"a",contractId:"ca"}]},
  ]);
  assert.deepEqual(uniqueShowAppearances(participants),[
    {personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"},
  ]);
});
test("malformed slots cannot silently waive appearance charges",()=>{
  assert.throws(()=>appearancesFromSlots([{wrestlers:["a"]}]),/missing participants/);
  assert.throws(()=>appearancesFromSlots([{participants:[{personId:"a"}]}]),/Invalid participant contract/);
});
