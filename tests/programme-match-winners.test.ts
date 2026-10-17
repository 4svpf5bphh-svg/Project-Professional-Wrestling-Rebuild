import test from "node:test";
import assert from "node:assert/strict";
import {programmeResultSide} from "../src/domain/programme-match-winners.js";
const members=[
 {programmeId:"rivalry",personId:"a",side:"A" as const},
 {programmeId:"rivalry",personId:"b",side:"B" as const},
 {programmeId:"rivalry",personId:"c",side:"B" as const},
];
test("reversed match sides still credit original rivalry side",()=>{
 const m={slotId:"m",sideA:["b","c"],sideB:["a"]};
 assert.equal(programmeResultSide(m,members,"rivalry","A"),"B");
 assert.equal(programmeResultSide(m,members,"rivalry","B"),"A");
 assert.equal(programmeResultSide(m,members,"rivalry",null),null);
});
test("an ambiguous match cannot fabricate a feud winner",()=>{
 assert.throws(()=>programmeResultSide({slotId:"m",sideA:["a"],sideB:["z"]},
  members,"rivalry","A"),/Ambiguous/);
});
