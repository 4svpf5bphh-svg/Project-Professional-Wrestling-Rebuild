import test from "node:test";
import assert from "node:assert/strict";
import {hasConcurrentCardChange,type CardDraftSnapshot}
 from "../src/ui/card-draft-conflict.js";
const original:CardDraftSnapshot={
 slots:[{slotId:"bout",position:0,kind:"MATCH",payload:{
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN"}}],
 programmeLinks:[],ready:false,canEdit:true,venueId:"arena",day:5
};
test("another company's World revision does not mean this booking changed",()=>{
 const unchanged=structuredClone(original);
 assert.equal(hasConcurrentCardChange(original,unchanged),false);
});
test("a changed scripted winner, edited event logistics or prepared show is a real conflict",()=>{
 const edited={
  ...original,slots:[{...original.slots[0]!,
   payload:{scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN"}}]
 };
 assert.equal(hasConcurrentCardChange(original,edited),true);
 assert.equal(hasConcurrentCardChange(original,{...original,venueId:"rival-arena"}),true);
 assert.equal(hasConcurrentCardChange(original,{...original,day:6}),true);
 assert.equal(hasConcurrentCardChange(original,{...original,ready:true}),true);
 assert.equal(hasConcurrentCardChange(original,{...original,canEdit:false}),true);
 assert.equal(hasConcurrentCardChange(original,{...original,
  programmeLinks:[{slotId:"bout",programmeId:"new-rivalry"}]}),true);
});
