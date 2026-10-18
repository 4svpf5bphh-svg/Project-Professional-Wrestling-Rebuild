import assert from "node:assert/strict";
import test from "node:test";
import { uniqueShowAppearances } from "../src/domain/appearance-policy.js";
import {appearancesFromSlots} from "../src/domain/card-participants.js";
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

test("Run-in and angle by the same wrestler charge only once, and historic spots stay readable",()=>{
 const match={participants:[{personId:"alice",contractId:"ca"},{personId:"bob",contractId:"cb"}],
  interference:{personId:"outside",contractId:"co",aidedSide:"A",plannedOutcome:"SUCCESS"}};
 const angle={participants:[{personId:"outside",contractId:"co"}]};
 assert.deepEqual(uniqueShowAppearances(appearancesFromSlots([match,angle])),[
  {personId:"alice",contractId:"ca"},{personId:"bob",contractId:"cb"},
  {personId:"outside",contractId:"co"}]);
 assert.deepEqual(appearancesFromSlots([{participants:[],interference:{
  personId:"legacy",aidedSide:"A",plannedOutcome:"THWARTED"}}]),[]);
 assert.throws(()=>appearancesFromSlots([{participants:[],interference:{
  personId:"outside",contractId:"",aidedSide:"A",plannedOutcome:"SUCCESS"}}]),
  /Invalid booked interference/);
});
