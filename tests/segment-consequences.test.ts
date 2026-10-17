import {test} from "node:test";
import {strict as assert} from "node:assert";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
import {authoredConsequenceIntents} from "../src/domain/segment-consequences.js";
const people=[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}];
const input=(outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED")=>buildBookedSegmentPayload({
 slotId:"s",position:0,kind:"STABLE_RECONCILIATION",actorIds:["a"],
 targetIds:["b"],outcome},people);
test("only authored successful segments emit consequence intents",()=>{
 assert.deepEqual(authoredConsequenceIntents(input("REFUSED")),[]);
 assert.deepEqual(authoredConsequenceIntents(input("INTERRUPTED")),[]);
 assert.deepEqual(authoredConsequenceIntents(input("HAPPENS")),[{
  slotId:"s",intent:"RECONCILIATION_OCCURRED",actorIds:["a"],targetIds:["b"]}]);
});
