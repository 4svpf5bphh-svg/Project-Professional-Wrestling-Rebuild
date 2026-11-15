/** Hired, World-seeded staff personalities speak through a genuine certified
 * Medical/Creative conflict. Deterministic presentation only: no generated
 * incidents, model calls, resource changes or additional database reads.
 */
import type {WorldStaffMember} from "./world-staff.js";
export type StaffTemperament=WorldStaffMember["personality"];
export type StaffDebateRole="MEDICAL"|"CREATIVE";
export type StaffDebateChoice="PRIORITISE_HEALTH"|"REFRESH_PROGRAMME"|"DEFER";
export interface StaffDebateVoice{
 name:string;personality:StaffTemperament;position:string;
}
export interface StaffDebateVoices{medical:StaffDebateVoice;creative:StaffDebateVoice}
const medicalPositions:Record<StaffTemperament,string>={
 FRANK:"The fatigue warning is real. I won't call another demanding match safe just because the story needs one.",
 PATIENT:"I understand the storyline matters. Give this wrestler a lighter workload first, then assess their condition again.",
 AMBITIOUS:"A strong programme means nothing if we lose its performer to exhaustion. Protect their long-term availability.",
 LOYAL:"We owe the wrestler a sustainable schedule. I want them healthy enough to work here next month, not just this week.",
 ECCENTRIC:"A big angle still needs a body that can perform it. The fatigue alarm is ringing louder than the entrance music."
};
const creativePositions:Record<StaffTemperament,string>={
 FRANK:"We have repeated the same programme beat too often. We need an actual new chapter or a finish, not another identical segment.",
 PATIENT:"I can work around a lighter schedule. But we must find a fresh chapter for a rivalry that has started repeating.",
 AMBITIOUS:"The crowd deserves forward momentum in this programme. A new chapter could lift it, provided the talent can deliver.",
 LOYAL:"We invested in this programme. I'd rather refresh it with care than abandon the wrestler or run the same beat again.",
 ECCENTRIC:"The storyline keeps walking back through the same curtain. Give it a new turn, a meaningful ending, or both."
};
export function staffDebateVoices(medical:WorldStaffMember,creative:WorldStaffMember):StaffDebateVoices{
 if(medical.role!=="MEDICAL"||creative.role!=="CREATIVE"||
  !medical.staffId||!creative.staffId)throw Error("Debate requires real Medical and Creative employees");
 return {
  medical:{name:medical.name,personality:medical.personality,
   position:medicalPositions[medical.personality]},
  creative:{name:creative.name,personality:creative.personality,
   position:creativePositions[creative.personality]}
 };
}
const reactionLeads:Record<StaffTemperament,string>={
 FRANK:"I'll be direct. ",
 PATIENT:"I understand. ",
 AMBITIOUS:"I'm thinking about the next few shows. ",
 LOYAL:"I want the best for this team. ",
 ECCENTRIC:"All right, here's the next act. "
};
/** Spoken response is a reaction to the manager's recorded decision, not a
 * claim that recovery, a booking or a refreshed programme already happened. */
export function staffDebateReaction(role:StaffDebateRole,temperament:StaffTemperament,
 decision:StaffDebateChoice):string{
 const core=role==="MEDICAL"?
  decision==="PRIORITISE_HEALTH"?
   "We'll judge this by the actual fatigue level after the next World week, not the promise.":
  decision==="REFRESH_PROGRAMME"?
   "A fresh angle is welcome, but it doesn't lower fatigue. The workload still needs watching.":
   "No commitment is recorded. I'll keep raising the genuine fatigue concern while it persists.":
  decision==="REFRESH_PROGRAMME"?
   "The programme needs to genuinely change or finish. A different title on the same segment won't do it.":
  decision==="PRIORITISE_HEALTH"?
   "We can give the wrestler room to recover, but this programme still needs a real next chapter.":
   "I can wait for a decision. The current repetition won't resolve itself.";
 return reactionLeads[temperament]+core;
}
