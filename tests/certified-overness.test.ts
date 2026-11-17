import test from "node:test";
import assert from "node:assert/strict";
import {deriveCertifiedOvernessChanges} from "../src/domain/certified-overness.js";
const fight={slotId:"match",personIds:["a","b"],
 crowdResponse:82,ratingStars:4, winnerIds:["a"]};
const spoken={slotId:"promo",actorIds:["a"],targetIds:["c"],
 targetPresence:"MENTIONED" as const,crowdResponse:82,ratingStars:3.75};
test("Great wrestling, including a losing participant, gains overness independently of fame",()=>{
 const earned=deriveCertifiedOvernessChanges([fight],[spoken]);
 assert.deepEqual(earned.map(x=>x.personId),["a","b"],
  "Merely mentioned targets never get an appearance reward");
 assert.ok(earned[0]!.overnessDelta>earned[1]!.overnessDelta);
 assert.ok(earned[1]!.overnessDelta>0);
 assert.ok(earned[0]!.gimmickDelta>0);
 assert.deepEqual(deriveCertifiedOvernessChanges([fight],[spoken]),earned);
});
test("Poor crowd connection cools the gimmick; established names are not automatically safe",()=>{
 const bad=deriveCertifiedOvernessChanges([{
  ...fight,crowdResponse:20,ratingStars:1.5
 }],[{...spoken,crowdResponse:18,ratingStars:1.25}]);
 assert.ok(bad[0]!.overnessDelta<0);
 assert.ok(bad[0]!.gimmickDelta<0);
 assert.ok(bad[1]!.overnessDelta<0);
});
test("An on-camera target gets a smaller genuine reaction; an unseen target gets none",()=>{
 const mentioned=deriveCertifiedOvernessChanges([],[spoken]);
 const onCamera=deriveCertifiedOvernessChanges([],[{
  ...spoken,targetPresence:"ON_SCREEN"
 }]);
 assert.deepEqual(mentioned.map(p=>p.personId),["a"]);
 assert.deepEqual(onCamera.map(p=>p.personId),["a","c"]);
 assert.ok(onCamera[1]!.overnessDelta<onCamera[0]!.overnessDelta);
});
test("Repetitive angles cannot farm extreme gains or double-count one booked identity",()=>{
 const spots=Array.from({length:20},(_,i)=>({
  ...spoken,slotId:"segment-"+i,targetIds:[],crowdResponse:100,
  ratingStars:5
 }));
 const earned=deriveCertifiedOvernessChanges([] ,spots);
 assert.equal(earned.length,1);
 assert.ok(earned[0]!.overnessDelta<=3.5);
 assert.ok(earned[0]!.gimmickDelta<=3.5);
 assert.throws(()=>deriveCertifiedOvernessChanges([fight,fight],[]),/Invalid/);
 assert.throws(()=>deriveCertifiedOvernessChanges([],[{...spoken,
  targetIds:["a"]}]),/Invalid/);
});
