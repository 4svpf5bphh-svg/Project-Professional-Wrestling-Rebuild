import assert from "node:assert/strict";
import test from "node:test";
import {planResourceRemediations} from "../src/domain/resource-remediation.js";
import type {ResourceClaim,ArbitrationOutcome} from "../src/domain/resource-arbitration.js";
const venue=(promotionId:string,day:number,id="main"):ResourceClaim=>({
  kind:"VENUE",promotionId,showId:promotionId,day,resourceId:id});
const wrestler=(promotionId:string,day:number,id="star"):ResourceClaim=>({
  kind:"WRESTLER",promotionId,showId:promotionId,day,resourceId:id,weeklyCapacity:2});
const loss=(kind:"VENUE"|"WRESTLER",denied="B",reason:"SAME_DAY"|"WEEKLY_CAPACITY"="SAME_DAY"):ArbitrationOutcome=>({
  kind,resourceId:kind==="VENUE"?"main":"star",day:3,reason,
  denied:{promotionId:denied,showId:denied},protected:[{promotionId:"A",showId:"A"}]});
test("venue conflict offers spare venue on same day and shifted show day, no card mutation",()=>{
  const claims=[venue("A",3),venue("B",3),wrestler("A",3,"a"),wrestler("B",3,"b")];
  const saved=JSON.stringify(claims);
  const plan=planResourceRemediations(claims,[loss("VENUE")],["main","spare"]);
  assert.deepEqual(plan.shows[0]!.choices[0],{kind:"CHANGE_VENUE",day:3,venueId:"spare"});
  assert.deepEqual(plan.shows[0]!.choices[1],{kind:"CHANGE_DAY",day:4,venueId:"main"});
  assert.equal(plan.shows[0]!.automaticallyApplied,false);
  assert.equal(JSON.stringify(claims),saved);
  assert.deepEqual(plan,planResourceRemediations([...claims].reverse(),[loss("VENUE")],["spare","main"]));
});
test("moving venue cannot resolve a wrestler collision on the same day",()=>{
  const claims=[venue("A",3),venue("B",3,"second"),wrestler("A",3),wrestler("B",3)];
  const plan=planResourceRemediations(claims,[loss("WRESTLER")],["main","second","spare"]);
  assert.ok(plan.shows[0]!.choices.every(c=>c.kind==="CHANGE_DAY"));
  assert.equal(plan.shows[0]!.choices[0]!.day,4);
});
test("weekly capacity requires deliberate creative rebooking",()=>{
  const claims=[venue("A",3),venue("B",4,"second"),wrestler("A",3),wrestler("B",4)];
  const plan=planResourceRemediations(claims,[loss("WRESTLER","B","WEEKLY_CAPACITY")],["main","second","spare"]);
  assert.equal(plan.shows[0]!.disposition,"CREATIVE_REBOOK_REQUIRED");
  assert.deepEqual(plan.shows[0]!.choices,[]);
});
test("all booked talent and venues are protected when suggesting days",()=>{
  const claims=[venue("A",3),venue("B",3),venue("C",4),
    wrestler("A",3,"x"),wrestler("B",3,"y"),wrestler("C",4,"y")];
  const plan=planResourceRemediations(claims,[loss("VENUE")],["main"]);
  assert.equal(plan.shows[0]!.choices.some(c=>c.day===4),false);
  assert.equal(plan.shows[0]!.choices[0]!.day,5);
});
test("unknown denied shows and duplicate show venues fail closed",()=>{
  assert.throws(()=>planResourceRemediations([venue("A",3)],[loss("VENUE","bogus")],["main"]),/unknown show/);
  assert.throws(()=>planResourceRemediations([venue("A",3),venue("A",3)],[],["main"]),/Duplicate/);
});
