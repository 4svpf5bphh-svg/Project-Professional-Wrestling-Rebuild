/** Spoken guidance for one real, pending specialist alert. The SQL source
 * establishes the problem; a deterministic temperament chooses a practical
 * *opinion*, not a new event, promise, injury or booking.
 */
import type {WorldStaffMember} from "./world-staff.js";
type Temperament=WorldStaffMember["personality"];
type Specialism="TALENT_MANAGER"|"MEDICAL";
const ALERTS:Record<Specialism,string>={
 TALENT_MANAGER:"Contract renewals need a look",
 MEDICAL:"The roster needs a breather"
};
const proposals:Record<Specialism,Record<Temperament,string>>={
 TALENT_MANAGER:{
  FRANK:"I'd check the actual remaining dates before offering anything. An impossible contract gets us nowhere.",
  PATIENT:"Let's start with the next booked show and renew only the appearances we can realistically use.",
  AMBITIOUS:"I'd rather secure the right long-term talent than throw money at a deal their calendar cannot support.",
  LOYAL:"Before we talk about replacements, I'd check whether our existing wrestlers actually want to stay.",
  ECCENTRIC:"Try a shorter term if the schedule is crowded. A clever deal beats a grand offer that can't be accepted."
 },
 MEDICAL:{
  FRANK:"I'd cut back the physical workload before asking anyone to work another long match.",
  PATIENT:"A lighter show can give them a chance to recover. The next real assessment decides, not my opinion.",
  AMBITIOUS:"Save the demanding bout for someone whose recorded condition actually supports it.",
  LOYAL:"We need these wrestlers healthy beyond one show. Ask for less from them now.",
  ECCENTRIC:"An interview can keep someone visible without booking another physical beating. It still needs your approval."
 }
};
export function staffAlertVoice(member:Pick<WorldStaffMember,"role"|"personality">,
 subject:string,verifiedBody:string):string{
 const role=member.role;
 if(role==="CREATIVE"&&subject.startsWith("Creative · ")){
  const opener={FRANK:"Here's what I'd change. ",PATIENT:"We can give this a little room. ",
   AMBITIOUS:"There's a bigger moment here. ",LOYAL:"Let's give this cast something they can use. ",
   ECCENTRIC:"I've been turning this one over. "};
  return opener[member.personality]+verifiedBody;
 }
 if(role!=="TALENT_MANAGER"&&role!=="MEDICAL")
  return verifiedBody;
 // Only genuine, unresolved specialist alerts use a voiced suggestion.
 // Follow-ups, completed commitments and personal disputes retain their
 // previously settled source text verbatim.
 if(subject!==ALERTS[role])return verifiedBody;
 return verifiedBody+" "+proposals[role][member.personality];
}
