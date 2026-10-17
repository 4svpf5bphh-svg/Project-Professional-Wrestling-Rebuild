/** A wrestler's "let's discuss my deal" only counts as followed through
 * when the original, matching contract has an actual submitted negotiation.
 * Never signs terms, changes offers, morale or match outcomes.
 */
import type {SqlRows} from "./world-operations.js";
export async function settleBackstageContractDiscussions(
 tx:SqlRows,worldId:string,weekIndex:number,
):Promise<{opened:number}>{
 if(!worldId||worldId.length>200||
  !Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw new Error("Invalid Backstage contract window");
 const opened=await tx.query<{request_id:string}>([
  "WITH conversations AS (",
  "SELECT r.request_id,r.promotion_id,r.person_id,r.source_contract_id,",
  "r.responded_week_index FROM ppw_backstage_requests r",
  "WHERE r.world_id=$1 AND r.kind='CONTRACT'",
  "AND r.decision='EXPLORE_RENEWAL' AND r.status='ANSWERED'",
  "AND r.source_contract_id IS NOT NULL",
  "AND r.follow_through_week_index IS NULL",
  "AND r.responded_week_index BETWEEN greatest(0,$2-52) AND $2",
  "ORDER BY r.responded_week_index,r.request_id LIMIT 2049",
  "), negotiations AS (",
  "SELECT r.request_id,p.created_week_index AS week_index",
  "FROM conversations r JOIN ppw_contract_renewal_proposals p",
  "ON p.world_id=$1 AND p.promotion_id=r.promotion_id",
  "AND p.person_id=r.person_id AND p.contract_id=r.source_contract_id",
  "AND p.created_week_index BETWEEN r.responded_week_index AND $2",
  "AND p.status<>'WITHDRAWN'",
  "UNION ALL",
  "SELECT r.request_id,o.submitted_week_index AS week_index",
  "FROM conversations r JOIN ppw_contract_offers o",
  "ON o.world_id=$1 AND o.promotion_id=r.promotion_id",
  "AND o.person_id=r.person_id AND o.source_contract_id=r.source_contract_id",
  "AND o.submitted_week_index BETWEEN r.responded_week_index AND $2",
  "AND o.status<>'WITHDRAWN'",
  "), first_activity AS (",
  "SELECT request_id,min(week_index) AS week_index",
  "FROM negotiations GROUP BY request_id",
  "), recorded AS (",
  "UPDATE ppw_backstage_requests r",
  "SET follow_through_kind='CONTRACT_NEGOTIATION_STARTED',",
  "follow_through_week_index=f.week_index",
  "FROM first_activity f WHERE r.world_id=$1",
  "AND r.request_id=f.request_id AND r.follow_through_week_index IS NULL",
  "RETURNING r.request_id)",
  "SELECT request_id FROM recorded LIMIT 2049"
 ].join(" "),[worldId,weekIndex]);
 if(opened.length>2048)throw new Error("Backstage contract discussions exceed World bound");
 return {opened:opened.length};
}
