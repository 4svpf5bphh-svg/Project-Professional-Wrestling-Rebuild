import test from "node:test";
import assert from "node:assert/strict";
import {chooseWorldMoments} from "../src/db/world-honours.js";
import type {WeeklyAward,WorldNewsStory} from "../src/db/world-news.js";

const award:WeeklyAward={
 kind:"MATCH",promotionId:"ai",promotionName:"AI Elite",showId:"finished",
 showName:"World Classic",slotId:"m1",title:"Alice vs Cara",
 peopleNames:["Alice","Cara"],personIds:["a","c"],rating:4.75,ratingUnit:"STARS"
};
const story=(key:string,sourceKind:WorldNewsStory["sourceKind"],
 title:string,desk:WorldNewsStory["desk"]="OFFICIAL"):WorldNewsStory=>({
 key,desk,certainty:desk==="DIRT"?"SPECULATION":"CONFIRMED",
 promotionId:"ai",promotionName:"AI Elite",showId:"finished",
 title,summary:"Verified completed show receipt.",sourceKind
});
test("World Moments only curate certified landmark facts, never speculation or normal matches",()=>{
 const stories=[
  story("title:finished:a","TITLE","World title changes hands"),
  story("angle:finished:b","ANGLE","Alice: Turn at World Classic"),
  story("event:finished","EVENT","World Classic makes headlines"),
  story("gossip","CROWD","Unconfirmed backstage SECRET","DIRT"),
  story("angle:finished:c","ANGLE","Someone: Attack at World Classic")
 ];
 const selected=chooseWorldMoments([award],stories);
 assert.deepEqual(selected.map(m=>m.kind),["TITLE","CLASSIC","TURN","EVENT"]);
 assert.equal(selected.length,4);
 assert.ok(selected.every(m=>m.showId==="finished"));
 assert.ok(!JSON.stringify(selected).includes("SECRET"));
 assert.equal(chooseWorldMoments([{...award,rating:4.5}],[]).length,0);
 assert.deepEqual(chooseWorldMoments([],stories.slice().reverse()),[
  ...chooseWorldMoments([],stories)
 ]);
});
