import type {WorldStaffMember} from "./world-staff.js";
/** A skilled producer streamlines the existing show expenditure; the
 * promotion still pays the employee's separate contracted weekly wage.
 * This never alters ticket forecasts, wrestlers, the match result or the
 * authored card. Percentage is capped to protect the original economy.
 */
export function staffedProductionCost(originalCost:number,staff:WorldStaffMember|null){
 if(!Number.isSafeInteger(originalCost)||originalCost<0)
  throw new Error("Invalid PPW production cost");
 if(staff&&staff.role!=="PRODUCTION")throw new Error("Only production staff affect production");
 const saving=staff?Math.round(originalCost*Math.min(0.06,
  Math.max(0,staff.craft-40)*0.0009)):0;
 return {cost:originalCost-saving,saving};
}
