import test from "node:test";
import assert from "node:assert/strict";
import {HOT_TAG_NAME,HOT_TAG_TAGLINE,dirtSheetByline,
 projectHotTagNewsThread} from "../src/domain/hot-tag-news.js";
const rumour={
 id:"wild:s1",year:1,week:12,desk:"DIRT" as const,promotionName:"CWA",
 title:"Joe walked out?",summary:"Anonymous report with a competing denial."
};
test("HOT TAG is an actual wrestling-social brand, not a new account service",()=>{
 assert.equal(HOT_TAG_NAME,"HOT TAG");
 assert.equal(HOT_TAG_TAGLINE,"Tag in. Sound off.");
 const a=projectHotTagNewsThread(rumour);
 assert.equal(a.length,3);
 assert.deepEqual(a,projectHotTagNewsThread({...rumour}));
 assert.deepEqual(rumour,{id:"wild:s1",year:1,week:12,desk:"DIRT",
  promotionName:"CWA",title:"Joe walked out?",summary:"Anonymous report with a competing denial."});
 assert.ok(a.every(p=>p.handle.startsWith("@")&&p.likes>=0));
 assert.ok(a.every(p=>!p.text.includes("Joe walked out")));
 assert.equal(new Set(a.map(p=>p.text)).size,3,"Three genuine distinct fan reactions, not repeated comments");
 assert.ok(a.some(p=>/source|version|story|work|claim|fiction|allegation|anonymous|rumour|report|journal|heat|timeline|fake|made up|wrestling|argu/i.test(p.text)));
 assert.deepEqual(dirtSheetByline(rumour.id),dirtSheetByline(rumour.id));
});
test("fan response varies by story and official reporting does not claim gossip is evidence",()=>{
 const official={...rumour,desk:"OFFICIAL" as const,id:"title:s2"};
 const before=projectHotTagNewsThread(official);
 assert.equal(before.length,3);
 assert.ok(before.every(p=>!p.text.includes("verified locker-room fight")));
 assert.notDeepEqual(before,projectHotTagNewsThread(rumour));
 assert.notDeepEqual(projectHotTagNewsThread({...rumour,id:"wild:other"}),projectHotTagNewsThread(rumour));
});
