import test from "node:test";
import assert from "node:assert/strict";
import {originalDefaultWrestlerAlignment,effectiveWrestlerAlignment}
 from "../src/domain/original-alignment.js";

test("original main hash produces exact canonical Face/Heel/Tweener Genesis assignments",()=>{
 for(const [personId,expected] of [
  ["person-0001","HEEL"],["person-0042","TWEENER"],["person-0643","FACE"],
  ["w0","FACE"],["w2","HEEL"]
 ] as const)assert.equal(originalDefaultWrestlerAlignment(20261017,personId),expected);
 assert.equal(originalDefaultWrestlerAlignment("20261017","person-0001"),"HEEL");
});
test("explicit canonical and promotion-specific alignments override Genesis defaults",()=>{
 assert.equal(effectiveWrestlerAlignment(20261017,"person-0001","FACE",null),"FACE");
 assert.equal(effectiveWrestlerAlignment(20261017,"person-0001","FACE","TWEENER"),"TWEENER");
 assert.equal(effectiveWrestlerAlignment(20261017,"person-0001",null,null),"HEEL");
 assert.throws(()=>originalDefaultWrestlerAlignment(Number.NaN,"p"),/Invalid original/);
});
