/** Availability snapshot for the wrestler management panel.
 * The show editor remains authoritative for future-week eligibility, consent
 * and appearance accounting; these labels never confer booking permission.
 */
export interface TalentManagementSnapshot{
 status:string;currentWeekIndex:number;medicalWeeksRemaining:number|null;
 contracts:readonly {isYours:boolean;startWeekIndex:number;
  expiresWeekIndex:number;remainingDates:number|null}[];
}
export type TalentManagementStatus="SIGNED"|"MEDICAL"|"NO_DATES"|
 "FUTURE"|"UNSIGNED"|"INACTIVE";
export function wrestlerManagementStatus(view:TalentManagementSnapshot):{
 kind:TalentManagementStatus;headline:string;detail:string;
}{
 const own=view.contracts.find(c=>c.isYours);
 if(view.status!=="ACTIVE"&&view.status!=="INJURED")
  return {kind:"INACTIVE",headline:"Not currently active",
   detail:"The current wrestler status does not permit a normal booking."};
 if(view.medicalWeeksRemaining!==null&&view.medicalWeeksRemaining>0)
  return {kind:"MEDICAL",headline:"Medical clearance pending",
   detail:"Estimated "+view.medicalWeeksRemaining+" week"+
    (view.medicalWeeksRemaining===1?"":"s")+
    " until clearance. A show cannot bypass the medical restriction."};
 if(own&&own.startWeekIndex>view.currentWeekIndex)
  return {kind:"FUTURE",headline:"Signed deal starts later",
   detail:"Starts in "+(own.startWeekIndex-view.currentWeekIndex)+" week"+
    (own.startWeekIndex-view.currentWeekIndex===1?"":"s")+
    ". The signed contract is not active this World week."};
 if(own&&own.remainingDates===0)
  return {kind:"NO_DATES",headline:"No appearance dates left",
   detail:"Review the agreement before booking another appearance. Unused weeks do not create extra dates."};
 if(own&&own.startWeekIndex<=view.currentWeekIndex&&
  own.expiresWeekIndex>=view.currentWeekIndex)
  return {kind:"SIGNED",headline:"Active roster agreement",
   detail:"Signed this World week. Medical status, creative control and the actual show week "+
    "are checked again when saving a card."};
 return {kind:"UNSIGNED",headline:"Not signed to your promotion",
  detail:"Scout the wrestler and review availability before proposing a contract."};
}
