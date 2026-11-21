import {test} from "node:test";
import assert from "node:assert/strict";
import {describeProgrammeChapter} from "../src/ui/programme-chapter-summary.js";

test("actual solo story matches do not invent an opponent or a rival winner",()=>{
 const record={kind:"MATCH",weekIndex:28,winnerSide:"B" as const};
 for(const format of ["SOLO","RELATIONSHIP","FACTION"] as const){
  const story=describeProgrammeChapter(record,"The Undertaker","",format);
  assert.equal(story.headline,"In-ring chapter");
  assert.equal(story.detail,"Story-linked match completed");
  assert.doesNotMatch(JSON.stringify(story),/Side B|rivalry|opponent| vs /i);
 }
 const scene=describeProgrammeChapter({kind:"SEGMENT",weekIndex:28,
  segmentKind:"INTERVIEW"},"The Undertaker","","SOLO");
 assert.equal(scene.headline,"Interview");
 assert.equal(scene.kind,"ANGLE");
});
test("original rival result chronology retains the real recorded winner",()=>{
 const record={kind:"MATCH",weekIndex:28,winnerSide:"B" as const};
 const recap=describeProgrammeChapter(record,"The Undertaker","Kane");
 assert.equal(recap.headline,"Kane won");
 assert.equal(recap.detail,"Official rivalry match result");
});
