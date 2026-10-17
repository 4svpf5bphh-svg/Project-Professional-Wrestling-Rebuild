import test from "node:test";
import assert from "node:assert/strict";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
import {describeAuthoredSegment} from "../src/domain/segment-results.js";
import {authoredConsequenceIntents} from "../src/domain/segment-consequences.js";
const people=[
 {personId:"leader",contractId:"contract-l"},
 {personId:"prospect",contractId:"contract-p"}];
const author=(outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED")=>
 buildBookedSegmentPayload({slotId:"invitation",position:2,kind:"STABLE_INVITATION",
  actorIds:["leader"],targetIds:["prospect"],stableId:"world-faction",
  stableDecision:"ACCEPTED",
  outcome},people);
test("a complete invitation carries the faction and player-authored result to broadcast",()=>{
 const angle=author("HAPPENS");
 const news=describeAuthoredSegment(angle,new Map([
  ["leader","The Boss"],["prospect","The Rookie"]]));
 assert.equal(news.stableId,"world-faction");
 assert.equal(news.stableDecision,"ACCEPTED");
 assert.match(news.summary,/invites The Rookie/);
 assert.deepEqual(authoredConsequenceIntents(angle).map(x=>x.intent),
  ["STABLE_INVITATION_OCCURRED"]);
});
test("an interrupted or rejected invitation creates no roster intent",()=>{
 for(const outcome of ["REFUSED","INTERRUPTED"] as const){
  const angle=author(outcome);
  assert.deepEqual(authoredConsequenceIntents(angle),[]);
  assert.equal(describeAuthoredSegment(angle,new Map()).outcome,outcome);
 }
});
test("only stable angles can claim a stable identity",()=>{
 assert.throws(()=>buildBookedSegmentPayload({slotId:"bad",position:0,
  kind:"PROMO",actorIds:["leader"],targetIds:[],outcome:"HAPPENS",
  stableId:"world-faction"},[people[0]!]),/Invalid authored segment/);
});

test("a performed rejected faction offer is not backstage consent",()=>{
 const s=author("HAPPENS");
 const rejected={...s,stableDecision:"REJECTED" as const};
 const report=describeAuthoredSegment(rejected,new Map());
 assert.match(report.summary,/rejected/);
 assert.equal(report.stableDecision,"REJECTED");
});
