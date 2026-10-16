import test from "node:test";
import assert from "node:assert/strict";
import {aggregateShowReactions} from "../src/simulation/aggregate-show-reactions.js";
const m={matchId:"m",position:0,crowdResponse:80,weight:1,
 plannedWinnerSide:"A" as const,actualWinnerSide:"A" as const,
 plannedFinish:"CLEAN_PIN",actualFinish:"CLEAN_PIN",
 injuryStoppage:false,medicalOverrideCertified:false};
const s={slotId:"s",position:1,kind:"TURN",crowdResponse:60,
 bookedOutcome:"REFUSED" as const,resolvedOutcome:"REFUSED" as const};
test("matches and authored segments contribute archived relative weights",()=>{
 const r=aggregateShowReactions([m],[s]);
 assert.equal(r.phase,"SHOW_AGGREGATION_PREVIEW");
 assert.equal(r.crowdResponse,72.1);
 assert.equal(r.segmentCount,1);
});
test("cross-type slot positions and ids cannot collide",()=>{
 assert.throws(()=>aggregateShowReactions([m],[{...s,position:0}]),/Invalid/);
 assert.throws(()=>aggregateShowReactions([m],[{...s,slotId:"m"}]),/Invalid/);
});
test("authored segment outcomes cannot be rewritten",()=>{
 assert.throws(()=>aggregateShowReactions([m],[{...s,resolvedOutcome:"HAPPENS"}]),/Invalid/);
});
test("empty and invalid scoring inputs fail closed",()=>{
 assert.throws(()=>aggregateShowReactions([],[]),/Empty/);
 assert.throws(()=>aggregateShowReactions([{...m,weight:0}],[]),/Invalid/);
});
