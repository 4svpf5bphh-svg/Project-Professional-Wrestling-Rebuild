import test from "node:test";
import assert from "node:assert/strict";
import {BACKSTAGE_CHOICES,backstageDecisionEffect,backstageMessage,backstageReply}
 from "../src/domain/backstage-conversations.js";
test("wrestler-initiated requests have constrained authored replies",()=>{
 for(const kind of ["CONTRACT","MORALE","MOMENTUM","PARTNERSHIP"] as const){
  assert.ok(backstageMessage(kind).length>20);
  assert.ok(BACKSTAGE_CHOICES[kind].includes("DECLINE"));
  assert.ok(BACKSTAGE_CHOICES[kind].includes("TALK"));
  for(const decision of BACKSTAGE_CHOICES[kind])
   assert.ok(["ANSWERED","DECLINED","PROMISED"].includes(
    backstageDecisionEffect(kind,decision).status));
 }
 assert.throws(()=>backstageDecisionEffect("CONTRACT","MEDIATE"),/does not offer/);
 assert.throws(()=>backstageDecisionEffect("PARTNERSHIP","PROMISE_APPEARANCE"),/does not offer/);
 assert.deepEqual(backstageDecisionEffect("MORALE","PROMISE_APPEARANCE"),
  {moraleDelta:1,promise:true,status:"PROMISED"});
 assert.equal(backstageDecisionEffect("CONTRACT","DECLINE").moraleDelta,-4);
 assert.match(backstageReply("PROMISE_APPEARANCE","BROKEN"),/never booked/);
 assert.match(backstageReply("PROMISE_APPEARANCE","FULFILLED"),/kept your word/);
});
