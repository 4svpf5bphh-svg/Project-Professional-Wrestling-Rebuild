import test from "node:test";
import assert from "node:assert/strict";
import {getPostShowVoiceBenchmark} from "../src/domain/postshow-voice-lab.js";
import {hotTagEditorialAnchors,validateHotTagEditorial,readHotTagEditorial} from "../src/domain/hot-tag-editorial.js";
import {postShowVoiceBrief,validatePostShowVoiceCopy,readPostShowVoiceCopy,blendPostShowVoiceCopy} from "../src/domain/postshow-voice-batch.js";
import {generatePostShowVoiceCopy} from "../src/db/postshow-voice-batches.js";
import {projectPopFeed} from "../src/domain/pop-social.js";
import {showReactionWire} from "../src/domain/show-reaction-wire.js";
const fixture=()=>getPostShowVoiceBenchmark("i-quit")!.show;
const copyFor=(show:ReturnType<typeof fixture>)=>{
 const anchor=hotTagEditorialAnchors(show)[0]!;
 return {[anchor.key]:{text:anchor.participants[0]+" is the reason I care about this rivalry. Give me more of this."}};
};
test("Groq fan opinion reuses certified identities, slot and engagement",()=>{
 const show=fixture(),before=projectPopFeed(show,showReactionWire(show));
 const anchors=hotTagEditorialAnchors(show);
 assert.ok(anchors.length>0&&anchors.length<=2);
 const copy=validateHotTagEditorial(anchors,copyFor(show));
 assert.equal(copy.length,1);
 assert.equal(copy[0]?.slotId,anchors[0]?.slotId);
 assert.equal(copy[0]?.voice,anchors[0]?.voice);
 const accepted=validatePostShowVoiceCopy(postShowVoiceBrief(show),{fans:copyFor(show)});
 assert.ok(accepted?.fans?.length);
 assert.deepEqual(readPostShowVoiceCopy(show,accepted),accepted);
 const enhanced=projectPopFeed({...show,shortform:blendPostShowVoiceCopy(show,accepted)},showReactionWire(show));
 const old=before.find(p=>p.slotId===copy[0]!.slotId)!;
 const newPost=enhanced.find(p=>p.slotId===copy[0]!.slotId)!;
 assert.equal(newPost.text,copy[0]!.text);
 assert.deepEqual(newPost.identity,old.identity);
 assert.equal(newPost.likes,old.likes);
 assert.equal(newPost.source,old.source);
});
test("Reject imagined wins, backstage news, generic non-local posts, fake identities",()=>{
 const show=fixture(),anchors=hotTagEditorialAnchors(show),a=anchors[0]!,name=a.participants[0]!;
 for(const text of [
  name+" won by pinfall and I thought it was brilliant.",
  name+" signed a new contract, what a great move.",
  name+" has a concussion but I think he'll be fine.",
  "I want much better stories in this promotion.",
  name+" is good but my insider says they are leaving.",
  name+" is brilliant according to the certified simulation.",
  name+" is great! Follow https://example.com for more.",
 ])assert.equal(validateHotTagEditorial(anchors,{[a.key]:{text}}).length,0,text);
 const good=validateHotTagEditorial(anchors,copyFor(show))[0]!;
 assert.deepEqual(readHotTagEditorial(anchors,[{...good,slotId:"invented"}]),[]);
 assert.deepEqual(readHotTagEditorial(anchors,[{...good,voice:"FAKE"}]),[]);
 assert.deepEqual(readHotTagEditorial(anchors,[good,good]),[]);
});
test("One Groq request writes fan copy with no second request or paid provider",async()=>{
 const show=fixture();let calls=0;let diagnostic:unknown;
 const result=await generatePostShowVoiceCopy(show,"dummy",async(url,init)=>{
  calls++;assert.match(String(url),/api\.groq\.com/);
  const body=JSON.parse(String(init?.body));
  assert.equal(body.model,"openai/gpt-oss-20b");
  assert.equal(body.max_completion_tokens,1000);
  assert.match(body.messages[0].content,/Opinions and wishes only/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({fans:copyFor(show)})}}]}));
 },undefined,d=>{diagnostic=d;});
 assert.equal(calls,1);assert.equal(result?.fans?.length,1);
 assert.equal((diagnostic as {fanThreads?:{accepted:number}})?.fanThreads?.accepted,1);
});
test("A failed fan response leaves the entire original deterministic feed intact",()=>{
 const show=fixture(),original=projectPopFeed(show,showReactionWire(show));
 const copy=validatePostShowVoiceCopy(postShowVoiceBrief(show),{fans:{f0:{text:"Fabricated report"}}});
 assert.equal(copy,null);
 assert.deepEqual(projectPopFeed({...show,shortform:blendPostShowVoiceCopy(show,copy)},showReactionWire(show)),original);
});
