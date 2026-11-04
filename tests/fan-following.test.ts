import test from "node:test";
import assert from "node:assert/strict";
import {estimateWrestlerFans,compactFanEstimate,wrestlerSpotlightTrait}
 from "../src/domain/fan-following.js";

test("estimated following tracks actual wrestler popularity, recognition and momentum",()=>{
 const unknown=estimateWrestlerFans(null,75,60);
 assert.equal(unknown,null);
 const novice=estimateWrestlerFans(30,20,20)!;
 const regional=estimateWrestlerFans(60,60,50)!;
 const global=estimateWrestlerFans(95,95,75)!;
 assert.ok(novice<regional&&regional<global);
 assert.ok(estimateWrestlerFans(60,60,75)!>regional);
 assert.equal(estimateWrestlerFans(110,110,120),
  estimateWrestlerFans(100,100,100));
 assert.equal(estimateWrestlerFans(60,60,50),regional);
 assert.match(compactFanEstimate(regional)!,/^~/);
 assert.equal(compactFanEstimate(null),null);
});
test("earned visual traits come only from existing attributes and never invent boosts",()=>{
 assert.equal(wrestlerSpotlightTrait({presentation:95,recognition:90}),"Superstar Look");
 assert.equal(wrestlerSpotlightTrait({matchCraft:94,inRingQuality:91}),"Technical Wizard");
 assert.equal(wrestlerSpotlightTrait({momentum:92,popularity:60}),"Rising Star");
 assert.equal(wrestlerSpotlightTrait({matchCraft:73,presentation:64}),null);
});
