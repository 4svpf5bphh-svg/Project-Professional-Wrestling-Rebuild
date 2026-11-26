
import test from "node:test";
import assert from "node:assert/strict";
import {estimatedGroqTokens} from "../src/domain/ai-director.js";
import {weeklyEditorialAnchors,weeklyEditorialMessages,weeklyEditorialResponseFormat,validateWeeklyEditorial,validateWeeklyEditorialDetailed,weeklyShowMomentSlot,weeklyHotTagThread,weeklyRatingsStory,readWeeklyRatingsStory,type WeeklyStory} from "../src/domain/weekly-world-editorial.js";
const official:WeeklyStory={id:"broadcast:ratings",year:1,week:30,title:"Crown Wrestling ratings decline",summary:"Crown Wrestling recorded a lower audience.",promotionName:"Crown Wrestling",promotionId:"a",desk:"OFFICIAL",certainty:"CONFIRMED"};
const dirt:WeeklyStory={...official,id:"rumour:1",desk:"DIRT",certainty:"SPECULATION",title:"Rival Wrestling future uncertain",promotionId:"b",promotionName:"Rival Wrestling"};
const copy={headline:"Why Crown Wrestling should rethink its approach",commentary:"I think Crown Wrestling should give the audience a better reason to care.",fans:["I hope Crown Wrestling makes the next broadcast worth watching.","Crown Wrestling should worry less about hype and more about good wrestling.","That broadcast was worth watching for the opener alone."]};
test("weekly brief includes public anchors and coherent fan replies with stable identities",()=>{
 const anchors=weeklyEditorialAnchors([official,dirt]);
 assert.equal(anchors.length,1);
 assert.doesNotMatch(weeklyEditorialMessages(anchors)[1]!.content,/SPECULATION/);
 const saved=validateWeeklyEditorial(anchors,{s0:copy});
 assert.deepEqual(saved[official.id],copy);
 const thread=weeklyHotTagThread(official,saved[official.id]);
 assert.equal(thread.length,3);assert.equal(thread[2]!.replyTo,thread[0]!.handle);
 assert.equal(thread[0]!.text,copy.fans[0]);
 assert.deepEqual(weeklyHotTagThread(official,saved[official.id]),thread);
});
test("invalid fan lead falls back without losing a valid independent opinion",()=>{
 const anchors=weeklyEditorialAnchors([official]);
 for(const first of ["Crown Wrestling signed a new star yesterday, I think.","Crown Wrestling should aim for 999 viewers.","I think this is brilliant for everyone."]){
  const saved=validateWeeklyEditorial(anchors,{s0:{...copy,fans:[first,...copy.fans.slice(1)]}});
  assert.equal(saved[official.id]?.fans?.[0],null);assert.equal(saved[official.id]?.fans?.[1],copy.fans[1]);assert.equal(saved[official.id]?.fans?.[2],null);
  assert.notEqual(weeklyHotTagThread(official,saved[official.id])[0]!.text,first);
 }
 assert.deepEqual(validateWeeklyEditorial(anchors,{wrong:copy}),{});
 assert.deepEqual(validateWeeklyEditorial(anchors,{s0:{fans:[...copy.fans.slice(0,2)]}})[official.id]?.fans,[...copy.fans.slice(0,2),null]);
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

test("one previous public source per promotion, no duplicate threads across stories",()=>{
 const second={...official,id:"event:other",title:"Crown Wrestling tournament outlook"};
 const anchors=weeklyEditorialAnchors([official,second],[],[
  {year:1,week:29,promotionId:"a",title:"Public prior tournament headline"},
  {year:1,week:31,promotionId:"a",title:"Private future tournament plans"}]);
 assert.match(weeklyEditorialMessages(anchors)[1]!.content,/Public prior tournament headline/);
 assert.doesNotMatch(weeklyEditorialMessages(anchors)[1]!.content,/Private future tournament plans/);
 assert.equal(Object.keys(validateWeeklyEditorial(anchors,{s0:copy,s1:copy})).length,1);
});

test("W31 public story accepts surname, CWA acronym, natural opinions and independent replies from the explicit response envelope",()=>{
 const joe:WeeklyStory={id:"angle:ascension:assault",year:1,week:31,desk:"OFFICIAL",certainty:"CONFIRMED",promotionId:"cwa",promotionName:"Chaotic Wrestling Alliance",title:"Samoa Joe makes a statement at Ascension",summary:"The post match assault happened on Chaotic Wrestling Alliance's Ascension, with Matt Riddle also involved.",sourceKind:"ANGLE",humanManaged:true};
 const anchors=weeklyEditorialAnchors([joe]);
 const result=validateWeeklyEditorialDetailed(anchors,{stories:[{key:"s0",headline:"Joe brings the heat",commentary:"Riddle and Joe are the reason to watch CWA right now.",fans:["Joe is an absolute menace.","Riddle needs to get his own back.","Calling Joe a menace is fair, but Riddle looks ready for a fight."]}]});
 assert.equal(result.copy[joe.id]?.fans?.[0],"Joe is an absolute menace.");
 assert.equal(result.copy[joe.id]?.fans?.[1],"Riddle needs to get his own back.");
 assert.equal(result.copy[joe.id]?.fans?.[2],"Calling Joe a menace is fair, but Riddle looks ready for a fight.");
 const rejected=validateWeeklyEditorialDetailed(anchors,{stories:[{key:"s0",fans:["Joe signed a new contract yesterday.","Riddle needs to get his own back.","Calling Joe a menace is fair, but Riddle looks ready for a fight."]}]});
 assert.equal(rejected.issues.UNVERIFIED_CLAIM,1);assert.equal(rejected.issues.PARENT_REJECTED,1);
 assert.equal(rejected.copy[joe.id]?.fans?.[1],"Riddle needs to get his own back.");
 assert.equal(weeklyShowMomentSlot(joe,"ascension",["assault"]),"assault");
 assert.equal(weeklyShowMomentSlot(joe,"another",["assault"]),null);
 assert.equal(weeklyShowMomentSlot({...joe,desk:"DIRT"},"ascension",["assault"]),null);
});
test("an ordinary match and a rumour do not take up a second feature",()=>{
 const a={...official,id:"angle:a:slot",sourceKind:"ANGLE",humanManaged:true};
 const b={...a,id:"match:b:slot",sourceKind:"MATCH",promotionId:"b",promotionName:"Rival Wrestling"};
 const rating={...official,id:"broadcast:ratings:weekly"};
 const anchors=weeklyEditorialAnchors([rating,dirt,a,b]);
 assert.deepEqual(anchors.map(x=>x.story.id),[a.id]);
});

test("strict weekly response requires every anchor, with distinct fan fields and no unknown keys",()=>{
 const a={...official,id:"angle:a:slot",sourceKind:"ANGLE",humanManaged:true};
 const b={...a,id:"match:b:slot",promotionId:"b",promotionName:"Rival Wrestling"};
 const rating={...official,id:"broadcast:ratings:weekly"};
 const anchors=weeklyEditorialAnchors([rating,dirt,a,b]);
 const response=weeklyEditorialResponseFormat(anchors);
 assert.equal(response.json_schema.strict,true);
 const schema=response.json_schema.schema;
 assert.deepEqual(schema.required,["s0","s1"]);
 assert.equal(schema.additionalProperties,false);
 for(const [key,field] of Object.entries(schema.properties)){
  assert.equal(field.additionalProperties,false);
  assert.deepEqual(field.required,["headline","commentary","fan1","fan2","reply","wrestler",...(key==="s0"?["fan3","fan4"]:[])]);
 }
 const result=validateWeeklyEditorialDetailed(weeklyEditorialAnchors([official]),{s0:{
  headline:copy.headline,commentary:copy.commentary,fan1:copy.fans[0],fan2:copy.fans[1],reply:copy.fans[2],wrestler:null
 }});
 assert.deepEqual(result.copy[official.id],copy);
});
test("weekly ratings snapshot cannot establish promotion growth",()=>{
 const story=weeklyRatingsStory(1,32,[{promotionId:"a",promotionName:"Crown Wrestling",rating:0.8,humanManaged:true}])!;
 const result=validateWeeklyEditorialDetailed(weeklyEditorialAnchors([story]),{s0:{fan1:"Crown Wrestling is growing fast.",fan2:"Crown Wrestling has a respectable audience.",reply:"Nah, not for me.",headline:"Crown Wrestling on television",commentary:"Crown Wrestling has a respectable audience this week.",wrestler:null}});
 assert.equal(result.issues.UNVERIFIED_RATINGS_TREND,1);
 assert.equal(result.copy[story.id]?.fans?.[0],null);
 assert.equal(result.copy[story.id]?.fans?.[1],"Crown Wrestling has a respectable audience.");
});

test("two full-sized weekly editorial sources fit the shared dispatch reservation",()=>{
 const sources=Array.from({length:3},(_,i)=>({...official,id:"title:"+i,sourceKind:"TITLE",humanManaged:true,promotionId:"p"+i,title:"x".repeat(200),summary:"x".repeat(500),promotionName:"p".repeat(110)}));
 const anchors=weeklyEditorialAnchors([...sources,{...dirt,id:"wild:show",title:"y".repeat(200),summary:"y".repeat(500)}]);
 const body={model:"openai/gpt-oss-20b",temperature:0.7,reasoning_effort:"low",max_completion_tokens:2600,
  response_format:weeklyEditorialResponseFormat(anchors),messages:weeklyEditorialMessages(anchors)};
 assert.equal(anchors.length,2);
 assert.ok(estimatedGroqTokens(JSON.stringify(body),2600)<=7000);
});

test("persona labels and false TV rivalry framing do not leak into the weekly edition",()=>{
 const story=weeklyRatingsStory(1,33,[{promotionId:"cwa",promotionName:"Chaotic Wrestling Alliance",rating:.1,humanManaged:true},{promotionId:"wwe",promotionName:"WWE",rating:3.5,humanManaged:false}])!;
 const result=validateWeeklyEditorialDetailed(weeklyEditorialAnchors([story]),{s0:{
  headline:"WWE outpaces CHA",commentary:"CWA has a smaller television audience this week.",
  fan1:"Passionate promotion loyalist: CWA deserves more viewers.",fan2:"CWA needs time to build a following.",reply:"Fair enough, give it time.",wrestler:null}});
 assert.equal(result.copy[story.id]?.headline,undefined);
 assert.equal(result.copy[story.id]?.commentary,"CWA has a smaller television audience this week.");
 assert.equal(result.copy[story.id]?.fans?.[0],"CWA deserves more viewers.");
 assert.equal(result.issues.UNVERIFIED_RATINGS_TREND,1);
});

test("routine signing digests do not consume the weekly editorial budget",()=>{
 const stories=Array.from({length:18},(_,i)=>({...official,id:"signing:"+i,title:"Talent "+i+" signs with Crown Wrestling",humanManaged:i>=14}));
 const anchors=weeklyEditorialAnchors(stories);
 assert.equal(anchors.length,1);
});
test("accepted Groq comments do not get padded with unrelated template replies",()=>{
 const s={...official,id:"match:show:slot"};
 const posts=weeklyHotTagThread(s,{fans:[null,"Crown Wrestling needs better stories.",null]});
 assert.equal(posts.length,1);
 assert.equal(posts[0]?.text,"Crown Wrestling needs better stories.");
});

test("title-win discussion reaches the exact match on the correct completed show",()=>{
 const s={...official,id:"title:extreme:main",sourceKind:"TITLE"};
 assert.equal(weeklyShowMomentSlot(s,"extreme",["main"]),"main");
 assert.equal(weeklyShowMomentSlot(s,"ascension",["main"]),null);
 assert.equal(weeklyShowMomentSlot({...s,desk:"DIRT"},"extreme",["main"]),null);
});

 test("championship leads, with a distinct TV angle as the second feature",()=>{
 const title={...official,id:"title:ppv:m1",sourceKind:"TITLE",humanManaged:true};
 const other={...official,id:"angle:tv:a1",sourceKind:"ANGLE",promotionId:"b",promotionName:"Rival Wrestling",humanManaged:true};
 const wild={...dirt,id:"wild:tv"};
 const routine={...official,id:"signing:routine"};
 const anchors=weeklyEditorialAnchors([routine,dirt,wild,other,title]);
 assert.deepEqual(anchors.map(a=>a.story.id),[title.id,other.id]);
 });
 test("recent fan copy is rejected without discarding fresh opinions",()=>{
 const anchors=weeklyEditorialAnchors([official],[],[],[copy.fans[0]!]);
 assert.match(weeklyEditorialMessages(anchors)[1]!.content,/avoidRecentFanCopy/);
 const result=validateWeeklyEditorialDetailed(anchors,{s0:copy});
 assert.equal(result.copy[official.id]?.fans?.[0],null);
 assert.equal(result.copy[official.id]?.fans?.[1],copy.fans[1]);
 assert.equal(result.copy[official.id]?.fans?.[2],null);
 });

 test("five lead reactions use stable identities and a real reply, without extra provider requests",()=>{
 const anchors=weeklyEditorialAnchors([official]);
 const saved=validateWeeklyEditorial(anchors,{s0:{...copy,fans:[...copy.fans,"Crown Wrestling has to give the fans a reason to tune in.","I reckon Crown Wrestling should put wrestling before the hype."]}});
 const posts=weeklyHotTagThread(official,saved[official.id]);
 assert.equal(posts.length,5);assert.equal(new Set(posts.map(p=>p.handle)).size,5);
 assert.equal(posts[2]?.replyTo,posts[0]?.handle);
 assert.deepEqual(posts,weeklyHotTagThread(official,saved[official.id]));
 });

test("fallback threads keep distinct reactions across an edition without discarding real AI copy",()=>{
 const seen=new Set<string>();
 for(let i=0;i<3;i++){
  const posts=weeklyHotTagThread({...official,id:"angle:"+i,title:"A wrestling angle",sourceKind:"ANGLE"},undefined,seen);
  assert.ok(posts.length>=3&&posts.length<=6);
  for(const post of posts){const key=post.text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();assert.ok(!seen.has(key));seen.add(key);}
 }
 assert.equal(weeklyHotTagThread(official,{fans:[null,"Crown Wrestling needs better stories.",null]},seen).length,1);
});

test("a same-show recap, human controls and unconfirmed stories cannot change the public lead",()=>{
 const belt={...official,id:"title:ppv:main",showId:"ppv",sourceKind:"TITLE",promotionId:"ai"};
 const recap={...belt,id:"event:ppv",sourceKind:"EVENT"};
 const tv={...belt,id:"angle:tv:turn",showId:"tv",sourceKind:"ANGLE"};
 const hidden={...belt,id:"title:other:main",certainty:"SPECULATION" as const};
 assert.deepEqual(weeklyEditorialAnchors([official,recap,tv,hidden,belt]).map(a=>a.story.id),[belt.id,tv.id]);
 assert.deepEqual(weeklyEditorialAnchors([dirt]),[]);
});

test("unrelated replies fail without discarding either independent fan",()=>{
 const result=validateWeeklyEditorialDetailed(weeklyEditorialAnchors([official]),{s0:{
  ...copy,fans:[copy.fans[0],copy.fans[1],"Nah mate, let them cook."]
 }});
 assert.deepEqual(result.copy[official.id]?.fans,[copy.fans[0],copy.fans[1],null]);
 assert.equal(result.fields["reply.REPLY_CONTEXT"],1);
});
