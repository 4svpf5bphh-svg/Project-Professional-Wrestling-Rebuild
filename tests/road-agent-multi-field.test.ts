import {test} from "node:test";
import {strict as assert} from "node:assert";
import {deriveRoadAgentReport} from "../src/domain/road-agent-report.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
import type {RecordedMatchReportFact} from "../src/db/record-match-report-facts.js";
test("Road Agent names every person in the real three-way ladder main event",()=>{
 const receipt:CompletedShowReceipt={worldId:"world",promotionId:"CWA",
  showId:"show",year:1,week:23,resolutionId:"official",crowdResponse:85,
  matches:[{matchId:"ladder",position:6,crowdResponse:85,
   actualFinish:"RETRIEVAL",actualWinnerSide:"A"}],segments:[]};
 const facts:RecordedMatchReportFact[]=[{matchId:"ladder",ratingStars:3.75,
  actualMinutes:23,executionQuality:78,chemistryModifier:0,
  finishCheaterPersonId:null,linkedProgrammes:0,programmeSignal:null,
  participantNames:["Mr. Perfect","Josh Alexander","Jay Lethal"],
  personIds:["perfect","alexander","lethal"],injuries:[]}];
 const report=deriveRoadAgentReport(receipt,facts,null);
 assert.match(report.praise,/Mr\. Perfect vs Josh Alexander vs Jay Lethal/);
 assert.match(report.praise,/23-minute bout earned 3\.75 stars/);
 assert.match(report.recommendation,/Mr\. Perfect vs Josh Alexander vs Jay Lethal/);
});
