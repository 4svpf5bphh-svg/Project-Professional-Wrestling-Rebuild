import test from "node:test";
import assert from "node:assert/strict";
import {certifiedCareerMoment} from "../src/domain/certified-career-moments.js";
test("only recorded stage changes become career-chapter news",()=>{
 const e={kind:"CAREER_STAGE_CHANGED",year:3,week:7,personName:"Maya Storm",
  fromStage:"VETERAN",careerStage:"SPECIAL_ATTRACTION"};
 const result=certifiedCareerMoment(e);
 assert.match(result?.title??"",/Maya Storm becomes a special attraction/);
 assert.match(result?.detail??"",/veteran → special attraction/);
 assert.equal(certifiedCareerMoment({...e,fromStage:null}),null);
 assert.equal(certifiedCareerMoment({...e,careerStage:"MYTHIC"}),null);
 assert.equal(certifiedCareerMoment({...e,week:53}),null);
});
test("retirement requires a real ledger event, not wrestler age or market status",()=>{
 assert.match(certifiedCareerMoment({kind:"WRESTLER_RETIRED",year:6,week:1,
  personName:"Alex Rook"})?.detail??"",/confirmed retirement/);
 assert.equal(certifiedCareerMoment({kind:"WRESTLER_DEBUTED",year:6,week:1,
  personName:"Alex Rook"}),null);
});
