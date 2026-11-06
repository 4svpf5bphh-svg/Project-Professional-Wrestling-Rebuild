import test from "node:test";
import assert from "node:assert/strict";
import {HOT_TAG_NAME,HOT_TAG_TAGLINE,dirtSheetByline,
 projectHotTagNewsThread,projectHotTagBroadcasterPost} from "../src/domain/hot-tag-news.js";
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
 // Fans react in their own words, never mechanically echoing the news title.
 assert.ok(a.every(p=>!p.text.includes("Confirmed: Joe walked out")));
 assert.ok(a.every(p=>!p.text.includes("“Joe walked out?”")));
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

test("official headline is not fed back verbatim as a fan's dialogue",()=>{
 const headline="WrestleMania takes centre stage";
 const posts=projectHotTagNewsThread({...rumour,
  desk:"OFFICIAL",title:headline,summary:"WWE held its premium event"});
 assert.equal(posts.length,3);
 assert.ok(posts.every(p=>!p.text.includes(headline)));
});

test("new weekly broadcasts have more varied, still deterministic fictional fan voices",()=>{
 const newer={...rumour,year:1,week:19};
 const posts=projectHotTagNewsThread(newer);
 assert.deepEqual(posts,projectHotTagNewsThread(newer));
 assert.equal(posts.length,3);
 assert.equal(new Set(posts.map(p=>p.text)).size,3);
 const future=Array.from({length:50},(_,i)=>projectHotTagNewsThread({
  ...newer,id:"next-week:"+i
 })).flat();
 assert.ok(future.some(p=>/conspiracy board|barber|car crash|anonymous source/i.test(p.text)),
  "New stories draw from the larger fictional voice bank");
});

test("certified match news generates participant-specific comments, not generic OTHER templates",()=>{
 const match={...rumour,id:"verified-title-main",desk:"OFFICIAL" as const,
  promotionName:"STARDOM",
  title:"Mei Seira vs Suzu Suzuki steals the show at Weekly show",
  summary:"Weekly show delivered a 4.75-star match for STARDOM."};
 const posts=projectHotTagNewsThread(match);
 assert.equal(posts.length,3);
 assert.deepEqual(posts,projectHotTagNewsThread(match));
 assert.ok(posts.some(p=>p.text.includes("Mei Seira vs Suzu Suzuki")),
  "Fan conversation names the actual certified match");
 assert.ok(posts.every(p=>!p.text.includes("People somehow have a definitive take")),
  "Match stories never fall back to the generic OTHER reaction bank");
 assert.equal(new Set(posts.map(p=>p.text)).size,3);
});

test("HOT TAG shows verified network voices only beneath a matching published statement",()=>{
 const verified={id:"broadcast:network:BROADCAST_TV:warning:abc",
  year:2,week:6,desk:"OFFICIAL" as const,promotionName:"CWA",
  title:"BBS Sports issues a TV warning",
  summary:'Three broadcast misses. BBS Sports responded: "The board expects better television."'};
 const post=projectHotTagBroadcasterPost(verified);
 assert.equal(post?.networkCode,"BROADCAST_TV");
 assert.equal(post?.displayName,"BBS Sports");
 assert.match(post?.text??"",/board expects/);
 assert.deepEqual(projectHotTagBroadcasterPost(verified),post);
 assert.equal(projectHotTagBroadcasterPost({...verified,desk:"DIRT"}),null);
 assert.equal(projectHotTagBroadcasterPost({...verified,id:"broadcast:clash:abc"}),null);
 assert.equal(projectHotTagBroadcasterPost({...verified,summary:"Unattributed speculation"}),null);
 const comments=projectHotTagNewsThread(verified);
 assert.equal(comments.length,3);
 assert.ok(comments.some(c=>/ratings|viewers|network|broadcast|TV|schedule/.test(c.text)));
});
