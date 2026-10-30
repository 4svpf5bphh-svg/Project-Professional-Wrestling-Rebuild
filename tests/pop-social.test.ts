import test from "node:test";
import assert from "node:assert/strict";
import {projectPopFeed} from "../src/domain/pop-social.js";
import {showReactionWire} from "../src/domain/show-reaction-wire.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
function fixture(name="John Cena",id="cena-night"):CompletedShowView{
 const entries:ShowResultEntry[]=[{
  slotId:"main",position:0,type:"MATCH",headline:name+" wins",
  outcome:"CLEAN_PIN",summary:"A clean pinfall",crowdResponse:87,
  actorIds:["a","b"],targetIds:[],fallout:{injuries:[],eliminations:[]},
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:18,
   sides:[[name],["Opponent"]],winnerNames:[name],championshipContested:false}
 }];
 return {showId:id,year:1,week:4,crowdResponse:87,matchCount:1,angleCount:0,entries};
}
test("POP! derives stable accounts and fictional engagement without network, writes or new incidents",()=>{
 const s=fixture();
 const original=showReactionWire(s),before=JSON.stringify(s);
 const posts=projectPopFeed(s,original);
 assert.equal(posts.length,1);
 assert.match(posts[0]!.identity.handle,/^@[A-Za-z0-9]+$/);
 assert.ok(posts[0]!.likes>0&&posts[0]!.comments>0&&posts[0]!.reposts>0);
 assert.deepEqual(projectPopFeed(s,showReactionWire(s)),posts);
 assert.equal(JSON.stringify(s),before);
 assert.equal(posts[0]!.slotId,"main");
 assert.equal(posts[0]!.source,original[0]!.source);
 assert.ok(posts.every(p=>p.text.length>0&&p.likes>0));
 assert.deepEqual(projectPopFeed(s,[]),[]);
 assert.deepEqual(projectPopFeed(s,[{...original[0]!,slotId:"phantom"}]),[]);
});
test("LOL CENA WINS is a permitted fan joke ONLY when he actually won",()=>{
 const jokes=Array.from({length:55},(_,i)=>{
  const s=fixture("John Cena","cena-"+i);
  return projectPopFeed(s,showReactionWire(s))[0]!.text;
 });
 assert.ok(jokes.some(x=>/LOL JOHN CENA WINS 😂/.test(x)));
 const losing=fixture("Samoa Joe","not-cena");
 losing.entries[0]!.matchContext!.sides=[["Samoa Joe"],["John Cena"]];
 losing.entries[0]!.matchContext!.winnerNames=["Samoa Joe"];
 assert.ok(projectPopFeed(losing,showReactionWire(losing)).every(x=>
  !/LOL JOHN CENA WINS/.test(x.text)));
 assert.ok(jokes.every(x=>!/CENA WINS AGAIN|streak|consecutive wins/i.test(x)),
  "A single certified finish does not prove an ongoing win streak");
});
test("POP! theories question reality without asserting actual backstage incidents",()=>{
 const s=fixture("Samoa Joe","heated-scenes");
 s.entries=[{slotId:"faceoff",position:0,type:"SEGMENT",headline:"Face to face",
  summary:"They confronted one another",outcome:"HAPPENS",crowdResponse:85,
  actorIds:["joe"],targetIds:["riddle"],segmentKind:"CONFRONTATION"}];
 s.matchCount=0;s.angleCount=1;
 const outputs=Array.from({length:20},(_,i)=>{
  s.showId="heated-scenes-"+i;
  return projectPopFeed(s,showReactionWire(s))[0]!.text;
 });
 assert.ok(outputs.some(x=>/was that even supposed to happen\? 👀/.test(x)));
 assert.ok(outputs.every(x=>!/confirmed real fight|actual backstage altercation/i.test(x)));
});
