import test from "node:test";
import assert from "node:assert/strict";
import {premiumScrumQuestions} from "../src/domain/premium-media-scrum.js";
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
