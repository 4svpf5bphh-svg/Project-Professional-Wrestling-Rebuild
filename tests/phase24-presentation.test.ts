import {test} from "node:test";
import assert from "node:assert/strict";
import {describeProgrammeChapter} from "../src/ui/programme-chapter-summary.js";
import {projectShowBreakdown} from "../src/ui/show-breakdown.js";
import type {ShowResultEntry} from "../src/db/show-results-view.js";

test("a certified attack timeline identifies its actual scripted place and intensity",()=>{
 const scene=describeProgrammeChapter({kind:"SEGMENT",weekIndex:12,segmentKind:"ATTACK",
  sceneLocation:"LOCKER_ROOM",sceneIntensity:"BEATDOWN",sceneVisual:"BLOODIED",
  angleOutcome:"HAPPENS"},"Samoa Joe","Mistico");
 assert.equal(scene.headline,"Attack");
 assert.match(scene.detail,/Locker Room/);
 assert.match(scene.detail,/Beatdown/);
 assert.match(scene.detail,/Bloodied/);
 assert.equal(scene.kind,"ANGLE");
});

test("match chapters are grounded in recorded winners, not generated storyline advice",()=>{
 assert.equal(describeProgrammeChapter({kind:"MATCH",weekIndex:11,winnerSide:"A"},
  "The Guns","The Bucks").headline,"The Guns won");
 assert.equal(describeProgrammeChapter({kind:"MATCH",weekIndex:11,winnerSide:null},
  "The Guns","The Bucks").headline,"Match completed");
});

test("certified rundown retains match outcomes, rating, injury and title facts",()=>{
 const entries:ShowResultEntry[]=[{
  slotId:"m1",position:0,type:"MATCH",headline:"Samoa Joe beat Mistico",
  summary:"Joe won",crowdResponse:85,outcome:"CLEAN_PIN",
  actorIds:["joe","mistico"],targetIds:[],
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
   sides:[["Samoa Joe"],["Mistico"]],winnerNames:["Samoa Joe"],
   championshipContested:true},
  fallout:{ratingStars:4.25,actualMinutes:19,injuries:[{
   personName:"Mistico",severity:"MINOR",weeksOut:2,stoppage:false}],
   eliminations:[],title:{name:"World Title",winnerName:"Samoa Joe",
    priorHolderName:"Mistico",changed:true}}
 },{
  slotId:"a1",position:1,type:"SEGMENT",headline:"Locker room attack",summary:"Attack",
  crowdResponse:66,outcome:"HAPPENS",actorIds:["joe"],targetIds:["mistico"],
  segmentKind:"ATTACK",segmentContext:{actorNames:["Samoa Joe"],targetNames:["Mistico"],
   videoPurpose:null,stableDecision:null,turnTargetAlignment:null}
 }];
 const rows=projectShowBreakdown(entries);
 assert.equal(rows.length,2);
 assert.equal(rows[0]?.winner,"Samoa Joe");
 assert.equal(rows[0]?.stars,4.25);
 assert.equal(rows[0]?.minutes,19);
 assert.equal(rows[0]?.participants,"Samoa Joe vs Mistico");
 assert.equal(rows[0]?.keyMoments.length,2);
 assert.equal(rows[1]?.kind,"ANGLE");
 assert.equal(rows[1]?.stars,null);
 assert.equal(rows[1]?.participants,"Samoa Joe · Mistico");
});
