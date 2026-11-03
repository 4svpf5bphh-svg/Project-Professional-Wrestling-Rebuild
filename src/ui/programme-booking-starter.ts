/** Quick Book feud casting from already-loaded, show-week scoped programme facts.
 * No new endpoint or tentative contract permission: save remains authoritative.
 * Deliberately never chooses a winner, changes creative consent or settles the show.
 */
import {newEditorMatch,type EditorMatch,type Format,type PersonPick,
 assignPerformer,assignBookedTeam} from "./card-editor-model.js";
import {newEditorSegment,addSegmentPerson,type EditorSegment}
 from "./card-segment-model.js";
import {angleCastingReadiness} from "./card-booking-readiness.js";
import {SEGMENT_BOOKING_RULES} from "../domain/segment-booking.js";
import {initialAngleScene,anglePurposesFor,angleLocationsFor}
 from "../domain/angle-scene.js";
import type {ProgrammeAngleIdea} from "../domain/programme-angle-recommendations.js";
export interface FeudCastPerson{
 personId:string;name:string;side?:"A"|"B"|null;
 contractId?:string|null;appearanceFee?:number|null;creativeControl?:string|null;
}
export interface FeudCast{programmeId:string;cast:readonly FeudCastPerson[]}
export type StarterResult<T>={ok:true;value:T}|{ok:false;reason:string};
const notReady=(reason:string):StarterResult<never>=>({ok:false,reason});
const bySide=(p:FeudCast,side:"A"|"B")=>p.cast.filter(x=>x.side===side)
 .sort((a,b)=>a.name.localeCompare(b.name)||a.personId.localeCompare(b.personId));
/** A blocked member is never converted to a synthetic contract or silently dropped. */
function checkCast(p:FeudCast):StarterResult<{a:PersonPick[];b:PersonPick[]}>{
 const a=bySide(p,"A"),b=bySide(p,"B");
 if(!a.length||!b.length)return notReady("Choose the rival wrestlers manually; both sides need recorded participants.");
 if(a.length+b.length>30||new Set([...a,...b].map(x=>x.personId)).size!==a.length+b.length)
  return notReady("This rivalry has overlapping or too many participants; choose the cast manually.");
 const blocked=[...a,...b].filter(p=>!p.contractId);
 if(blocked.length)return notReady(
  blocked.map(x=>x.name).slice(0,3).join(", ")+
  " cannot be quick-cast for this show's date. Check contracts and medical status, or pick available wrestlers manually.");
 return {ok:true,value:{
  a:a.map(x=>({personId:x.personId,contractId:x.contractId!})),
  b:b.map(x=>({personId:x.personId,contractId:x.contractId!}))
 }};
}
export function programmeMatchStarter(p:FeudCast,slotId:string,
 occupied:ReadonlySet<string>=new Set()):StarterResult<EditorMatch>{
 const checked=checkCast(p);
 if(!checked.ok)return checked;
 const {a,b}=checked.value;
 if(a.length!==b.length||a.length>5)
  return notReady("This rivalry needs a manually chosen match format for its sides.");
 if([...a,...b].some(x=>occupied.has(x.personId)))
  return notReady("A rivalry wrestler is already in another match on this card.");
 const format:Format=(["SINGLES","TAG","TRIOS","FOUR_V_FOUR","FIVE_V_FIVE"] as const)[a.length-1]!;
 let match=newEditorMatch(slotId,format);
 try{
  if(a.length===1){
   match=assignPerformer(match,0,0,a[0]!);
   match=assignPerformer(match,1,0,b[0]!);
  }else{
   match=assignBookedTeam(match,0,a);
   match=assignBookedTeam(match,1,b);
  }
 }catch(e){return notReady(e instanceof Error?e.message:"Cannot quick-cast this match");}
 return {ok:true,value:match};
}
export function programmeAngleIdeaStarter(p:FeudCast,slotId:string,
 idea:ProgrammeAngleIdea):EditorSegment{
 const initial=newEditorSegment(slotId,idea.kind);
 const defaultScene=initialAngleScene(idea.kind);
 const purpose=idea.purpose;
 const location=idea.location;
 return {...initial,programmeId:p.programmeId,durationMinutes:idea.minutes,
  ...(idea.kind==="VIDEO_PACKAGE"?{videoPurpose:"FEUD_RECAP" as const}:{}),
  scene:{...defaultScene,
   purpose:purpose&&anglePurposesFor(idea.kind).includes(purpose)?purpose:defaultScene.purpose,
   location:location&&angleLocationsFor(idea.kind).includes(location)?location:defaultScene.location}};
}
/** Choose which rival initiates the scene. A signing casts both sides as
 * speakers; an attack/challenge sets actors and targets in the chosen order.
 */
export function programmeAngleCastStarter(p:FeudCast,segment:EditorSegment,
 initiating:"A"|"B"):StarterResult<EditorSegment>{
 const checked=checkCast(p);
 if(!checked.ok)return checked;
 const from=initiating==="A"?checked.value.a:checked.value.b;
 const against=initiating==="A"?checked.value.b:checked.value.a;
 const rules=SEGMENT_BOOKING_RULES[segment.kind];
 if(!rules)return notReady("Choose a supported angle.");
 const signing=segment.kind==="CONTRACT_SIGNING";
 const actors=signing?[...from,...against]:from;
 const targets=signing||!rules.allowTargets?[]:against;
 if(actors.length>rules.maxActors||actors.length<rules.minActors||
  actors.length+targets.length>30||targets.length<rules.minTargets)
  return notReady("The full rival sides do not fit this angle's cast. Choose individuals or a different type.");
 try{
  let next={...segment,actors:[],targets:[]};
  for(const p of actors)next=addSegmentPerson(next,"actors",p);
  for(const p of targets)next=addSegmentPerson(next,"targets",p);
  const ready=angleCastingReadiness(next);
  if(!ready.complete)return notReady(ready.hint);
  return {ok:true,value:next};
 }catch(e){return notReady(e instanceof Error?e.message:"Cannot cast this rivalry scene");}
}
