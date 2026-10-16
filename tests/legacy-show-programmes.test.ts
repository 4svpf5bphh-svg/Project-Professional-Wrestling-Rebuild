import assert from "node:assert/strict";
import test from "node:test";
import {evaluateArchivedProgrammeReactions}
 from "../src/simulation/legacy/show-programmes.js";
const matches=[{matchId:"m1",promotionId:"p",linkedProgrammeIds:["hot"]}];
const hot={programmeId:"hot",promotionId:"p",status:"ACTIVE" as const,heat:95,repetition:0};
test("original heat uplift clamps at +2.5 and remains pure",()=>{
 const result=evaluateArchivedProgrammeReactions(matches,[hot]);
 assert.deepEqual(result,[{matchId:"m1",modifier:2.5,reason:"HOT_PROGRAMME",
  linkedActiveProgrammeCount:1}]);
 assert.deepEqual(evaluateArchivedProgrammeReactions(matches,[hot]),result);
});
test("stale programmes and other promotions never leak into match heat",()=>{
 const other={...hot,promotionId:"another"};
 const inactive={...hot,status:"COMPLETED" as const};
 assert.equal(evaluateArchivedProgrammeReactions(matches,[other])[0]!.modifier,0);
 assert.equal(evaluateArchivedProgrammeReactions(matches,[inactive])[0]!.modifier,0);
 assert.equal(evaluateArchivedProgrammeReactions([
  {...matches[0]!,linkedProgrammeIds:[]}],[hot])[0]!.modifier,0);
});
test("repetition offsets hot heat, and dominates the explanation when warranted",()=>{
 const result=evaluateArchivedProgrammeReactions(matches,[{...hot,heat:65,repetition:40}]);
 assert.equal(result[0]!.modifier,-0.6000000000000001);
 assert.equal(result[0]!.reason,"PROGRAMME_REPETITION");
 const cool=evaluateArchivedProgrammeReactions(matches,[{...hot,heat:20,repetition:0}]);
 assert.equal(cool[0]!.modifier,-2);
 assert.equal(cool[0]!.reason,"COOL_PROGRAMME");
});
test("multiple active programmes average, do not sum, and duplicate links count once",()=>{
 const m=[{...matches[0]!,linkedProgrammeIds:["hot","cold","hot"]}];
 const cold={...hot,programmeId:"cold",heat:20};
 const x=evaluateArchivedProgrammeReactions(m,[hot,cold])[0]!;
 assert.equal(x.linkedActiveProgrammeCount,2);
 assert.equal(x.modifier,0.25);
});
test("null heat is unknown and does not invent positive programme heat",()=>{
 const r=evaluateArchivedProgrammeReactions(matches,[{...hot,heat:null,repetition:10}]);
 assert.equal(r[0]!.modifier,-0.4);
 assert.equal(r[0]!.reason,"PROGRAMME_REPETITION");
});
test("invalid and duplicate canonical programme records fail closed",()=>{
 assert.throws(()=>evaluateArchivedProgrammeReactions(matches,[hot,hot]),/Invalid canonical/);
 assert.throws(()=>evaluateArchivedProgrammeReactions(matches,[{...hot,heat:120}]),/Invalid canonical/);
 assert.throws(()=>evaluateArchivedProgrammeReactions(matches,[{...hot,repetition:-1}]),/Invalid canonical/);
 assert.throws(()=>evaluateArchivedProgrammeReactions([matches[0]!,matches[0]!],[hot]),/Invalid match/);
});
