import test from "node:test";
import assert from "node:assert/strict";
import {verifiedCareerForm} from "../src/domain/verified-career-form.js";
const match=(week:number,won:boolean,stars:number|null)=>({
 year:1,week,won,stars,format:"SINGLES" as const
});
test("recent wins and losses are exact certified facts, not separate game statistics",()=>{
 const rows=[
  match(10,true,4.5),match(9,true,4.3),match(8,false,4.0),
  match(7,true,3.8),match(6,false,4.2),match(5,false,3.2),
  match(4,true,3.0),match(3,false,3.4)
 ];
 const actual=verifiedCareerForm(rows);
 assert.deepEqual(actual.sequence,["W","W","L","W","L"]);
 assert.deepEqual([actual.wins,actual.losses,actual.recentCount],[3,2,5]);
 assert.deepEqual(actual.currentRun,{result:"W",length:2});
 assert.deepEqual(actual.ratingTrend,{recentAverage:4.15,
  previousAverage:3.45,delta:.7,recentRated:4,previousRated:4,
  direction:"HIGHER"});
 assert.match(actual.note,/not a change in ability/);
});
test("cooler rated matches are explicitly match ratings, not wrestler skill loss",()=>{
 const rows=[
  match(9,false,2.9),match(8,false,3.2),match(7,false,3.1),
  match(6,true,3.0),match(5,true,4.0),match(4,true,4.1),
  match(3,true,4.3),match(2,true,4.2)
 ];
 const result=verifiedCareerForm(rows);
 assert.deepEqual(result.currentRun,{result:"L",length:3});
 assert.equal(result.ratingTrend?.direction,"LOWER");
 assert.equal(result.ratingTrend?.delta,-1.1);
});
test("missing ratings, thin history and equal receptions never fabricate improvement",()=>{
 const thin=verifiedCareerForm([match(2,true,null),match(1,false,null)]);
 assert.equal(thin.ratingTrend,null);
 assert.equal(thin.recentCount,2);
 assert.deepEqual(thin.sequence,["W","L"]);
 assert.equal(verifiedCareerForm([]).currentRun,null);
 assert.equal(verifiedCareerForm([]).note,"No certified matches are recorded yet.");
 const missing=Array.from({length:8},(_,i)=>match(10-i,i<3,i===1||i===5?null:4));
 assert.equal(verifiedCareerForm(missing).ratingTrend,null,
  "Both four-bout windows must contain at least three actual ratings");
 const same=Array.from({length:8},(_,i)=>match(10-i,true,i<4?3.9:4));
 assert.equal(verifiedCareerForm(same).ratingTrend?.direction,"SIMILAR");
});
test("max twelve match evidence and stable chronology protect history",()=>{
 const rows=Array.from({length:18},(_,i)=>match(20-i,true,4.2));
 const result=verifiedCareerForm(rows);
 assert.equal(result.currentRun?.length,12);
 assert.throws(()=>verifiedCareerForm([match(1,true,4),match(2,false,4)]),
  /newest-first/);
 assert.throws(()=>verifiedCareerForm([match(5,true,6)]),/verified match evidence/);
});
