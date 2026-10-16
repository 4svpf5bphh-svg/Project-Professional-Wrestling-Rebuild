import test from "node:test";
import assert from "node:assert/strict";
import {verifyResolvedSinglesEvidence,type BookedSinglesOutcome,
 type ResolvedSinglesEvidence} from "../src/domain/verified-match-evidence.js";
const booking:BookedSinglesOutcome={participants:["a","b"],
 scriptedWinner:"a",plannedFinish:"CLEAN_PIN",interferencePlannedOutcome:"SUCCESS"};
const normal:ResolvedSinglesEvidence={actualWinner:"a",actualFinish:"CLEAN_PIN"};
test("ordinary booked outcome remains authoritative",()=>{
 assert.deepEqual(verifyResolvedSinglesEvidence(booking,normal),
  {actualWinnerSide:"A",actualFinish:"CLEAN_PIN"});
});
test("only booked and successful interference protects finish",()=>{
 const valid={...normal,actualFinish:"PROTECTED_FINISH",
  interference:{plannedOutcome:"SUCCESS" as const,actualOutcome:"SUCCESS" as const}};
 assert.equal(verifyResolvedSinglesEvidence(booking,valid).actualFinish,"PROTECTED_FINISH");
 for(const outcome of ["THWARTED","ABORTED"] as const)
  assert.throws(()=>verifyResolvedSinglesEvidence(booking,{
   ...valid,interference:{...valid.interference,actualOutcome:outcome}}),
   /Finish is not supported/);
 assert.throws(()=>verifyResolvedSinglesEvidence({...booking,
  interferencePlannedOutcome:"THWARTED"},valid),/inconsistent with booking/);
});
test("serious injury to booked winner may trigger referee stoppage",()=>{
 const stopped:ResolvedSinglesEvidence={actualWinner:"b",
  actualFinish:"INJURY_STOPPAGE",
  medical:{injuredPersonId:"a",severity:"MAJOR",stoppage:true}};
 assert.equal(verifyResolvedSinglesEvidence(booking,stopped).actualWinnerSide,"B");
 assert.throws(()=>verifyResolvedSinglesEvidence(booking,{
  ...stopped,medical:{...stopped.medical!,severity:"MINOR" as "MAJOR"}}),
  /Medical evidence inconsistent/);
 assert.throws(()=>verifyResolvedSinglesEvidence(booking,{
  ...stopped,actualWinner:"a"}),/Medical stoppage cannot preserve/);
});
test("no simulation-supplied winner or finish rewrite",()=>{
 assert.throws(()=>verifyResolvedSinglesEvidence(booking,{
  ...normal,actualWinner:"b"}),/cannot change scripted winner/);
 assert.throws(()=>verifyResolvedSinglesEvidence(booking,{
  ...normal,actualFinish:"SUBMISSION"}),/Finish is not supported/);
});
