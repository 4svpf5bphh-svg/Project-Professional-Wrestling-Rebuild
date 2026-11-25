import test from "node:test";
import assert from "node:assert/strict";
import {programmeResultSide,programmeResultSideForLayout} from "../src/domain/programme-match-winners.js";
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

test("solo road to a title credits actual opponent results but never invents a feud",()=>{
 const cast=[{programmeId:"solo",personId:"a",side:"A" as const}];
 const match={slotId:"title",sideA:["challenger"],sideB:["a"]};
 assert.equal(programmeResultSide(match,cast,"solo","A"),"B");
 assert.equal(programmeResultSide(match,cast,"solo","B"),"A");
 assert.equal(programmeResultSide(match,cast,"solo",null),null);
 assert.equal(programmeResultSide({slotId:"internal",sideA:["a"],sideB:["c"]},
  [...cast,{programmeId:"solo",personId:"c",side:"A" as const}],
  "solo","A"),null,"Faction members fighting each other have no imaginary opposing story side");
});

test("a solo story uses the certified winning side for triple threats, four-ways and battle royals",()=>{
 const cast=[{programmeId:"solo",personId:"hero",side:"A" as const}];
 for(const size of [3,4,6,30]){
  const sides=Array.from({length:size},(_,i)=>({sideId:i<26?String.fromCharCode(65+i):"A"+String.fromCharCode(65+i-26),
   participants:[{personId:i===size-1?"hero":"opponent-"+i}]}));
  const layout={slotId:"title",sides};
  assert.equal(programmeResultSideForLayout(layout,cast,"solo",sides[size-1]!.sideId),"A");
  for(const s of sides.slice(0,-1))
   assert.equal(programmeResultSideForLayout(layout,cast,"solo",s.sideId),"B");
  assert.equal(programmeResultSideForLayout(layout,cast,"solo",null),null);
  assert.throws(()=>programmeResultSideForLayout(layout,cast,"solo","ZZ"),/not a booked side/);
 }
});
test("multi-team stories credit one competing team, not an invented rival",()=>{
 const match={slotId:"tag",sides:[
  {sideId:"A",participants:[{personId:"a"},{personId:"b"}]},
  {sideId:"B",participants:[{personId:"c"},{personId:"d"}]},
  {sideId:"C",participants:[{personId:"e"},{personId:"f"}]},
 ]};
 const cast=["e","f"].map(personId=>({programmeId:"faction",personId,side:"A" as const}));
 assert.equal(programmeResultSideForLayout(match,cast,"faction","C"),"A");
 assert.equal(programmeResultSideForLayout(match,cast,"faction","A"),"B");
 assert.equal(programmeResultSideForLayout(match,[...cast,{programmeId:"faction",personId:"a",side:"A"}],"faction","C"),null);
 assert.throws(()=>programmeResultSideForLayout(match,members,"rivalry","A"),/Rivalry links require/);
});
