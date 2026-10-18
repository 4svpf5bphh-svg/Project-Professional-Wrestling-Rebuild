import {test} from "node:test";
import {strict as assert} from "node:assert";
import {normalizeBookedSegment} from "../src/domain/segment-booking.js";
import type {SegmentCreativeBeat} from "../src/domain/segment-creative-beats.js";
const known=new Set(["a","b","c"]);
const make=(kind:"ATTACK"|"TURN"|"CONTRACT_SIGNING"|"INTERFERENCE"|"DEBUT"|"VIDEO_PACKAGE"|"STABLE_EXIT"|"STABLE_RECONCILIATION",actorIds:string[],targetIds:string[],extra:Record<string,unknown>={})=>({slotId:"slot",position:0,kind,actorIds,targetIds,outcome:"HAPPENS" as const,...extra});
test("attacks and interference require an explicit target",()=>{
 for(const kind of ["ATTACK","INTERFERENCE"] as const){
  assert.throws(()=>normalizeBookedSegment(make(kind,["a"],[]),known));
  assert.deepEqual(normalizeBookedSegment(make(kind,["a"],["b"]),known).targetIds,["b"]);
 }
});
test("contract signing needs two actors, not a victim",()=>{
 assert.throws(()=>normalizeBookedSegment(make("CONTRACT_SIGNING",["a"],[]),known));
 assert.throws(()=>normalizeBookedSegment(make("CONTRACT_SIGNING",["a","b"],["c"]),known));
 assert.equal(normalizeBookedSegment(make("CONTRACT_SIGNING",["a","b"],[]),known).kind,"CONTRACT_SIGNING");
});
test("debut and turn use one protagonist",()=>{
 assert.throws(()=>normalizeBookedSegment(make("DEBUT",["a","b"],[]),known));
 assert.throws(()=>normalizeBookedSegment(make("TURN",["a","b"],[]),known));
});
test("video subtype and stable reconciliation are explicit",()=>{
 assert.throws(()=>normalizeBookedSegment(make("VIDEO_PACKAGE",["a"],[]),known));
 assert.equal(normalizeBookedSegment(make("VIDEO_PACKAGE",["a"],[],{videoPurpose:"RETURN_HYPE"}),known).videoPurpose,"RETURN_HYPE");
 assert.throws(()=>normalizeBookedSegment(make("STABLE_RECONCILIATION",["a"],[]),known));
});
test("authored refusal is never changed by normalisation",()=>{
 assert.equal(normalizeBookedSegment({...make("ATTACK",["a"],["b"]),outcome:"REFUSED"},known).outcome,"REFUSED");
});

test("scripted deliveries reject forged values and mismatched segment types",()=>{
 const good=make("ATTACK",["a"],["b"],{creativeBeat:{
  kind:"ATTACK",presentation:"BEATDOWN",objective:"GENERATE_HEAT"}});
 assert.deepEqual(normalizeBookedSegment(good,known).creativeBeat,{
  kind:"ATTACK",presentation:"BEATDOWN",objective:"GENERATE_HEAT"});
 for(const bad of [
  {kind:"ATTACK",presentation:"INVISIBLE",objective:"GENERATE_HEAT"},
  {kind:"PROMO",purpose:"BOAST"},
  {kind:"ATTACK",presentation:"BEATDOWN"},
  {kind:"ATTACK",presentation:"BEATDOWN",objective:"GENERATE_HEAT",extra:"not allowed"}
 ])assert.throws(()=>normalizeBookedSegment({...good,creativeBeat:bad as unknown as SegmentCreativeBeat},known));
});
