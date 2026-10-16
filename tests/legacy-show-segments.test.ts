import test from "node:test";
import assert from "node:assert/strict";
import {validateAuthoredSegments,type AuthoredSegment} from "../src/simulation/legacy/show-segments.js";
const known=new Set(["a","b","c"]);
const attack:AuthoredSegment={slotId:"1",position:2,kind:"ATTACK",
 actorIds:["a"],targetIds:["b"],outcome:"HAPPENS"};
test("scripted attack outcome survives unchanged",()=>{
 assert.deepEqual(validateAuthoredSegments([attack],known)[0],attack);
 assert.equal(validateAuthoredSegments([{...attack,outcome:"REFUSED"}],known)[0]!.outcome,"REFUSED");
});
test("video packages require explicit subtype",()=>{
 assert.throws(()=>validateAuthoredSegments([{...attack,kind:"VIDEO_PACKAGE"}],known));
 assert.equal(validateAuthoredSegments([{...attack,kind:"VIDEO_PACKAGE",
  videoPurpose:"RETURN_HYPE"}],known)[0]!.videoPurpose,"RETURN_HYPE");
});
test("rejects ambiguous participants, invalid target, duplicate slot and position",()=>{
 assert.throws(()=>validateAuthoredSegments([{...attack,targetIds:["a"]}],known));
 assert.throws(()=>validateAuthoredSegments([{...attack,targetIds:["unknown"]}],known));
 assert.throws(()=>validateAuthoredSegments([attack,{...attack,position:3}],known));
 assert.throws(()=>validateAuthoredSegments([attack,{...attack,slotId:"2"}],known));
});
