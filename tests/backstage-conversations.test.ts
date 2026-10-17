import test from "node:test";
import assert from "node:assert/strict";
import {BACKSTAGE_CHOICES,backstageDecisionEffect,backstageMessage,backstageReply}
 from "../src/domain/backstage-conversations.js";
test("wrestler-initiated requests have constrained authored replies",()=>{
 for(const kind of ["CONTRACT","MORALE","MOMENTUM","CREATIVE","PARTNERSHIP","ROLE_USAGE","GIMMICK_PITCH"] as const){
  assert.ok(backstageMessage(kind).length>20);
  if(kind!=="GIMMICK_PITCH")
   assert.ok(BACKSTAGE_CHOICES[kind].includes("DECLINE"));
  if(kind!=="GIMMICK_PITCH")
   assert.ok(BACKSTAGE_CHOICES[kind].includes("TALK"));
  for(const decision of BACKSTAGE_CHOICES[kind])
   assert.ok(["ANSWERED","DECLINED","PROMISED"].includes(
    backstageDecisionEffect(kind,decision).status));
 }
 assert.throws(()=>backstageDecisionEffect("CONTRACT","MEDIATE"),/does not offer/);
 assert.throws(()=>backstageDecisionEffect("PARTNERSHIP","PROMISE_APPEARANCE"),/does not offer/);
 assert.deepEqual(backstageDecisionEffect("MORALE","PROMISE_APPEARANCE"),
  {moraleDelta:0,promise:true,status:"PROMISED"});
 assert.equal(backstageDecisionEffect("CONTRACT","DECLINE").moraleDelta,0);
 assert.match(backstageReply("PROMISE_APPEARANCE","BROKEN"),/didn't deliver/);
 assert.deepEqual(backstageDecisionEffect("ROLE_USAGE","PROMISE_FEATURED"),
  {moraleDelta:0,promise:true,status:"PROMISED"});
 assert.equal(backstageDecisionEffect("CONTRACT","TALK").moraleDelta,0);
 assert.equal(backstageDecisionEffect("PARTNERSHIP","MEDIATE").moraleDelta,0);
 assert.match(backstageReply("PROMISE_FEATURED","EXCUSED"),/couldn't reasonably/);
 assert.deepEqual(backstageDecisionEffect("CREATIVE","PROMISE_SEGMENT"),
  {moraleDelta:0,promise:true,status:"PROMISED"});
 assert.match(backstageMessage("CREATIVE"),/mic time/);
 assert.match(backstageMessage("GIMMICK_PITCH",{observedMatchShows:4,averageCrowd:48}),
  /4 matches.*48\/100/);
 assert.equal(backstageDecisionEffect("GIMMICK_PITCH","KEEP_CHARACTER").status,"DECLINED");
 assert.match(backstageReply("PROMISE_APPEARANCE","FULFILLED"),/kept your word/);
});
