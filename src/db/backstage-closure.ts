/** Close unanswered conversations whose subject is no longer available.
 * The system does not fabricate a booker's DECLINE choice. A closed thread
 * remains in private history, and a real renewed deal can receive new pitches.
 * One bounded, world-scoped update only at canonical publication.
 */
import type {SqlRows} from "./world-operations.js";
export async function closeUnavailableBackstageRequests(
 tx:SqlRows,worldId:string,nextWeekIndex:number,
){
 if(!worldId||!Number.isSafeInteger(nextWeekIndex)||nextWeekIndex<0)
  throw new Error("Invalid Backstage World week");
 const rows=await tx.query<{request_id:string}>([
  "UPDATE ppw_backstage_requests r SET status='EXCUSED',",
  "assessment_reason=CASE WHEN person.status<>'ACTIVE'",
  "THEN 'WRESTLER_UNAVAILABLE' ELSE 'CONTRACT_UNAVAILABLE' END",
  "FROM ppw_people person WHERE r.world_id=$1 AND r.status='PENDING'",
  "AND person.world_id=r.world_id AND person.person_id=r.person_id",
  "AND (person.status<>'ACTIVE' OR NOT EXISTS(",
  "SELECT 1 FROM ppw_contracts c WHERE c.world_id=r.world_id",
  "AND c.promotion_id=r.promotion_id AND c.person_id=r.person_id",
  "AND c.status='SIGNED' AND c.start_week_index<=$2",
  "AND c.expires_week_index>=$2))",
  "RETURNING r.request_id"
 ].join(" "),[worldId,nextWeekIndex]);
 if(rows.length>512)throw new Error("Backstage closure exceeds bounded World batch");
 return {closed:rows.length};
}
