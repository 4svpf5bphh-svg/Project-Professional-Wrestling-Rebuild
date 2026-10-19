import test from "node:test";
import assert from "node:assert/strict";
import {newEditorMatch,restoreEditorMatch,assignPerformer,changeWinner,
 resizeMatch,moveElimination,moveRunningOrder,buildBookedMatch,FORMATS,
 editorMatchStyle,changeMatchIntent,changeMatchStyle,editorStyleLoad,bookedMatchHeadline,
 bookedStyleReadiness,bookedConditionReport}
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

test("singles match style uses original scoring dimensions and survives booking round-trip",()=>{
 let m=newEditorMatch("m","SINGLES");
 m=assignPerformer(m,0,0,{personId:"a",contractId:"a"});
 m=assignPerformer(m,1,0,{personId:"b",contractId:"b"});
 assert.equal(editorMatchStyle(m).competitiveness,85);
 m=changeMatchIntent(m,"TECHNICAL");assert.equal(editorMatchStyle(m).technical,92);
 m=changeMatchStyle(m,"risk",75);assert.equal(editorMatchStyle(m).risk,75);
 assert.ok(editorStyleLoad(m).total>0);
 const booking=buildBookedMatch(m);
 assert.equal((booking.style as {risk:number}).risk,75);
 assert.deepEqual(editorMatchStyle(restoreEditorMatch("m",booking)),editorMatchStyle(m));
 assert.throws(()=>changeMatchStyle(m,"risk",101),/0–100/);
 assert.throws(()=>changeMatchIntent(m,"IMAGINARY"),/Unknown/);
 assert.throws(()=>changeMatchStyle(newEditorMatch("tag","TAG"),"risk",10),/singles/);
});

test("collapsed card headline names real booked competitors without loading new profiles",()=>{
 let m=newEditorMatch("single","SINGLES");
 const display=(p:{personId:string}|null)=>p?p.personId==="a"?"MJF":"Cody Rhodes":"Choose wrestler";
 assert.match(bookedMatchHeadline(m,display),/Choose wrestler vs Choose wrestler/);
 m=assignPerformer(m,0,0,{personId:"a",contractId:"a"});
 m=assignPerformer(m,1,0,{personId:"b",contractId:"b"});
 assert.equal(bookedMatchHeadline(m,display),"MJF vs Cody Rhodes");
 let battle=newEditorMatch("royal","BATTLE_ROYAL");
 assert.match(bookedMatchHeadline(battle,display),/0 of 20 entrants/);
 battle=assignPerformer(battle,0,0,{personId:"a",contractId:"a"});
 assert.match(bookedMatchHeadline(battle,display),/1 of 20 entrants/);
});

test("original match-style acceptance responds to wrestler fatigue without affecting the finish",()=>{
 let match=newEditorMatch("style","SINGLES");
 match=assignPerformer(match,0,0,{personId:"fresh",contractId:"fresh-deal"});
 match=assignPerformer(match,1,0,{personId:"tired",contractId:"tired-deal"});
 const fit={inRingQuality:80,matchCraft:80,presentation:80,stamina:90,
  safety:90,fatigue:5,wear:4};
 const byPerson=new Map([["fresh",fit],["tired",{...fit,fatigue:95}]]);
 const before=bookedStyleReadiness(match,byPerson);
 assert.equal(before.known,2);
 assert.equal(before.missing,0);
 assert.equal(before.reports.find(x=>x.personId==="fresh")?.status,"COMFORTABLE");
 assert.equal(before.reports.find(x=>x.personId==="tired")?.status,"REFUSES");
 assert.deepEqual(bookedStyleReadiness(match,new Map()).reports,[]);
 assert.equal(bookedStyleReadiness(match,new Map()).missing,2);
 assert.equal(buildBookedMatch(match).scriptedWinnerSide,"A");
});

test("contracted run-in survives booking and winner edits without writing an unwanted finish",()=>{
 let match=newEditorMatch("interference","SINGLES");
 match=assignPerformer(match,0,0,{personId:"alice",contractId:"deal-alice"});
 match=assignPerformer(match,1,0,{personId:"bob",contractId:"deal-bob"});
 match={...match,interference:{personId:"outside",contractId:"deal-outside",
  aidedSide:"A",plannedOutcome:"SUCCESS"},plannedFinish:"FOREIGN_OBJECT",
  cheatingWrestlerId:"alice"};
 const booked=buildBookedMatch(match);
 assert.equal(booked.scriptedWinnerSide,"A");
 assert.deepEqual(booked.interference,match.interference);
 assert.equal(booked.cheatingWrestlerId,"alice");
 const returned=restoreEditorMatch("interference",booked);
 assert.deepEqual(returned.interference,match.interference);
 const changed=changeWinner(returned,1);
 assert.equal(changed.winnerSide,1);
 assert.equal(changed.interference?.aidedSide,"B");
 assert.equal(changed.cheatingWrestlerId,undefined);
 assert.equal(buildBookedMatch(changed).scriptedWinnerSide,"B");
 const defeated=assignPerformer(changed,1,0,{personId:"outside",contractId:"deal-outside"});
 assert.equal(defeated.interference,undefined,"Booked participant cannot remain their own interferer");
});

test("reducing battle royals and team formations never silently discards wrestlers",()=>{
 let battle=newEditorMatch("battle","BATTLE_ROYAL");
 battle=assignPerformer(battle,19,0,{personId:"last",contractId:"last-deal"});
 assert.throws(()=>resizeMatch(battle,19),/Remove wrestlers/);
 const shorter=resizeMatch(assignPerformer(battle,19,0,null),19);
 assert.equal(shorter.teams.length,19);
 let team=newEditorMatch("team","MULTI_TEAM");
 team=assignPerformer(team,0,1,{personId:"partner",contractId:"partner-deal"});
 assert.throws(()=>resizeMatch(team,3,1),/Invalid team size/);
 assert.equal(resizeMatch(team,3,2).teams[0]?.[1]?.personId,"partner");
 team=resizeMatch(team,3,3);
 team=assignPerformer(team,0,2,{personId:"third",contractId:"third-deal"});
 assert.throws(()=>resizeMatch(team,3,2),/Remove wrestlers/);
});

test("team and battle-royal bookings reveal factual participant condition without changing finishes",()=>{
 let match=newEditorMatch("tag","TAG");
 match=assignPerformer(match,0,0,{personId:"a",contractId:"a"});
 match=assignPerformer(match,1,1,{personId:"b",contractId:"b"});
 const snapshot={inRingQuality:75,matchCraft:70,presentation:60,
  stamina:80,safety:90,fatigue:35,wear:20};
 const reports=bookedConditionReport(match,new Map([["a",snapshot]]));
 assert.equal(reports.length,2);
 assert.deepEqual(reports[0],{personId:"a",known:true,
  stamina:80,safety:90,fatigue:35,wear:20});
 assert.equal(reports[1]?.known,false);
 assert.equal(reports[1]?.wear,null);
 assert.equal(match.winnerSide,0);
 const battle=newEditorMatch("royal","BATTLE_ROYAL");
 assert.deepEqual(bookedConditionReport(battle,new Map()),[]);
});

test("resizing a multi-entrant match cannot rewrite an authored winner",()=>{
 const royal=changeWinner(newEditorMatch("royal","BATTLE_ROYAL"),19);
 assert.throws(()=>resizeMatch(royal,19),/Choose a new winner/);
 const repaired=changeWinner(royal,0);
 assert.equal(resizeMatch(repaired,19).winnerSide,0);
 let teams=resizeMatch(newEditorMatch("teams","MULTI_TEAM"),6,2);
 teams=changeWinner(teams,5);
 assert.throws(()=>resizeMatch(teams,5,2),/Choose a new winner/);
 assert.equal(resizeMatch(changeWinner(teams,4),5,2).winnerSide,4);
});
