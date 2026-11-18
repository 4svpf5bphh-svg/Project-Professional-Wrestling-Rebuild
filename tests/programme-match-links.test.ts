import test from "node:test";
import assert from "node:assert/strict";
import {inferProgrammeMatchLinks,validateProgrammeAngleLinks} from "../src/domain/programme-match-links.js";
const people=[
 {programmeId:"rivalry",personId:"a",side:"A" as const},
 {programmeId:"rivalry",personId:"b",side:"B" as const},
 {programmeId:"rivalry",personId:"c",side:"B" as const},
];
test("an original tag-style feud automatically recognises matching sides",()=>{
 assert.deepEqual(inferProgrammeMatchLinks([
  {slotId:"first",sideA:["a"],sideB:["b"]},
  {slotId:"second",sideA:["c","b"],sideB:["a"]},
  {slotId:"unrelated",sideA:["a"],sideB:["stranger"]},
 ],people),[
  {slotId:"first",programmeId:"rivalry"},
  {slotId:"second",programmeId:"rivalry"},
 ]);
});
test("the sim never guesses a programme from a one-sided or ambiguous match",()=>{
 assert.deepEqual(inferProgrammeMatchLinks([
  {slotId:"not-feud",sideA:["b"],sideB:["c"]},
 ],people),[]);
 assert.throws(()=>inferProgrammeMatchLinks([
  {slotId:"invalid",sideA:["a"],sideB:["a"]}],people));
});

test("programme angles require a cast member from the actual rivalry",()=>{
 assert.doesNotThrow(()=>validateProgrammeAngleLinks([
  {slotId:"solo-promo",programmeId:"rivalry",personIds:["a"]},
  {slotId:"attack",programmeId:"rivalry",personIds:["a","outsider"]},
 ],people));
 assert.throws(()=>validateProgrammeAngleLinks([
  {slotId:"wrong",programmeId:"rivalry",personIds:["outsider"]},
 ],people),/wrestler from the linked rivalry/);
 assert.throws(()=>validateProgrammeAngleLinks([
  {slotId:"missing",programmeId:"other-rivalry",personIds:["a"]},
 ],people),/wrestler from the linked rivalry/);
 assert.throws(()=>validateProgrammeAngleLinks([
  {slotId:"repeat",programmeId:"rivalry",personIds:["a"]},
  {slotId:"repeat",programmeId:"rivalry",personIds:["b"]},
 ],people),/repeated angle/);
});

test("non-rival matches link only by explicit booker choice and a real cast member",async()=>{
 const {validateNonRivalMatchLinks}=await import("../src/domain/programme-match-links.js");
 const actors=[
  {programmeId:"solo",personId:"a",side:"A" as const,programmeFormat:"SOLO" as const},
  {programmeId:"alliance",personId:"b",side:"A" as const,programmeFormat:"RELATIONSHIP" as const},
  {programmeId:"alliance",personId:"c",side:"A" as const,programmeFormat:"RELATIONSHIP" as const},
  ...people.map(x=>({...x,programmeFormat:"RIVALRY" as const}))
 ];
 const selected=[{slotId:"title-bout",programmeId:"solo",
  personIds:["a","champion"],tournament:false}];
 assert.deepEqual(validateNonRivalMatchLinks(selected,actors),
  [{slotId:"title-bout",programmeId:"solo"}]);
 assert.deepEqual(inferProgrammeMatchLinks([
  {slotId:"title-bout",sideA:["a"],sideB:["champion"]}
 ],actors),[],"No automatic story association from participation alone");
 assert.throws(()=>validateNonRivalMatchLinks([{
  slotId:"other",programmeId:"solo",personIds:["outsider","champion"],
  tournament:false}],actors),/wrestler from that story/);
 assert.throws(()=>validateNonRivalMatchLinks([{
  slotId:"old-rivalry",programmeId:"rivalry",personIds:["a","b"],
  tournament:false}],actors),/Only non-rival/);
 assert.throws(()=>validateNonRivalMatchLinks([{
  slotId:"tourney",programmeId:"solo",personIds:["a","champion"],
  tournament:true}],actors),/Tournament/);
});
