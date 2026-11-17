import test from "node:test";
import assert from "node:assert/strict";
import {STORY_BLUEPRINTS,storyBlueprint,storyBlueprintFamily,
 type BlueprintFamily} from "../src/domain/story-blueprints.js";
import {anglePurposesFor,isAngleScene} from "../src/domain/angle-scene.js";
import {ANGLE_TYPES,addSegmentPerson,buildEditorSegment,
 restoreEditorSegment} from "../src/ui/card-segment-model.js";
import {storyBlueprintAngleStarter} from "../src/ui/story-blueprint-starter.js";

test("sixteen distinct flexible story blueprints reuse the original playable angle vocabulary",()=>{
 assert.equal(STORY_BLUEPRINTS.length,16);
 assert.equal(new Set(STORY_BLUEPRINTS.map(x=>x.id)).size,16);
 const families:BlueprintFamily[]=["RISE","FALL","RELATIONSHIPS","CONFLICT"];
 for(const family of families){
  assert.equal(storyBlueprintFamily(family).length,4);
 }
 const kinds=new Set(ANGLE_TYPES.map(x=>x.value));
 const ids=new Set<string>();
 for(const blueprint of STORY_BLUEPRINTS){
  assert.equal(storyBlueprint(blueprint.id),blueprint);
  assert.ok(blueprint.motivation.length>=10);
  assert.ok(blueprint.desiredFeeling.length>=8);
  assert.ok(blueprint.description.length>=25);
  assert.ok(blueprint.beats.length>=3);
  for(const beat of blueprint.beats){
   assert.ok(kinds.has(beat.kind),beat.title);
   assert.ok(anglePurposesFor(beat.kind).includes(beat.purpose),
    blueprint.id+" / "+beat.title+" must be real booking intent");
   assert.ok(!ids.has(blueprint.id+":"+beat.id));
   ids.add(blueprint.id+":"+beat.id);
   const angle=storyBlueprintAngleStarter("angle-"+ids.size,beat,null);
   assert.equal(angle.programmeId,null);
   assert.deepEqual(angle.actors,[]);
   assert.deepEqual(angle.targets,[]);
   assert.equal(angle.outcome,"HAPPENS");
   assert.equal(angle.specialMoment,null);
   assert.ok(angle.scene&&isAngleScene(angle.scene,angle.kind));
   assert.equal(angle.scene?.purpose,beat.purpose);
   assert.ok(angle.creativeBeat?.kind===angle.kind);
  }
 }
 assert.equal(ids.size,48);
});
test("booked blueprint intent uses existing canonical segment payload and Programme link",()=>{
 const beat=storyBlueprint("SLOW_BURN_VILLAIN")!.beats[0]!;
 const draft=storyBlueprintAngleStarter("angle-resentment",beat,"genuine-feud");
 assert.equal(draft.kind,"INTERVIEW");
 assert.equal(draft.programmeId,"genuine-feud");
 assert.equal(draft.scene?.purpose,"REVEAL_MOTIVATION");
 const cast=addSegmentPerson(draft,"actors",{personId:"takeshita",contractId:"signed-1"});
 const saved=buildEditorSegment(cast);
 const restored=restoreEditorSegment("angle-resentment",saved);
 assert.equal(restored.actors[0]?.personId,"takeshita");
 assert.equal(restored.scene?.purpose,"REVEAL_MOTIVATION");
 assert.equal(restored.kind,"INTERVIEW");
 assert.equal(restored.outcome,"HAPPENS");
});
test("teased betrayal never silently becomes established ally, completed turn or match winner",()=>{
 const blueprint=storyBlueprint("BETRAYAL")!;
 const hint=storyBlueprintAngleStarter("angle-hint",blueprint.beats[0]!,null);
 assert.equal(hint.kind,"INTERVIEW");
 assert.equal(hint.turnTargetAlignment,"HEEL"); // Editor default only; not booked as a TURN.
 assert.equal(hint.stableId,null);
 assert.deepEqual(hint.actors,[]);
 assert.deepEqual(hint.targets,[]);
 assert.equal(hint.scene?.purpose,"TEASE_BETRAYAL");
 assert.ok(!("scriptedWinner" in hint));
});
test("blueprint starter rejects forged beats and invented Programme references",()=>{
 const valid=storyBlueprint("UNDERDOG")!.beats[0]!;
 assert.throws(()=>storyBlueprintAngleStarter("",valid),/supported/i);
 assert.throws(()=>storyBlueprintAngleStarter("angle",{
  ...valid,purpose:"TARGET_CHAMPIONSHIP"
 }),/supported/i);
 assert.throws(()=>storyBlueprintAngleStarter("angle",valid," "),/existing Programme/);
 assert.equal(storyBlueprint("NOT_REAL"),undefined);
});
