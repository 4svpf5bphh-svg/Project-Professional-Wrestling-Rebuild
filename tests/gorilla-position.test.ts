import test from "node:test";
import assert from "node:assert/strict";
import {planGorillaPosition, type GorillaPolicy} from "../src/domain/gorilla-position.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
import type {RecordedMatchReportFact} from "../src/db/record-match-report-facts.js";
const receipt:CompletedShowReceipt={
 worldId:"world",promotionId:"promotion",showId:"event",year:1,week:4,
 resolutionId:"seal-4",crowdResponse:61,
 matches:[
  {matchId:"opener",position:0,crowdResponse:33,actualFinish:"CLEAN_PIN",actualWinnerSide:"A"},
  {matchId:"feature",position:2,crowdResponse:90,actualFinish:"SUBMISSION",actualWinnerSide:"B"},
  {matchId:"main",position:4,crowdResponse:39,actualFinish:"INJURY_STOPPAGE",actualWinnerSide:"A"}
 ],segments:[]};
const facts:RecordedMatchReportFact[]=receipt.matches.map((m,i)=>({
 matchId:m.matchId,ratingStars:3+i/2,executionQuality:70,actualMinutes:i===1?49:14,
 chemistryModifier:0,finishCheaterPersonId:null,linkedProgrammes:0,
 programmeSignal:null,injuries:i===2?[{personId:"a",severity:"MINOR",weeksOut:2}]:[]
}));
const agent={staffId:"agent",name:"Morgan",craft:92,people:84,reliability:91};
test("Gorilla's legal decision tree protects authored outcomes and treats medical stoppage as mandatory",()=>{
 for(const policy of ["STICK_TO_CARD","USE_JUDGEMENT","FOLLOW_THE_CROWD","PROTECT_KEY_PLANS"] as GorillaPolicy[]){
  const log=planGorillaPosition(receipt,facts,policy,agent);
  assert.deepEqual(log,planGorillaPosition(receipt,facts,policy,agent));
  assert.equal(log.incidents.find(x=>x.kind==="MEDICAL_STOPPAGE")?.choice,"BRIEF_MEDICAL");
  assert.ok(log.incidents.every(x=>x.legalChoices.includes(x.choice)));
  assert.deepEqual(log.guarantees,
   ["SCRIPTED_WINNERS_UNCHANGED","FINISHES_UNCHANGED","MEDICAL_EVIDENCE_UNCHANGED"]);
  assert.ok(log.crowdAdjustment>=0&&log.crowdAdjustment<=1);
  assert.ok(log.crowdAfter>=log.crowdBefore&&log.crowdAfter<=100);
  assert.equal(receipt.crowdResponse,61);
  assert.equal(receipt.matches[2]!.actualFinish,"INJURY_STOPPAGE");
 }
 const protect=planGorillaPosition(receipt,facts,"PROTECT_KEY_PLANS",agent);
 assert.equal(protect.incidents.find(x=>x.matchId==="main"&&x.kind==="CROWD_DIP")?.choice,
  "PROTECT_SCRIPT");
 assert.deepEqual(protect.incidents.find(x=>x.matchId==="main"&&x.kind==="CROWD_DIP")?.legalChoices,
  ["PROTECT_SCRIPT"]);
 const stick=planGorillaPosition(receipt,facts,"STICK_TO_CARD",agent);
 assert.equal(stick.crowdAdjustment,0);
 assert.ok(stick.incidents.filter(x=>x.kind==="CROWD_DIP").every(x=>x.choice==="PROTECT_SCRIPT"));
});
test("Manager presence never grants an option or scoring bonus; only pre-authorised policy and employed skills count",()=>{
 const crowd=planGorillaPosition(receipt,facts,"FOLLOW_THE_CROWD",agent);
 assert.ok(crowd.incidents.some(x=>x.choice==="RESET_COMMENTARY"));
 assert.ok(crowd.incidents.some(x=>x.choice==="LET_CROWD_BREATHE"));
 assert.ok(crowd.incidents.some(x=>x.choice==="TIGHTEN_TRANSITIONS"));
 assert.ok(crowd.crowdAdjustment>0&&crowd.crowdAdjustment<=1);
 const vacant=planGorillaPosition(receipt,facts,"FOLLOW_THE_CROWD",null);
 assert.equal(vacant.crowdAdjustment,0);
 assert.ok(vacant.incidents.filter(x=>x.kind!=="MEDICAL_STOPPAGE")
  .every(x=>x.choice==="PROTECT_SCRIPT"));
 const weak=planGorillaPosition(receipt,facts,"USE_JUDGEMENT",
  {...agent,people:30,reliability:30,craft:30});
 assert.equal(weak.crowdAdjustment,0);
 assert.equal(crowd.staffId,agent.staffId);
 assert.equal(vacant.staffId,null);
});
test("Gorilla rejects invented match evidence, duplicates, missing data and invalid staff skills",()=>{
 assert.throws(()=>planGorillaPosition(receipt,facts.slice(1),"FOLLOW_THE_CROWD",agent),/certified/);
 assert.throws(()=>planGorillaPosition(receipt,[facts[0]!,facts[0]!,facts[2]!],
  "FOLLOW_THE_CROWD",agent),/certified/);
 assert.throws(()=>planGorillaPosition({...receipt,crowdResponse:105},facts,
  "FOLLOW_THE_CROWD",agent),/certified/);
 assert.throws(()=>planGorillaPosition(receipt,facts,"USE_JUDGEMENT",
  {...agent,craft:-2}),/competencies/);
});
