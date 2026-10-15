import assert from "node:assert/strict";
import test from "node:test";
import {evaluateArchivedShowAlignments,combineArchivedPacingAndAlignments}
 from "../src/simulation/legacy/show-alignment.js";
import {evaluateArchivedMatchPacing}
 from "../src/simulation/legacy/show-pacing.js";

const face={matchId:"first",position:0,aId:"A",bId:"B",
 aAlignment:"FACE" as const,bAlignment:"HEEL" as const};
const same={matchId:"second",position:1,aId:"C",bId:"D",
 aAlignment:"HEEL" as const,bAlignment:"HEEL" as const};

test("original face/heel clarity, same-side and tweener signals",()=>{
 const m=evaluateArchivedShowAlignments([face,same],[],20);
 assert.equal(m[0]!.baseModifier,2.2);
 assert.equal(m[0]!.reason,"FACE_HEEL_CLARITY");
 assert.equal(m[1]!.modifier,-0.3);
 assert.equal(m[1]!.reason,"SAME_ALIGNMENT");
 const t=evaluateArchivedShowAlignments([{...face,bAlignment:"TWEENER"}],[],20);
 assert.equal(t[0]!.modifier,0.7);
 assert.equal(t[0]!.reason,"TWEENER_TENSION");
 const tt=evaluateArchivedShowAlignments([{
   ...face,aAlignment:"TWEENER",bAlignment:"TWEENER",
 }],[],20);
 assert.equal(tt[0]!.modifier,-0.1);
});
test("unexplained switching creates the exact historical 8-week volatility penalty",()=>{
 const h=[
  {personId:"A",weekIndex:20,method:"OFFSCREEN_SWITCH" as const,changed:true},
  {personId:"A",weekIndex:19,method:"TURN" as const,changed:true},
  {personId:"B",weekIndex:20,method:"JUST_SIGNED" as const,changed:true},
 ];
 const changes=evaluateArchivedShowAlignments([face],h,20);
 assert.equal(changes[0]!.volatilityModifier,-1.8);
 assert.equal(changes[0]!.baseModifier,2.2);
 assert.equal(changes[0]!.modifier,0.4);
 assert.equal(changes[0]!.reason,"ALIGNMENT_VOLATILITY");
 const without=evaluateArchivedShowAlignments([face],[
   {personId:"A",weekIndex:12,method:"OFFSCREEN_SWITCH",changed:true},
   {personId:"A",weekIndex:20,method:"OFFSCREEN_SWITCH",changed:false},
 ],20);
 assert.equal(without[0]!.modifier,2.2);
});
test("up to repeated offscreen changes, worst single wrestler dominates, capped at -3",()=>{
 const history=Array.from({length:8},(_,i)=>({
   personId:"B",weekIndex:20-i,method:"OFFSCREEN_SWITCH" as const,changed:true,
 }));
 const m=evaluateArchivedShowAlignments([face],history,20);
 assert.equal(m[0]!.volatilityModifier,-3);
 assert.equal(m[0]!.modifier,-0.8);
});
test("pacing and alignment use archived weighted aggregation but remain NOT FINAL",()=>{
 const pacing=evaluateArchivedMatchPacing([
   {matchId:"first",position:0,intent:"PROTECTIVE",crowdResponse:55},
   {matchId:"second",position:1,intent:"EPIC",crowdResponse:75},
 ]);
 const aligned=evaluateArchivedShowAlignments([face,same],[],15);
 const combined=combineArchivedPacingAndAlignments(pacing,aligned);
 assert.equal(combined.phase,"PACING_AND_ALIGNMENT_NOT_FINAL");
 assert.deepEqual(combined.pendingContext,["PROGRAMME","DIRTY_FINISH_HISTORY","SEGMENT_CROWD"]);
 assert.equal(combined.segmentReactions,"NOT_PROJECTED");
 const weight=combined.matches.map(x=>x.weight);
 assert.deepEqual(weight,[1,1.26]);
 const expected=Math.round((combined.matches[0]!.adjustedCrowdResponse*
   weight[0]!+combined.matches[1]!.adjustedCrowdResponse*weight[1]!)/
   (weight[0]!+weight[1]!)*10)/10;
 assert.equal(combined.crowdResponse,expected);
 assert.equal(combined.baseCrowdResponse,pacing.baseMatchCrowd);
 assert.throws(()=>combineArchivedPacingAndAlignments(pacing,aligned.slice(0,1)),
   /Incompatible pacing/);
});
test("invalid or future history, duplicate matches and missing context fail closed",()=>{
 assert.throws(()=>evaluateArchivedShowAlignments([face],[
  {personId:"A",weekIndex:21,method:"TURN",changed:true},
 ],20),/Future alignment/);
 assert.throws(()=>evaluateArchivedShowAlignments([face],[
  {personId:"X",weekIndex:18,method:"TURN",changed:true},
 ],20),/Invalid alignment history/);
 assert.throws(()=>evaluateArchivedShowAlignments([face,face],[],20),
   /Invalid match alignment/);
 assert.throws(()=>evaluateArchivedShowAlignments([{...face,aAlignment:"OTHER" as "FACE"}],[],20),
   /Invalid match alignment/);
});
