import test from "node:test";
import assert from "node:assert/strict";
import {finalizeResolvedShow,type FinalizedShowInput}
 from "../src/simulation/finalize-resolved-show.js";
const input:FinalizedShowInput={worldId:"w",promotionId:"p",showId:"s",
 year:1,week:1,resolutionId:"r",finalCrowdResponse:70,
 phase:"AUTHORITATIVE_RESOLVED",
 matches:[{matchId:"m",position:0,crowdResponse:80,
  plannedWinnerSide:"A",actualWinnerSide:"A",
  plannedFinish:"PIN",actualFinish:"PIN",
  injuryStoppage:false,medicalOverrideCertified:false}],
 segments:[{slotId:"a",position:1,kind:"TURN",
  bookedOutcome:"REFUSED",resolvedOutcome:"REFUSED",crowdResponse:60}]};
test("scripted match and refused angle remain authored",()=>{
 const result=finalizeResolvedShow(input);
 assert.equal(result.matches[0]!.actualWinnerSide,"A");
 assert.equal(result.segments[0]!.outcome,"REFUSED");
});
test("non-medical winner or finish rewrite is rejected",()=>{
 assert.throws(()=>finalizeResolvedShow({...input,matches:[{
  ...input.matches[0]!,actualWinnerSide:"B"}]}),/Uncertified/);
 assert.throws(()=>finalizeResolvedShow({...input,matches:[{
  ...input.matches[0]!,actualFinish:"DQ"}]}),/Uncertified/);
});
test("certified injury stoppage may override a scripted finish",()=>{
 const r=finalizeResolvedShow({...input,matches:[{...input.matches[0]!,
  actualWinnerSide:"B",actualFinish:"REFEREE_STOPPAGE",
  injuryStoppage:true,medicalOverrideCertified:true}]});
 assert.equal(r.matches[0]!.actualFinish,"REFEREE_STOPPAGE");
});
test("medical override must be explicitly certified",()=>{
 assert.throws(()=>finalizeResolvedShow({...input,matches:[{
  ...input.matches[0]!,injuryStoppage:true,actualWinnerSide:"B",
  medicalOverrideCertified:false}]}),/Uncertified/);
});
test("simulation cannot change a wrestler's authored segment refusal",()=>{
 assert.throws(()=>finalizeResolvedShow({...input,segments:[{
  ...input.segments[0]!,resolvedOutcome:"HAPPENS"}]}),/cannot rewrite/);
});
