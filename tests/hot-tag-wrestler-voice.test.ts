import test from "node:test";
import assert from "node:assert/strict";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
import {projectHotTagShowWrestlerPosts,projectHotTagNewsWrestlerPost}
 from "../src/domain/hot-tag-wrestler-voice.js";

function show(entries:ShowResultEntry[]):CompletedShowView{
 return {showId:"show-certified-19",year:1,week:19,crowdResponse:88,
  matchCount:entries.filter(x=>x.type==="MATCH").length,
  angleCount:entries.filter(x=>x.type==="SEGMENT").length,entries};
}
const match:ShowResultEntry={slotId:"match-1",position:1,type:"MATCH",
 headline:"Joe defeats Riddle",summary:"Joe took the decision",
 crowdResponse:89,outcome:"CLEAN_PIN",actorIds:["joe","riddle"],targetIds:[],
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
  isMainEvent:true,sides:[["Samoa Joe"],["Matt Riddle"]],
  sideParticipants:[[{personId:"joe",name:"Samoa Joe"}],
   [{personId:"riddle",name:"Matt Riddle"}]],
  winnerNames:["Samoa Joe"],championshipContested:false},
 performerIdentities:[{personId:"joe",ringName:"Samoa Joe",character:"prizefighter",
  style:null,signatureMoves:[],finishingMoves:[],source:"WORLD_RECORD"}]};
const attack:ShowResultEntry={slotId:"angle-1",position:0,type:"SEGMENT",
 headline:"Joe attacks Riddle",summary:"An assault happened",
 crowdResponse:95,outcome:"HAPPENS",actorIds:["joe"],targetIds:["riddle"],
 segmentKind:"ATTACK",segmentContext:{actorNames:["Samoa Joe"],
  targetNames:["Matt Riddle"],videoPurpose:null,stableDecision:null,turnTargetAlignment:null}};
test("wrestler voices use certified on-screen actors, prioritize moments, and don't spam accounts",()=>{
 const s=show([match,attack]);
 const before=JSON.stringify(s);
 const posts=projectHotTagShowWrestlerPosts(s);
 assert.equal(posts.length,1,"One wrestler does not post twice about the same show");
 assert.equal(posts[0]!.personId,"joe");
 assert.equal(posts[0]!.slotId,"angle-1","Major on-screen confrontation takes priority");
 assert.equal(posts[0]!.origin,"SHOW");
 assert.match(posts[0]!.handle,/^@SamoaJoe[a-z0-9]+$/);
 assert.ok(posts[0]!.likes>0);
 assert.deepEqual(projectHotTagShowWrestlerPosts(s),posts);
 assert.equal(JSON.stringify(s),before,"Projection must not mutate certified results");
});
test("verified singles and tag winners speak about the result, never unconfirmed losers",()=>{
 const one=projectHotTagShowWrestlerPosts(show([match]));
 assert.equal(one.length,1);
 assert.equal(one[0]!.personId,"joe");
 const ambiguous=structuredClone(match);
 ambiguous.matchContext!.winnerNames=["Joe","Riddle"];
 assert.equal(projectHotTagShowWrestlerPosts(show([ambiguous])).length,0);
 const tag=structuredClone(match);
 tag.matchContext!.sides=[["Joe","Partner"],["Riddle","Partner B"]];
 tag.matchContext!.sideParticipants=[
  [{personId:"joe",name:"Joe"},{personId:"partner",name:"Partner"}],
  [{personId:"riddle",name:"Riddle"},{personId:"b",name:"Partner B"}]];
 tag.matchContext!.winnerNames=["Joe","Partner"];
 const posts=projectHotTagShowWrestlerPosts(show([tag]));
 assert.equal(posts.length,1);
 assert.match(posts[0]!.text,/team|together|we|our|us/i);
});
test("unplayed or unverified public incidents never become wrestler posts",()=>{
 const cancelled={...attack,outcome:"REFUSED"};
 assert.deepEqual(projectHotTagShowWrestlerPosts(show([cancelled])),[]);
 const unseen={...attack,actorIds:[],segmentContext:{...attack.segmentContext!,
  actorNames:[]}};
 assert.deepEqual(projectHotTagShowWrestlerPosts(show([unseen])),[]);
 const missing={...match,matchContext:{...match.matchContext!,
  sideParticipants:undefined}};
 assert.deepEqual(projectHotTagShowWrestlerPosts(show([missing])),[]);
});
test("major events from different people create a bounded stable feed",()=>{
 const angles=Array.from({length:9},(_,i)=>({...attack,
  slotId:"angle-"+i,position:i,actorIds:["person-"+i],
  segmentContext:{...attack.segmentContext!,actorNames:["Person "+i]}}));
 const posts=projectHotTagShowWrestlerPosts(show(angles));
 assert.equal(posts.length,3);
 assert.equal(new Set(posts.map(x=>x.personId)).size,3);
 assert.deepEqual(projectHotTagShowWrestlerPosts(show(angles)),posts);
});
const story={id:"match:show-certified-19:match-1",year:1,week:19,
 desk:"OFFICIAL" as const,sourceKind:"MATCH",promotionId:"cwa",
 promotionName:"CWA",title:"Samoa Joe vs Matt Riddle steals the show",
 summary:"Certified 4.7 stars"};
const awards=[{year:1,week:19,kind:"MATCH" as const,
 promotionId:"cwa",showId:"show-certified-19",slotId:"match-1",
 personIds:["joe","riddle"],peopleNames:["Samoa Joe","Matt Riddle"]}];
test("published weekly awards support a verified wrestler account without a new database query",()=>{
 const post=projectHotTagNewsWrestlerPost(story,awards);
 assert.equal(post?.personId,"joe");
 assert.equal(post?.slotId,"match-1");
 assert.equal(post?.origin,"NEWS");
 assert.deepEqual(projectHotTagNewsWrestlerPost(story,awards),post);
 assert.notEqual(post?.text,story.title,"Wrestlers do not just recite news headlines");
});
test("unverified rumours, old awards, mismatched companies and wrong source cannot impersonate wrestlers",()=>{
 assert.equal(projectHotTagNewsWrestlerPost({...story,desk:"DIRT"},awards),null);
 assert.equal(projectHotTagNewsWrestlerPost({...story,promotionId:"rival"},awards),null);
 assert.equal(projectHotTagNewsWrestlerPost({...story,week:20},awards),null);
 assert.equal(projectHotTagNewsWrestlerPost({...story,id:"match:other:match-1"},awards),null);
 assert.equal(projectHotTagNewsWrestlerPost({...story,sourceKind:"TITLE"},awards),null);
 assert.equal(projectHotTagNewsWrestlerPost(story,[{...awards[0]!,
  personIds:[],peopleNames:[]}]),null);
 assert.equal(projectHotTagNewsWrestlerPost({...story,desk:"DIRT",
  title:"Unverified backstage violence"},awards),null);
});
