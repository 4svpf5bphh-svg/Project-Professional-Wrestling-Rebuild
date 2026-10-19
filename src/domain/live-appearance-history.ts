/** Original main's promotion-specific live appearance rule.
 * One completed physical show counts once. Non-physical video packages and
 * bookings are not appearances. Unknown historic evidence is never a debut.
 */
export const MIN_RETURN_ABSENCE_WEEKS=4 as const;
export type LiveAppearanceStatus=
 "DEBUT_ELIGIBLE"|"RETURN_ELIGIBLE"|"ESTABLISHED"|"UNKNOWN";
export function liveAppearanceStatus(
 complete:boolean,lastWeekIndex:number|null,currentWeekIndex:number
):LiveAppearanceStatus{
 if(!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0||
  (lastWeekIndex!==null&&(!Number.isSafeInteger(lastWeekIndex)||
   lastWeekIndex<0||lastWeekIndex>currentWeekIndex)))
  throw new Error("Invalid appearance history week");
 if(!complete)return "UNKNOWN";
 if(lastWeekIndex===null)return "DEBUT_ELIGIBLE";
 return currentWeekIndex-lastWeekIndex>=MIN_RETURN_ABSENCE_WEEKS?
  "RETURN_ELIGIBLE":"ESTABLISHED";
}
