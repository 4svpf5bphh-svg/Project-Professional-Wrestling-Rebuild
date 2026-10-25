
/** Once per actual retirement, expose only career-qualified former wrestlers
 * to the shared staff market. It never signs them, creates wages or rewrites
 * finished wrestling matches. This runs within atomic World certification.
 */
import type {SqlRows} from "./world-operations.js";
import {retiredStaffCandidate,type RetiredCareerEvidence}
 from "../domain/staff-succession.js";
export async function publishRetiredStaffCandidates(tx:SqlRows,worldId:string,
 retiredIds:readonly string[],weekIndex:number):Promise<number>{
 if(retiredIds.length===0)return 0;
 if(!worldId||worldId.length>200||retiredIds.length>2500||
  !Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw new Error("Invalid retired staff settlement");
 const evidence=await tx.query<{
  person_id:string;name:string;status:string;
  in_ring_quality:number|null;match_craft:number|null;
  presentation:number|null;safety:number|null;career_experience:number|null;
  matches:string;wins:string;tag_matches:string;
 }>([
  "WITH appearances AS (",
  "SELECT e.person_id,e.won,false AS tag FROM ppw_individual_field_career_effects e",
  "JOIN ppw_completed_shows done ON done.world_id=e.world_id AND done.show_id=e.show_id",
  "WHERE e.world_id=$1 AND e.person_id=ANY($2::text[]) UNION ALL",
  "SELECT e.person_id,e.won,true AS tag FROM ppw_tag_match_career_effects e",
  "JOIN ppw_completed_shows done ON done.world_id=e.world_id AND done.show_id=e.show_id",
  "WHERE e.world_id=$1 AND e.person_id=ANY($2::text[])",
  "), summary AS (SELECT person_id,count(*)::text AS matches,",
  "count(*) FILTER(WHERE won)::text AS wins,",
  "count(*) FILTER(WHERE tag)::text AS tag_matches FROM appearances GROUP BY person_id)",
  "SELECT p.person_id,p.name,p.status,p.in_ring_quality,p.match_craft,",
  "p.presentation,p.safety,p.career_experience,",
  "coalesce(s.matches,'0') AS matches,coalesce(s.wins,'0') AS wins,",
  "coalesce(s.tag_matches,'0') AS tag_matches",
  "FROM ppw_people p LEFT JOIN summary s ON s.person_id=p.person_id",
  "WHERE p.world_id=$1 AND p.person_id=ANY($2::text[]) AND p.status='RETIRED'",
  "ORDER BY p.person_id LIMIT 2501"
 ].join(" "),[worldId,retiredIds]);
 if(evidence.length>2500)throw new Error("Retirement evidence exceeds World bound");
 const qualified=evidence.map(p=>retiredStaffCandidate({
  personId:p.person_id,name:p.name,status:p.status,
  inRingQuality:p.in_ring_quality,matchCraft:p.match_craft,
  presentation:p.presentation,safety:p.safety,
  careerExperience:p.career_experience,matches:Number(p.matches),
  wins:Number(p.wins),tagMatches:Number(p.tag_matches)
 } satisfies RetiredCareerEvidence,weekIndex)).filter(x=>x!==null);
 if(!qualified.length)return 0;
 const inserted=await tx.query<{person_id:string;staff_id:string;role:string}>([
  "INSERT INTO ppw_staff_alumni(world_id,person_id,staff_id,role,",
  "craft,people,reliability,weekly_salary,personality,specialism,",
  "career_summary,qualified_week_index)",
  "SELECT $1,x.person_id,x.staff_id,x.role,x.craft,x.people,x.reliability,",
  "x.salary,x.personality,x.specialism,x.summary,$3",
  "FROM jsonb_to_recordset($2::jsonb) x(",
  "person_id text,staff_id text,role text,craft integer,people integer,",
  "reliability integer,salary integer,personality text,specialism text,",
  "summary text) ON CONFLICT (world_id,person_id) DO NOTHING",
  "RETURNING person_id,staff_id,role"
 ].join(" "),[worldId,JSON.stringify(qualified.map(q=>({
  person_id:q.formerWrestlerId,staff_id:q.staffId,role:q.role,
  craft:q.craft,people:q.people,reliability:q.reliability,
  salary:q.weeklySalary,personality:q.personality,
  specialism:q.specialism,summary:q.careerNote
 }))),weekIndex]);
 if(inserted.length)await tx.query([
  "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
  "SELECT $1,$2,$3,'WRESTLER_BECAME_STAFF_CANDIDATE',",
  "jsonb_build_object('personId',x.person_id,'staffId',x.staff_id,",
  "'role',x.role,'significance','ROUTINE')",
  "FROM jsonb_to_recordset($4::jsonb) x(person_id text,staff_id text,role text)"
 ].join(" "),[worldId,Math.floor(weekIndex/52)+1,weekIndex%52+1,
  JSON.stringify(inserted)]);
 return inserted.length;
}
