import {validateAuthoredSegments,type AuthoredSegment,type SegmentKind,type VideoPurpose,type SegmentOutcome} from "../simulation/legacy/show-segments.js";
export const SEGMENT_BOOKING_RULES:Readonly<Record<SegmentKind,{
 minActors:number;minTargets:number;maxActors:number;allowTargets:boolean;purposes:readonly VideoPurpose[];
}>>={
 ATTACK:{minActors:1,minTargets:1,maxActors:20,allowTargets:true,purposes:[]},
 TURN:{minActors:1,minTargets:0,maxActors:1,allowTargets:true,purposes:[]},
 CONTRACT_SIGNING:{minActors:2,minTargets:0,maxActors:20,allowTargets:false,purposes:[]},
 INTERFERENCE:{minActors:1,minTargets:1,maxActors:20,allowTargets:true,purposes:[]},
 DEBUT:{minActors:1,minTargets:0,maxActors:1,allowTargets:false,purposes:[]},
 VIDEO_PACKAGE:{minActors:0,minTargets:0,maxActors:20,allowTargets:true,
  purposes:["DEBUT_HYPE","RETURN_HYPE","WRESTLER_HYPE","FEUD_RECAP","EVENT_PROMO"]},
 STABLE_EXIT:{minActors:1,minTargets:0,maxActors:20,allowTargets:true,purposes:[]},
 STABLE_RECONCILIATION:{minActors:1,minTargets:1,maxActors:20,allowTargets:true,purposes:[]},
};
export interface SegmentBookingInput{
 slotId:string;position:number;kind:SegmentKind;actorIds:readonly string[];
 targetIds:readonly string[];outcome:SegmentOutcome;videoPurpose?:VideoPurpose;
}
/** Shared authoring validation; never randomise or override the booked outcome. */
export function normalizeBookedSegment(input:SegmentBookingInput,knownPeople:ReadonlySet<string>):AuthoredSegment{
 const rules=SEGMENT_BOOKING_RULES[input.kind];
 if(!rules||!Array.isArray(input.actorIds)||!Array.isArray(input.targetIds)||
  input.actorIds.length<rules.minActors||input.actorIds.length>rules.maxActors||
  input.targetIds.length<rules.minTargets||
  (!rules.allowTargets&&input.targetIds.length>0)||
  (input.kind==="VIDEO_PACKAGE"?!rules.purposes.includes(input.videoPurpose as VideoPurpose):
   input.videoPurpose!==undefined))throw new Error("Invalid segment booking roles");
 return validateAuthoredSegments([input],knownPeople)[0]!;
}
