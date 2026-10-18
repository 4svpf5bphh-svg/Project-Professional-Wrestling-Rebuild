import test from "node:test";
import assert from "node:assert/strict";
import {buildCreativeConcerns,creativeDecisionScore,creativeApprovalRequired,
 type CreativeContract} from "../src/domain/match-creative-consent.js";
const alice={personId:"alice",contractId:"c-alice"};
const bob={personId:"bob",contractId:"c-bob"};
const match=(finish="CLEAN_PIN",winner="A",opponent=bob)=>({
 matchType:"SINGLES",family:"INDIVIDUAL",
 sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[opponent]}],
 participants:[alice,opponent],scriptedWinnerSide:winner,
 plannedFinish:finish,intent:"COMPETITIVE",plannedLengthMinutes:18});
const terms=(personId:string,right:CreativeContract["creativeControl"],
 id="main"):CreativeContract=>({
 promotionId:"local",personId,contractId:id,name:personId,
 creativeControl:right,roleExpectation:"FEATURED",morale:65,fatigue:8,
 priorities:{loyalty:50,role:60}});
test("consultation is advisory; protected clean losses and full approval require agreement",()=>{
 const slots=[{slotId:"one",payload:match()}];
 const consultation=buildCreativeConcerns("show","local",slots,[
  terms("bob","CONSULTATION")]);
 assert.equal(consultation[0]!.reason,"CONSULTATION_REQUESTED");
 assert.equal(consultation[0]!.requiresConsent,false);
 assert.equal(creativeApprovalRequired(consultation).length,0);
 const protectedLoss=buildCreativeConcerns("show","local",slots,[
  terms("bob","PROTECTED_FINISHES")]);
 assert.equal(protectedLoss[0]!.reason,"PROTECTED_LOSS");
 assert.equal(creativeApprovalRequired(protectedLoss).length,1);
 assert.equal(buildCreativeConcerns("show","local",[
  {slotId:"one",payload:match("PROTECTED_FINISH")}],
  [terms("bob","PROTECTED_FINISHES")]).length,0);
 const full=buildCreativeConcerns("show","local",slots,[
  terms("alice","FULL_APPROVAL"),terms("bob","FULL_APPROVAL")]);
 assert.equal(full.length,2);
 assert.ok(full.every(x=>x.reason==="MATCH_APPROVAL"));
});
test("strongest overlapping right wins, and an old waiver never follows rewritten matches",()=>{
 const contracts=[terms("bob","CONSULTATION","weak"),
  terms("bob","FULL_APPROVAL","strong")];
 const base=buildCreativeConcerns("show","local",[
  {slotId:"one",payload:match()}],contracts);
 assert.equal(base.length,1);
 assert.equal(base[0]!.contractId,"strong");
 const receipt={showId:"show",slotId:"one",personId:"bob",
  contractId:"strong",signature:base[0]!.signature,decision:"APPROVED" as const};
 const approved=buildCreativeConcerns("show","local",[
  {slotId:"one",payload:match()}],contracts,[receipt]);
 assert.equal(creativeApprovalRequired(approved).length,0);
 for(const different of [
  match("SUBMISSION"),match("CLEAN_PIN","B"),
  {...match(),plannedLengthMinutes:24},
  {...match(),intent:"STORY"},
 ]){
  const changed=buildCreativeConcerns("show","local",[
   {slotId:"one",payload:different}],contracts,[receipt]);
  assert.equal(changed[0]!.decision,"NOT_REQUESTED");
  assert.equal(creativeApprovalRequired(changed).length,1);
 }
 const differentShow=buildCreativeConcerns("new-show","local",[
  {slotId:"one",payload:match()}],contracts,[receipt]);
 assert.equal(differentShow[0]!.decision,"NOT_REQUESTED");
});
test("approval score follows original morale, fatigue, role and loyalty tradeoffs",()=>{
 const p=terms("bob","PROTECTED_FINISHES");
 assert.ok(creativeDecisionScore(p,"MATCH_APPROVAL")>
  creativeDecisionScore(p,"PROTECTED_LOSS"));
 assert.throws(()=>creativeDecisionScore({...p,morale:null},"PROTECTED_LOSS"),
  /complete personnel record/);
});
