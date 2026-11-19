import assert from "node:assert/strict";
import test from "node:test";
import {ANGLE_MOMENT_PRESETS,angleMomentsForFamily,angleMomentPresetStarter}
 from "../src/ui/angle-moment-presets.js";
import {STORY_BLUEPRINTS} from "../src/domain/story-blueprints.js";
import {isAngleScene} from "../src/domain/angle-scene.js";
import {isSegmentCreativeBeat} from "../src/domain/segment-creative-beats.js";
import {buildEditorSegment,addSegmentPerson}
 from "../src/ui/card-segment-model.js";

test("all twelve quick moments map to valid original Blueprint and booking fields",()=>{
 assert.equal(ANGLE_MOMENT_PRESETS.length,12);
 assert.equal(new Set(ANGLE_MOMENT_PRESETS.map(p=>p.id)).size,12);
 for(const preset of ANGLE_MOMENT_PRESETS){
  const s=angleMomentPresetStarter("angle-59",preset.id);
  const beat=STORY_BLUEPRINTS.find(p=>p.id===preset.blueprintId)!
   .beats.find(x=>x.id===preset.beatId)!;
  assert.equal(s.kind,beat.kind,preset.id);
  assert.equal(s.scene?.purpose,beat.purpose,preset.id);
  assert.ok(isAngleScene(s.scene,s.kind),preset.id);
  assert.ok(isSegmentCreativeBeat(s.creativeBeat,s.kind),preset.id);
  assert.deepEqual(s.actors,[],preset.id);
  assert.deepEqual(s.targets,[],preset.id);
  assert.equal(s.programmeId,null,preset.id);
  assert.equal(s.outcome,"HAPPENS",preset.id);
  assert.equal(s.specialMoment,null,preset.id);
 }
 for(const family of ["RISE","FALL","RELATIONSHIPS","CONFLICT"] as const){
  assert.equal(angleMomentsForFamily(family).length,3);
 }
});

test("betrayal keeps original explicit turn and separately linked Programme",()=>{
 let s=angleMomentPresetStarter("angle-59","betrayal-turn","feud-1");
 assert.equal(s.kind,"TURN");assert.equal(s.scene?.purpose,"TEASE_BETRAYAL");
 assert.equal(s.turnTargetAlignment,"HEEL");
 assert.deepEqual(s.creativeBeat,{kind:"TURN",presentation:"BETRAY_PARTNER"});
 s=addSegmentPerson(s,"actors",{personId:"joe",contractId:"joe-deal"});
 s=addSegmentPerson(s,"targets",{personId:"riddle",contractId:"riddle-deal"});
 const payload=buildEditorSegment(s);
 assert.deepEqual(payload.actorIds,["joe"]);
 assert.deepEqual(payload.targetIds,["riddle"]);
 assert.equal(payload.turnTargetAlignment,"HEEL");
 assert.equal("programmeId" in payload,false);
 assert.equal(s.programmeId,"feud-1");
});

test("title challenge stays open and ambush has only authored physical scene data",()=>{
 const c=angleMomentPresetStarter("slot-title","title-demand");
 assert.equal(c.kind,"CHALLENGE");
 assert.deepEqual(c.creativeBeat,{kind:"CHALLENGE",response:"LEFT_OPEN"});
 const a=angleMomentPresetStarter("slot-attack","jealous-ambush");
 assert.equal(a.scene?.location,"BACKSTAGE");
 assert.equal(a.scene?.intensity,"BEATDOWN");
 assert.equal(a.scene?.visual,"OFFICIALS_SEPARATE");
 assert.deepEqual(a.creativeBeat,{kind:"ATTACK",
  presentation:"PREMEDITATED_AMBUSH",objective:"ESCALATE_RIVALRY"});
 assert.deepEqual(a.targets,[]);
 assert.throws(()=>angleMomentPresetStarter("slot","invalid"));
 assert.throws(()=>angleMomentPresetStarter("slot","betrayal-turn","x".repeat(201)));
});
