import test from "node:test";
import assert from "node:assert/strict";
import {validatePostMatchLinks} from "../src/domain/post-match-links.js";
const match={slotId:"bout",payload:{participants:[
 {personId:"victim",contractId:"v"},{personId:"opponent",contractId:"o"}]}};
const angle={slotId:"aftermath",payload:{
 kind:"POST_MATCH_ASSAULT",sourceMatchSlotId:"bout",
 actorIds:["attacker"],targetIds:["victim"],
 participants:[{personId:"attacker",contractId:"a"},{personId:"victim",contractId:"v"}]}};
test("the post-match assault is anchored to an actual earlier bout",()=>{
 assert.doesNotThrow(()=>validatePostMatchLinks([match],[angle],["bout","aftermath"]));
 for(const [matches,ordered] of [
  [[],["bout","aftermath"]],[ [match],["aftermath","bout"]],
  [[match],["aftermath"]]
 ] as const) assert.throws(()=>validatePostMatchLinks(matches,[angle],ordered),
  /must follow a match/);
 assert.throws(()=>validatePostMatchLinks([match],[{...angle,payload:{
  ...angle.payload,targetIds:["stranger"]}}],["bout","aftermath"]),
  /must have taken part/);
 assert.throws(()=>validatePostMatchLinks([match],[{...angle,payload:{
  ...angle.payload,sourceMatchSlotId:"other-promotion"}}],["bout","aftermath"]),
  /must follow a match/);
});
test("ordinary angles cannot smuggle an unrelated match reference",()=>{
 assert.throws(()=>validatePostMatchLinks([match],[{...angle,payload:{
  ...angle.payload,kind:"PROMO"}}],["bout","aftermath"]),/Only post-match/);
 assert.doesNotThrow(()=>validatePostMatchLinks([match],[{...angle,payload:{
  kind:"PROMO",actorIds:["attacker"],targetIds:[]}}],["bout","aftermath"]));
});
