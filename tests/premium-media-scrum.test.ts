import test from "node:test";
import assert from "node:assert/strict";
import {premiumScrumQuestions} from "../src/domain/premium-media-scrum.js";
import {publishablePressEditorial,pressReplyMode} from "../src/domain/premium-press-editorial.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";
const premium:CompletedShowView={
 showId:"main",showName:"Crown's Big Night",year:1,week:4,
 bookingClass:"PREMIUM",crowdResponse:87,matchCount:2,angleCount:0,
 entries:[{
  slotId:"opening",position:0,type:"MATCH",headline:"Tag team clash opens the show",
  summary:"A certified tag contest",crowdResponse:82,outcome:"CLEAN_PIN",actorIds:[],targetIds:[]
 },{
  slotId:"final",position:1,type:"MATCH",headline:"Champion survives controversial finish",
  summary:"The official finish stands",crowdResponse:90,outcome:"FOREIGN_OBJECT",actorIds:[],targetIds:[]
 }]
};
test("post-PPV scrum uses real event headlines, no fake wrestlers or invented outcomes",()=>{
 const qs=premiumScrumQuestions(premium);
 assert.deepEqual(qs.map(q=>q.id),["MAIN_EVENT","BIG_PICTURE","NEXT_CHAPTER"]);
 assert.ok(qs[0]?.question.includes("Champion survives controversial finish"));
 assert.ok(qs[1]?.question.includes("Tag team clash opens the show"));
 assert.ok(qs.every(q=>q.answers.length===3));
 assert.ok(!qs.some(q=>/rating|score|simulat/i.test(q.question)));
 assert.deepEqual(premiumScrumQuestions({...premium,bookingClass:"REGULAR"}),[]);
 assert.equal(premiumScrumQuestions({...premium,entries:[]}).length,3);
});

test("Named PPV press stories distinguish saved answers, refusals and skipped questions",()=>{
 const refused=publishablePressEditorial(premium,"Josh Robinson",new Map([["MAIN_EVENT",2]]));
 assert.equal(refused.length,2);
 assert.match(refused[0]!.title,/Josh Robinson says no comment/);
 assert.match(refused[0]!.summary,/declined/);
 assert.match(refused[0]!.summary,/No comment/);
 assert.match(refused[1]!.summary,/reason has not been established/);
 assert.equal(refused[1]!.certainty,"SPECULATION");
 const direct=publishablePressEditorial(premium,"Josh Robinson",new Map([["MAIN_EVENT",0]]));
 assert.match(direct[0]!.summary,/The audience saw it/);
 assert.doesNotMatch(direct[0]!.title,/declines/);
 const skipped=publishablePressEditorial(premium,"Josh Robinson",new Map([["BIG_PICTURE",1]]));
 assert.match(skipped[0]!.summary,/Some things worked/);
 assert.doesNotMatch(skipped[0]!.title,/declines|refuses/);
 assert.deepEqual(publishablePressEditorial(premium,"Josh Robinson",new Map()),[],
  "No news before the manager attends and ends the session");
 const skipped=publishablePressEditorial(premium,"Josh Robinson",
  new Map(),{sessionEnded:true});
 assert.equal(skipped.length,2);
 assert.match(skipped[0]!.title,/ends the press conference without taking questions/);
 assert.match(skipped[0]!.summary,/without answering any of the three/);
 assert.equal(skipped[0]!.certainty,"CONFIRMED");
 assert.equal(skipped[1]!.certainty,"SPECULATION");
 assert.doesNotMatch(JSON.stringify(skipped),
  /"No comment\.|declined|refused|Josh Robinson:|said "/i,
  "Explicit silence isn't an invented quote or a recorded refusal");
 const partial=publishablePressEditorial(premium,"Josh Robinson",
  new Map([["BIG_PICTURE",1]]),{sessionEnded:true});
 assert.match(partial[0]!.summary,/2 remaining questions were left unanswered/);
 assert.match(partial[0]!.summary,/Some things worked, some things didn't/);
 assert.doesNotMatch(partial[0]!.summary,/No comment/);
 const full=publishablePressEditorial(premium,"Josh Robinson",new Map([
  ["MAIN_EVENT",0],["BIG_PICTURE",1],["NEXT_CHAPTER",1]]),{sessionEnded:true});
 assert.doesNotMatch(full[0]!.summary,/remaining question/);
 assert.deepEqual(publishablePressEditorial({...premium,bookingClass:"REGULAR"},
  "Josh Robinson",new Map([["MAIN_EVENT",2]])),[]);
});

 test("Saved press transcript distinguishes direct, evasive, decline and silence without new quotations",()=>{
  assert.equal(pressReplyMode("MAIN_EVENT",0),"DIRECT");
  assert.equal(pressReplyMode("MAIN_EVENT",1),"EVASIVE");
  assert.equal(pressReplyMode("MAIN_EVENT",2),"DECLINED");
  assert.equal(pressReplyMode("BIG_PICTURE",1),"DIRECT");
  assert.equal(pressReplyMode("BIG_PICTURE",2),"EVASIVE");
  assert.equal(pressReplyMode("NEXT_CHAPTER",1),"EVASIVE");
  assert.equal(pressReplyMode("MAIN_EVENT",9),null);
  const evasive=publishablePressEditorial(premium,"Josh Robinson",new Map([
   ["MAIN_EVENT",1],["NEXT_CHAPTER",1]
  ]));
  assert.equal(evasive.length,2);
  assert.match(evasive[0]!.title,/details close/);
  assert.match(evasive[0]!.summary,/behind closed doors/);
  assert.match(evasive[0]!.summary,/Nothing is being announced tonight/);
  assert.doesNotMatch(evasive[0]!.summary,/No comment/);
  assert.match(evasive[1]!.title,/kept details close/);
  assert.equal(evasive[0]!.certainty,"CONFIRMED");
  assert.equal(evasive[1]!.certainty,"SPECULATION");
  assert.doesNotMatch(evasive[1]!.summary,/secret contract|future match booked/i);
  const one=publishablePressEditorial(premium,"Josh Robinson",
   new Map([["BIG_PICTURE",0]]));
  assert.match(one[0]!.summary,/The wrestlers did the talking/);
  assert.doesNotMatch(one[0]!.summary,/No comment|next chapter/i);
  const noStatement=publishablePressEditorial(premium,"Josh Robinson",
   new Map([["NEXT_CHAPTER",7]]));
  assert.deepEqual(noStatement,[],
   "Out-of-range or unanswered questions cannot produce invented transcripts");
 });
