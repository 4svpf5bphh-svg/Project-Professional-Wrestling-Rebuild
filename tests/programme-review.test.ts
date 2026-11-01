import test from "node:test";
import assert from "node:assert/strict";
import {evaluateProgrammeReview} from "../src/domain/programme-review.js";
test("certified varied hot rivalry earns a strong review",()=>{
 const result=evaluateProgrammeReview({heat:93,repetition:25,matchCount:3,
  segmentCount:4,finaleCompleted:true,finaleCrowd:88});
 assert.ok(result.score>=82);
});
test("administrative closure does not earn a fictional payoff",()=>{
 const base={heat:78,repetition:16,matchCount:2,segmentCount:1,finaleCrowd:85};
 const closed=evaluateProgrammeReview({...base,finaleCompleted:false});
 const certified=evaluateProgrammeReview({...base,finaleCompleted:true});
 assert.ok(closed.score<certified.score);
 assert.match(closed.verdict,/without a certified/);
});
test("repeated chapters cannot increase grade indefinitely",()=>{
 const a=evaluateProgrammeReview({heat:66,repetition:20,matchCount:4,
  segmentCount:4,finaleCompleted:true,finaleCrowd:60});
 const b=evaluateProgrammeReview({heat:66,repetition:140,matchCount:4,
  segmentCount:4,finaleCompleted:true,finaleCrowd:60});
 assert.ok(b.score<a.score);
});
