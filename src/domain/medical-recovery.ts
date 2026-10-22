/** Deterministic medical absence rules. Week indexes are zero-based and
 * clearance is exclusive: an injury sustained in week N for K weeks permits
 * the first return in week N + K, matching original PPW.
 * Pure rules shared by booking and the authoritative World settlement.
 */
export type MedicalSeverity="MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
export interface MedicalAbsence {
 personId:string;
 incidentWeekIndex:number;
 weeksOut:number;
 severity:MedicalSeverity;
}
export function medicalClearanceWeek(injury:MedicalAbsence):number {
 if(!injury.personId||!Number.isSafeInteger(injury.incidentWeekIndex)||
  injury.incidentWeekIndex<0||!Number.isSafeInteger(injury.weeksOut)||
  injury.weeksOut<1||injury.weeksOut>52||
  !["MINOR","MODERATE","MAJOR","SEVERE"].includes(injury.severity))
  throw new Error("Invalid medical absence");
 return injury.incidentWeekIndex+injury.weeksOut;
}
export function remainingMedicalWeeks(injury:MedicalAbsence,currentWeekIndex:number):number {
 if(!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0)
  throw new Error("Invalid current week");
 return Math.max(0,medicalClearanceWeek(injury)-currentWeekIndex);
}
export function isMedicallyCleared(injury:MedicalAbsence,currentWeekIndex:number):boolean {
 return remainingMedicalWeeks(injury,currentWeekIndex)===0;
}
/** Multiple incidents never shorten an existing absence. */
export function effectiveMedicalClearance(injuries:readonly MedicalAbsence[]):number|null {
 if(injuries.length===0)return null;
 return Math.max(...injuries.map(medicalClearanceWeek));
}
