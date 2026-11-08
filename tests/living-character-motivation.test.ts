import test from "node:test";
import assert from "node:assert/strict";
import {livingWrestlerMotivation} from "../src/domain/living-character-motivation.js";
const base={onRoster:true,status:"ACTIVE",careerStage:"PRIME",
 currentWeekIndex:40,momentum:66,morale:70,championships:[]};
test("a verified unresolved wrestler pitch outranks generic career form",()=>{
 const motivation=livingWrestlerMotivation({...base,
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:30}],
  requests:[{kind:"CREATIVE",status:"PENDING",createdWeekIndex:39}]});
 assert.equal(motivation?.kind,"CREATIVE");
 assert.equal(motivation?.next,"BACKSTAGE");
 assert.match(motivation!.reason,/not replied/i);
});
test("accepted mic-time promise stays a booking obligation without changing the card",()=>{
 const motivation=livingWrestlerMotivation({...base,
  requests:[{kind:"CREATIVE",status:"PROMISED",createdWeekIndex:38,
   dueWeekIndex:41,decision:"PROMISE_SEGMENT"}]});
 assert.equal(motivation?.kind,"PROMISE_PENDING");
 assert.match(motivation!.title,/promo or angle/);
 assert.match(motivation!.reason,/Y1 W42/);
 assert.equal(motivation?.source,"PROMISE");
 assert.equal(motivation?.next,"BOOKING");
});
test("a broken promise stays consequential until a later verified fulfilment",()=>{
 const memory=[{kind:"PROMISE_BROKEN",weekIndex:29}];
 assert.equal(livingWrestlerMotivation({...base,memories:memory})?.kind,"PROMISE_BROKEN");
 assert.notEqual(livingWrestlerMotivation({...base,memories:[...memory,
  {kind:"PROMISE_KEPT",weekIndex:35}]})?.kind,"PROMISE_BROKEN");
 assert.notEqual(livingWrestlerMotivation({...base,currentWeekIndex:75,
  memories:memory})?.kind,"PROMISE_BROKEN");
});
test("a title chance matters, but a later win or live championship supersedes it",()=>{
 assert.equal(livingWrestlerMotivation({...base,
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:32}]})?.kind,"TITLE_CHALLENGE");
 assert.notEqual(livingWrestlerMotivation({...base,memories:[
  {kind:"TITLE_CHALLENGE",weekIndex:32},{kind:"TITLE_WON",weekIndex:33}
 ]})?.kind,"TITLE_CHALLENGE");
 assert.equal(livingWrestlerMotivation({...base,championships:["World Title"],
  memories:[{kind:"TITLE_CHALLENGE",weekIndex:32}]})?.kind,"CHAMPION");
});
test("career stages vary, but never invent contracts or outcomes",()=>{
 for(const [stage,kind] of [["PROSPECT","PROSPECT"],["PRIME","PRIME"],
  ["VETERAN","VETERAN"],["SPECIAL_ATTRACTION","SPECIAL_ATTRACTION"]] as const)
  assert.equal(livingWrestlerMotivation({...base,careerStage:stage})?.kind,kind);
 assert.equal(livingWrestlerMotivation({...base,momentum:9})?.kind,"LOW_MOMENTUM");
 assert.equal(livingWrestlerMotivation({...base,morale:12})?.kind,"LOW_MORALE");
});
test("private directions are unavailable for non-roster or retired wrestlers",()=>{
 assert.equal(livingWrestlerMotivation({...base,onRoster:false,
  requests:[{kind:"CREATIVE",status:"PENDING",createdWeekIndex:40}]}),null);
 assert.equal(livingWrestlerMotivation({...base,status:"RETIRED"}),null);
 assert.equal(livingWrestlerMotivation({...base,status:"INJURED",
  requests:[{kind:"TITLE_AMBITION",status:"PENDING",createdWeekIndex:40}]})?.kind,
  "RECOVERY");
 assert.equal(livingWrestlerMotivation({...base,currentWeekIndex:-1}),null);
});

test("wrestler-led proposals name their verified counterpart and match history",()=>{
 const rival=livingWrestlerMotivation({...base,requests:[{
  kind:"RIVALRY_PITCH",status:"PENDING",createdWeekIndex:39,
  relatedName:"Matt Riddle",verifiedShows:3}]});
 assert.equal(rival?.title,"Build a rivalry with Matt Riddle");
 assert.match(rival!.reason,/3 completed singles matches with Matt Riddle/);
 assert.equal(rival?.next,"BACKSTAGE");
 const tag=livingWrestlerMotivation({...base,requests:[{
  kind:"TAG_TEAM_PITCH",status:"PENDING",createdWeekIndex:39,
  relatedName:"Dax Harwood",verifiedShows:2}]});
 assert.equal(tag?.title,"Team with Dax Harwood");
 assert.match(tag!.reason,/2 completed tag matches together/);
});

test("agreed pitch stays actionable until a real completed show or programme",()=>{
 const explore={kind:"RIVALRY_PITCH",status:"ANSWERED",decision:"EXPLORE_RIVALRY",
  createdWeekIndex:36,respondedWeekIndex:37,
  relatedName:"Matt Riddle",verifiedShows:3,followThroughWeekIndex:null};
 const pending=livingWrestlerMotivation({...base,requests:[explore]});
 assert.equal(pending?.kind,"RIVALRY_FOLLOW_THROUGH");
 assert.equal(pending?.next,"PROGRAMMES");
 assert.match(pending!.reason,/has not been recorded yet/);
 assert.notEqual(livingWrestlerMotivation({...base,requests:[{
  ...explore,followThroughWeekIndex:39}]})?.kind,"RIVALRY_FOLLOW_THROUGH");
 assert.notEqual(livingWrestlerMotivation({...base,currentWeekIndex:47,requests:[
  explore]})?.kind,"RIVALRY_FOLLOW_THROUGH");
 const pair=livingWrestlerMotivation({...base,requests:[{
  ...explore,kind:"TAG_TEAM_PITCH",decision:"EXPLORE_TEAM"}]});
 assert.equal(pair?.kind,"TAG_FOLLOW_THROUGH");
 assert.equal(pair?.next,"BOOKING");
 assert.match(pair!.reason,/completed tag match/);
});

test("declined, unsafe or expired ideas cannot become fake new booker commitments",()=>{
 const given={kind:"RIVALRY_PITCH",status:"ANSWERED",decision:"EXPLORE_RIVALRY",
  createdWeekIndex:36,respondedWeekIndex:37,
  relatedName:"Matt Riddle",followThroughWeekIndex:null};
 for(const altered of [
  {...given,status:"DECLINED"}, {...given,decision:"TALK"},
  {...given,relatedName:null},{...given,respondedWeekIndex:null},
  {...given,respondedWeekIndex:45}
 ]){
  assert.notEqual(livingWrestlerMotivation({...base,requests:[altered]})?.kind,
   "RIVALRY_FOLLOW_THROUGH");
 }
 const priority=livingWrestlerMotivation({...base,requests:[given,
  {kind:"CREATIVE",status:"PENDING",createdWeekIndex:40}]});
 assert.equal(priority?.kind,"CREATIVE");
 assert.equal(livingWrestlerMotivation({...base,onRoster:false,requests:[given]}),null);
 assert.equal(livingWrestlerMotivation({...base,status:"INJURED",requests:[given]})?.kind,
  "RECOVERY");
});

test("veteran-led mentorship remembers real tag chemistry and an actionable next step",()=>{
 const pitch={kind:"MENTORSHIP_PITCH",status:"PENDING",createdWeekIndex:40,
  verifiedShows:3,relatedName:"Young Prospect"};
 const asking=livingWrestlerMotivation({...base,careerStage:"VETERAN",requests:[pitch]});
 assert.equal(asking?.kind,"MENTORSHIP_PITCH");
 assert.equal(asking?.title,"Help Young Prospect develop");
 assert.match(asking!.reason,/3 completed tag matches/);
 const accepted={...pitch,status:"ANSWERED",decision:"EXPLORE_MENTORSHIP",
  respondedWeekIndex:40,followThroughWeekIndex:null};
 const continuing=livingWrestlerMotivation({...base,requests:[accepted]});
 assert.equal(continuing?.kind,"MENTORSHIP_FOLLOW_THROUGH");
 assert.equal(continuing?.next,"BOOKING");
 assert.match(continuing!.reason,/Only a new completed match/);
 assert.notEqual(livingWrestlerMotivation({...base,requests:[{
  ...accepted,followThroughWeekIndex:41}]})?.kind,"MENTORSHIP_FOLLOW_THROUGH");
 assert.notEqual(livingWrestlerMotivation({...base,currentWeekIndex:49,
  requests:[accepted]})?.kind,"MENTORSHIP_FOLLOW_THROUGH");
 assert.notEqual(livingWrestlerMotivation({...base,requests:[{
  ...accepted,decision:"NOT_NOW"}]})?.kind,"MENTORSHIP_FOLLOW_THROUGH");
 assert.equal(livingWrestlerMotivation({...base,status:"INJURED",
  requests:[accepted]})?.kind,"RECOVERY");
 assert.equal(livingWrestlerMotivation({...base,onRoster:false,requests:[accepted]}),null);
});

test("refusal is remembered briefly, never treated as a promise, artificial feud or injury",()=>{
 const refused={kind:"REQUEST_DECLINED",weekIndex:39};
 const current=livingWrestlerMotivation({...base,memories:[refused]});
 assert.equal(current?.kind,"REQUEST_DECLINED");
 assert.match(current!.reason,/Y1 W40/);
 assert.match(current!.reason,/did not promise or schedule anything/);
 assert.notEqual(livingWrestlerMotivation({...base,currentWeekIndex:45,
  memories:[refused]})?.kind,"REQUEST_DECLINED");
 assert.equal(livingWrestlerMotivation({...base,status:"INJURED",
  memories:[refused]})?.kind,"RECOVERY");
 assert.equal(livingWrestlerMotivation({...base,memories:[refused],
  requests:[{kind:"CREATIVE",status:"PENDING",createdWeekIndex:40}]})?.kind,"CREATIVE");
});
