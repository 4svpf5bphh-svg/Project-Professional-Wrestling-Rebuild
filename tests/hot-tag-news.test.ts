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
 assert.ok(a.length>=3&&a.length<=6,"A story has 3–6 fan reactions");
 assert.deepEqual(a,projectHotTagNewsThread({...rumour}));
 assert.deepEqual(rumour,{id:"wild:s1",year:1,week:12,desk:"DIRT",
  promotionName:"CWA",title:"Joe walked out?",summary:"Anonymous report with a competing denial."});
 assert.ok(a.every(p=>p.handle.startsWith("@")&&p.likes>=0));
 // Fans react in their own words, never mechanically echoing the news title.
 assert.ok(a.every(p=>!p.text.includes("Confirmed: Joe walked out")));
 assert.ok(a.every(p=>!p.text.includes("“Joe walked out?”")));
 assert.equal(new Set(a.map(p=>p.text)).size,a.length,"Distinct fan reactions, not repeated comments");
 assert.ok(a.some(p=>/source|version|story|work|claim|fiction|allegation|anonymous|rumour|report|journal|heat|timeline|fake|made up|wrestling|argu/i.test(p.text)));
 assert.deepEqual(dirtSheetByline(rumour.id),dirtSheetByline(rumour.id));
});
test("fan response varies by story and official reporting does not claim gossip is evidence",()=>{
 const official={...rumour,desk:"OFFICIAL" as const,id:"title:s2"};
 const before=projectHotTagNewsThread(official);
 assert.ok(before.length>=3&&before.length<=6,"A story has 3–6 fan reactions");
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
  assert.ok(posts.length>=3&&posts.length<=6,"A story has 3–6 fan reactions");
  assert.equal(new Set(posts.map(x=>x.handle)).size,posts.length);
  assert.equal(new Set(posts.map(x=>x.text)).size,posts.length);
 }
 assert.ok(threads[0]!.some(x=>/challenge|answer|fight|face.to.face|mic|match/i.test(x.text)));
 assert.ok(threads[1]!.some(x=>/title|championship|belt|division|finish/i.test(x.text)));
 assert.ok(threads[2]!.some(x=>/debut|arriv|roster|signing|first impression/i.test(x.text)));
});

test("official headline is not fed back verbatim as a fan's dialogue",()=>{
 const headline="WrestleMania takes centre stage";
 const posts=projectHotTagNewsThread({...rumour,
  desk:"OFFICIAL",title:headline,summary:"WWE held its premium event"});
 assert.ok(posts.length>=3&&posts.length<=6,"A story has 3–6 fan reactions");
 assert.ok(posts.every(p=>!p.text.includes(headline)));
});

test("new weekly broadcasts have more varied, still deterministic fictional fan voices",()=>{
 const newer={...rumour,year:1,week:19};
 const posts=projectHotTagNewsThread(newer);
 assert.deepEqual(posts,projectHotTagNewsThread(newer));
 assert.ok(posts.length>=3&&posts.length<=6,"A story has 3–6 fan reactions");
 assert.equal(new Set(posts.map(p=>p.text)).size,posts.length);
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
 assert.ok(posts.length>=3&&posts.length<=6,"A story has 3–6 fan reactions");
 assert.deepEqual(posts,projectHotTagNewsThread(match));
 assert.ok(posts.some(p=>p.text.includes("Mei Seira vs Suzu Suzuki")),
  "Fan conversation names the actual certified match");
 assert.ok(posts.every(p=>!p.text.includes("People somehow have a definitive take")),
  "Match stories never fall back to the generic OTHER reaction bank");
 assert.equal(new Set(posts.map(p=>p.text)).size,posts.length);
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
 assert.ok(comments.length>=3&&comments.length<=6,"A story has 3–6 fan reactions");
 assert.ok(comments.some(c=>/ratings|viewers|network|broadcast|TV|schedule/.test(c.text)));
});

test("Press-conference HOT TAG reacts to the actual type of saved answer",()=>{
 const article={...rumour,year:3,week:22,desk:"OFFICIAL" as const,
  id:"press:official:ppv-one",title:"Josh Robinson says no comment after Armageddon",
  summary:'Josh declined the question, replying "No comment. You will have to wait for the next show."'};
 const noComment=projectHotTagNewsThread(article);
 assert.ok(noComment.length>=3&&noComment.length<=6);
 assert.match(noComment[0]!.text,/no comment|refusal|reason|words/i);
 assert.ok(noComment.every(p=>!p.text.includes("Josh Robinson:")));
 assert.deepEqual(noComment,projectHotTagNewsThread(article));
 const evasive=projectHotTagNewsThread({...article,
  title:"Josh Robinson keeps details close after Armageddon"});
 assert.match(evasive[0]!.text,/promoter|sidestep|cards|details|answer/i);
 const direct=projectHotTagNewsThread({...article,
  title:"Josh Robinson addresses the wrestling press after Armageddon"});
 assert.match(direct[0]!.text,/answered|on.record|manager has spoken/i);
 assert.notDeepEqual(noComment,evasive);
 assert.notDeepEqual(evasive,direct);
 const skippedArticle={...article,id:"press:official:ppv-skipped",
  title:"Josh Robinson ends the press conference without taking questions after Armageddon",
  summary:"Josh Robinson ended the post-show press session without answering any of the three questions."};
 const skipped=projectHotTagNewsThread(skippedArticle);
 assert.ok(skipped.length>=3&&skipped.length<=6);
 assert.match(skipped[0]!.text,/without answering|zero answers|skipped scrum/i);
 assert.doesNotMatch(skipped[0]!.text,/refused|no comment|declined/i);
 assert.notDeepEqual(skipped,noComment);
 assert.deepEqual(skipped,projectHotTagNewsThread(skippedArticle));
 const followed=projectHotTagNewsThread({...article,
  id:"press:followup:w2",title:"CWA returns to the ring after press scrutiny",
  summary:"The certified broadcast gave wrestling fans another headline."});
 assert.ok(followed.length>=3&&followed.length<=6);
 assert.match(followed[0]!.text,/on.air follow.up|microphones|next show/i);
 assert.deepEqual(followed,projectHotTagNewsThread({...article,
  id:"press:followup:w2",title:"CWA returns to the ring after press scrutiny",
  summary:"The certified broadcast gave wrestling fans another headline."}));
 assert.notDeepEqual(followed,noComment);
 const dirts=projectHotTagNewsThread({...article,
  id:"press:rumour:ppv-one",desk:"DIRT",title:"No comment after Armageddon"});
 assert.match(dirts[0]!.text,/no comment|refusal|reason|words/i);
 assert.equal(new Set(dirts.map(p=>p.text)).size,dirts.length);
});

/** Entire-feed verification: stable IDs, no recurring two-account monopoly, no
 * provider calls and no fabricated wrestler/network endorsements. */
test("HOT TAG rotates a large fictional population with rowdy takes and occasional replies",()=>{
 const stories=Array.from({length:120},(_,i)=>({...rumour,
  id:"broadcast:network:BROADCAST_GROWTH:warning:"+i,
  year:3,week:22,desk:"OFFICIAL" as const,
  title:"VibeFlix has concerns about television audiences",
  summary:'A certified broadcast notice. VibeFlix responded: "Improve next week."'
 }));
 const threads=stories.map(projectHotTagNewsThread);
 const handles=new Map<string,number>();
 const counts=new Set<number>();
 let hasReply=false,hasRudeness=false,hasHumour=false,total=0;
 for(let i=0;i<threads.length;i++){
  const thread=threads[i]!;counts.add(thread.length);
  assert.ok(thread.length>=3&&thread.length<=6);
  assert.deepEqual(thread,projectHotTagNewsThread(stories[i]!));
  assert.equal(new Set(thread.map(p=>p.handle)).size,thread.length);
  assert.equal(new Set(thread.map(p=>p.text)).size,thread.length);
  for(const comment of thread){
   total++;handles.set(comment.handle,(handles.get(comment.handle)??0)+1);
   if(comment.replyTo){hasReply=true;
    assert.ok(thread.some(other=>other.handle===comment.replyTo));
   }
   hasRudeness ||= /shit|bollocks|bloody|damn/i.test(comment.text);
   hasHumour ||= /pigeon|nan|goblin|steel cage|spreadsheet|powerbomb/i.test(comment.text);
   assert.ok(!comment.text.includes('VibeFlix responded:'),
    "Fans must not impersonate a certified broadcaster statement");
  }
 }
 assert.ok(counts.size>=3,"Do not repeat one fixed comment count on every story");
 assert.ok(handles.size>=40,"Many distinct accounts, not the same two on every article");
 assert.ok(Math.max(...handles.values())<total/8,"No single account monopolises the feed");
 assert.ok(hasReply,"Some comments respond to an earlier visible fan");
 assert.ok(hasRudeness&&hasHumour,
  "Wrestling-social comments should include both colourful language and absurdity");
});
