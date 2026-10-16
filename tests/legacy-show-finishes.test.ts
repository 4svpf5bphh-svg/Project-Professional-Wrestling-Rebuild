import assert from "node:assert/strict";
import test from "node:test";
import {evaluateArchivedFinishReactions,type FinishedCheatingMatch}
 from "../src/simulation/legacy/show-finishes.js";
const m:FinishedCheatingMatch={matchId:"main",promotionId:"p",weekIndex:20,
 actualFinish:"FOREIGN_OBJECT",actualWinnerSide:"A",finishCheaterPersonId:"heel",
 participants:[{personId:"heel",side:"A",alignment:"HEEL"},
 {personId:"face",side:"B",alignment:"FACE"}],linkedProgramme:true};
const run=(x:FinishedCheatingMatch=m,h:Parameters<typeof evaluateArchivedFinishReactions>[1]=[])=>
 evaluateArchivedFinishReactions([x],h)[0]!;
test("heel object cheating lifts crowd only with valid winning-side culprit",()=>{
 assert.deepEqual(run(),{matchId:"main",modifier:1.8,
  reason:"HEEL_CHEATING_HEAT",repeatCount:0,programmeLinked:true});
 assert.equal(run({...m,finishCheaterPersonId:"face"}).modifier,0);
 assert.equal(run({...m,actualFinish:"PIN"}).modifier,0);
 assert.equal(run({...m,actualWinnerSide:null}).modifier,0);
});
test("DQ cheater is the losing side; face cheating causes backlash",()=>{
 assert.equal(run({...m,actualFinish:"DISQUALIFICATION",actualWinnerSide:"B"}).modifier,1.2);
 assert.equal(run({...m,actualFinish:"DISQUALIFICATION",actualWinnerSide:"A"}).modifier,0);
 assert.equal(run({...m,actualFinish:"FOREIGN_OBJECT",actualWinnerSide:"B",
  finishCheaterPersonId:"face"}).modifier,-1.3);
});
test("repeating the same finish with the same people erodes only its bonus",()=>{
 const h={promotionId:"p",weekIndex:19,actualFinish:"FOREIGN_OBJECT" as const,
  cheaterPersonId:"heel",participantIds:["heel","face"],completed:true};
 assert.equal(run(m,[h]).modifier,0.9);
 assert.equal(run(m,[h,{...h,weekIndex:18}]).modifier,0);
 assert.equal(run(m,[h,{...h,weekIndex:18}]).reason,"DIRTY_FINISH_FAMILIAR");
 assert.equal(run(m,[{...h,weekIndex:12}]).repeatCount,1);
 assert.equal(run(m,[{...h,weekIndex:11}]).repeatCount,0);
});
test("no cross-promotion, future, same-week, incomplete or unrelated repeats",()=>{
 const h={promotionId:"p",weekIndex:19,actualFinish:"FOREIGN_OBJECT" as const,
  cheaterPersonId:"heel",participantIds:["heel","face"],completed:true};
 for(const invalid of [{...h,promotionId:"other"},{...h,weekIndex:20},
  {...h,weekIndex:21},{...h,completed:false},{...h,cheaterPersonId:"other"},
  {...h,participantIds:["heel","stranger"]}]){
  assert.equal(run(m,[invalid]).repeatCount,0);
 }
});
test("missing opposing alignment gives no heel lift; history cannot override a medical finish",()=>{
 assert.equal(run({...m,participants:m.participants.map(p=>({...p,
  alignment:"TWEENER" as const}))}).modifier,0);
 assert.equal(run({...m,actualFinish:"OTHER"},[{
  promotionId:"p",weekIndex:19,actualFinish:"FOREIGN_OBJECT",
  cheaterPersonId:"heel",participantIds:["heel","face"],completed:true,
 }]).modifier,0);
});
