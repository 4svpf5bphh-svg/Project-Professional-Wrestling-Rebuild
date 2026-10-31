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
 // A quoted headline is not confirmation: all rumour responses stay framed
 // as uncertainty and no fan post is promoted to a certified World event.
 assert.ok(a.every(p=>!p.text.includes("Confirmed: Joe walked out")));
 assert.ok(a.some(p=>p.text.includes("Joe walked out?")));
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

test("official comments respond differently to challenges, title changes and debuts",()=>{
 const article={...rumour,desk:"OFFICIAL" as const};
 const fixtures=[
  {...article,id:"c1",title:"Konosuke Takeshita issues a challenge at Armageddon",
   summary:"The challenge was made live on screen."},
  {...article,id:"c2",title:"A new champion crowned at Armageddon",
   summary:"The official title changed hands."},
  {...article,id:"c3",title:"Surprise debut at Ascension",
   summary:"A new signing appeared on television."}
 ];
 const threads=fixtures.map(projectHotTagNewsThread);
 for(const posts of threads){
  assert.equal(posts.length,3);
  assert.equal(new Set(posts.map(x=>x.handle)).size,3);
  assert.equal(new Set(posts.map(x=>x.text)).size,3);
 }
 assert.ok(threads[0]!.some(x=>/challenge|answer|fight|face.to.face|mic|match/i.test(x.text)));
 assert.ok(threads[1]!.some(x=>/title|championship|belt|division|finish/i.test(x.text)));
 assert.ok(threads[2]!.some(x=>/debut|arriv|roster|signing|first impression/i.test(x.text)));
});
