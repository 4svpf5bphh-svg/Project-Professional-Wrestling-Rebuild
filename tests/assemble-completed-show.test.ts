import test from "node:test";
import assert from "node:assert/strict";
import {assembleCompletedShowReceipt,type ResolvedShowFacts}
 from "../src/simulation/assemble-completed-show.js";
const facts:ResolvedShowFacts={worldId:"w",promotionId:"p",showId:"s",
 year:1,week:1,resolutionId:"resolution",phase:"AUTHORITATIVE_RESOLVED",
 finalCrowdResponse:77,
 matches:[{matchId:"m",position:0,crowdResponse:82,actualFinish:"PIN",
  actualWinnerSide:"B",phase:"FINAL_MATCH"}],
 segments:[{slotId:"a",position:1,kind:"TURN",outcome:"REFUSED",
  crowdResponse:69,phase:"FINAL_SEGMENT"}]};
test("only finalized server facts assemble to a durable receipt",()=>{
 const r=assembleCompletedShowReceipt(facts);
 assert.equal(r.matches[0]!.actualWinnerSide,"B");
 assert.equal(r.segments[0]!.outcome,"REFUSED");
 assert.equal("phase" in r.matches[0]!,false);
 assert.equal("phase" in r.segments[0]!,false);
});
test("provisional show and match outputs fail closed",()=>{
 assert.throws(()=>assembleCompletedShowReceipt({
  ...facts,phase:"PREVIEW" as ResolvedShowFacts["phase"]}),/Provisional/);
 assert.throws(()=>assembleCompletedShowReceipt({
  ...facts,matches:[{...facts.matches[0]!,
   phase:"PREVIEW" as "FINAL_MATCH"}]}),/Provisional/);
});
test("assembled receipt remains isolated from input mutations",()=>{
 const r=assembleCompletedShowReceipt(facts);
 assert.notEqual(r.matches[0],facts.matches[0]);
 assert.notEqual(r.segments[0],facts.segments[0]);
});
