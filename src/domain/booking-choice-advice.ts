/** Actionable, choice-specific staff adjustments for the original card editor.
 * Suggestions use already loaded roster/booking data. They neither simulate
 * consent nor change a winner, a World record or a booking until tapped.
 */
import {changeMatchStipulation,type EditorMatch} from "../ui/card-editor-model.js";
import type {EditorSegment} from "../ui/card-segment-model.js";
import {stipulationInjuryRisk,stipulationMinimumMinutes} from "./match-stipulations.js";
import {ANGLE_PURPOSES,isAngleScene,type AngleScene} from "./angle-scene.js";
import type {AdvisorPerson} from "./staff-context-advice.js";
import type {StaffRole} from "./world-staff.js";
export type BookingAdjustment=
 |{kind:"MATCH_LENGTH";minutes:number}
 |{kind:"MATCH_RULES"}
 |{kind:"ANGLE_DURATION";minutes:number}
 |{kind:"ANGLE_SOFTEN"}
 |{kind:"ANGLE_PURPOSE";purpose:AngleScene["purpose"]}
 |{kind:"BACK_TO_CAST"};
export type BookingChoiceAdvice={
 role:StaffRole|"HOUSE";level:"WATCH"|"INFO";
 title:string;message:string;actionLabel:string;adjustment:BookingAdjustment;
};
const known=(value:number|null|undefined):value is number=>
 typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100;
const make=(role:BookingChoiceAdvice["role"],title:string,message:string,
 actionLabel:string,adjustment:BookingAdjustment):BookingChoiceAdvice=>
 ({role,level:"WATCH",title,message,actionLabel,adjustment});
export function bookingChoiceAdvice(booking:EditorMatch|EditorSegment,
 people:readonly AdvisorPerson[],staffed:ReadonlySet<StaffRole>,
 context:{programmeCast?:readonly string[];hasProgrammes?:boolean}={}):
 BookingChoiceAdvice|null{
 const byId=new Map(people.map(p=>[p.personId,p]));
 if("teams" in booking){
  const cast=booking.teams.flat().flatMap(p=>p?[byId.get(p.personId)]:[])
   .filter((p):p is AdvisorPerson=>p!==undefined);
  if(!cast.length)return null;
  const rules=booking.stipulation??"STANDARD";
  const risk=stipulationInjuryRisk(rules);
  const unsafe=cast.filter(p=>known(p.safety)&&p.safety<50);
  const tired=cast.filter(p=>known(p.fatigue)&&p.fatigue>=65||
   known(p.wear)&&p.wear>=72);
  if(risk>=1.25&&unsafe.length&&tired.length){
   const role=staffed.has("REFEREE")?"REFEREE":
    staffed.has("MEDICAL")?"MEDICAL":"HOUSE";
   return make(role,"Reconsider the stipulation",
    unsafe.map(p=>p.name).join(", ")+" has lower safety while "+
    tired.map(p=>p.name).join(", ")+" has elevated fatigue or wear. "+
    "Standard rules remove the selected stipulation; switching also resets "+
    "the finish, so review it before completing the match.",
    "Use standard rules",{kind:"MATCH_RULES"});
  }
  const lowStamina=cast.filter(p=>known(p.stamina)&&p.stamina<55);
  const target=Math.max(stipulationMinimumMinutes(rules),
   Math.min(18,booking.plannedLengthMinutes-5));
  if(staffed.has("ROAD_AGENT")&&lowStamina.length&&
   booking.plannedLengthMinutes>=25&&target<booking.plannedLengthMinutes)
   return make("ROAD_AGENT","Consider a tighter match",
    lowStamina.map(p=>p.name).join(", ")+" may struggle with "+
    booking.plannedLengthMinutes+" minutes at current stamina. "+
    target+" minutes respects this match's minimum. "+
    "The cast, planned winner and finish stay unchanged.",
    "Shorten to "+target+" min",{kind:"MATCH_LENGTH",minutes:target});
  if(risk>=1.25&&unsafe.length&&staffed.has("REFEREE"))
   return make("REFEREE","Reduce the match-risk exposure",
    unsafe.map(p=>p.name).join(", ")+" has a lower safety reading for "+
    "these rules. Standard rules remove the stipulation and reset the "+
    "finish; choose that only if it fits your intended story.",
    "Use standard rules",{kind:"MATCH_RULES"});
  return null;
 }
 const segment=booking;
 const cast=[...segment.actors,...segment.targets].flatMap(p=>{
  const person=byId.get(p.personId);return person?[person]:[];
 });
 const tired=cast.filter(p=>known(p.fatigue)&&p.fatigue>=65||
  known(p.wear)&&p.wear>=72);
 const severe=["ATTACK","POST_MATCH_ASSAULT"].includes(segment.kind)&&
  segment.scene&&(segment.scene.intensity==="BRUTAL"||
   segment.scene.visual==="BLOODIED");
 if(severe&&tired.length){
  return make(staffed.has("MEDICAL")?"MEDICAL":"HOUSE",
   "Soften this physical scene",
   tired.map(p=>p.name).join(", ")+" has elevated fatigue or wear. "+
   "A brief warning with officials separating the wrestlers reduces "+
   "the planned on-screen severity, without promising a medical outcome.",
   "Reduce physical intensity",{kind:"ANGLE_SOFTEN"});
 }
 const scene=segment.scene;
 if(staffed.has("CREATIVE")&&scene){
  if(segment.programmeId&&scene.purpose==="START_RIVALRY"&&
   ANGLE_PURPOSES.includes("BUILD_RIVALRY")){
   return make("CREATIVE","Align the purpose with this feud",
    "This scene is linked to an existing programme but its goal says "+
    "start a new rivalry. Escalating the linked feud keeps the purpose "+
    "consistent without changing the actors or what happens.",
    "Escalate linked feud",{kind:"ANGLE_PURPOSE",purpose:"BUILD_RIVALRY"});
  }
  if(segment.programmeId&&context.programmeCast?.length&&
   !cast.some(p=>context.programmeCast!.includes(p.personId)))
   return make("CREATIVE","Bring the feud into the scene",
    "None of the linked programme's wrestlers is currently cast. "+
    "Choose a participant from the feud before scripting its next chapter.",
    "Review wrestlers",{kind:"BACK_TO_CAST"});
  const weakPresentation=cast.filter(p=>
   known(p.presentation)&&p.presentation<50);
  const longTalk=["INTERVIEW","PROMO","CHALLENGE","CONFRONTATION",
   "CONTRACT_SIGNING"].includes(segment.kind)&&segment.durationMinutes>=25;
  if(longTalk||segment.kind!=="VIDEO_PACKAGE"&&segment.durationMinutes>=15&&
   weakPresentation.length)
   return make("CREATIVE","Tighten the talking time",
    segment.durationMinutes+" minutes of "+segment.kind.replaceAll("_"," ").toLowerCase()+
    (weakPresentation.length?" puts extra pressure on "+weakPresentation.map(p=>p.name).join(", ")+".":".")+
    " A shorter scene keeps the cast and intended outcome.",
    "Shorten scene to 10 min",{kind:"ANGLE_DURATION",minutes:10});
 }
 return null;
}
/** Apply only the explicit, selected change; all other authored choices
 * survive. The server still validates the final saved booking.
 */
export function applyBookingAdjustment(
 booking:EditorMatch|EditorSegment,change:BookingAdjustment):EditorMatch|EditorSegment{
 if(change.kind==="BACK_TO_CAST")return booking;
 if("teams" in booking){
  if(change.kind==="MATCH_LENGTH"){
   const min=stipulationMinimumMinutes(booking.stipulation??"STANDARD");
   if(!Number.isSafeInteger(change.minutes)||change.minutes<min||
    change.minutes>=booking.plannedLengthMinutes)
    throw new Error("The advised match duration is no longer legal");
   return {...booking,plannedLengthMinutes:change.minutes};
  }
  if(change.kind==="MATCH_RULES")
   return changeMatchStipulation(booking,"STANDARD");
  throw new Error("That staff adjustment does not apply to this match");
 }
 if(change.kind==="ANGLE_DURATION"){
  if(!Number.isSafeInteger(change.minutes)||change.minutes<1||
   change.minutes>30||change.minutes>=booking.durationMinutes)
   throw new Error("The advised angle duration is no longer legal");
  return {...booking,durationMinutes:change.minutes};
 }
 if(!booking.scene)throw new Error("This angle does not have an editable scene");
 if(change.kind==="ANGLE_SOFTEN"){
  if(!["ATTACK","POST_MATCH_ASSAULT"].includes(booking.kind))
   throw new Error("Only physical attacks have this adjustment");
  const scene={...booking.scene,intensity:"WARNING" as const,
   visual:"OFFICIALS_SEPARATE" as const};
  if(!isAngleScene(scene,booking.kind))throw new Error("Invalid softened scene");
  return {...booking,scene};
 }
 if(change.kind==="ANGLE_PURPOSE"){
  if(!ANGLE_PURPOSES.includes(change.purpose))
   throw new Error("Invalid suggested purpose");
  const scene={...booking.scene,purpose:change.purpose};
  if(!isAngleScene(scene,booking.kind))throw new Error("Invalid suggested scene");
  const beat=booking.creativeBeat;
  const creativeBeat=beat?.kind==="ATTACK"?{...beat,objective:
   (change.purpose==="BUILD_TARGET_SYMPATHY"?"BUILD_SYMPATHY":
    change.purpose==="BUILD_RIVALRY"?"ESCALATE_RIVALRY":"GENERATE_HEAT") as
    typeof beat.objective}:beat;
  return {...booking,scene,creativeBeat};
 }
 throw new Error("That staff adjustment does not apply to this angle");
}
