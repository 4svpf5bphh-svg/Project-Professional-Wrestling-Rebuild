import type {WorldStaffMember} from "./world-staff.js";
/** Small live-show presentation improvement from competent staff.
 * Commentators support the broadcast, Road Agents the card pacing, and
 * Referees assist on complex layouts. Not a replacement for match quality,
 * crowd, wrestler skill, finishes or any booked outcome.
 */
export function staffShowPresentationBonus(staff:readonly WorldStaffMember[],
 complexMatches:number):number{
 if(!Number.isSafeInteger(complexMatches)||complexMatches<0||complexMatches>100)
  throw new Error("Invalid card complexity for staff");
 const role=(name:WorldStaffMember["role"])=>staff.find(s=>s.role===name);
 const road=role("ROAD_AGENT"),com=role("COMMENTATOR"),ref=role("REFEREE");
 const roadBonus=road?Math.max(0,road.craft-45)*0.022:0;
 const commentaryBonus=com?Math.max(0,(com.craft+com.people)/2-45)*0.014:0;
 const refereeBonus=ref&&complexMatches?
  Math.max(0,ref.reliability-48)*0.014*
   Math.min(1,complexMatches/2):0;
 return Math.round(Math.min(2.5,roadBonus+commentaryBonus+refereeBonus)*10)/10;
}
