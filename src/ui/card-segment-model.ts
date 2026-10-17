/** Typed mobile angle editor. A segment's outcome belongs to the player. */
import {buildBookedSegmentPayload,type BookedSegmentPayload}
 from "../domain/segment-booking.js";
import type {SegmentKind,SegmentOutcome,VideoPurpose}
 from "../simulation/legacy/show-segments.js";
export type SegmentPerson={personId:string;contractId:string};
export interface EditorSegment{
 slotId:string;kind:SegmentKind;actors:SegmentPerson[];targets:SegmentPerson[];
 outcome:SegmentOutcome;videoPurpose:VideoPurpose;programmeId:string|null;
 turnTargetAlignment:"FACE"|"HEEL"|"TWEENER"|null;stableId:string|null;
}
export const ANGLE_TYPES:readonly {value:SegmentKind;label:string}[]=[
 {value:"PROMO",label:"Promo"},{value:"INTERVIEW",label:"Interview"},
 {value:"CONFRONTATION",label:"Confrontation"},{value:"CHALLENGE",label:"Challenge"},
 {value:"CELEBRATION",label:"Celebration"},{value:"ATTACK",label:"Attack"},
 {value:"TURN",label:"Turn"},{value:"CONTRACT_SIGNING",label:"Contract signing"},
 {value:"INTERFERENCE",label:"Interference"},{value:"DEBUT",label:"Live debut"},
 {value:"VIDEO_PACKAGE",label:"Video package"},
 {value:"STABLE_INVITATION",label:"Stable invitation"},{value:"STABLE_EXIT",label:"Stable exit"},
 {value:"STABLE_RECONCILIATION",label:"Stable reconciliation"},
];
export const VIDEO_PURPOSES:readonly VideoPurpose[]=[
 "DEBUT_HYPE","RETURN_HYPE","WRESTLER_HYPE","FEUD_RECAP","EVENT_PROMO",
];
export const REQUIRED_TARGETS=new Set<SegmentKind>([
 "CONFRONTATION","CHALLENGE","ATTACK","INTERFERENCE","STABLE_INVITATION","STABLE_RECONCILIATION"
]);
export const LIMITED_ACTORS=new Set<SegmentKind>(["TURN","DEBUT"]);
export function newEditorSegment(slotId:string,kind:SegmentKind="PROMO"):EditorSegment{
 return {slotId,kind,actors:[],targets:[],outcome:"HAPPENS",videoPurpose:"WRESTLER_HYPE",programmeId:null,
  turnTargetAlignment:"HEEL",stableId:null};
}
export function restoreEditorSegment(slotId:string,raw:unknown):EditorSegment{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid segment");
 const p=raw as Record<string,unknown>;
 const kind=ANGLE_TYPES.find(x=>x.value===p.kind)?.value??"PROMO";
 const participants=(Array.isArray(p.participants)?p.participants:[]) as SegmentPerson[];
 const find=(keys:unknown):SegmentPerson[]=>Array.isArray(keys)?
  keys.flatMap(id=>participants.filter(p=>p.personId===id).map(p=>({...p}))):[];
 // Historical promo/interview drafts may have a contracted speaker but no
 // explicit role list; preserve their identity in the editable model.
 return {...newEditorSegment(slotId,kind),
  actors:find(Array.isArray(p.actorIds)?p.actorIds:
   ["PROMO","INTERVIEW","CELEBRATION"].includes(kind)?participants.map(p=>p.personId):[]),
  targets:find(p.targetIds),
  stableId:typeof p.stableId==="string"&&p.stableId.trim()?p.stableId:null,
  outcome:["HAPPENS","REFUSED","INTERRUPTED"].includes(String(p.outcome))?
   p.outcome as SegmentOutcome:"HAPPENS",
  turnTargetAlignment:["FACE","HEEL","TWEENER"].includes(String(p.turnTargetAlignment))?
   p.turnTargetAlignment as EditorSegment["turnTargetAlignment"]:null,
  videoPurpose:VIDEO_PURPOSES.includes(p.videoPurpose as VideoPurpose)?
   p.videoPurpose as VideoPurpose:"WRESTLER_HYPE"};
}
export function addSegmentPerson(s:EditorSegment,role:"actors"|"targets",
 person:SegmentPerson):EditorSegment{
 if(!person.personId||!person.contractId||
  [...s.actors,...s.targets].some(p=>p.personId===person.personId))
  throw new Error("A wrestler cannot fill two roles in one angle");
 if(role==="actors"&&LIMITED_ACTORS.has(s.kind)&&s.actors.length>=1)
  throw new Error("This angle has one lead wrestler");
 if(s[role].length>=20)throw new Error("Angle role capacity exceeded");
 return {...s,[role]:[...s[role],{...person}]};
}
export function buildEditorSegment(s:EditorSegment):BookedSegmentPayload{
 return buildBookedSegmentPayload({
  slotId:s.slotId,position:0,kind:s.kind,
  actorIds:s.actors.map(p=>p.personId),
  targetIds:s.targets.map(p=>p.personId),outcome:s.outcome,
  ...(s.kind==="VIDEO_PACKAGE"?{videoPurpose:s.videoPurpose}:{}),
  ...(s.stableId?{stableId:s.stableId}:{}),
  ...(s.kind==="TURN"&&s.turnTargetAlignment?
   {turnTargetAlignment:s.turnTargetAlignment}:{}),
 },[...s.actors,...s.targets]);
}
