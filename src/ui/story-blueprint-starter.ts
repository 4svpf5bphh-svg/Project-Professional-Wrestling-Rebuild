/** One selected Story Blueprint beat becomes an ordinary original booking
 * segment. The selection alone never books cast, result, relationship or fee.
 * The saved scene.purpose & validated creativeBeat carry the authored intent. */
import {anglePurposesFor,initialAngleScene,isAngleScene}
 from "../domain/angle-scene.js";
import {isSegmentCreativeBeat}
 from "../domain/segment-creative-beats.js";
import {STORY_BLUEPRINTS,type StoryBlueprintBeat}
 from "../domain/story-blueprints.js";
import {newEditorSegment,type EditorSegment}
 from "./card-segment-model.js";

export function storyBlueprintAngleStarter(slotId:string,beat:StoryBlueprintBeat,
 programmeId:string|null=null):EditorSegment{
 if(!slotId||slotId.length>200||!STORY_BLUEPRINTS.some(b=>b.beats.some(x=>x===beat)))
  throw new Error("Choose a supported Story Blueprint beat");
 if(!anglePurposesFor(beat.kind).includes(beat.purpose))
  throw new Error("That story intention is not valid for this scene");
 if(programmeId!==null&&(!programmeId.trim()||programmeId.length>200))
  throw new Error("Choose an existing Programme");
 const initial=newEditorSegment(slotId,beat.kind);
 const scene={...initialAngleScene(beat.kind),purpose:beat.purpose};
 if(!isAngleScene(scene,beat.kind)||!initial.creativeBeat||
  !isSegmentCreativeBeat(initial.creativeBeat,beat.kind))
  throw new Error("The existing angle engine cannot book this suggestion");
 return {...initial,programmeId,scene,
  ...(beat.kind==="VIDEO_PACKAGE"?{videoPurpose:"FEUD_RECAP" as const}:{})};
}
