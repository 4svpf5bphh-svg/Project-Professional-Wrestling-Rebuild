import test from "node:test";
import assert from "node:assert/strict";
import {describeWrestlerStory,type WrestlerStoryOrigin}
 from "../src/domain/programme-story-spine.js";
const origin:WrestlerStoryOrigin={requestId:"private:one",initiatorId:"joe",
 opponentId:"mistico",acceptedWeekIndex:3,recordedWeekIndex:null,
 previousCertifiedMeetings:2};
const base={origin,initiatorName:"Samoa Joe",opponentName:"Místico",
 activityCount:0,plannedShows:[],resolvedFinaleWeekIndex:null};
test("accepted wrestler feud is not mistaken for an authored, aired or certified scene",()=>{
 const accepted=describeWrestlerStory(base);
 assert.equal(accepted.stage,"AWAITING_CHAPTER");
 assert.match(accepted.detail,/Samoa Joe suggested this rivalry with Místico/);
 assert.match(accepted.detail,/Y1 W4/);
 const draft=describeWrestlerStory({...base,plannedShows:[
  {showName:"Ascension",status:"DRAFT"}]});
 assert.equal(draft.stage,"SCHEDULED");
 assert.match(draft.headline,/not yet aired/);
 assert.match(draft.detail,/in draft/);
 const confirmed=describeWrestlerStory({...base,plannedShows:[
  {showName:"Ascension",status:"SUBMITTED"}]});
 assert.equal(confirmed.stage,"SCHEDULED");
 assert.match(confirmed.detail,/confirmed/);
 const delivered=describeWrestlerStory({...base,activityCount:2,plannedShows:[
  {showName:"Next PPV",status:"DRAFT"}]});
 assert.equal(delivered.stage,"ON_SCREEN");
 assert.match(delivered.detail,/2 certified chapters/);
 const payoff=describeWrestlerStory({...base,activityCount:3,
  resolvedFinaleWeekIndex:8});
 assert.equal(payoff.stage,"FINALE_DELIVERED");
 assert.match(payoff.detail,/Y1 W9/);
});
