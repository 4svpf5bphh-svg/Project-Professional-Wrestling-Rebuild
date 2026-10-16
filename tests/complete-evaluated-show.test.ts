import test from "node:test";
import assert from "node:assert/strict";
import {completeEvaluatedShow,type EvaluatedShowInput}
 from "../src/simulation/complete-evaluated-show.js";
const input:EvaluatedShowInput={
 worldId:"w",promotionId:"p",showId:"s",year:1,week:1,resolutionId:"r",
 matches:[{matchId:"m",position:0,crowdResponse:80,weight:1,
  plannedWinnerSide:"A",actualWinnerSide:"A",
  plannedFinish:"CLEAN_PIN",actualFinish:"CLEAN_PIN",
  injuryStoppage:false,medicalOverrideCertified:false}],
 segments:[{slotId:"angle",position:1,kind:"TURN",
  bookedOutcome:"REFUSED",resolvedOutcome:"REFUSED",crowdResponse:60}],
};
test("weighted evaluated show produces validated receipt",()=>{
 const receipt=completeEvaluatedShow(input,{phase:"WORLD_RESOLVER_VERIFIED"});
 assert.equal(receipt.crowdResponse,72.1);
 assert.equal(receipt.matches[0]!.actualFinish,"CLEAN_PIN");
 assert.equal(receipt.segments[0]!.outcome,"REFUSED");
 assert.equal("weight" in receipt.matches[0]!,false);
});
test("unverified evaluation cannot be promoted to recorded facts",()=>{
 assert.throws(()=>completeEvaluatedShow(input,{
  phase:"PREVIEW" as "WORLD_RESOLVER_VERIFIED"}),/Unverified/);
});
test("booked winner and segment outcomes cannot be silently changed",()=>{
 assert.throws(()=>completeEvaluatedShow({...input,matches:[{
  ...input.matches[0]!,actualWinnerSide:"B"}]},
  {phase:"WORLD_RESOLVER_VERIFIED"}),/Uncertified/);
 assert.throws(()=>completeEvaluatedShow({...input,segments:[{
  ...input.segments[0]!,resolvedOutcome:"HAPPENS"}]},
  {phase:"WORLD_RESOLVER_VERIFIED"}),/Invalid/);
});
