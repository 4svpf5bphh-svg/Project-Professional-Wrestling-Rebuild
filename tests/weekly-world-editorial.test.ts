
import test from "node:test";
import assert from "node:assert/strict";
import {weeklyEditorialAnchors,weeklyEditorialMessages,validateWeeklyEditorial,weeklyHotTagThread,type WeeklyStory} from "../src/domain/weekly-world-editorial.js";
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
