import {test} from "node:test";
import {strict as assert} from "node:assert";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
import {describeAuthoredSegment,describeShowSegments} from "../src/domain/segment-results.js";
const names=new Map([["a","Wrestler A"],["b","Wrestler B"]]);
const people=[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}];
const segment=(kind:"ATTACK"|"STABLE_RECONCILIATION",outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED",position=0)=>
 buildBookedSegmentPayload({slotId:"slot-"+position,position,kind,actorIds:["a"],targetIds:["b"],outcome},people);
test("results preserve authored attack outcome",()=>{
 const happened=describeAuthoredSegment(segment("ATTACK","HAPPENS"),names);
 assert.match(happened.summary,/attacks Wrestler B/);
 const refused=describeAuthoredSegment(segment("ATTACK","REFUSED"),names);
 assert.equal(refused.outcome,"REFUSED");
 assert.match(refused.summary,/does not happen/);
 assert.doesNotMatch(refused.summary,/successfully/);
});
test("interrupted reconciliation does not assert a successful reunion",()=>{
 const result=describeAuthoredSegment(segment("STABLE_RECONCILIATION","INTERRUPTED"),names);
 assert.equal(result.outcome,"INTERRUPTED");
 assert.match(result.summary,/interrupted before completion/);
});
test("results use authored running order",()=>{
 const result=describeShowSegments([segment("ATTACK","HAPPENS",2),segment("ATTACK","REFUSED",1)],names);
 assert.deepEqual(result.map(x=>x.position),[1,2]);
});
test("duplicate slots are rejected",()=>{
 const item=segment("ATTACK","HAPPENS");
 assert.throws(()=>describeShowSegments([item,item],names));
});

test("scripted interruption and rescue endings are certified distinctly",()=>{
 const endings=[
  {kind:"INTERRUPTION" as const,roles:[["a"],["b"]] as const,
   ending:"SPEAKER_PREVAILS" as const,expected:/Wrestler B got the last word/},
  {kind:"RESCUE" as const,roles:[["a","c"],["b"]] as const,
   ending:"RESCUE_OVERWHELMED" as const,expected:/rescue was overwhelmed/},
  {kind:"POST_MATCH_ASSAULT" as const,roles:[["a"],["b"]] as const,
   ending:"VICTIM_FIGHTS_BACK" as const,expected:/Wrestler B fought back/}
 ];
 const namesWithRescuer=new Map([...names,["c","Wrestler C"]]);
 for(const {kind,roles,ending,expected} of endings){
  const item=buildBookedSegmentPayload({
   slotId:"story",position:1,kind,actorIds:[...roles[0]],
   targetIds:[...roles[1]],outcome:"HAPPENS",
   creativeBeat:{kind,ending} as never,
   ...(kind==="POST_MATCH_ASSAULT"?{sourceMatchSlotId:"bout"}:{})
  },[...new Set([...roles[0],...roles[1]])].map(personId=>({
   personId,contractId:"contract-"+personId
  })));
  assert.match(describeAuthoredSegment(item,namesWithRescuer).summary,expected);
  const refused=describeAuthoredSegment({...item,outcome:"REFUSED"},namesWithRescuer);
  assert.doesNotMatch(refused.summary,expected,
   "An angle that did not happen cannot claim the scripted ending occurred");
 }
});

test("filmed bloodied locker-room ambush honours roles, purpose, and refusal",()=>{
 const scene={location:"LOCKER_ROOM" as const,visual:"BLOODIED" as const,
  purpose:"ELEVATE_INITIATOR" as const};
 const payload=buildBookedSegmentPayload({
  slotId:"joe-ambush",position:1,kind:"ATTACK",actorIds:["a"],targetIds:["b"],
  outcome:"HAPPENS",creativeBeat:{kind:"ATTACK",
   presentation:"BLINDSIDE",objective:"GENERATE_HEAT"},scene
 },people);
 const summary=describeAuthoredSegment(payload,names).summary;
 assert.match(summary,/Wrestler A attacks Wrestler B in the locker room/);
 assert.match(summary,/bloodied/);
 assert.doesNotMatch(summary,/elevate the initiator|medical injury|rating score/i);
 assert.doesNotMatch(summary,/was injured|injured for|weeks out/);
 const stopped=describeAuthoredSegment({...payload,outcome:"REFUSED"},names).summary;
 assert.doesNotMatch(stopped,/bloodied|elevate the initiator/);
});

test("video, turn and faction What choices are expressed only when the scene happens",()=>{
 const samples=[
  {kind:"VIDEO_PACKAGE",beat:{kind:"VIDEO_PACKAGE",presentation:"DARK_TEASER"},check:/more questions than answers/},
  {kind:"TURN",beat:{kind:"TURN",presentation:"REJECT_OLD_SELF"},check:/rejected their old identity/},
  {kind:"STABLE_EXIT",beat:{kind:"STABLE_EXIT",departure:"PUBLIC_DENUNCIATION"},check:/denounced in public/}
 ] as const;
 for(const sample of samples){
  const item=buildBookedSegmentPayload({
   slotId:sample.kind,position:0,kind:sample.kind,outcome:"HAPPENS",
   actorIds:["a"],targetIds:[],durationMinutes:5,
   ...(sample.kind==="VIDEO_PACKAGE"?{videoPurpose:"FEUD_RECAP" as const}:{}),
   ...(sample.kind==="STABLE_EXIT"?{stableId:"stable"}:{}),
   creativeBeat:sample.beat
  },[{personId:"a",contractId:"a-contract"}]);
  assert.match(describeAuthoredSegment(item,names).summary,sample.check);
  assert.doesNotMatch(describeAuthoredSegment({...item,outcome:"INTERRUPTED"},names).summary,sample.check);
 }
});

test("promos, interviews, celebrations, confrontations and debuts honour selected What",()=>{
 const samples=[
  {kind:"PROMO" as const,beat:{kind:"PROMO" as const,purpose:"PROMISE_VICTORY" as const},actors:["a"],targets:[],text:/victory was boldly promised/},
  {kind:"INTERVIEW" as const,beat:{kind:"INTERVIEW" as const,format:"BACKSTAGE" as const,topic:"TITLE_AMBITIONS" as const,response:"SARCASTIC" as const},actors:["a"],targets:[],text:/title ambitions.*sarcasm/},
  {kind:"CELEBRATION" as const,beat:{kind:"CELEBRATION" as const,occasion:"FACTION_UNITY" as const,ending:"POSE" as const},actors:["a"],targets:[],text:/faction unity.*pose/},
  {kind:"CONFRONTATION" as const,beat:{kind:"CONFRONTATION" as const,ending:"RELUCTANT_HANDSHAKE" as const},actors:["a"],targets:["b"],text:/uneasy handshake/},
  {kind:"DEBUT" as const,beat:{kind:"DEBUT" as const,presentation:"SURPRISE_REVEAL" as const,objective:"CREATE_MYSTERY" as const},actors:["a"],targets:[],text:/crowd by surprise/}
 ];
 for(const sample of samples){
  const personIds=[...sample.actors,...sample.targets];
  const payload=buildBookedSegmentPayload({
   slotId:sample.kind,position:0,kind:sample.kind,outcome:"HAPPENS",
   actorIds:sample.actors,targetIds:sample.targets,creativeBeat:sample.beat
  },personIds.map(personId=>({personId,contractId:"deal-"+personId})));
  const happened=describeAuthoredSegment(payload,names).summary;
  assert.match(happened,sample.text);
  assert.doesNotMatch(describeAuthoredSegment({...payload,outcome:"REFUSED"},names).summary,sample.text);
 }
});
