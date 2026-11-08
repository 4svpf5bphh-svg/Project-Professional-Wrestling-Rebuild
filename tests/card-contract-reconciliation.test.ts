import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,assignPerformer,buildBookedMatch} from "../src/ui/card-editor-model.js";
import {newEditorSegment,addSegmentPerson,buildEditorSegment} from "../src/ui/card-segment-model.js";
import {reconcileDraftAgreements} from "../src/ui/card-contract-reconciliation.js";

test("renewed show-week rights rebind a match, interference and angle without changing outcomes",()=>{
 const joe={personId:"joe",contractId:"old-joe"},mistico={personId:"mistico",contractId:"old-mistico"};
 let match=assignPerformer(assignPerformer(newEditorMatch("match","SINGLES"),0,0,joe),1,0,mistico);
 match={...match,championshipId:"title",plannedFinish:"CLEAN_PIN",
  interference:{personId:"third",contractId:"old-third",aidedSide:"A",plannedOutcome:"SUCCESS"}};
 const angle=addSegmentPerson(addSegmentPerson(newEditorSegment("angle","CONFRONTATION"),
  "actors",joe),"targets",mistico);
 const rights=[
  {personId:"joe",contractId:"new-joe"},{personId:"mistico",contractId:"new-mistico"},
  {personId:"third",contractId:"new-third"}];
 const updated=reconcileDraftAgreements([match],[angle],rights);
 assert.deepEqual(updated.changedPersonIds,["joe","mistico","third"]);
 assert.equal(updated.matches[0]?.teams[0]?.[0]?.contractId,"new-joe");
 assert.equal(updated.matches[0]?.teams[1]?.[0]?.contractId,"new-mistico");
 assert.equal(updated.matches[0]?.interference?.contractId,"new-third");
 assert.equal(updated.matches[0]?.plannedFinish,match.plannedFinish);
 assert.equal(updated.matches[0]?.winnerSide,match.winnerSide);
 assert.equal(updated.matches[0]?.championshipId,match.championshipId);
 assert.equal(updated.segments[0]?.actors[0]?.contractId,"new-joe");
 assert.equal(updated.segments[0]?.targets[0]?.contractId,"new-mistico");
 assert.equal(buildBookedMatch(updated.matches[0]!).participants[0]?.contractId,"new-joe");
 assert.equal(buildEditorSegment(updated.segments[0]!).participants[0]?.contractId,"new-joe");
 assert.deepEqual(reconcileDraftAgreements(updated.matches,updated.segments,rights).changedPersonIds,[]);
 assert.equal(match.teams[0]?.[0]?.contractId,"old-joe");
});
test("a not-yet-eligible renewal never silently replaces the booked agreement",()=>{
 const match=assignPerformer(newEditorMatch("match","SINGLES"),0,0,{
  personId:"joe",contractId:"old-joe"});
 const result=reconcileDraftAgreements([match],[],[{personId:"joe",contractId:null}]);
 assert.deepEqual(result.changedPersonIds,[]);
 assert.equal(result.matches[0]?.teams[0]?.[0]?.contractId,"old-joe");
});
