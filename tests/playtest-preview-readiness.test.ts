import test from "node:test";
import assert from "node:assert/strict";
import {assessPlaytestPopulation,type PreviewPopulation}
 from "../src/db/playtest-preview-readiness.js";

const ready:PreviewPopulation={
 worldId:"original-new",year:1,week:1,phase:"OPEN",
 promotions:13,activePromotions:13,wrestlers:643,signedContracts:400,
 venues:60,markets:20,championships:26,availableTakeovers:5,
 controlledPromotions:0,humanManagers:0,
 women:203,protectedRealPromotions:8,activeTagTeams:14,
 activePersonas:643,genesisImports:1,viableParentRosters:2
};
test("a complete population with two claimable promotions can be previewed",()=>{
 assert.deepEqual(assessPlaytestPopulation(ready).issues,[]);
 assert.equal(assessPlaytestPopulation(ready).ready,true);
 const afterClaims={...ready,availableTakeovers:3,controlledPromotions:2,humanManagers:2};
 assert.equal(assessPlaytestPopulation(afterClaims).ready,true);
});
test("authentic 13-promotion World with unavailable claims is not falsely called playable",()=>{
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

test("a synthetic 643-person World cannot bypass original-content preflight",()=>{
 const invalid=assessPlaytestPopulation({...ready,promotions:8,activePromotions:8,
  women:100,protectedRealPromotions:0,activeTagTeams:1,
  activePersonas:0,genesisImports:0});
 assert.equal(invalid.ready,false);
 assert.match(invalid.issues.join(" "),/promotion ecosystem/i);
 assert.match(invalid.issues.join(" "),/women's division/i);
 assert.match(invalid.issues.join(" "),/eight protected real/i);
 assert.match(invalid.issues.join(" "),/tag partnerships/i);
 assert.match(invalid.issues.join(" "),/wrestler-owned moves/i);
 assert.match(invalid.issues.join(" "),/verified original Genesis/i);
});

test("preview blocks missing WWE/NXT and AEW/ROH signed roster lineage before World Lock",()=>{
 const broken=assessPlaytestPopulation({...ready,viableParentRosters:1});
 assert.equal(broken.ready,false);
 assert.match(broken.issues.join(" "),/Original parent-company NXT\/ROH/);
});
