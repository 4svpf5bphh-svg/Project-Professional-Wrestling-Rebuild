import test from "node:test";
import assert from "node:assert/strict";
import {angleActionsFor,isAuthoredAngleSequence,angleSequenceRoles}
 from "../src/domain/angle-sequence.js";
import {addSegmentPerson,buildEditorSegment,newEditorSegment,restoreEditorSegment,
 liveSegmentPersonIds} from "../src/ui/card-segment-model.js";
import {describeAuthoredSegment} from "../src/domain/segment-results.js";
import {authoredConsequenceIntents} from "../src/domain/segment-consequences.js";
import {certifiedProgrammeBeatSignature}
 from "../src/domain/programme-beat-signature.js";

const named=new Map([["joe","Samoa Joe"],["riddle","Matt Riddle"]]);
const person=(id:string)=>({personId:id,contractId:id+"-signed"});
const book=(kind:"ATTACK"|"TURN"|"PROMO"="ATTACK")=>{
 let s=newEditorSegment("story-slot",kind);
 s=addSegmentPerson(s,"actors",person("joe"));
 s=addSegmentPerson(s,"targets",person("riddle"));
 return s;
};
test("an ordered scene survives signed card payload, reopens, and narrates in actual order",()=>{
 let s=book();
 s.programmeId="rivalry-1";
 s.scriptedActions=[
  {action:"SPEAK",by:"joe",to:"riddle",line:"You know why I'm here."},
  {action:"REPLY",by:"riddle",to:"joe",line:"Then try me."},
  {action:"ATTACK",by:"joe",to:"riddle"},
  {action:"FIGHT_BACK",by:"riddle",to:"joe"}
 ];
 const payload=buildEditorSegment(s);
 assert.deepEqual(payload.scriptedActions,s.scriptedActions);
 assert.equal(payload.participants.length,2);
 const reloaded=restoreEditorSegment("story-slot",payload);
 assert.deepEqual(reloaded.scriptedActions,s.scriptedActions);
 assert.deepEqual(buildEditorSegment(reloaded),payload);
 assert.equal(reloaded.programmeId,null);
 assert.equal(s.programmeId,"rivalry-1"); // a separate canonical Programme link
 const recap=describeAuthoredSegment(payload,named);
 assert.equal(recap.kind,"ATTACK");
 assert.match(recap.summary,/1\. Samoa Joe spoke/);
 assert.match(recap.summary,/2\. Matt Riddle answered/);
 assert.match(recap.summary,/3\. Samoa Joe attacked/);
 assert.match(recap.summary,/4\. Matt Riddle fought back/);
 assert.ok(recap.summary.indexOf("Samoa Joe spoke")<
  recap.summary.indexOf("Samoa Joe attacked"));
 assert.deepEqual(authoredConsequenceIntents(payload).map(x=>x.intent),
  ["ATTACK_OCCURRED"]);
});
test("sequence cannot invent cast, physical attendance or extra World effects",()=>{
 let s=book("PROMO");
 assert.equal(liveSegmentPersonIds(s).length,1);
 s.scriptedActions=[{action:"SPEAK",by:"joe",to:"riddle"}];
 assert.deepEqual(buildEditorSegment(s).scriptedActions,s.scriptedActions);
 s.scriptedActions=[{action:"ATTACK",by:"joe",to:"riddle"}];
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
 s.scriptedActions=[{action:"REPLY",by:"riddle",to:"joe"}];
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
 s.targetPresence="ON_SCREEN";
 assert.equal(liveSegmentPersonIds(s).length,2);
 s.scriptedActions=[{action:"REPLY",by:"riddle",to:"joe"}];
 assert.deepEqual(buildEditorSegment(s).scriptedActions,s.scriptedActions);
});
test("turns and saves belong to their existing canonical segment kind only",()=>{
 assert.equal(angleActionsFor("PROMO").includes("BETRAY"),false);
 assert.equal(angleActionsFor("TURN").includes("BETRAY"),true);
 assert.equal(angleActionsFor("RESCUE").includes("RESCUE"),true);
 let turn=book("TURN");
 turn.scriptedActions=[{action:"BETRAY",by:"joe",to:"riddle"},
  {action:"WALK_AWAY",by:"joe"}];
 const payload=buildEditorSegment(turn);
 assert.deepEqual(authoredConsequenceIntents(payload).map(x=>x.intent),
  ["TURN_OCCURRED"]);
 turn.outcome="REFUSED";
 assert.doesNotMatch(describeAuthoredSegment(buildEditorSegment(turn),named).summary,
  /Joe betrayed/);
});
test("malformed, ambiguous or oversized action data is rejected on canonical validation",()=>{
 const roles={kind:"ATTACK" as const,actorIds:["joe"],targetIds:["riddle"]};
 const valid=[{action:"ATTACK",by:"joe",to:"riddle"}];
 assert.ok(isAuthoredAngleSequence(valid,roles));
 for(const invalid of [
  [],Array(7).fill(valid[0]),
  [{action:"ATTACK",by:"intruder",to:"riddle"}],
  [{action:"ATTACK",by:"joe",to:"intruder"}],
  [{action:"ATTACK",by:"joe",to:"joe"}],
  [{action:"ATTACK",by:"joe"}],
  [{action:"WALK_AWAY",by:"joe",to:"riddle"}],
  [{action:"FAKE_WORLD_RESULT",by:"joe"}],
  [{action:"SPEAK",by:"joe",line:"x".repeat(161)}],
  [{action:"SPEAK",by:"joe",line:"\nscript"}],
  [{action:"ATTACK",by:"joe",to:"riddle",effect:"INJURE"}]
 ])assert.equal(isAuthoredAngleSequence(invalid,roles),false,JSON.stringify(invalid).slice(0,100));
 assert.deepEqual(angleSequenceRoles({kind:"PROMO",actorIds:["joe"],targetIds:["riddle"]}),
  {visible:["joe"],mentioned:["riddle"]});
});
test("only actual certified action order distinguishes rivalry repetition",()=>{
 const plain=book(),p=buildEditorSegment(plain);
 const signature=(payload:unknown)=>certifiedProgrammeBeatSignature({
  kind:"SEGMENT",personIds:["joe","riddle"],payload});
 const original=signature(p);
 const first={...p,scriptedActions:[{action:"SPEAK",by:"joe"},
  {action:"ATTACK",by:"joe",to:"riddle"}]};
 const repeated={...p,scriptedActions:[{action:"SPEAK",by:"joe"},
  {action:"ATTACK",by:"joe",to:"riddle",line:"No more games."}]};
 const changed={...p,scriptedActions:[{action:"ATTACK",by:"joe",to:"riddle"},
  {action:"SPEAK",by:"joe"}]};
 assert.notEqual(signature(first),original);
 assert.equal(signature(first),signature(repeated));
 assert.notEqual(signature(first),signature(changed));
 assert.equal(signature(p),original);
});
