import test from "node:test";
import assert from "node:assert/strict";
import {assessPlaytestPopulation,type PreviewPopulation}
 from "../src/db/playtest-preview-readiness.js";

const ready:PreviewPopulation={
 worldId:"original-new",year:1,week:1,phase:"OPEN",
 promotions:8,activePromotions:8,wrestlers:643,signedContracts:400,
 venues:16,markets:4,championships:16,availableTakeovers:2,
 controlledPromotions:0,humanManagers:0
};
test("a complete population with two claimable promotions can be previewed",()=>{
 assert.deepEqual(assessPlaytestPopulation(ready).issues,[]);
 assert.equal(assessPlaytestPopulation(ready).ready,true);
 const afterClaims={...ready,availableTakeovers:0,controlledPromotions:2,humanManagers:2};
 assert.equal(assessPlaytestPopulation(afterClaims).ready,true);
});
test("real eight-promotion World with locked claims is not falsely called playable",()=>{
 const x=assessPlaytestPopulation({...ready,availableTakeovers:0});
 assert.equal(x.ready,false);
 assert.match(x.issues.join(" "),/Fewer than two distinct promotions/);
 assert.equal(assessPlaytestPopulation({...ready,availableTakeovers:1,
  controlledPromotions:1,humanManagers:1}).ready,true);
});
test("a toy fixture cannot masquerade as a full-content player preview",()=>{
 const x=assessPlaytestPopulation({...ready,wrestlers:4,signedContracts:3,
  venues:1,markets:1,championships:0,phase:"LOCKED"});
 assert.equal(x.ready,false);
 assert.ok(x.issues.length>=5);
 assert.equal(assessPlaytestPopulation({...ready,controlledPromotions:2,
  humanManagers:1}).ready,false);
});
