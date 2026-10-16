import test from "node:test";
import assert from "node:assert/strict";
import {adaptInterferenceMatch} from "../src/simulation/interference-match-bridge.js";
import {finalizeResolvedShow} from "../src/simulation/finalize-resolved-show.js";
import type {InterferenceResolutionPreview} from "../src/simulation/legacy/match-interference.js";
const p:InterferenceResolutionPreview={
 stage:"POST_INTERFERENCE_PRE_SHOW_FLOW",
 plannedWinnerId:"a",actualWinnerId:"a",
 plannedFinish:"CLEAN_PIN",actualFinish:"PROTECTED_FINISH",
 injuryStoppage:false,crowdResponse:80,
 interference:{personId:"x",aidedSide:"A",plannedOutcome:"SUCCESS",
  outcome:"SUCCESS",delivery:1,abortReason:null}};
test("successful authored interference survives finalization",()=>{
 const match=adaptInterferenceMatch("m",0,["a","b"],p,false);
 const r=finalizeResolvedShow({worldId:"w",promotionId:"p",showId:"s",
  year:1,week:1,resolutionId:"r",phase:"AUTHORITATIVE_RESOLVED",
  finalCrowdResponse:80,matches:[match],segments:[]});
 assert.equal(r.matches[0]!.actualFinish,"PROTECTED_FINISH");
 assert.equal(r.matches[0]!.actualWinnerSide,"A");
});
test("aborted interference cannot protect finish",()=>{
 assert.throws(()=>adaptInterferenceMatch("m",0,["a","b"],{
  ...p,interference:{...p.interference!,outcome:"ABORTED",
   abortReason:"INTERFERER_UNAVAILABLE"}},false),/Inconsistent/);
});
test("interference cannot arbitrarily change winner",()=>{
 assert.throws(()=>adaptInterferenceMatch("m",0,["a","b"],{
  ...p,actualWinnerId:"b"},false),/Inconsistent/);
});
test("injury override requires medical certification",()=>{
 assert.throws(()=>adaptInterferenceMatch("m",0,["a","b"],{
  ...p,injuryStoppage:true,actualWinnerId:"b",
  actualFinish:"INJURY_STOPPAGE"},false),/Inconsistent/);
});
