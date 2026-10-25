
/** World-shared alumni are projected in the already-required, authenticated
 * staff-owner read; no extra iPhone query or polling is necessary.
 */
import {worldStaff,type StaffRole,type WorldStaffMember} from "./world-staff.js";
export const STAFF_ALUMNI_JSON_SQL=[
 "COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (",
 "SELECT a.staff_id AS \"staffId\",p.name,a.role,a.craft,a.people,",
 "a.reliability,a.weekly_salary AS \"weeklySalary\",a.personality,",
 "a.specialism,a.person_id AS \"formerWrestlerId\",",
 "a.career_summary AS \"careerNote\"",
 "FROM ppw_staff_alumni a JOIN ppw_people p ON p.world_id=a.world_id",
 "AND p.person_id=a.person_id AND p.status='RETIRED'",
 "WHERE a.world_id=w.world_id",
 "ORDER BY EXISTS(SELECT 1 FROM ppw_staff_employments e",
 "WHERE e.world_id=a.world_id AND e.staff_id=a.staff_id",
 "AND e.status='ACTIVE') DESC,",
 "a.qualified_week_index DESC,a.person_id LIMIT 192",
 ") s),'[]'::jsonb) AS alumni_staff"
].join(" ");
export function worldStaffWithAlumni(seed:string|number|bigint,
 legacyStaffIds:readonly string[],alumni:unknown):WorldStaffMember[]{
 if(!Array.isArray(alumni))throw new Error("Invalid World staff alumni catalogue");
 return [...worldStaff(seed,legacyStaffIds),...alumni.map((a:Record<string,unknown>)=>{
  if(typeof a.staffId!=="string"||typeof a.name!=="string"||
   typeof a.formerWrestlerId!=="string"||typeof a.role!=="string"||
   !["ROAD_AGENT","TRAINER","COMMENTATOR","CREATIVE"].includes(a.role)||
   typeof a.specialism!=="string"||typeof a.careerNote!=="string")
   throw new Error("Corrupt staff alumni identity");
  const craft=Number(a.craft),people=Number(a.people),
   reliability=Number(a.reliability),weeklySalary=Number(a.weeklySalary);
  if(![craft,people,reliability].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100)||
   !Number.isSafeInteger(weeklySalary)||weeklySalary<1||weeklySalary>1_000_000||
   !["FRANK","PATIENT","AMBITIOUS","LOYAL","ECCENTRIC"].includes(String(a.personality)))
   throw new Error("Corrupt alumni staff competencies");
  return {staffId:a.staffId,name:a.name,role:a.role as StaffRole,
   craft,people,reliability,weeklySalary,
   insight:Math.round((craft*2+people+reliability)/4),
   personality:a.personality as WorldStaffMember["personality"],
   specialism:a.specialism,formerWrestlerId:a.formerWrestlerId,
   careerNote:a.careerNote};
 })];
}
