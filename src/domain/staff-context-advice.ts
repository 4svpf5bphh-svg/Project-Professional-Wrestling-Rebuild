/** Pre-show professional notes. Pure, deterministic and deliberately advisory:
 * the authoritative match/angle resolver still decides what actually happens.
 * No extra RPC, writes, random chemistry claims or guaranteed star predictions.
 */
import type {EditorMatch} from "../ui/card-editor-model.js";
import type {EditorSegment} from "../ui/card-segment-model.js";
import type {StaffRole} from "./world-staff.js";
import {stipulationInjuryRisk} from "./match-stipulations.js";
export type StaffNote={
 role:StaffRole|"HOUSE";level:"WATCH"|"INFO";
 title:string;message:string;
};
export type AdvisorPerson={
 personId:string;name:string;
 inRingQuality?:number|null;matchCraft?:number|null;presentation?:number|null;
 stamina?:number|null;safety?:number|null;fatigue?:number|null;wear?:number|null;
};
const valid=(n:number|null|undefined):n is number=>typeof n==="number"&&
 Number.isFinite(n)&&n>=0&&n<=100;
const note=(role:StaffNote["role"],level:StaffNote["level"],
 title:string,message:string):StaffNote=>({role,level,title,message});
/** Clear risks only. "Good chemistry" cannot be inferred from two ratings. */
export function matchStaffNotes(match:EditorMatch,people:readonly AdvisorPerson[],
 staffed:ReadonlySet<StaffRole>):StaffNote[]{
 const notes:StaffNote[]=[];
 const ids=new Set(match.teams.flat().filter(x=>x!==null).map(x=>x!.personId));
 const cast=people.filter(p=>ids.has(p.personId));
 if(!cast.length)return [];
 const highRisk=stipulationInjuryRisk(match.stipulation??"STANDARD")>=1.25;
 const poorCondition=cast.filter(p=>valid(p.fatigue)&&p.fatigue>=65||
  valid(p.wear)&&p.wear>=72);
 const safetyConcern=cast.filter(p=>valid(p.safety)&&p.safety<50);
 const staminaConcern=cast.filter(p=>valid(p.stamina)&&p.stamina<55);
 const craftConcern=cast.filter(p=>valid(p.matchCraft)&&p.matchCraft<52||
  valid(p.inRingQuality)&&p.inRingQuality<47);
 if(staffed.has("ROAD_AGENT")){
  if(match.plannedLengthMinutes>=25&&staminaConcern.length)
   notes.push(note("ROAD_AGENT","WATCH","This is a demanding match",
    staminaConcern.map(p=>p.name).join(", ")+" may struggle to maintain the planned "+
    match.plannedLengthMinutes+" minutes. Shorten the bout or adjust its pacing."));
  else if(match.plannedLengthMinutes>=30&&craftConcern.length)
   notes.push(note("ROAD_AGENT","WATCH","Protect the match structure",
    craftConcern.map(p=>p.name).join(", ")+
    " may need help carrying a long, intricate bout. A shorter or simpler structure is worth considering."));
 }
 if(staffed.has("MEDICAL")&&poorCondition.length)
  notes.push(note("MEDICAL","WATCH","Watch cumulative wear",
   poorCondition.map(p=>p.name).join(", ")+
   " has elevated fatigue or wear. They may be available but still need a lighter workload."));
 if(staffed.has("REFEREE")&&(highRisk&&safetyConcern.length))
  notes.push(note("REFEREE","WATCH","Risky stipulation and safety concerns",
   safetyConcern.map(p=>p.name).join(", ")+
   " has a lower safety rating in a higher-risk match. Consider simpler spots or standard rules."));
 else if(staffed.has("REFEREE")&&highRisk)
  notes.push(note("REFEREE","INFO","Additional match-risk briefing",
   "This stipulation increases the baseline injury risk. The referee cannot eliminate that risk."));
 // A critical safety fact is shown even when a company has not hired a doctor.
 if(!staffed.has("MEDICAL")&&poorCondition.length&&highRisk)
  notes.push(note("HOUSE","WATCH","High-risk booking with tired talent",
   poorCondition.map(p=>p.name).join(", ")+
   " has elevated fatigue or wear. Your house office recommends reviewing the stipulation."));
 return notes.slice(0,4);
}
export function angleStaffNotes(segment:EditorSegment,people:readonly AdvisorPerson[],
 staffed:ReadonlySet<StaffRole>,programmeCast:readonly string[]=[]):StaffNote[]{
 const ids=[...segment.actors,...segment.targets].map(p=>p.personId);
 const cast=people.filter(p=>ids.includes(p.personId));
 const notes:StaffNote[]=[];
 // A physical angle can need a Doctor or Referee even if the manager has no
 // Creative hire. A scripted bloody aftermath is not a certified injury.
 const physical=["ATTACK","POST_MATCH_ASSAULT","RESCUE"].includes(segment.kind);
 const intense=physical&&(segment.scene?.intensity==="BRUTAL"||
  segment.scene?.visual==="BLOODIED");
 const tired=cast.filter(p=>valid(p.fatigue)&&p.fatigue>=65||
  valid(p.wear)&&p.wear>=72);
 if(physical&&tired.length){
  notes.push(note(staffed.has("MEDICAL")?"MEDICAL":"HOUSE","WATCH",
   "Check condition before this physical scene",
   tired.map(p=>p.name).join(", ")+
   " has elevated fatigue or wear. Rehearse the physical beat carefully or "+
   "reduce its intensity. The on-screen aftermath does not create a medical injury."));
 }
 if(intense&&staffed.has("REFEREE"))
  notes.push(note("REFEREE","INFO","Coordinate the staged violence",
   "The referee and crew should plan the separation and timing of this intense "+
   "physical angle. Its visual severity is storytelling, not a guaranteed injury."));
 if(staffed.has("CREATIVE")){
  if(segment.programmeId&&programmeCast.length&&!ids.some(id=>programmeCast.includes(id)))
   notes.push(note("CREATIVE","WATCH","Storyline cast does not appear",
    "No wrestler from the chosen feud is in this segment. The chapter may not advance that rivalry."));
  if(segment.kind!=="VIDEO_PACKAGE"&&segment.durationMinutes>=15&&
   cast.some(p=>valid(p.presentation)&&p.presentation<50))
   notes.push(note("CREATIVE","WATCH","Long scene, limited presentation strength",
    "One or more featured wrestlers may be carrying a longer talking or character segment "+
    "than their current presentation suggests. Consider sharing the microphone or tightening it."));
  if(["ATTACK","POST_MATCH_ASSAULT","INTERRUPTION","CONFRONTATION"].includes(segment.kind)&&
   !segment.targets.length)
   notes.push(note("CREATIVE","INFO","Give the conflict a clear target",
    "An identifiable opponent usually gives this kind of confrontation more context. "+
    "Book the participants and motivation deliberately."));
  if(segment.kind==="VIDEO_PACKAGE")
   notes.push(note("CREATIVE","INFO","A video can do the storytelling",
    "Pre-recorded material can recap a feud without requiring wrestlers to appear live on this show."));
 }
 return notes.slice(0,4);
}
/** A performer can appear in a match and a separate angle on the same
 * card. The existing server correctly allows that, but the staff should
 * warn when those are two *physical* commitments. Never count promos or
 * pre-recorded videos as extra physical workload. Card models are already
 * in memory: this is an advisory-only projection with no database calls.
 */
export function showWorkloadNotes(slotId:string,current:EditorMatch|EditorSegment,
 matches:readonly EditorMatch[],segments:readonly EditorSegment[],
 people:readonly AdvisorPerson[],staffed:ReadonlySet<StaffRole>):StaffNote[]{
 const physical=new Set<EditorSegment["kind"]>(["ATTACK","POST_MATCH_ASSAULT","RESCUE"]);
 const isMatch="teams" in current;
 if(!isMatch&&!physical.has(current.kind))return [];
 const participants=isMatch?
  current.teams.flat().flatMap(p=>p?[p.personId]:[]):
  [...current.actors,...current.targets].map(p=>p.personId);
 if(!participants.length)return [];
 const otherMatches=new Set(matches.filter(m=>m.slotId!==slotId)
  .flatMap(m=>m.teams.flat().flatMap(p=>p?[p.personId]:[])));
 const otherPhysicalAngles=new Set(segments.filter(s=>
  s.slotId!==slotId&&physical.has(s.kind))
  .flatMap(s=>[...s.actors,...s.targets].map(p=>p.personId)));
 const overlapping=[...new Set(participants)].filter(id=>
  isMatch?otherPhysicalAngles.has(id):
   otherMatches.has(id)||otherPhysicalAngles.has(id));
 if(!overlapping.length)return [];
 const names=new Map(people.map(p=>[p.personId,p.name]));
 const peopleText=overlapping.map(id=>names.get(id)??id).join(", ");
 const otherWork=isMatch?"a physical angle":
  [otherMatches.size&&overlapping.some(id=>otherMatches.has(id))?"a match":null,
   overlapping.some(id=>otherPhysicalAngles.has(id))?"another physical angle":null]
   .filter(Boolean).join(" and ");
 const elevated=people.some(p=>overlapping.includes(p.personId)&&
  (valid(p.fatigue)&&p.fatigue>=65||valid(p.wear)&&p.wear>=72));
 return [note(staffed.has("MEDICAL")?"MEDICAL":"HOUSE","WATCH",
  "Multiple physical bookings on this show",
  peopleText+" also "+(overlapping.length===1?"has":"have")+
  " "+otherWork+" on this card. Consider reducing the length or intensity "+
  "of one physical appearance and coordinate recovery"+
  (elevated?", especially with the current fatigue or wear.":".")+
  " This is a workload warning, not a predicted injury.")];
}
export function contractStaffNotes(input:{weeklyGuarantee:number;weeks:number;
 appearanceFee:number;dates:number;signingBonus:number;
 cash:number;cashReserve:number|null;weeklyGuarantees:number;
 wageLimit:number|null;recurringMargin:number|null},
 staffed:ReadonlySet<StaffRole>):StaffNote[]{
 if(!staffed.has("TALENT_MANAGER"))return [];
 const notes:StaffNote[]=[];
 const room=input.wageLimit===null?null:
  input.wageLimit-input.weeklyGuarantees-input.weeklyGuarantee;
 if(room!==null&&room<0)notes.push(note("TALENT_MANAGER","WATCH",
  "This would exceed your wage plan",
  "Your guaranteed payroll would be above the limit you've set. "+
  "Consider a guarantee no higher than $"+Math.max(0,input.wageLimit!-input.weeklyGuarantees).toLocaleString("en-GB")+
  " per week to stay within your current allowance. Acceptance is not guaranteed."));
 if(input.cashReserve!==null&&input.cash-input.signingBonus<input.cashReserve)
  notes.push(note("TALENT_MANAGER","WATCH","Signing bonus reaches your reserve",
   "Keeping your existing reserve would mean a signing bonus of no more than $"+
    Math.max(0,input.cash-input.cashReserve!).toLocaleString("en-GB")+
    ". You can still choose different terms."));
 if(input.recurringMargin!==null&&input.recurringMargin-input.weeklyGuarantee<0)
  notes.push(note("TALENT_MANAGER","WATCH","Fixed costs exceed recurring income",
   "This is before ticket sales and variable show costs. The offer increases financial pressure."));
 if(input.dates>input.weeks&&input.appearanceFee>0)
  notes.push(note("TALENT_MANAGER","INFO","Purchased dates require scheduling",
   "Those dates expire with the agreement. Multiple bookings in the same week may be needed to use them."));
 if(!notes.length)notes.push(note("TALENT_MANAGER","INFO","Offer fits the current plan",
  "No immediate spending-plan breach is visible. Acceptance still depends on "+
  "the wrestler's interest, other commitments and the terms you propose."));
 return notes.slice(0,3);
}
