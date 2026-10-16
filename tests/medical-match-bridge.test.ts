import test from "node:test";
import assert from "node:assert/strict";
import {adaptMedicalMatch} from "../src/simulation/medical-match-bridge.js";
import {finalizeResolvedShow} from "../src/simulation/finalize-resolved-show.js";
import type {InjuryResolutionPreview} from "../src/simulation/legacy/match-injuries.js";
const p:InjuryResolutionPreview={
 stage:"POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW",
 preInjury:{} as InjuryResolutionPreview["preInjury"],
 injuries:[],injuryStoppage:false,plannedWinnerId:"a",actualWinnerId:"a",
 plannedFinish:"CLEAN_PIN",actualFinish:"CLEAN_PIN",crowdResponse:76};
test("ordinary finish remains scripted",()=>{
 const m=adaptMedicalMatch("m",0,["a","b"],p);
 assert.equal(m.actualWinnerSide,"A");
 assert.equal(m.medicalOverrideCertified,false);
});
test("serious injury allows stoppage through finalization",()=>{
 const m=adaptMedicalMatch("m",0,["a","b"],{...p,
  injuries:[{personId:"a",severity:"MAJOR",weeksOut:6,probability:0.02}],
  injuryStoppage:true,actualWinnerId:"b",actualFinish:"INJURY_STOPPAGE"});
 const r=finalizeResolvedShow({worldId:"w",promotionId:"p",showId:"s",
  year:1,week:1,resolutionId:"r",finalCrowdResponse:72,
  phase:"AUTHORITATIVE_RESOLVED",matches:[m],segments:[]});
 assert.equal(r.matches[0]!.actualFinish,"INJURY_STOPPAGE");
 assert.equal(r.matches[0]!.actualWinnerSide,"B");
});
test("unsupported injury override is rejected",()=>{
 assert.throws(()=>adaptMedicalMatch("m",0,["a","b"],{...p,
  injuryStoppage:true,actualWinnerId:"b",actualFinish:"INJURY_STOPPAGE"}),
  /Inconsistent/);
 assert.throws(()=>adaptMedicalMatch("m",0,["a","b"],{...p,
  actualWinnerId:"b"}),/Inconsistent/);
});
