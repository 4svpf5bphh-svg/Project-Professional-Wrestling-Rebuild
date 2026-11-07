import test from "node:test";
import assert from "node:assert/strict";
import {premiumScrumQuestions} from "../src/domain/premium-media-scrum.js";
import {publishablePressEditorial} from "../src/domain/premium-press-editorial.js";
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
 assert.match(refused[0]!.title,/Josh Robinson declines/);
 assert.match(refused[0]!.summary,/No comment/);
 assert.match(refused[1]!.summary,/unverified/);
 assert.equal(refused[1]!.certainty,"SPECULATION");
 const direct=publishablePressEditorial(premium,"Josh Robinson",new Map([["MAIN_EVENT",0]]));
 assert.match(direct[0]!.summary,/The audience saw it/);
 assert.doesNotMatch(direct[0]!.title,/declines/);
 const skipped=publishablePressEditorial(premium,"Josh Robinson",new Map([["BIG_PICTURE",1]]));
 assert.match(skipped[0]!.summary,/Some things worked/);
 assert.doesNotMatch(skipped[0]!.title,/declines|refuses/);
 assert.deepEqual(publishablePressEditorial(premium,"Josh Robinson",new Map()),[]);
 assert.deepEqual(publishablePressEditorial({...premium,bookingClass:"REGULAR"},
  "Josh Robinson",new Map([["MAIN_EVENT",2]])),[]);
});
