import test from "node:test";
import assert from "node:assert/strict";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
import {verifiedSlotStoryThreads} from "../src/domain/ringside-story-threads.js";
import {ringsideBrief} from "../src/domain/ringside-editorial.js";
import type {RingsideMemory} from "../src/db/ringside-continuity.js";

const matchup=(slotId:string,position:number,sideA:string,sideB:string):ShowResultEntry=>({
 slotId,position,type:"MATCH",headline:sideA+" vs "+sideB,
 summary:"Official contest",outcome:"CLEAN_PIN",crowdResponse:80,
 actorIds:[sideA,sideB],targetIds:[],
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:15,
  sides:[[sideA],[sideB]],winnerNames:[sideA],championshipContested:false}
});
const chapter={programmeId:"joe-riddle",sideA:"Samoa Joe",sideB:"Matt Riddle",
 precedingMatches:1,precedingAngles:2,previousWinner:"B" as const,
 previousMatchWeek:53,currentWinner:"A" as const};
const angle:ShowResultEntry={slotId:"challenge",position:0,type:"SEGMENT",
 headline:"A challenge",summary:"The challenge took place",outcome:"HAPPENS",
 crowdResponse:75,actorIds:["joe"],targetIds:["riddle"],
 segmentContext:{actorNames:["Samoa Joe"],targetNames:["Matt Riddle"],
  videoPurpose:null,stableDecision:null,turnTargetAlignment:null},
 programmeChapters:[{...chapter,currentWinner:null}]};
const joe={...matchup("joe",1,"Samoa Joe","Matt Riddle"),programmeChapters:[chapter]};
const another=matchup("unrelated",2,"Kenny Omega","PAC");
const noMatch=matchup("outsider",3,"Cody Rhodes","MJF");
const show:CompletedShowView={showId:"new",showName:"Collision",
 year:2,week:4,matchCount:3,angleCount:1,crowdResponse:79,
 entries:[angle,joe,another,noMatch]};
const history:RingsideMemory={priorMatches:[
 {when:"Y2 W2",wrestlers:["Kenny Omega","PAC"],winners:["PAC"],finish:"CLEAN_PIN"},
 {when:"Y2 W3",wrestlers:["Cody Rhodes","MJF"],winners:["MJF"],finish:"FLASH_PIN"},
 {when:"Y2 W5",wrestlers:["Samoa Joe","Matt Riddle"],winners:["Matt Riddle"],finish:"SUBMISSION"},
 {when:"Y1 W1",wrestlers:["Samoa Joe","Someone else"],winners:["Someone else"],finish:"CLEAN_PIN"},
 ],programmes:[]};
test("linked promo and match share a story without pretending the earlier angle caused it",()=>{
 const notes=verifiedSlotStoryThreads(show,history);
 assert.equal(notes.length,4);
 assert.deepEqual(notes[1]?.earlierOnThisCard,{card:1,kind:"SEGMENT"});
 assert.deepEqual(notes[0]?.rivalry,{
  pairing:"Samoa Joe vs Matt Riddle",previousMatches:1,previousAngles:2,
  lastMatch:"Year 2, Week 2",lastWinner:"Matt Riddle"
 });
 assert.equal(notes[1]?.rivalry?.previousMatches,1);
 assert.equal(notes[1]?.previousSharedMatch,undefined,
  "Certified feud's exact last result takes precedence over generic shared card history");
 assert.doesNotMatch(JSON.stringify(notes),/revenge|retaliation|promised/i);
});
test("only opposite-side participants sharing a certified prior match receive callbacks",()=>{
 const notes=verifiedSlotStoryThreads(show,history);
 assert.deepEqual(notes[2]?.previousSharedMatch,
  {when:"Y2 W2",winner:"PAC",finish:"CLEAN_PIN"});
 assert.deepEqual(notes[3]?.previousSharedMatch,
  {when:"Y2 W3",winner:"MJF",finish:"FLASH_PIN"});
 const mix=matchup("not-their-feud",4,"PAC","Matt Riddle");
 const outside=verifiedSlotStoryThreads({...show,entries:[mix]},history);
 assert.equal(outside[0],null);
 const together=matchup("together",4,"Kenny Omega","Cody Rhodes");
 const teamed:typeof history={...history,priorMatches:[{when:"Y2 W1",
  wrestlers:["Kenny Omega","Cody Rhodes","PAC","MJF"],winners:["Kenny Omega"],finish:"CLEAN_PIN"}]};
 // A shared match is not proof of opposing teams in the historical bout.
 const label=verifiedSlotStoryThreads({...show,entries:[together]},teamed)[0];
 assert.equal(label?.previousSharedMatch?.winner,"Kenny Omega");
 assert.equal(label?.rivalry,undefined);
});
test("future and same-week history is suppressed even when stale data is supplied",()=>{
 const bad:RingsideMemory={priorMatches:[{when:"Y2 W5",
  wrestlers:["Kenny Omega","PAC"],winners:["PAC"],finish:"CLEAN_PIN"},
 {when:"Y2 W4",wrestlers:["Kenny Omega","PAC"],winners:["PAC"],finish:"CLEAN_PIN"},
 {when:"not a date",wrestlers:["Kenny Omega","PAC"],winners:["PAC"],finish:"CLEAN_PIN"}],programmes:[]};
 assert.deepEqual(verifiedSlotStoryThreads({...show,entries:[another]},bad),[null]);
});
test("Groq's compact factual brief has different private history per slot and no global dump",()=>{
 const brief=ringsideBrief(show,history);
 assert.equal(brief.slots.length,4);
 assert.equal(brief.slots[0]?.storyThread?.rivalry?.pairing,"Samoa Joe vs Matt Riddle");
 assert.equal(brief.slots[1]?.storyThread?.earlierOnThisCard?.card,1);
 assert.equal(brief.slots[2]?.storyThread?.previousSharedMatch?.winner,"PAC");
 assert.equal(brief.slots[3]?.storyThread?.previousSharedMatch?.winner,"MJF");
 // Previous/next card headlines are intentionally retained for transitions.
 // Only historical evidence must be strictly scoped to its own encounter.
 assert.doesNotMatch(JSON.stringify(brief.slots[2]?.storyThread),/Matt Riddle|Samoa Joe/);
 assert.doesNotMatch(JSON.stringify(brief.slots[3]?.storyThread),/PAC|Samoa Joe/);
 const without=ringsideBrief({...show,entries:[noMatch]});
 assert.equal("storyThread" in without.slots[0]!,false);
});
