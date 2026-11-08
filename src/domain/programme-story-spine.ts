/** An accepted private wrestler feud pitch only becomes on-screen story
 * after the manager actually books and certifies the relevant chapters.
 * Projection from existing immutable facts; never another story ledger.
 */
export interface WrestlerStoryOrigin{
 requestId:string;initiatorId:string;opponentId:string;
 acceptedWeekIndex:number;recordedWeekIndex:number|null;
 previousCertifiedMeetings:number|null;
}
export type WrestlerStoryStage="AWAITING_CHAPTER"|"SCHEDULED"|
 "ON_SCREEN"|"FINALE_DELIVERED";
export interface WrestlerStorySummary{
 stage:WrestlerStoryStage;headline:string;detail:string;
}
const when=(index:number)=>"Y"+(Math.floor(index/52)+1)+" W"+(index%52+1);
export function describeWrestlerStory(input:{
 origin:WrestlerStoryOrigin;initiatorName:string;opponentName:string;
 activityCount:number;plannedShows:readonly {showName:string;status:string}[];
 resolvedFinaleWeekIndex:number|null;
}):WrestlerStorySummary{
 const {origin,initiatorName,opponentName}=input;
 const intro=initiatorName+" suggested this rivalry with "+opponentName+
  " · accepted "+when(origin.acceptedWeekIndex);
 if(input.resolvedFinaleWeekIndex!==null)
  return {stage:"FINALE_DELIVERED",headline:"Wrestler idea reached its payoff",
   detail:intro+" · finale certified "+when(input.resolvedFinaleWeekIndex)};
 if(input.activityCount>0)
  return {stage:"ON_SCREEN",headline:"Wrestler idea played out on screen",
   detail:intro+" · "+input.activityCount+" certified chapter"+
    (input.activityCount===1?"":"s")};
 if(input.plannedShows.length)
  return {stage:"SCHEDULED",headline:"Opening chapter booked, not yet aired",
   detail:intro+" · "+input.plannedShows[0]!.showName+
    (input.plannedShows[0]!.status==="SUBMITTED"?" confirmed":" in draft")};
 return {stage:"AWAITING_CHAPTER",headline:"Wrestler idea accepted — no on-screen chapter yet",
  detail:intro+" · a programme alone does not book a match or angle"};
}
