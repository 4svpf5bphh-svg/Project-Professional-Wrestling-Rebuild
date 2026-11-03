import test from "node:test";
import assert from "node:assert/strict";
import {programmeMatchStarter,programmeAngleIdeaStarter,programmeAngleCastStarter}
 from "../src/ui/programme-booking-starter.js";
import {recommendProgrammeAngles} from "../src/domain/programme-angle-recommendations.js";
import {buildEditorSegment} from "../src/ui/card-segment-model.js";
import {buildBookedMatch} from "../src/ui/card-editor-model.js";
const p={programmeId:"rivalry",cast:[
 {personId:"joe",name:"Samoa Joe",side:"A" as const,contractId:"contract-joe"},
 {personId:"m",name:"Místico",side:"B" as const,contractId:"contract-m"}]};
test("one-tap feud match reuses the canonical finish/cast model, never secretly changes winner",()=>{
 const result=programmeMatchStarter(p,"slot",new Set());
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.value.format,"SINGLES");
 const canonical=buildBookedMatch(result.value);
 assert.equal(canonical.participants.length,2);
 assert.deepEqual(canonical.sides.map(s=>s.participants[0]?.personId),["joe","m"]);
 assert.equal(result.value.winnerSide,0);
});
test("team rivalry uses the existing tag engine, and refuses a booked wrestler",()=>{
 const tag={programmeId:"tag-feud",cast:[
  ...p.cast,{personId:"a",name:"Ally",side:"A" as const,contractId:"contract-a"},
  {personId:"b",name:"Buddy",side:"B" as const,contractId:"contract-b"}]};
 const result=programmeMatchStarter(tag,"tag",new Set());
 assert.equal(result.ok,true);
 if(result.ok){
  assert.equal(result.value.format,"TAG");
  assert.equal(result.value.teams[0]?.length,2);
  assert.equal(result.value.teams[1]?.length,2);
 }
 const blocked=programmeMatchStarter(tag,"tag",new Set(["joe"]));
 assert.equal(blocked.ok,false);
});
test("stale, invalid or missing contracts never create synthetic appearance rights",()=>{
 const unsafe={...p,cast:p.cast.map(x=>x.personId==="joe"?{...x,contractId:null}:x)};
 const match=programmeMatchStarter(unsafe,"match");
 const idea=recommendProgrammeAngles({heat:45,repetition:5})[0]!;
 const angle=programmeAngleCastStarter(unsafe,programmeAngleIdeaStarter(unsafe,"angle",idea),"A");
 assert.equal(match.ok,false);assert.equal(angle.ok,false);
 assert.match(!match.ok?match.reason:"",/Samoa Joe/);
});
test("a recommended attack casts real sides and authors a valid why/where, no forced outcome",()=>{
 const idea=recommendProgrammeAngles({heat:60,repetition:48,
  latestFollowUp:{choice:"PLAN_RETALIATION",laterAngleRecorded:false}}).find(x=>x.kind==="ATTACK")!;
 const starter=programmeAngleIdeaStarter(p,"angle",idea);
 assert.equal(starter.scene?.purpose,"SEEK_REVENGE");
 assert.equal(starter.scene?.location,"BACKSTAGE");
 const result=programmeAngleCastStarter(p,starter,"B");
 assert.equal(result.ok,true);
 if(result.ok){
  assert.deepEqual(result.value.actors.map(x=>x.personId),["m"]);
  assert.deepEqual(result.value.targets.map(x=>x.personId),["joe"]);
  assert.equal(result.value.outcome,"HAPPENS");
  assert.equal(buildEditorSegment(result.value).kind,"ATTACK");
 }
});
test("contract signing casts both sides as speakers; video is a recap not an appearance miracle",()=>{
 const ideas=recommendProgrammeAngles({heat:80,repetition:0});
 const signing=programmeAngleIdeaStarter(p,"contract",ideas[0]!);
 const cast=programmeAngleCastStarter(p,signing,"A");
 assert.equal(signing.kind,"CONTRACT_SIGNING");
 assert.equal(cast.ok,true);
 if(cast.ok){
  assert.equal(cast.value.actors.length,2);
  assert.equal(cast.value.targets.length,0);
  assert.equal(buildEditorSegment(cast.value).kind,"CONTRACT_SIGNING");
 }
 const video=programmeAngleIdeaStarter(p,"recap",
  ideas.find(x=>x.kind==="VIDEO_PACKAGE")!);
 assert.equal(video.videoPurpose,"FEUD_RECAP");
 const castVideo=programmeAngleCastStarter(p,video,"B");
 assert.equal(castVideo.ok,true);
});
test("latest certified angle changes lead suggestion instead of repeating identical beats",()=>{
 const p={heat:82,repetition:0,lastChapter:{kind:"SEGMENT",segmentKind:"CONTRACT_SIGNING"}};
 const choices=recommendProgrammeAngles(p);
 assert.equal(choices[0]?.kind,"CHALLENGE");
 assert.equal(choices[2]?.kind,"CONTRACT_SIGNING");
});

test("older programme cards without cast metadata keep manual booking available",()=>{
 const historic={programmeId:"historic",cast:undefined} as unknown as typeof p;
 const result=programmeMatchStarter(historic,"fresh");
 assert.equal(result.ok,false);
 assert.match(!result.ok?result.reason:"",/manually/);
});
