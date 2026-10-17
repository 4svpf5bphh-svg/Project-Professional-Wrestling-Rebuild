import {test} from "node:test";
import {strict as assert} from "node:assert";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
const actor={personId:"a",contractId:"ca"},target={personId:"b",contractId:"cb"};
const base={slotId:"s",position:0,kind:"ATTACK" as const,actorIds:["a"],targetIds:["b"],outcome:"HAPPENS" as const};
test("segment payload binds attacker and victim to contracted identities",()=>{
 const payload=buildBookedSegmentPayload(base,[actor,target]);
 assert.deepEqual(payload.participants,[actor,target]);
 assert.deepEqual(payload.actorIds,["a"]);
 assert.deepEqual(payload.targetIds,["b"]);
});
test("segment payload rejects missing, duplicate or unassigned identities",()=>{
 assert.throws(()=>buildBookedSegmentPayload(base,[actor]));
 assert.throws(()=>buildBookedSegmentPayload(base,[actor,target,target]));
 assert.throws(()=>buildBookedSegmentPayload(base,[actor,target,{personId:"c",contractId:"cc"}]));
});
test("scripted refusal survives the canonical segment payload",()=>{
 assert.equal(buildBookedSegmentPayload({...base,outcome:"REFUSED"},[actor,target]).outcome,"REFUSED");
});
