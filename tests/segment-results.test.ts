import {test} from "node:test";
import {strict as assert} from "node:assert";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
import {describeAuthoredSegment,describeShowSegments} from "../src/domain/segment-results.js";
const names=new Map([["a","Wrestler A"],["b","Wrestler B"]]);
const people=[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}];
const segment=(kind:"ATTACK"|"STABLE_RECONCILIATION",outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED",position=0)=>
 buildBookedSegmentPayload({slotId:"slot-"+position,position,kind,actorIds:["a"],targetIds:["b"],outcome},people);
test("results preserve authored attack outcome",()=>{
 const happened=describeAuthoredSegment(segment("ATTACK","HAPPENS"),names);
 assert.match(happened.summary,/attacks Wrestler B/);
 const refused=describeAuthoredSegment(segment("ATTACK","REFUSED"),names);
 assert.equal(refused.outcome,"REFUSED");
 assert.match(refused.summary,/does not happen/);
 assert.doesNotMatch(refused.summary,/successfully/);
});
test("interrupted reconciliation does not assert a successful reunion",()=>{
 const result=describeAuthoredSegment(segment("STABLE_RECONCILIATION","INTERRUPTED"),names);
 assert.equal(result.outcome,"INTERRUPTED");
 assert.match(result.summary,/interrupted before completion/);
});
test("results use authored running order",()=>{
 const result=describeShowSegments([segment("ATTACK","HAPPENS",2),segment("ATTACK","REFUSED",1)],names);
 assert.deepEqual(result.map(x=>x.position),[1,2]);
});
test("duplicate slots are rejected",()=>{
 const item=segment("ATTACK","HAPPENS");
 assert.throws(()=>describeShowSegments([item,item],names));
});
