import test from "node:test";
import assert from "node:assert/strict";
import {eligibleProgrammePayoffs,certifiedFinaleDelivered,PROGRAMME_PAYOFFS}
 from "../src/domain/programme-finales.js";
const match={matchType:"SINGLES",stipulation:"STANDARD"};
const angle=(kind:string)=>({kind,actorIds:["a"],targetIds:["b"]});
test("an on-screen finale is always tied to a real, appropriate angle or match",()=>{
 assert.deepEqual(eligibleProgrammePayoffs("MATCH",match),["DECISIVE_MATCH"]);
 assert.deepEqual(eligibleProgrammePayoffs("MATCH",{...match,championshipId:"belt",stipulation:"CAGE"}),
  ["DECISIVE_MATCH","TITLE_SHOWDOWN","STIPULATION_SHOWDOWN"]);
 assert.deepEqual(eligibleProgrammePayoffs("SEGMENT",angle("CONFRONTATION")),["FINAL_CONFRONTATION"]);
 assert.deepEqual(eligibleProgrammePayoffs("SEGMENT",angle("TURN")),["BETRAYAL"]);
 assert.deepEqual(eligibleProgrammePayoffs("SEGMENT",angle("STABLE_RECONCILIATION")),["RECONCILIATION"]);
 assert.deepEqual(eligibleProgrammePayoffs("SEGMENT",angle("VIDEO_PACKAGE")),[]);
 assert.deepEqual(eligibleProgrammePayoffs("SEGMENT",{kind:"FORGED"}),[]);
 assert.equal(Object.keys(PROGRAMME_PAYOFFS).length,6);
});
test("a decisive feud match has to produce a certified winner",()=>{
 assert.equal(certifiedFinaleDelivered({
  kind:"MATCH",payoff:"DECISIVE_MATCH",payload:match,
  winnerSide:null,angleHappened:false}),false);
 assert.equal(certifiedFinaleDelivered({
  kind:"MATCH",payoff:"DECISIVE_MATCH",payload:match,
  winnerSide:"A",angleHappened:false}),true);
 assert.equal(certifiedFinaleDelivered({
  kind:"MATCH",payoff:"TITLE_SHOWDOWN",payload:match,
  winnerSide:"B",angleHappened:false}),false,
  "A rematch without the title on the line is not a title payoff");
 assert.equal(certifiedFinaleDelivered({
  kind:"MATCH",payoff:"STIPULATION_SHOWDOWN",payload:{...match,stipulation:"STANDARD"},
  winnerSide:"B",angleHappened:false}),false,
  "If a booker changes the booked stipulation, the original finale plan is not fulfilled");
});
test("only a completed, still-matching scripted scene can deliver the angle payoff",()=>{
 assert.equal(certifiedFinaleDelivered({
  kind:"SEGMENT",payoff:"BETRAYAL",payload:angle("TURN"),
  winnerSide:null,angleHappened:true}),true);
 assert.equal(certifiedFinaleDelivered({
  kind:"SEGMENT",payoff:"BETRAYAL",payload:angle("TURN"),
  winnerSide:null,angleHappened:false}),false);
 assert.equal(certifiedFinaleDelivered({
  kind:"SEGMENT",payoff:"RECONCILIATION",payload:angle("TURN"),
  winnerSide:null,angleHappened:true}),false);
 assert.equal(certifiedFinaleDelivered({
  kind:"SEGMENT",payoff:"RECONCILIATION",payload:angle("STABLE_RECONCILIATION"),
  winnerSide:null,angleHappened:true}),true);
});
