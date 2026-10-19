import test from "node:test";
import assert from "node:assert/strict";
import {runningOrderBlocks,moveLinkedRunningOrder,attachPostMatchAngle,
 type LinkedRunningOrderAngle} from "../src/ui/card-running-order.js";
const assault=(source:string):LinkedRunningOrderAngle=>({
 slotId:"assault",kind:"POST_MATCH_ASSAULT",sourceMatchSlotId:source
});
test("match and adjacent post-match assault reorder as a single block in either direction",()=>{
 const links=[assault("main")];
 const original=["opening","main","assault","closing"];
 assert.deepEqual(runningOrderBlocks(original,links),
  [["opening"],["main","assault"],["closing"]]);
 assert.deepEqual(moveLinkedRunningOrder(original,"assault",-1,links),
  ["main","assault","opening","closing"]);
 assert.deepEqual(moveLinkedRunningOrder(original,"main",1,links),
  ["opening","closing","main","assault"]);
 assert.deepEqual(moveLinkedRunningOrder(original,"assault",1,links),
  ["opening","closing","main","assault"]);
 assert.deepEqual(moveLinkedRunningOrder(original,"opening",1,links),
  ["main","assault","opening","closing"]);
});
test("unlinked match or angle moves independently, respecting bounds",()=>{
 const order=["first","promo","last"];
 assert.deepEqual(moveLinkedRunningOrder(order,"promo",1,[]),
  ["first","last","promo"]);
 assert.deepEqual(moveLinkedRunningOrder(order,"last",-1,[]),
  ["first","last","promo"]);
 assert.equal(moveLinkedRunningOrder(order,"first",-1,[]),null);
 assert.equal(moveLinkedRunningOrder(order,"last",1,[]),null);
 assert.equal(moveLinkedRunningOrder(order,"unknown",1,[]),null);
});
test("nonadjacent older linked assaults cannot move ahead of their source",()=>{
 const old=["match","interview","assault","closing"];
 const links=[assault("match")];
 assert.deepEqual(moveLinkedRunningOrder(old,"assault",-1,links),
  ["match","assault","interview","closing"]);
 assert.deepEqual(moveLinkedRunningOrder(old,"match",1,links),
  ["interview","match","assault","closing"]);
 assert.equal(moveLinkedRunningOrder(["assault","match","closing"],
  "closing",-1,links),null,"An invalid historical link may not be made worse");
 assert.equal(moveLinkedRunningOrder(["match","assault"],
  "assault",-1,links),null);
});
test("moves never break multiple attached match/assault pairs",()=>{
 const order=["a","attackA","b","attackB","closing"];
 const links=[{slotId:"attackA",kind:"POST_MATCH_ASSAULT",sourceMatchSlotId:"a"},
  {slotId:"attackB",kind:"POST_MATCH_ASSAULT",sourceMatchSlotId:"b"}];
 assert.deepEqual(moveLinkedRunningOrder(order,"attackB",-1,links),
  ["b","attackB","a","attackA","closing"]);
 assert.deepEqual(moveLinkedRunningOrder(order,"a",1,links),
  ["b","attackB","a","attackA","closing"]);
 assert.equal(moveLinkedRunningOrder(order,"closing",1,links),null);
});

test("choosing a source match explicitly attaches an assault directly to its bout",()=>{
 const old=["opener","main","interview","assault","closing"];
 assert.deepEqual(attachPostMatchAngle(old,"assault","main"),
  ["opener","main","assault","interview","closing"]);
 assert.deepEqual(attachPostMatchAngle(["main","assault"],"assault","main"),
  ["main","assault"]);
 assert.deepEqual(attachPostMatchAngle(
  ["assault","interview","main","closing"],"assault","main"),
  ["interview","main","assault","closing"]);
 assert.equal(attachPostMatchAngle(old,"main","main"),null);
 assert.equal(attachPostMatchAngle(old,"assault","missing"),null);
 assert.equal(attachPostMatchAngle(old,"missing","main"),null);
});
