import test from "node:test";
import assert from "node:assert/strict";
import {BACKSTAGE_CHOICES,backstageDecisionEffect,backstageMessage,backstageReply,backstageManagerReply}
 from "../src/domain/backstage-conversations.js";
test("wrestler-initiated requests have constrained authored replies",()=>{
 for(const kind of ["CONTRACT","MORALE","MOMENTUM","CREATIVE","PARTNERSHIP","ROLE_USAGE","GIMMICK_PITCH","TAG_TEAM_PITCH","RIVALRY_PITCH","TEAM_MOMENT"] as const){
  assert.ok(backstageMessage(kind).length>20);
  if(!["GIMMICK_PITCH","TAG_TEAM_PITCH","RIVALRY_PITCH","TEAM_MOMENT"].includes(kind))
   assert.ok(BACKSTAGE_CHOICES[kind].includes("DECLINE"));
  if(!["GIMMICK_PITCH","TAG_TEAM_PITCH","RIVALRY_PITCH","TEAM_MOMENT"].includes(kind))
   assert.ok(BACKSTAGE_CHOICES[kind].includes("TALK"));
  for(const decision of BACKSTAGE_CHOICES[kind])
   assert.ok(["ANSWERED","DECLINED","PROMISED"].includes(
    backstageDecisionEffect(kind,decision).status));
 }
 assert.throws(()=>backstageDecisionEffect("CONTRACT","MEDIATE"),/does not offer/);
 assert.deepEqual(BACKSTAGE_CHOICES.TAG_TEAM_PITCH,["EXPLORE_TEAM","NOT_NOW"]);
 assert.equal(backstageDecisionEffect("TAG_TEAM_PITCH","EXPLORE_TEAM").moraleDelta,0);
 assert.equal(backstageDecisionEffect("TAG_TEAM_PITCH","NOT_NOW").status,"DECLINED");
 assert.match(backstageMessage("TAG_TEAM_PITCH",{partnerName:"Partner",verifiedTagShows:2}),/Partner/);
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
 assert.match(backstageMessage("RIVALRY_PITCH",
  {partnerName:"Rival",verifiedSinglesShows:3,averageCrowd:84}),
  /Rival.*rivalry/);
 assert.equal(backstageDecisionEffect("RIVALRY_PITCH","EXPLORE_RIVALRY").status,"ANSWERED");
 assert.throws(()=>backstageDecisionEffect("RIVALRY_PITCH","PROMISE_SEGMENT"),/does not offer/);
 assert.match(backstageMessage("GIMMICK_PITCH",{observedMatchShows:4,averageCrowd:48}),
  /crowd response.*different character/);
 assert.equal(backstageDecisionEffect("GIMMICK_PITCH","KEEP_CHARACTER").status,"DECLINED");
 assert.match(backstageReply("PROMISE_APPEARANCE","FULFILLED"),/kept your word/);
 assert.deepEqual(BACKSTAGE_CHOICES.TEAM_MOMENT,[]);
 assert.match(backstageMessage("TEAM_MOMENT",{partnerName:"Partner"}),/Partner/);
});

test("manager SMS reflects the subject but never grants a new gameplay promise",()=>{
 const contract=backstageManagerReply("TALK","CONTRACT");
 const injury=backstageManagerReply("TALK","MEDICAL_SUPPORT");
 const title=backstageManagerReply("TALK","TITLE_AMBITION");
 const trust=backstageManagerReply("TALK","TRUST_CHECK_IN");
 assert.match(contract,/deal|signed/);
 assert.match(injury,/recovery|health|ring/);
 assert.match(title,/title shot/);
 assert.match(trust,/promise/);
 assert.equal(new Set([contract,injury,title,trust]).size,4);
 assert.match(backstageManagerReply("DECLINE","TITLE_AMBITION"),/title shot/);
 assert.match(backstageManagerReply("PROMISE_APPEARANCE","BOOKING_OMISSION"),/two weeks/);
 assert.match(backstageManagerReply("TALK"),/got my attention/);
 assert.deepEqual(backstageDecisionEffect("CONTRACT","TALK"),{
  moraleDelta:0,promise:false,status:"ANSWERED"});
});
test("career-sensitive wrestler ambitions are frozen to their original stage",()=>{
 const message=(stage:"PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION")=>
  backstageMessage("BOOKING_OMISSION",{careerStage:stage},"career-voice-1");
 const young=message("PROSPECT"),veteran=message("VETERAN");
 assert.notEqual(young,veteran);
 assert.match(young,/learn|prove|young|spot|ring time/i);
 assert.match(veteran,/been around|experience|veteran|spotlight|offer|place/i);
 assert.equal(young,message("PROSPECT"));
 assert.equal(veteran,message("VETERAN"));
 const title=backstageMessage("TITLE_AMBITION",
  {careerStage:"VETERAN",relevantTitle:"Intercontinental Title"},"career-title");
 assert.match(title,/Intercontinental Title/);
 assert.doesNotMatch(title,/\/100|booking score|simulat/i);
 assert.match(backstageMessage("BOOKING_OMISSION",undefined,"old-request"),
  /appeared|cards|booked|place/);
});
test("phase 3 private request voices are deterministic, factual and varied",()=>{
 const voices=new Set<string>();
 for(const kind of ["MEDICAL_SUPPORT","BOOKING_OMISSION","LOSS_STREAK",
  "TITLE_AMBITION","TRUST_CHECK_IN"] as const){
  for(const decision of BACKSTAGE_CHOICES[kind])
   assert.ok(["ANSWERED","DECLINED","PROMISED"].includes(
    backstageDecisionEffect(kind,decision).status));
  assert.ok(backstageMessage(kind,{relevantTitle:"Women's World Championship"},"saved-message-1").length>20);
  for(let n=0;n<15;n++){
   const message=backstageMessage(kind,{relevantTitle:"Women's World Championship"},"saved-message-"+n);
   assert.equal(message,backstageMessage(kind,{relevantTitle:"Women's World Championship"},"saved-message-"+n));
   assert.doesNotMatch(message,/\/100|execution modifier|booking score|game mechanic/i);
   voices.add(message);
  }
 }
 assert.ok(voices.size>=12,"multiple subjects and stable writing lenses");
 assert.match(backstageMessage("TITLE_AMBITION",{relevantTitle:"World Title"},"title-1"),/World Title|championship|title match/i);
 assert.throws(()=>backstageDecisionEffect("TITLE_AMBITION","PROMISE_FEATURED"),/does not offer/);
 assert.throws(()=>backstageDecisionEffect("MEDICAL_SUPPORT","PROMISE_APPEARANCE"),/does not offer/);
});
