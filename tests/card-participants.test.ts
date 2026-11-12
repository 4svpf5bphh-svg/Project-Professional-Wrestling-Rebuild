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

test("pre-recorded videos do not cost contracted live dates",()=>{
 const video={kind:"VIDEO_PACKAGE",participants:[{personId:"a",contractId:"ca"}]};
 assert.deepEqual(appearancesFromSlots([video]),[]);
 assert.deepEqual(uniqueShowAppearances(appearancesFromSlots([
  video,{kind:"MATCH",participants:[{personId:"a",contractId:"ca"}]},
  {kind:"PROMO",participants:[{personId:"b",contractId:"cb"}]}
 ])),[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}]);
});

test("mentioning a rival carries no fee until they appear",()=>{
 const actor={personId:"joe",contractId:"joe-deal"},target={personId:"mistico",contractId:"mistico-deal"};
 for(const kind of ["PROMO","INTERVIEW","CHALLENGE"]){
  const speech={kind,actorIds:["joe"],targetIds:["mistico"],participants:[actor,target]};
  assert.deepEqual(appearancesFromSlots([speech]),[actor]);
  assert.deepEqual(appearancesFromSlots([{...speech,targetPresence:"ON_SCREEN"}]),[actor,target]);
 }
 const attack={kind:"ATTACK",actorIds:["joe"],targetIds:["mistico"],participants:[actor,target]};
 assert.deepEqual(appearancesFromSlots([attack]),[actor,target]);
 assert.deepEqual(uniqueShowAppearances(appearancesFromSlots([
  {kind:"PROMO",actorIds:["joe"],targetIds:["mistico"],participants:[actor,target]},attack])),
  [actor,target],"An eventual physical appearance must be paid only once");
});
