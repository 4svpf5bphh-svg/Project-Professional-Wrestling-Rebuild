import test from "node:test";
import assert from "node:assert/strict";
import {postShowHandoff} from "../src/domain/post-show-handoff.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const match=(id:string,
 signal:"COOL_PROGRAMME"|"HOT_PROGRAMME"|"PROGRAMME_REPETITION"|null=null,
 stars=3.2):ShowResultEntry=>({
 slotId:id,position:0,type:"MATCH",headline:"Omega versus Joe",summary:"Official result",
 crowdResponse:80,outcome:"CLEAN_PIN",actorIds:["omega","joe"],targetIds:[],
 fallout:{ratingStars:stars,injuries:[],eliminations:[],programmeSignal:signal}
});
const view=(entries:ShowResultEntry[]):CompletedShowView=>({
 showId:"show",year:1,week:4,crowdResponse:83,matchCount:entries.filter(e=>e.type==="MATCH").length,
 angleCount:0,entries,showName:"PPW Night"
});
test("medical, title and cooling rivalry get exactly three historic, truthful routes plus booking",()=>{
 const one=match("a","COOL_PROGRAMME",4.5);
 one.fallout!.injuries=[{personName:"Joe",severity:"MODERATE",weeksOut:3,stoppage:false}];
 one.fallout!.title={name:"World Championship",winnerName:"Omega",priorHolderName:"Joe",changed:true};
 const advice=postShowHandoff(view([one]));
 assert.deepEqual(advice.actions.map(x=>x.key),
  ["medical","title","cooling","plan"]);
 assert.deepEqual(advice.actions.map(x=>x.destination),
  ["roster","championships","programmes","planner"]);
 assert.match(advice.actions[0]!.detail,/current status/);
 assert.match(advice.actions[1]!.detail,/who holds it now/);
 assert.ok(advice.actions.every(x=>!x.detail.includes("You must")));
 assert.ok(advice.standout?.includes("verified stars"));
});
test("hot rivalries take priority over generic standout while free booking stays optional",()=>{
 const advice=postShowHandoff(view([match("a","HOT_PROGRAMME",4.8)]));
 assert.deepEqual(advice.actions.map(x=>x.key),["hot","plan"]);
 assert.ok(advice.actions[0]!.detail.includes("purpose"));
 const simple=postShowHandoff(view([match("a",null,2.9)]));
 assert.deepEqual(simple.actions.map(x=>x.key),["plan"]);
});
test("verified standout is editorial only and low ratings never invent a star",()=>{
 const advice=postShowHandoff(view([match("a",null,4.45)]));
 assert.deepEqual(advice.actions.map(x=>x.key),["standout","plan"]);
 assert.match(advice.actions[0]!.detail,/4.45 verified stars/);
 const noFacts=match("b");noFacts.fallout={injuries:[],eliminations:[]};
 assert.equal(postShowHandoff(view([noFacts])).standout,null);
});
test("old injury, production and title evidence never claim the current World state",()=>{
 const old=view([match("a")]);
 old.gorillaLog={
  ...({staffName:"Mika",policy:"STICK_TO_CARD",crowdAdjustment:0,
    incidents:[{position:0,kind:"CROWD",evidence:"Verified",choice:"KEEP",
      reason:"Verified"}]} as unknown as NonNullable<CompletedShowView["gorillaLog"]>)
 };
 const actions=postShowHandoff(old).actions;
 assert.equal(actions[0]?.destination,"staff");
 assert.equal(actions[1]?.destination,"planner");
 assert.ok(actions.every(a=>!a.detail.includes("currently injured")));
});
