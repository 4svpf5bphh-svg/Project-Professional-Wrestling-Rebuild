/** Match-local standing permissions. One batch across all candidate promotions:
 * never one roster, programme or World-snapshot request per wrestler.
 */
import type {SqlRows} from "./world-operations.js";
import {normalizeBookableMatch} from "../domain/bookable-match.js";
import {standingTermsCoverMatch} from "../domain/standing-programme-creative.js";
import type {CreativeConcern} from "../domain/match-creative-consent.js";
import type {CreativeReviewShow} from "./match-creative-consent.js";

type StandingRow={
 show_id:string;slot_id:string;person_id:string;contract_id:string;
 match_type:"SINGLES"|"TAG";permitted_outcome:"WIN_ONLY"|"WIN_OR_PROTECTED_LOSS";
 own_people:string[];opponent_people:string[];current_a:string[];current_b:string[];
 decided_week_index:number;expires_week_index:number;approved:boolean;
};
const expanded=(side:"A"|"B")=>[
 "ARRAY(SELECT DISTINCT person_id FROM (",
 "SELECT CASE WHEN r.ref_kind='PERSON' THEN r.ref_id ELSE tm.person_id END AS person_id",
 "FROM ppw_programme_side_refs r",
 "LEFT JOIN ppw_tag_teams t ON t.world_id=r.world_id",
 "AND t.team_id=r.ref_id AND r.ref_kind='TEAM'",
 "LEFT JOIN ppw_tag_team_members tm ON tm.world_id=r.world_id",
 "AND tm.team_id=r.ref_id AND tm.active",
 "WHERE r.world_id=link.world_id AND r.promotion_id=link.promotion_id",
 "AND r.programme_id=link.programme_id AND r.side='"+side+"'",
 "AND (r.ref_kind='PERSON' OR (t.status='ACTIVE' AND tm.person_id IS NOT NULL))",
 ") people WHERE person_id IS NOT NULL ORDER BY person_id)"
].join(" ");
export async function standingCoveredConcerns(tx:SqlRows,worldId:string,
 shows:readonly CreativeReviewShow[],concerns:readonly CreativeConcern[]):Promise<Set<string>>{
 const full=concerns.filter(x=>x.reason==="MATCH_APPROVAL");
 if(!full.length)return new Set();
 const allowed=new Set(full.map(x=>[
  x.showId,x.slotId,x.personId,x.contractId].join("\u0001")));
 const records=await tx.query<StandingRow>([
  "SELECT link.draft_id AS show_id,link.slot_id,consent.person_id,consent.contract_id,",
  "consent.match_type,consent.permitted_outcome,consent.own_people,",
  "consent.opponent_people,consent.decided_week_index,",
  "consent.expires_week_index,consent.approved,",
  expanded("A")+" AS current_a,",expanded("B")+" AS current_b",
  "FROM ppw_programme_match_activities link",
  "JOIN ppw_programmes p ON p.world_id=link.world_id",
  "AND p.promotion_id=link.promotion_id AND p.programme_id=link.programme_id",
  "AND p.status='ACTIVE'",
  "JOIN ppw_programme_creative_agreements consent",
  "ON consent.world_id=link.world_id",
  "AND consent.promotion_id=link.promotion_id",
  "AND consent.programme_id=link.programme_id AND consent.approved",
  "WHERE link.world_id=$1 AND link.draft_id=ANY($2::text[])",
  "AND link.kind='MATCH' AND link.promotion_id=ANY($3::text[])",
  "ORDER BY link.draft_id,link.slot_id,consent.person_id LIMIT 3001"
 ].join(" "),[worldId,[...new Set(shows.map(x=>x.showId))],
  [...new Set(shows.map(x=>x.promotionId))]]);
 if(records.length>3000)throw new Error("Too many signed rivalry terms");
 const showMap=new Map(shows.map(x=>[x.showId,x]));
 const result=new Set<string>();
 for(const a of records){
  const key=[a.show_id,a.slot_id,a.person_id,a.contract_id].join("\u0001");
  if(!allowed.has(key))continue;
  const show=showMap.get(a.show_id);
  const match=show?.slots.find(s=>s.kind==="MATCH"&&s.slot_id===a.slot_id);
  if(!match)continue;
  const own=a.current_a.includes(a.person_id)?a.current_a:
   a.current_b.includes(a.person_id)?a.current_b:[];
  const opponents=a.current_a.includes(a.person_id)?a.current_b:
   a.current_b.includes(a.person_id)?a.current_a:[];
  if(standingTermsCoverMatch({
   showId:a.show_id,slotId:a.slot_id,personId:a.person_id,
   contractId:a.contract_id,startWeekIndex:a.decided_week_index,
   expiresWeekIndex:a.expires_week_index,matchType:a.match_type,
   permittedOutcome:a.permitted_outcome,ownPeople:a.own_people,
   opponentPeople:a.opponent_people,currentOwn:own,currentOpponents:opponents,
   approved:a.approved
  },normalizeBookableMatch(match.payload),show.weekIndex))result.add(key);
 }
 return result;
}
