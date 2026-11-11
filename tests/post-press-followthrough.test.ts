import test from "node:test";
import assert from "node:assert/strict";
import {composePostPressFollowthrough}
 from "../src/domain/post-press-followthrough.js";
import type {WorldNewsStory} from "../src/db/world-news.js";
const old={year:1,week:52,promotionId:"cwa",showId:"armageddon",
 title:"Josh Robinson says no comment after Armageddon"};
const show={showId:"next",promotionId:"cwa",
 promotionName:"Chaotic Wrestling Alliance",showName:"Thursday Night Chaos"};
const noteworthy:WorldNewsStory={
 key:"angle:next:scene",desk:"OFFICIAL",certainty:"CONFIRMED",
 promotionId:"cwa",promotionName:show.promotionName,showId:show.showId,
 title:"Samoa Joe challenges Matt Riddle at Thursday Night Chaos",
 summary:"The challenge happened on-screen.",sourceKind:"ANGLE"
};
const base={year:2,week:1,previousPress:[old],currentShows:[show],
 publishedStories:[noteworthy]};
test("certified next-week programme produces one fact-grounded press follow-up across the year boundary",()=>{
 const item=composePostPressFollowthrough(base);
 assert.equal(item.length,1);
 assert.equal(item[0]!.desk,"OFFICIAL");
 assert.equal(item[0]!.certainty,"CONFIRMED");
 assert.equal(item[0]!.showId,"next");
 assert.equal(item[0]!.sourceKind,"EVENT");
 assert.match(item[0]!.summary,/Samoa Joe challenges Matt Riddle/);
 assert.match(item[0]!.summary,/on.record no comment/);
 assert.doesNotMatch(item[0]!.summary,/secret plans|guaranteed rematch|certified result|simulation/);
 assert.deepEqual(item,composePostPressFollowthrough(base));
});
test("no public next-week result, false rival event, speculation or future dated press means no article",()=>{
 assert.deepEqual(composePostPressFollowthrough({...base,publishedStories:[]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,currentShows:[]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,
  publishedStories:[{...noteworthy,desk:"DIRT",certainty:"SPECULATION"}]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,
  publishedStories:[{...noteworthy,promotionId:"rival"}]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,
  previousPress:[{...old,year:2,week:1}]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,
  previousPress:[{...old,year:1,week:51}]}),[]);
 assert.deepEqual(composePostPressFollowthrough({...base,
  publishedStories:[{...noteworthy,showId:"armageddon"}]}),[]);
});
test("skipped, evasive and direct press stays attributed, never a new invented quote",()=>{
 for(const [title,words] of [
  ["Josh Robinson ends the press conference without taking questions after Armageddon",
   /ended without questions/],
  ["Josh Robinson keeps details close after Armageddon",/kept its plans close/],
  ["Josh Robinson addresses the wrestling press after Armageddon",
   /spoke to reporters/]
 ] as const){
  const out=composePostPressFollowthrough({...base,previousPress:[{...old,title}]});
  assert.equal(out.length,1);
  assert.match(out[0]!.summary,words);
  assert.doesNotMatch(out[0]!.summary,/Josh Robinson said|Josh Robinson refused|promised/i);
 }
});
test("a 2-manager World publishes at most two unique following-week stories despite duplicate cards",()=>{
 const rival={...show,showId:"rivalNext",promotionId:"rival",promotionName:"Rival Pro"};
 const rivalPress={...old,promotionId:"rival",showId:"rivalPPV",
  title:"Rival management keeps details close after the PPV"};
 const rivalStory={...noteworthy,showId:rival.showId,promotionId:rival.promotionId,
  promotionName:rival.promotionName,key:"title:rivalNext",sourceKind:"TITLE" as const};
 const inputs={...base,currentShows:[show,rival],
  previousPress:[old,rivalPress,old],publishedStories:[noteworthy,rivalStory]};
 const stories=composePostPressFollowthrough(inputs);
 assert.equal(stories.length,2);
 assert.equal(new Set(stories.map(s=>s.promotionId)).size,2);
 assert.deepEqual(stories,composePostPressFollowthrough({
  ...inputs,previousPress:[rivalPress,old],publishedStories:[rivalStory,noteworthy]
 }));
 assert.ok(stories.every(x=>x.title.length<=240&&x.summary.length<=600));
});
