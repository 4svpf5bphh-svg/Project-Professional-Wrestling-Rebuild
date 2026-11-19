/** Authored wrestling moments are native original Story Blueprint scenes.
 * No automatic relationship, match, fee, result or database record is created. */
import {isAngleScene,type AngleScene} from "../domain/angle-scene.js";
import {isSegmentCreativeBeat} from "../domain/segment-creative-beats.js";
import {storyBlueprint,type BlueprintFamily} from "../domain/story-blueprints.js";
import {storyBlueprintAngleStarter} from "./story-blueprint-starter.js";
import type {EditorSegment} from "./card-segment-model.js";

export interface AngleMomentPreset{
 id:string;family:BlueprintFamily;title:string;description:string;
 blueprintId:string;beatId:string;scene?:Partial<AngleScene>;
 delivery?:Readonly<Record<string,string>>;
 turnTargetAlignment?:"FACE"|"HEEL"|"TWEENER";
}
export const ANGLE_MOMENT_PRESETS:readonly AngleMomentPreset[]=[
 {id:"underdog-confession",family:"RISE",title:"Admit the setback",
  description:"An honest interview. No past loss is assumed.",
  blueprintId:"UNDERDOG",beatId:"struggle",
  scene:{location:"INTERVIEW_AREA"},delivery:{topic:"RECENT_FORM",response:"CANDID"}},
 {id:"underdog-defiance",family:"RISE",title:"Stand up to the obstacle",
  description:"A real face-to-face with the wrestler in their way.",
  blueprintId:"UNDERDOG",beatId:"defy",
  scene:{location:"IN_RING"},delivery:{ending:"STAREDOWN"}},
 {id:"title-demand",family:"RISE",title:"Demand a title opportunity",
  description:"A challenge, not an automatically booked title match.",
  blueprintId:"TITLE_CHASE",beatId:"challenge",
  scene:{location:"IN_RING"},delivery:{response:"LEFT_OPEN"}},
 {id:"villain-resentment",family:"FALL",title:"Let resentment show",
  description:"The first crack in a wrestler's public persona.",
  blueprintId:"SLOW_BURN_VILLAIN",beatId:"resent",
  scene:{location:"INTERVIEW_AREA"},delivery:{topic:"NEXT_STEPS",response:"SARCASTIC"}},
 {id:"villain-line",family:"FALL",title:"Steal the spotlight",
  description:"A selfish interruption, not an automatic heel turn.",
  blueprintId:"SLOW_BURN_VILLAIN",beatId:"line",
  scene:{location:"IN_RING"},delivery:{ending:"INTERRUPTER_PREVAILS"}},
 {id:"jealous-ambush",family:"FALL",title:"A calculated ambush",
  description:"A scripted attack with a real victim and visible aftermath.",
  blueprintId:"JEALOUSY",beatId:"attack",
  scene:{location:"BACKSTAGE",intensity:"BEATDOWN",visual:"OFFICIALS_SEPARATE"},
  delivery:{presentation:"PREMEDITATED_AMBUSH",objective:"ESCALATE_RIVALRY"}},
 {id:"betrayal-warning",family:"RELATIONSHIPS",title:"Hint at a betrayal",
  description:"Build suspicion; nobody changes allegiance yet.",
  blueprintId:"BETRAYAL",beatId:"hint",
  scene:{location:"INTERVIEW_AREA"},delivery:{topic:"FACTION_FUTURE",response:"EVASIVE"}},
 {id:"betrayal-turn",family:"RELATIONSHIPS",title:"Turn on a partner",
  description:"An explicit turn; cast and allegiance remain your choices.",
  blueprintId:"BETRAYAL",beatId:"choice",
  scene:{location:"IN_RING"},delivery:{presentation:"BETRAY_PARTNER"},
  turnTargetAlignment:"HEEL"},
 {id:"earn-trust",family:"RELATIONSHIPS",title:"Save an uneasy ally",
  description:"A rescue on screen, not an invented alliance.",
  blueprintId:"BETRAYAL",beatId:"trust",
  scene:{location:"RINGSIDE"},delivery:{ending:"RESCUER_STANDS_TALL"}},
 {id:"vengeful-words",family:"CONFLICT",title:"Demand an answer",
  description:"Confront a rival without fabricating past grievances.",
  blueprintId:"VENDETTA",beatId:"answer",
  scene:{location:"IN_RING"},delivery:{ending:"VERBAL_WARNING"}},
 {id:"revenge-attack",family:"CONFLICT",title:"Strike back",
  description:"A real attack; injury and crowd response are not assumed.",
  blueprintId:"VENDETTA",beatId:"retaliate",
  scene:{location:"PARKING_LOT",intensity:"BEATDOWN",visual:"NONE"},
  delivery:{presentation:"FACE_TO_FACE_ASSAULT",objective:"ESCALATE_RIVALRY"}},
 {id:"prove-respect",family:"CONFLICT",title:"Prove you belong",
  description:"Issue a challenge without claiming a response.",
  blueprintId:"RESPECT",beatId:"prove",
  scene:{location:"IN_RING"},delivery:{response:"LEFT_OPEN"}}
] as const;

export function angleMomentsForFamily(family:BlueprintFamily):readonly AngleMomentPreset[]{
 return ANGLE_MOMENT_PRESETS.filter(p=>p.family===family);
}
export function angleMomentPresetStarter(slotId:string,presetId:string,
 programmeId:string|null=null):EditorSegment{
 const preset=ANGLE_MOMENT_PRESETS.find(p=>p.id===presetId);
 if(!preset)throw new Error("Choose an available wrestling moment");
 const blueprint=storyBlueprint(preset.blueprintId);
 const beat=blueprint?.beats.find(b=>b.id===preset.beatId);
 if(!beat||blueprint?.family!==preset.family)
  throw new Error("The original story catalogue does not support this moment");
 const start=storyBlueprintAngleStarter(slotId,beat,programmeId);
 const scene={...start.scene!,...preset.scene};
 const creativeBeat=start.creativeBeat?{...start.creativeBeat,...preset.delivery}:null;
 if(!isAngleScene(scene,beat.kind)||!creativeBeat||
  !isSegmentCreativeBeat(creativeBeat,beat.kind))
  throw new Error("The original angle rules cannot book this moment");
 return {...start,scene,creativeBeat,
  ...(preset.turnTargetAlignment?
   {turnTargetAlignment:preset.turnTargetAlignment}:{})};
}
