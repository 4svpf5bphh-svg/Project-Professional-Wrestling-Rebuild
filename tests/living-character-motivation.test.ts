import test from "node:test";
import assert from "node:assert/strict";
import {livingWrestlerMotivation} from "../src/domain/living-character-motivation.js";
const base={onRoster:true,status:"ACTIVE",careerStage:"PRIME",
 currentWeekIndex:40,momentum:66,morale:70,championships:[]};
test("a verified unresolved wrestler pitch outranks generic career form",()=>{
 const motivation=livingWrestlerMotivation({...base,
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:30}],
  requests:[{kind:"CREATIVE",status:"PENDING",createdWeekIndex:39}]});
 assert.equal(motivation?.kind,"CREATIVE");
 assert.equal(motivation?.next,"BACKSTAGE");
 assert.match(motivation!.reason,/not replied/i);
});
test("accepted mic-time promise stays a booking obligation without changing the card",()=>{
 const motivation=livingWrestlerMotivation({...base,
  requests:[{kind:"CREATIVE",status:"PROMISED",createdWeekIndex:38,
   dueWeekIndex:41,decision:"PROMISE_SEGMENT"}]});
 assert.equal(motivation?.kind,"PROMISE_PENDING");
 assert.match(motivation!.title,/promo or angle/);
 assert.match(motivation!.reason,/Y1 W42/);
 assert.equal(motivation?.source,"PROMISE");
 assert.equal(motivation?.next,"BOOKING");
});
test("a broken promise stays consequential until a later verified fulfilment",()=>{
 const memory=[{kind:"PROMISE_BROKEN",weekIndex:29}];
 assert.equal(livingWrestlerMotivation({...base,memories:memory})?.kind,"PROMISE_BROKEN");
 assert.notEqual(livingWrestlerMotivation({...base,memories:[...memory,
  {kind:"PROMISE_KEPT",weekIndex:35}]})?.kind,"PROMISE_BROKEN");
 assert.notEqual(livingWrestlerMotivation({...base,currentWeekIndex:75,
  memories:memory})?.kind,"PROMISE_BROKEN");
});
test("a title chance matters, but a later win or live championship supersedes it",()=>{
 assert.equal(livingWrestlerMotivation({...base,
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:32}]})?.kind,"TITLE_CHALLENGE");
 assert.notEqual(livingWrestlerMotivation({...base,memories:[
  {kind:"TITLE_CHALLENGE",weekIndex:32},{kind:"TITLE_WON",weekIndex:33}
 ]})?.kind,"TITLE_CHALLENGE");
 assert.equal(livingWrestlerMotivation({...base,championships:["World Title"],
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:32}]})?.kind,"CHAMPION");
});
test("career stages vary, but never invent contracts or outcomes",()=>{
 for(const [stage,kind] of [["PROSPECT","PROSPECT"],["PRIME","PRIME"],
  ["VETERAN","VETERAN"],["SPECIAL_ATTRACTION","SPECIAL_ATTRACTION"]] as const)
  assert.equal(livingWrestlerMotivation({...base,careerStage:stage})?.kind,kind);
 assert.equal(livingWrestlerMotivation({...base,momentum:9})?.kind,"LOW_MOMENTUM");
 assert.equal(livingWrestlerMotivation({...base,morale:12})?.kind,"LOW_MORALE");
});
test("private directions are unavailable for non-roster or retired wrestlers",()=>{
 assert.equal(livingWrestlerMotivation({...base,onRoster:false,
  requests:[{kind:"CREATIVE",status:"PENDING",createdWeekIndex:40}]}),null);
 assert.equal(livingWrestlerMotivation({...base,status:"RETIRED"}),null);
 assert.equal(livingWrestlerMotivation({...base,status:"INJURED",
  requests:[{kind:"TITLE_AMBITION",status:"PENDING",createdWeekIndex:40}]})?.kind,
  "RECOVERY");
 assert.equal(livingWrestlerMotivation({...base,currentWeekIndex:-1}),null);
});
