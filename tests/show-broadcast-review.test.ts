import test from "node:test";
import assert from "node:assert/strict";
import {broadcastTone,reviewCompletedEntry,broadcastShowPulse}
 from "../src/domain/show-broadcast-review.js";
import type {ShowResultEntry} from "../src/db/show-results-view.js";
const basic={slotId:"one",position:0,crowdResponse:89,actorIds:[],targetIds:[]};
test("broadcast reviews are deterministic, score-banded and format aware",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Winners victorious",
  summary:"A clean pinfall settled the contest.",outcome:"CLEAN_PIN",
  matchContext:{format:"3v3",intent:"TECHNICAL",plannedMinutes:16,
   sides:[["A","B","C"],["D","E","F"]],winnerNames:["A","B","C"],
   championshipContested:false}};
 const first=reviewCompletedEntry(entry,"show");
 assert.deepEqual(reviewCompletedEntry(entry,"show"),first);
 assert.match(first.recap,/A & B & C vs D & E & F/);
 assert.match(first.recap,/mat craft|technical contest/i);
 assert.match(first.recap,/clean pinfall/);
 assert.equal(first.tag,"3v3 tag match");
 assert.equal(first.tone,"RED_HOT");
 assert.equal(broadcastTone(65),"OVER");
 assert.equal(broadcastTone(44),"FLAT");
});
test("championship contest is not reported as a title change",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"A victorious",
  summary:"A clean pinfall settled it.",outcome:"CLEAN_PIN",
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:null,
   sides:[["A"],["B"]],winnerNames:["A"],championshipContested:true}};
 const result=reviewCompletedEntry(entry,"s");
 assert.match(result.recap,/championship was on the line/);
 assert.doesNotMatch(result.recap,/new champion|changed hands|retained/i);
});
test("refusal and interruption never become successful angles",()=>{
 for(const outcome of ["REFUSED","INTERRUPTED"]){
  const entry:ShowResultEntry={...basic,type:"SEGMENT",segmentKind:"ATTACK",
   headline:"Backstage attack",summary:"The planned attack never happened.",
   outcome};
  const result=reviewCompletedEntry(entry,"s");
  assert.match(result.headline,outcome==="REFUSED"?/Didn't go to plan/:/Cut short/);
  assert.doesNotMatch(result.recap,/landed|succeeded|crushed/);
 }
});
test("pulse counts only scored completed entries and keeps the hottest",()=>{
 const a:ShowResultEntry={...basic,type:"MATCH",headline:"A",summary:"A",outcome:"CLEAN_PIN"};
 const b:ShowResultEntry={...a,slotId:"two",crowdResponse:28};
 assert.deepEqual(broadcastShowPulse([a,b]),
  {topSlotId:"one",hotMoments:1,coldMoments:1});
});

test("actual match chemistry can colour reviews only when there is recorded evidence",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Result",
  summary:"A clean fall.",outcome:"CLEAN_PIN",fallout:{
   chemistryModifier:3.2,injuries:[],eliminations:[]}};
 assert.match(reviewCompletedEntry(entry,"show").recap,/in-ring chemistry/);
 entry.fallout!.chemistryModifier=-2;
 assert.match(reviewCompletedEntry(entry,"show").recap,/worked against/);
 entry.fallout!.chemistryModifier=0;
 assert.doesNotMatch(reviewCompletedEntry(entry,"show").recap,/in-ring chemistry|worked against/);
});
test("non-AI review names a confirmed new champion and medical consequence",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Result",
  summary:"The referee counted three.",outcome:"CLEAN_PIN",
  fallout:{
   title:{name:"World Championship",winnerName:"Challenger",
    priorHolderName:"Champion",changed:true},
   injuries:[{personName:"Champion",severity:"MODERATE",weeksOut:4,stoppage:false}],
   eliminations:[],interference:undefined,
  }};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.headline,/NEW CHAMPION.*Challenger/);
 assert.match(result.recap,/World Championship/);
 assert.match(result.recap,/4 PPW weeks/);
 assert.equal(result.bulletins.length,2);
 assert.ok(result.paragraphs.length>=3);
});
test("contested title stays with champion when the decision does not transfer it",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Result",
  summary:"A DQ ends the match.",outcome:"DISQUALIFICATION",
  fallout:{title:{name:"Tag Titles",winnerName:"Challengers",
   priorHolderName:"Champions",changed:false},
   injuries:[],eliminations:[]}};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.recap,/Champions remained champion/);
 assert.doesNotMatch(result.recap,/NEW CHAMPION|captured/);
});
test("verified run-in and battle royal eliminations enrich the report without inventing moves",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Winner",
  summary:"The last elimination decided the bout.",outcome:"OVER_THE_TOP_ROPE",
  fallout:{injuries:[],interference:{personName:"Manager",outcome:"ABORTED"},
   eliminations:["First","Second","Third"]}};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.recap,/never|did not materialise/);
 assert.match(result.recap,/First → Second → Third/);
 assert.doesNotMatch(result.recap,/powerbomb|suplex|signature finisher/i);
});

test("ongoing rivalries enrich the match report only when a certified programme is linked",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Booked feud",
  summary:"A clean pinfall.",outcome:"CLEAN_PIN",
  fallout:{injuries:[],eliminations:[],linkedProgrammes:1,
   programmeSignal:"HOT_PROGRAMME",ratingStars:4.5,executionQuality:89,
   actualMinutes:28}};
 const reviewed=reviewCompletedEntry(entry,"rivalry");
 assert.match(reviewed.recap,/part of an ongoing rivalry/);
 assert.match(reviewed.recap,/story gave the crowd something to care about/);
 assert.match(reviewed.recap,/barely put a foot wrong/);
 assert.match(reviewed.recap,/28 minutes/);
 entry.fallout!.programmeSignal="PROGRAMME_REPETITION";
 assert.match(reviewCompletedEntry(entry,"rivalry").recap,
  /Repeated meetings had started to test/);
 entry.fallout!.linkedProgrammes=0;
 assert.doesNotMatch(reviewCompletedEntry(entry,"rivalry").recap,
  /ongoing rivalry|repetition/);
});

test("completed segments get detailed, evidence-only copy for all authored angle types",()=>{
 const kinds=["PROMO","INTERVIEW","CONFRONTATION","CHALLENGE",
  "CELEBRATION","ATTACK","TURN","CONTRACT_SIGNING","INTERFERENCE",
  "DEBUT","VIDEO_PACKAGE","STABLE_INVITATION","STABLE_EXIT",
  "STABLE_RECONCILIATION"] as const;
 for(const kind of kinds){
  const entry:ShowResultEntry={...basic,type:"SEGMENT",slotId:kind,
   segmentKind:kind,outcome:"HAPPENS",headline:kind,
   summary:"Authorised event took place.",
   segmentContext:{actorNames:["Alpha"],targetNames:["Bravo"],
    videoPurpose:"DEBUT_HYPE",stableDecision:"REJECTED",
    turnTargetAlignment:"HEEL"}};
  const first=reviewCompletedEntry(entry,"show");
  assert.equal(first.paragraphs.length,3);
  assert.ok(first.paragraphs[1]!.length>65,kind+" must have meaningful copy");
  assert.deepEqual(first,reviewCompletedEntry(entry,"show"));
  assert.doesNotMatch(first.recap,/a surprise finisher|was pinned with|powerbomb/i);
 }
});
test("refused or interrupted scripted angles cannot falsely claim their intended effect",()=>{
 for(const outcome of ["REFUSED","INTERRUPTED"]){
  for(const kind of ["TURN","DEBUT","STABLE_INVITATION","ATTACK","VIDEO_PACKAGE"]){
   const entry:ShowResultEntry={...basic,type:"SEGMENT",segmentKind:kind,
    headline:"Booked angle",summary:"The intended action did not complete.",
    outcome,segmentContext:{actorNames:["Alpha"],targetNames:["Bravo"],
     stableDecision:"ACCEPTED",videoPurpose:"DEBUT_HYPE",
     turnTargetAlignment:"HEEL"}};
   const narrative=reviewCompletedEntry(entry,"show");
   assert.doesNotMatch(narrative.recap,
    /completed the authored change|made the scheduled live debut|accepted the faction invitation|was the booked aggressor|video package spotlighted/i);
  }
 }
});
test("an accepted faction invitation remains a scripted answer, not a hidden roster mutation",()=>{
 const entry:ShowResultEntry={...basic,type:"SEGMENT",
  segmentKind:"STABLE_INVITATION",outcome:"HAPPENS",headline:"Faction",
  summary:"The invitation was accepted.",
  segmentContext:{actorNames:["Leader"],targetNames:["Prospect"],
   stableDecision:"ACCEPTED",videoPurpose:null,turnTargetAlignment:null}};
 const result=reviewCompletedEntry(entry,"show");
 assert.match(result.recap,/accepted the faction invitation/);
 assert.match(result.recap,/not by itself a transfer/);
});

test("the no-AI match review remembers a certified named feud without score-speak",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",
  headline:"Joe vs Riddle",summary:"Joe secured the pinfall.",outcome:"CLEAN_PIN",
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
   sides:[["Samoa Joe"],["Matt Riddle"]],winnerNames:["Samoa Joe"],
   championshipContested:false},
  programmeChapters:[{programmeId:"rivalry",sideA:"Samoa Joe",sideB:"Matt Riddle",
   precedingMatches:2,precedingAngles:1,previousWinner:"B",
   previousMatchWeek:53,currentWinner:"A"}],
  fallout:{injuries:[],eliminations:[],linkedProgrammes:1,
   programmeSignal:"HOT_PROGRAMME",ratingStars:4.5,executionQuality:88,
   chemistryModifier:2.1}};
 const result=reviewCompletedEntry(entry,"fallback-rivalry");
 assert.match(result.recap,/Samoa Joe and Matt Riddle had already shared 2 matches/);
 assert.match(result.recap,/Matt Riddle had won their most recent meeting/);
 assert.match(result.recap,/Their in-ring chemistry/);
 assert.doesNotMatch(result.recap,
  /\/100|programme heat|meaningful heat|scored compatibility|crowd score|chemistry modifier/i);
 assert.deepEqual(result,reviewCompletedEntry(entry,"fallback-rivalry"));
});
