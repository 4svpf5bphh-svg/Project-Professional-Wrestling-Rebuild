
import test from "node:test";
import assert from "node:assert/strict";
import {weeklyEditorialAnchors,weeklyEditorialMessages,validateWeeklyEditorial,weeklyHotTagThread,weeklyRatingsStory,readWeeklyRatingsStory,type WeeklyStory} from "../src/domain/weekly-world-editorial.js";
const official:WeeklyStory={id:"broadcast:ratings",year:1,week:30,title:"Crown Wrestling ratings decline",summary:"Crown Wrestling recorded a lower audience.",promotionName:"Crown Wrestling",promotionId:"a",desk:"OFFICIAL",certainty:"CONFIRMED"};
const dirt:WeeklyStory={...official,id:"rumour:1",desk:"DIRT",certainty:"SPECULATION",title:"Rival Wrestling future uncertain",promotionId:"b",promotionName:"Rival Wrestling"};
const copy={headline:"Why Crown Wrestling should rethink its approach",commentary:"I think Crown Wrestling should give the audience a better reason to care.",fans:["I hope Crown Wrestling makes the next broadcast worth watching.","Crown Wrestling should worry less about hype and more about good wrestling.","Nah mate, I think you are being far too harsh."]};
test("weekly brief includes public anchors and coherent fan replies with stable identities",()=>{
 const anchors=weeklyEditorialAnchors([official,dirt]);
 assert.equal(anchors.length,2);
 assert.match(weeklyEditorialMessages(anchors)[1]!.content,/SPECULATION/);
 const saved=validateWeeklyEditorial(anchors,{s0:copy});
 assert.deepEqual(saved[official.id],copy);
 const thread=weeklyHotTagThread(official,saved[official.id]);
 assert.equal(thread.length,3);assert.equal(thread[2]!.replyTo,thread[0]!.handle);
 assert.equal(thread[0]!.text,copy.fans[0]);
 assert.deepEqual(weeklyHotTagThread(official,saved[official.id]),thread);
});
test("unverified result, numeric claim, generic lead and broken reply fall back as a thread",()=>{
 const anchors=weeklyEditorialAnchors([official]);
 for(const first of ["Crown Wrestling signed a new star yesterday, I think.","Crown Wrestling should aim for 999 viewers.","I think this is brilliant for everyone."]){
  const saved=validateWeeklyEditorial(anchors,{s0:{...copy,fans:[first,...copy.fans.slice(1)]}});
  assert.equal(saved[official.id]?.fans,undefined);
  assert.notEqual(weeklyHotTagThread(official,saved[official.id])[0]!.text,first);
 }
 assert.deepEqual(validateWeeklyEditorial(anchors,{wrong:copy}),{});
 assert.deepEqual(validateWeeklyEditorial(anchors,{s0:{fans:[...copy.fans.slice(0,2)]}}),{});
});

test("ratings anchor uses only certified finite supplied episodes and prefers human broadcasts",()=>{
 const story=weeklyRatingsStory(1,31,[
  {promotionId:"ai",promotionName:"Titan Wrestling",rating:8.1,humanManaged:false},
  {promotionId:"a",promotionName:"Crown Wrestling",rating:0.4,humanManaged:true},
  {promotionId:"invalid",promotionName:"Unknown",rating:NaN,humanManaged:false}])!;
 assert.equal(story.promotionId,"a");assert.match(story.summary,/0\.40/);assert.match(story.summary,/8\.10/);
 assert.doesNotMatch(story.summary,/Unknown/);assert.match(story.summary,/not necessarily/);
 assert.deepEqual(readWeeklyRatingsStory(story,1,31),story);assert.equal(readWeeklyRatingsStory(story,1,30),null);
});
test("wrestler voice is attached only to the verified public award identity",()=>{
 const story:WeeklyStory={...official,id:"match:show:slot",sourceKind:"MATCH"};
 const anchors=weeklyEditorialAnchors([story],[{year:1,week:30,kind:"MATCH",promotionId:"a",showId:"show",slotId:"slot",personIds:["w"],peopleNames:["Rex"]}]);
 assert.equal(anchors[0]?.wrestler?.personId,"w");
 const saved=validateWeeklyEditorial(anchors,{s0:{wrestler:"I think the people who watched deserve more like that."}});
 assert.equal(saved[story.id]?.wrestler?.personId,"w");
 assert.deepEqual(validateWeeklyEditorial(anchors,{s0:{wrestler:"I pinned him and I guarantee my next match."}}),{});
 assert.deepEqual(validateWeeklyEditorial(weeklyEditorialAnchors([dirt]),{s0:{wrestler:"I think the fans deserve more than that."}}),{});
});
