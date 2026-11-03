import test from "node:test";
import assert from "node:assert/strict";
import {projectPostShowScorecard} from "../src/ui/post-show-scorecard.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const match=(id:string,position:number,rating:number|null,crowd:number):ShowResultEntry=>({
 slotId:id,position,type:"MATCH",headline:"Match "+id,summary:"Official result",
 crowdResponse:crowd,outcome:"CLEAN_PIN",actorIds:[],targetIds:[],
 fallout:{...(rating===null?{}:{ratingStars:rating}),injuries:[],eliminations:[]}
});
const show=(entries:ShowResultEntry[]):CompletedShowView=>({
 showId:"show",year:1,week:5,crowdResponse:77,
 matchCount:entries.filter(e=>e.type==="MATCH").length,
 angleCount:entries.filter(e=>e.type==="SEGMENT").length,entries
});
test("post-show scorecard ranks certified match ratings and crowd scores separately",()=>{
 const entries=[match("first",0,3.25,94),match("second",1,4.5,55),
  match("third",2,2.75,83)];
 const result=projectPostShowScorecard(show(entries));
 assert.equal(result.bestMatch?.slotId,"second");
 assert.equal(result.bestMatch?.value,4.5);
 assert.equal(result.lowestRatedMatch?.slotId,"third");
 assert.equal(result.crowdPeak?.slotId,"first");
 assert.equal(result.crowdLow?.slotId,"second");
});
test("one rated bout does not become a fictitious weakest match",()=>{
 const entries=[match("single",0,4,91)];
 const result=projectPostShowScorecard(show(entries));
 assert.equal(result.bestMatch?.slotId,"single");
 assert.equal(result.lowestRatedMatch,null);
 assert.equal(result.crowdPeak,null);
 assert.equal(result.crowdLow,null);
});
test("undocumented match ratings remain absent and distinct injuries are counted once",()=>{
 const a=match("a",0,null,70),b=match("b",1,null,60);
 a.fallout!.injuries=[{personName:"Joe",severity:"MINOR",weeksOut:1,stoppage:false}];
 b.fallout!.injuries=[{personName:"Joe",severity:"MODERATE",weeksOut:3,stoppage:false}];
 b.fallout!.title={name:"World title",winnerName:"Omega",
  priorHolderName:"Joe",changed:true};
 const result=projectPostShowScorecard(show([a,b]));
 assert.equal(result.bestMatch,null);
 assert.equal(result.lowestRatedMatch,null);
 assert.deepEqual(result.medical,[{name:"Joe",weeksOut:3}]);
 assert.deepEqual(result.titleChanges,[{name:"World title",winner:"Omega"}]);
});
