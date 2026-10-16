import test from "node:test";
import assert from "node:assert/strict";
import {deriveArchivedMatchEvidence}
 from "../src/simulation/derive-archived-match-evidence.js";
const base={worldId:"w",promotionId:"p",showId:"s",year:1,week:1,
 stage:"PRE_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW",
 showPacingPreview:null,showAlignmentPreview:null,showProgrammePreview:null,
 showFinishPreview:null,showMatchContextPreview:null};
function projection(actualFinish:string,actualWinnerId="a"){
 const injuryStoppage=actualFinish==="INJURY_STOPPAGE";
 return {...base,projections:[{slotId:"m",position:0,winnerId:"a",
  personIds:["a","b"],plannedFinish:"CLEAN_PIN",
  injuryPreview:{plannedWinnerId:"a",actualWinnerId,
   injuryStoppage,injuries:injuryStoppage?
    [{personId:"a",severity:"MAJOR",weeksOut:5,probability:0.01}]:[]},
  interferencePreview:{plannedWinnerId:"a",actualWinnerId,
   plannedFinish:"CLEAN_PIN",actualFinish,injuryStoppage,
   crowdResponse:73,interference:null}}]};
}
test("archived clean finish derives booked winner",()=>{
 const result=deriveArchivedMatchEvidence(projection("CLEAN_PIN") as never);
 assert.equal(result[0]!.receipt.actualWinnerSide,"A");
 assert.equal(result[0]!.evidence.resolution.actualFinish,"CLEAN_PIN");
});
test("archived serious medical stoppage derives evidence and opponent winner",()=>{
 const result=deriveArchivedMatchEvidence(projection("INJURY_STOPPAGE","b") as never);
 assert.equal(result[0]!.receipt.actualWinnerSide,"B");
 assert.equal(result[0]!.evidence.resolution.medical?.severity,"MAJOR");
});
test("unexplained changed winner and finish fail closed",()=>{
 assert.throws(()=>deriveArchivedMatchEvidence(projection("CLEAN_PIN","b") as never),
  /cannot change scripted winner/);
 assert.throws(()=>deriveArchivedMatchEvidence(projection("PROTECTED_FINISH") as never),
  /Finish is not supported/);
});
test("incomplete archived preview is never a completed result",()=>{
 const p=projection("CLEAN_PIN");
 p.projections[0]!.interferencePreview=null as never;
 assert.throws(()=>deriveArchivedMatchEvidence(p as never),/incomplete/);
});
