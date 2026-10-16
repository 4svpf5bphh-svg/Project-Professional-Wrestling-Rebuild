import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,restoreEditorMatch,assignPerformer,changeWinner,
 resizeMatch,moveElimination,moveRunningOrder,buildBookedMatch,FORMATS}
 from "../src/ui/card-editor-model.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../src/domain/match-sides.js";
const assign=(count:number,format:"BATTLE_ROYAL"|"MULTI_TEAM")=>{
 let state=newEditorMatch("main",format);
 if(format==="BATTLE_ROYAL")state=resizeMatch(state,count);
 else state=resizeMatch(state,count,2);
 for(let i=0;i<state.teams.length;i++)
  for(let j=0;j<state.teams[i]!.length;j++){
   const id="person-"+(i*5+j);
   state=assignPerformer(state,i,j,{personId:id,contractId:"deal-"+id});
  }
 return state;
};
test("all match formats are selectable and use the existing canonical writer",()=>{
 assert.equal(FORMATS.length,9);
 for(const fmt of FORMATS){
  if(fmt.value==="MULTI_TEAM"||fmt.value==="BATTLE_ROYAL")continue;
  let m=newEditorMatch("one",fmt.value);
  for(let i=0;i<m.teams.length;i++)
   for(let j=0;j<m.teams[i]!.length;j++){
    const id="w"+(i*5+j);
    m=assignPerformer(m,i,j,{personId:id,contractId:"deal-"+id});
   }
  const p=buildBookedMatch(m);
  assert.equal(p.participants.length,m.teams.reduce((sum,s)=>sum+s.length,0));
  assert.doesNotThrow(()=>requireSupportedScoringLayout(readCanonicalMatchLayout(p)));
 }
});
test("30 entrant battle royal keeps authored winner and elimination order through editor rehydration",()=>{
 let m=assign(30,"BATTLE_ROYAL");
 m=changeWinner(m,29);
 m=moveElimination(m,0,1);
 const p=buildBookedMatch(m);
 assert.equal(p.scriptedWinnerSide,"AD");
 assert.equal(p.participants.length,30);
 assert.equal(p.eliminationOrder?.length,29);
 const restored=restoreEditorMatch("main",p);
 assert.deepEqual(buildBookedMatch(restored),p);
 assert.throws(()=>assignPerformer(m,1,0,{personId:"person-0",
  contractId:"deal-person-0"}),/already/);
});
test("six side multi-team retains wrestler identities while adjusting team size",()=>{
 let m=assign(6,"MULTI_TEAM");
 m=changeWinner(m,5);
 const initial=buildBookedMatch(m);
 assert.equal(initial.participants.length,12);
 assert.equal(initial.scriptedWinnerSide,"F");
 const bigger=resizeMatch(m,6,5);
 assert.equal(bigger.teams[0]?.[0]?.personId,m.teams[0]?.[0]?.personId);
 assert.equal(bigger.teams[0]?.[4],null);
 assert.throws(()=>buildBookedMatch(bigger),/Choose/);
 assert.throws(()=>resizeMatch(m,7,2),/out of range/);
 assert.throws(()=>resizeMatch(m,6,6),/team size/);
});
test("original card arrow order and explicit elimination order never shuffle unexpectedly",()=>{
 let m=assign(6,"BATTLE_ROYAL");
 const original=[...m.eliminationOrder];
 m=moveElimination(m,0,1);
 assert.equal(m.eliminationOrder[0],original[1]);
 assert.deepEqual(moveRunningOrder(["a","b","c"],"b",-1),["b","a","c"]);
 assert.deepEqual(moveRunningOrder(["a","b","c"],"a",-1),["a","b","c"]);
});
