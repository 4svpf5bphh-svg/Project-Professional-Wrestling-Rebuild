import test from "node:test";
import assert from "node:assert/strict";
import {CONTRACT_TERM_PRESETS,applyContractTermPreset,selectedContractTermPreset}
 from "../src/domain/contract-term-presets.js";

test("long, middle and short-term purchases are realistic, optional starting points",()=>{
 assert.deepEqual(CONTRACT_TERM_PRESETS.map(p=>[p.weeks,p.dates]),
  [[52,40],[26,20],[12,9]]);
 for(const kind of ["LONG","MID","SHORT"] as const){
  const terms=applyContractTermPreset("LIMITED_NON_EXCLUSIVE",kind);
  assert.equal(selectedContractTermPreset(terms.family,terms.weeks,terms.dates),kind);
  assert.ok(terms.dates<=terms.weeks);
 }
});
test("exclusive contracts remain unlimited while selected duration controls expiry",()=>{
 const plan=applyContractTermPreset("EXCLUSIVE","LONG");
 assert.deepEqual(plan,{family:"EXCLUSIVE",weeks:52,dates:52});
 assert.equal(selectedContractTermPreset("EXCLUSIVE",52,52),"LONG");
});
test("one-night star attraction remains distinct and does not limit custom dates",()=>{
 assert.deepEqual(applyContractTermPreset("EXCLUSIVE","ONE_NIGHT"),
  {family:"ONE_OFF",weeks:1,dates:1});
 assert.deepEqual(applyContractTermPreset("ONE_OFF","MID"),
  {family:"LIMITED_NON_EXCLUSIVE",weeks:26,dates:20});
 assert.equal(selectedContractTermPreset("LIMITED_NON_EXCLUSIVE",37,17),"CUSTOM");
});
