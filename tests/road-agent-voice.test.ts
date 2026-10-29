import test from "node:test";
import assert from "node:assert/strict";
import {deriveRoadAgentReport} from "../src/domain/road-agent-report.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
import type {RecordedMatchReportFact} from "../src/db/record-match-report-facts.js";
import type {WorldStaffMember} from "../src/domain/world-staff.js";

const receipt:CompletedShowReceipt={
 worldId:"test-world",promotionId:"promoter",showId:"test-show",
 year:1,week:1,resolutionId:"test-resolution",crowdResponse:70,
 matches:[
  {matchId:"opener",position:0,crowdResponse:78,actualFinish:"SUBMISSION",
   actualWinnerSide:"A"},
  {matchId:"main",position:3,crowdResponse:55,actualFinish:"CLEAN_PIN",
   actualWinnerSide:"B"}
 ],
 segments:[{slotId:"promo",position:1,kind:"PROMO",outcome:"HAPPENS",
  crowdResponse:65}]
};
const facts:RecordedMatchReportFact[]=[
 {matchId:"opener",ratingStars:4,executionQuality:83,actualMinutes:18,
  plannedMinutes:18,chemistryModifier:5,finishCheaterPersonId:null,
  linkedProgrammes:1,programmeSignal:"CONTINUITY",injuries:[]},
 {matchId:"main",ratingStars:2,executionQuality:42,actualMinutes:28,
  plannedMinutes:18,chemistryModifier:-5,finishCheaterPersonId:null,
  linkedProgrammes:0,programmeSignal:null,injuries:[]}
];
test("the Road Agent's opinions refer to the actual card and practical issues",()=>{
 const report=deriveRoadAgentReport(receipt,facts,null);
 assert.equal(report.strongestMatchId,"opener");
 assert.equal(report.reviewedMatches,2);
 assert.match(report.praise,/opener/);
 assert.match(report.concern,/longer than planned/);
 assert.match(report.concern,/10 minutes/);
 assert.ok(report.recommendation.length>30);
 assert.doesNotMatch(JSON.stringify(report),/executionQuality|ratingStars|simulator/i);
});
test("a staff personality changes the voice, never the verified strongest match",()=>{
 const frank={name:"Sally Sparks",staffId:"agent-1",personality:"FRANK"} as WorldStaffMember;
 const patient={name:"Miles Grant",staffId:"agent-2",personality:"PATIENT"} as WorldStaffMember;
 const first=deriveRoadAgentReport(receipt,facts,frank);
 const second=deriveRoadAgentReport(receipt,facts,patient);
 assert.equal(first.reporter,"Sally Sparks");
 assert.equal(second.reporter,"Miles Grant");
 assert.notEqual(first.praise,second.praise);
 assert.notEqual(first.headline,second.headline);
 assert.equal(first.strongestMatchId,second.strongestMatchId);
});
test("staff reports cannot treat missing or duplicated match evidence as completed",()=>{
 assert.throws(()=>deriveRoadAgentReport(receipt,facts.slice(0,1),null),/complete/);
 assert.throws(()=>deriveRoadAgentReport(receipt,[facts[0]!,facts[0]!],null),/complete/);
});

test("Road Agent gives location-specific, fixable notes for real timing and execution issues",()=>{
 const report=deriveRoadAgentReport(receipt,facts,{
  name:"Morgan Stone",staffId:"staff-road",personality:"FRANK"
 } as WorldStaffMember);
 assert.match(report.concern,/closing match run 10 minutes longer/);
 assert.match(report.recommendation,/timing of the closing match/);
 assert.match(report.recommendation,/unbooked transitions/);
 const unpaced=deriveRoadAgentReport(receipt,facts.map(f=>({
  ...f,actualMinutes:f.plannedMinutes!
 })),null);
 assert.match(unpaced.concern,/closing match/);
 assert.match(unpaced.recommendation,/shorter structure/);
 assert.doesNotMatch(report.recommendation,/\b[0-9]+\/100|execution score|match quality meter/i);
});
