/** Private wrestler correspondence, generated only at World publication. */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import {backstageDecisionEffect,type BackstageKind,type BackstageDecision}
 from "../domain/backstage-conversations.js";
export interface BackstageDecisionInput {
 worldId:string;promotionId:string;playerId:string;requestId:string;
 expectedRevision:number;conversationId:string;decision:BackstageDecision;
}
export async function decideBackstageRequest(pool:TransactionPool,i:BackstageDecisionInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId,i.conversationId]
  .every(x=>typeof x==="string"&&x.length>0&&x.length<=200))
  throw new Error("Invalid Backstage command");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_DECISION",requiresOpenWeek:true,
  execute:async tx=>{
   const found=await tx.query<{person_id:string;related_person_id:string|null;
    kind:BackstageKind;year:number;week:number;morale:number|null;
    source_contract_id:string|null;expires_week_index:number|null}>([
    "SELECT r.person_id,r.related_person_id,r.kind,w.year,w.week,p.morale,",
    "r.source_contract_id,cdeal.expires_week_index",
    "FROM ppw_backstage_requests r JOIN ppw_worlds w ON w.world_id=r.world_id",
    "JOIN ppw_people p ON p.world_id=r.world_id AND p.person_id=r.person_id",
    "JOIN ppw_promotion_controls c ON c.world_id=r.world_id",
    "AND c.promotion_id=r.promotion_id AND c.player_id=$4 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions promo ON promo.world_id=r.world_id",
    "AND promo.promotion_id=r.promotion_id AND promo.lifecycle='ACTIVE'",
    "LEFT JOIN ppw_contracts cdeal ON cdeal.world_id=r.world_id",
    "AND cdeal.contract_id=r.source_contract_id",
    "WHERE r.world_id=$1 AND r.request_id=$2 AND r.promotion_id=$3",
    "AND r.status='PENDING' AND p.status='ACTIVE'",
    "AND EXISTS(SELECT 1 FROM ppw_contracts deal",
    "WHERE deal.world_id=r.world_id AND deal.promotion_id=r.promotion_id",
    "AND deal.person_id=r.person_id AND deal.status='SIGNED'",
    "AND deal.start_week_index<=(w.year-1)*52+w.week-1",
    "AND deal.expires_week_index>=(w.year-1)*52+w.week-1)",
    "FOR UPDATE OF r"
   ].join(" "),[i.worldId,i.conversationId,i.promotionId,i.playerId]);
   if(found.length!==1)throw new Error("Wrestler request unavailable or already answered");
   const r=found[0]!,effect=backstageDecisionEffect(r.kind,i.decision);
   const weekIndex=(r.year-1)*52+r.week-1;
   if(effect.promise){
    // A promise is a choice with a real deliverable. Zero-date and expiring
    // contracts cannot be used to manufacture an impossible booking debt.
    // This narrow read runs only when the booker actually makes a promise.
    const eligible=await tx.query<{contract_id:string}>([
     "SELECT contract_id FROM ppw_contracts",
     "WHERE world_id=$1 AND promotion_id=$2 AND person_id=$3",
     "AND status='SIGNED' AND start_week_index<=$4",
     "AND expires_week_index>$4",
     "AND (family='EXCLUSIVE' OR remaining_dates>0)",
     "AND ($5::text IS NULL OR contract_id=$5)",
     "ORDER BY expires_week_index DESC,contract_id LIMIT 1"
    ].join(" "),[i.worldId,i.promotionId,r.person_id,weekIndex,r.source_contract_id]);
    if(eligible.length!==1)
     throw new Error("Cannot promise a booking without remaining contracted dates and a future week");
   }
   if((i.decision==="EXPLORE_TEAM"||i.decision==="EXPLORE_RIVALRY")&&
     r.related_person_id){
    const partner=await tx.query<{contract_id:string}>([
     "SELECT c.contract_id FROM ppw_contracts c",
     "JOIN ppw_people p ON p.world_id=c.world_id AND p.person_id=c.person_id",
     "WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.person_id=$3",
     "AND c.status='SIGNED' AND p.status='ACTIVE'",
     "AND c.start_week_index<=$4 AND c.expires_week_index>=$4 LIMIT 1"
    ].join(" "),[i.worldId,i.promotionId,r.related_person_id,weekIndex]);
    if(!partner.length)throw new Error("Proposed wrestler is no longer contracted");
   }
   // A role-specific featured promise must be tied to the original active
   // contract, and must leave at least one World week to deliver.
   if(i.decision==="PROMISE_FEATURED"&&
     (!r.source_contract_id||r.expires_week_index===null||
      r.expires_week_index<=weekIndex))
    throw new Error("Featured booking promise requires a continuing contract");
   const deadline=i.decision==="PROMISE_FEATURED"?
    Math.min(weekIndex+4,r.expires_week_index!):weekIndex+2;
   const changed=await tx.query<{request_id:string}>([
    "UPDATE ppw_backstage_requests SET status=$4,decision=$5,",
    "responded_week_index=$6,due_week_index=$7",
    "WHERE world_id=$1 AND request_id=$2 AND promotion_id=$3 AND status='PENDING'",
    "RETURNING request_id"
   ].join(" "),[i.worldId,i.conversationId,i.promotionId,
    effect.status,i.decision,weekIndex,effect.promise?deadline:null]);
   if(changed.length!==1)throw new Error("Backstage request changed");
   // No instant morale/chemistry reward for selecting a reply. Only a
   // verified broken promise can affect promotion-scoped trust later.
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'BACKSTAGE_RESPONSE',",
    "jsonb_build_object('promotionId',$4::text,'personId',$5::text,",
    "'conversationId',$6::text,'decision',$7::text))"
   ].join(" "),[i.worldId,r.year,r.week,i.promotionId,r.person_id,
    i.conversationId,i.decision]);
   return {conversationId:i.conversationId,personId:r.person_id,
    status:effect.status,decision:i.decision,
    dueWeekIndex:effect.promise?deadline:null,
    moraleDelta:0};
  }});
}
/** Match/promo commitments only resolve against authoritative completed
 * results. Stat progression from the actual show already happened elsewhere.
 * A broken word affects only promotion-specific trust; no global morale bonus.
 */
export async function settleBackstagePromises(tx:SqlRows,worldId:string,weekIndex:number){
 const rows=await tx.query<{request_id:string;promotion_id:string;person_id:string;
  status:string;assessment_reason:string;trust_delta:number}>([
  "WITH promises AS (",
  "SELECT r.request_id,r.promotion_id,r.person_id,r.decision,r.responded_week_index,",
  "r.due_week_index,r.source_contract_id,r.promised_role,",
  "EXISTS(SELECT 1 FROM ppw_completed_shows sh",
  "JOIN ppw_card_slots s ON s.world_id=sh.world_id AND s.draft_id=sh.show_id",
  "LEFT JOIN ppw_completed_show_matches match ON match.world_id=sh.world_id",
  "AND match.show_id=sh.show_id AND match.match_id=s.slot_id",
  "LEFT JOIN ppw_completed_show_segments segment ON segment.world_id=sh.world_id",
  "AND segment.show_id=sh.show_id AND segment.slot_id=s.slot_id",
  "WHERE sh.world_id=r.world_id AND sh.promotion_id=r.promotion_id",
  "AND (sh.year-1)*52+sh.week-1 BETWEEN r.responded_week_index",
  "AND least($2,r.due_week_index)",
  "AND s.payload->'participants' @> jsonb_build_array(",
  "CASE WHEN r.decision='PROMISE_FEATURED' THEN",
  "jsonb_build_object('personId',r.person_id,'contractId',r.source_contract_id)",
  "ELSE jsonb_build_object('personId',r.person_id) END)",
  "AND CASE WHEN r.decision='PROMISE_SEGMENT' THEN",
  "s.kind='SEGMENT' AND segment.slot_id IS NOT NULL",
  "AND segment.authored_outcome='HAPPENS'",
  "WHEN r.decision='PROMISE_FEATURED' THEN",
  "s.kind='MATCH' AND match.match_id IS NOT NULL AND",
  "match.position >= (SELECT max(other.position) -",
  "CASE WHEN r.promised_role='MAIN_EVENT' THEN 0 ELSE 1 END",
  "FROM ppw_completed_show_matches other",
  "WHERE other.world_id=sh.world_id AND other.show_id=sh.show_id)",
  "ELSE s.kind='MATCH' AND match.match_id IS NOT NULL END",
  ") AS fulfilled,",
  "EXISTS(SELECT 1 FROM ppw_completed_shows sh",
  "WHERE sh.world_id=r.world_id AND sh.promotion_id=r.promotion_id",
  "AND (sh.year-1)*52+sh.week-1 BETWEEN r.responded_week_index",
  "AND least($2,r.due_week_index)) AS had_show,",
  "EXISTS(SELECT 1 FROM ppw_contracts c",
  "WHERE c.world_id=r.world_id AND c.promotion_id=r.promotion_id",
  "AND c.person_id=r.person_id AND c.status='SIGNED'",
  "AND (r.source_contract_id IS NULL OR c.contract_id=r.source_contract_id)",
  "AND (c.family='EXCLUSIVE' OR c.remaining_dates>0)",
  "AND c.start_week_index<=$2 AND c.expires_week_index>=$2) AS active_deal",
  "FROM ppw_backstage_requests r",
  "WHERE r.world_id=$1 AND r.status='PROMISED'",
  "AND r.responded_week_index<=$2",
  "), settled AS (",
  "UPDATE ppw_backstage_requests r SET",
  "status=CASE WHEN p.fulfilled THEN 'FULFILLED'",
  "WHEN NOT p.had_show OR NOT p.active_deal THEN 'EXCUSED'",
  "ELSE 'BROKEN' END,",
  "assessment_reason=CASE WHEN p.fulfilled THEN 'VERIFIED_BOOKING'",
  "WHEN NOT p.had_show THEN 'NO_COMPLETED_SHOW'",
  "WHEN NOT p.active_deal THEN 'CONTRACT_UNAVAILABLE'",
  "ELSE 'UNFULFILLED_COMMITMENT' END,",
  "trust_delta=CASE WHEN NOT p.fulfilled AND p.had_show AND p.active_deal",
  "THEN -3 ELSE 0 END",
  "FROM promises p WHERE r.world_id=$1 AND r.request_id=p.request_id",
  "AND (p.fulfilled OR r.due_week_index<=$2)",
  "RETURNING r.request_id,r.promotion_id,r.person_id,r.status,",
  "r.assessment_reason,r.trust_delta",
  ") SELECT * FROM settled LIMIT 513"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>512)throw new Error("Backstage promise settlement overflow");
 if(!rows.length)return {settled:0,broken:0};
 const penalties=rows.filter(row=>row.trust_delta<0);
 if(penalties.length){
  // One batched upsert keyed by promotion AND person. The same wrestler can
  // work in several feds without an unrelated promoter's trust suffering.
  await tx.query([
   "INSERT INTO ppw_backstage_promotion_trust(world_id,promotion_id,person_id,trust)",
   "SELECT $1,x.promotion_id,x.person_id,",
   "greatest(0,50+sum(x.trust_delta))",
   "FROM jsonb_to_recordset($2::jsonb) AS x(",
   "promotion_id text,person_id text,trust_delta integer)",
   "GROUP BY x.promotion_id,x.person_id",
   "ON CONFLICT(world_id,promotion_id,person_id) DO UPDATE",
   "SET trust=greatest(0,ppw_backstage_promotion_trust.trust+EXCLUDED.trust-50)"
  ].join(" "),[worldId,JSON.stringify(penalties)]);
 }
 await tx.query([
  "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
  "SELECT $1,$2,$3,'BACKSTAGE_PROMISE_'||x.status,",
  "jsonb_build_object('promotionId',x.promotion_id,'personId',x.person_id,",
  "'conversationId',x.request_id,'reason',x.assessment_reason,",
  "'trustDelta',x.trust_delta)",
  "FROM jsonb_to_recordset($4::jsonb) AS x(",
  "person_id text,status text,promotion_id text,request_id text,",
  "assessment_reason text,trust_delta integer)"
 ].join(" "),[worldId,Math.floor(weekIndex/52)+1,weekIndex%52+1,JSON.stringify(rows)]);
 return {settled:rows.length,broken:penalties.length};
}
/** Original PPW cadence: one new private discussion per promotion/week,
 * at most three outstanding. Role grievances require four verified matches
 * under the same contract in the last 12 weeks with no promised featured slot.
 * Scan one bounded 12-week show window, never the entire World or N+1 history.
 */
export async function publishBackstageRequests(tx:SqlRows,worldId:string,weekIndex:number){
 const rows=await tx.query<{request_id:string}>([
  "WITH completed_slots AS (",
  "SELECT sh.promotion_id,sh.show_id,",
  "row_number() OVER (PARTITION BY sh.promotion_id,sh.show_id",
  "ORDER BY played.position DESC) AS main_event_rank,",
  "s.payload->'participants' AS participants,",
  "played.crowd_response AS crowd_response",
  "FROM ppw_completed_shows sh JOIN ppw_completed_show_matches played",
  "ON played.world_id=sh.world_id AND played.show_id=sh.show_id",
  "JOIN ppw_card_slots s ON s.world_id=played.world_id",
  "AND s.draft_id=played.show_id AND s.slot_id=played.match_id",
  "AND s.kind='MATCH'",
  "WHERE sh.world_id=$1 AND (sh.year-1)*52+sh.week-1",
  "BETWEEN greatest(0,$2-12) AND $2-1",
  "), role_evidence AS (",
  "SELECT m.promotion_id,x.participant->>'personId' AS person_id,",
  "x.participant->>'contractId' AS contract_id,",
  "count(*)::integer AS match_shows,",
  "count(*) FILTER(WHERE m.main_event_rank=1)::integer AS main_shows,",
  "count(*) FILTER(WHERE m.main_event_rank<=2)::integer AS upper_shows,",
  "round(avg(m.crowd_response)::numeric,1)::double precision AS average_response",
  "FROM completed_slots m CROSS JOIN LATERAL",
  "jsonb_array_elements(m.participants) AS x(participant)",
  "GROUP BY m.promotion_id,person_id,contract_id",
  "), working_strains AS (",
  "SELECT DISTINCT ON (sh.promotion_id,x.person_id)",
  "sh.promotion_id,x.person_id,x.partner_id,ch.verified_shows,ch.trust_delta",
  "FROM ppw_wrestler_relationship_changes ch",
  "JOIN ppw_tag_working_pair_appearances a ON a.world_id=ch.world_id",
  "AND a.show_id=ch.show_id AND a.match_id=ch.match_id",
  "AND a.person_a_id=ch.person_a_id AND a.person_b_id=ch.person_b_id",
  "JOIN ppw_completed_shows sh ON sh.world_id=ch.world_id",
  "AND sh.show_id=ch.show_id",
  "CROSS JOIN LATERAL (VALUES (ch.person_a_id,ch.person_b_id),",
  "(ch.person_b_id,ch.person_a_id)) AS x(person_id,partner_id)",
  "JOIN ppw_contracts partner ON partner.world_id=ch.world_id",
  "AND partner.promotion_id=sh.promotion_id",
  "AND partner.person_id=x.partner_id AND partner.status='SIGNED'",
  "AND partner.start_week_index<=$2 AND partner.expires_week_index>=$2",
  "AND (partner.remaining_dates IS NULL OR partner.remaining_dates>0)",
  "JOIN ppw_people coworker ON coworker.world_id=ch.world_id",
  "AND coworker.person_id=x.partner_id AND coworker.status='ACTIVE'",
  "WHERE ch.world_id=$1 AND ch.week_index=$2-1",
  "AND (sh.year-1)*52+sh.week-1=ch.week_index",
  "AND ch.change_type='STRAIN' AND ch.trust_delta<0",
  "AND ch.verified_shows>=3",
  "ORDER BY sh.promotion_id,x.person_id,ch.trust_delta,x.partner_id",
  "),",
  "career_matches AS (",
  "SELECT sh.promotion_id,e.person_id,e.won FROM ppw_completed_shows sh",
  "JOIN ppw_individual_field_career_effects e",
  "ON e.world_id=sh.world_id AND e.show_id=sh.show_id",
  "WHERE sh.world_id=$1 AND (sh.year-1)*52+sh.week-1",
  "BETWEEN greatest(0,$2-8) AND $2-1",
  "UNION ALL",
  "SELECT sh.promotion_id,e.person_id,e.won FROM ppw_completed_shows sh",
  "JOIN ppw_tag_match_career_effects e",
  "ON e.world_id=sh.world_id AND e.show_id=sh.show_id",
  "WHERE sh.world_id=$1 AND (sh.year-1)*52+sh.week-1",
  "BETWEEN greatest(0,$2-8) AND $2-1",
  "), loss_evidence AS (",
  "SELECT promotion_id,person_id,",
  "count(*) FILTER(WHERE NOT won)::integer AS losses,",
  "count(*) FILTER(WHERE won)::integer AS wins",
  "FROM career_matches GROUP BY promotion_id,person_id",
  "), recent_shows AS (",
  "SELECT promotion_id,count(*)::integer AS show_count",
  "FROM ppw_completed_shows WHERE world_id=$1",
  "AND (year-1)*52+week-1 BETWEEN greatest(0,$2-12) AND $2-1",
  "GROUP BY promotion_id",
  "),",
  " eligible AS (",
  "SELECT DISTINCT ON (c.promotion_id,c.person_id)",
  "c.promotion_id,c.person_id,c.contract_id,c.role_expectation,",
  "c.start_week_index,",
  "p.morale,p.momentum,p.recognition,c.expires_week_index,",
  "coalesce(ev.match_shows,0) AS observed_match_shows,",
  "coalesce(ev.average_response,100) AS average_response,",
  "CASE WHEN c.role_expectation='MAIN_EVENT' THEN",
  "coalesce(ev.main_shows,0) ELSE coalesce(ev.upper_shows,0) END",
  "AS observed_featured_shows,",
  "strain.partner_id AS related_person_id,",
  "strain.verified_shows AS working_verified_shows,",
  "strain.trust_delta AS working_trust_delta,",
  "coalesce(losses.losses,0) AS recent_losses,",
  "coalesce(losses.wins,0) AS recent_wins,",
  "coalesce(shows.show_count,0) AS promotion_shows,",
  "EXISTS(SELECT 1 FROM ppw_medical_absences med",
  "WHERE med.world_id=c.world_id AND med.person_id=c.person_id",
  "AND med.status='ACTIVE' AND med.cleared_week_index>$2)",
  "AS medically_unavailable,",
  "EXISTS(SELECT 1 FROM ppw_backstage_memories remembered",
  "WHERE remembered.world_id=c.world_id",
  "AND remembered.promotion_id=c.promotion_id",
  "AND remembered.person_id=c.person_id AND remembered.kind='PROMISE_BROKEN'",
  "AND remembered.occurred_week_index>=$2-26",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_memories kept",
  "WHERE kept.world_id=remembered.world_id",
  "AND kept.promotion_id=remembered.promotion_id",
  "AND kept.person_id=remembered.person_id AND kept.kind='PROMISE_KEPT'",
  "AND kept.occurred_week_index>remembered.occurred_week_index))",
  "AS remembered_broken_promise,",
  "aspiration.title_name AS relevant_title",
  "FROM ppw_contracts c JOIN ppw_people p ON p.world_id=c.world_id",
  "AND p.person_id=c.person_id",
  "JOIN ppw_promotions promo ON promo.world_id=c.world_id",
  "AND promo.promotion_id=c.promotion_id AND promo.lifecycle='ACTIVE'",
  "JOIN ppw_promotion_controls owner ON owner.world_id=c.world_id",
  "AND owner.promotion_id=c.promotion_id AND owner.active",
  "JOIN ppw_memberships member ON member.world_id=owner.world_id",
  "AND member.player_id=owner.player_id AND member.status='ACTIVE'",
  "LEFT JOIN role_evidence ev ON ev.promotion_id=c.promotion_id",
  "AND ev.person_id=c.person_id AND ev.contract_id=c.contract_id",
  "LEFT JOIN loss_evidence losses ON losses.promotion_id=c.promotion_id",
  "AND losses.person_id=c.person_id",
  "LEFT JOIN recent_shows shows ON shows.promotion_id=c.promotion_id",
  "LEFT JOIN LATERAL (",
  "SELECT title.name AS title_name FROM ppw_backstage_memories memory",
  "JOIN ppw_championships title ON title.world_id=memory.world_id",
  "AND title.promotion_id=memory.promotion_id",
  "AND title.championship_id=memory.source_id",
  "WHERE memory.world_id=c.world_id AND memory.promotion_id=c.promotion_id",
  "AND memory.person_id=c.person_id AND memory.kind='TITLE_CHALLENGE'",
  "AND memory.occurred_week_index>=$2-26",
  "ORDER BY memory.occurred_week_index DESC,memory.memory_id DESC LIMIT 1",
  ") aspiration ON true",
  "LEFT JOIN working_strains strain ON strain.promotion_id=c.promotion_id",
  "AND strain.person_id=c.person_id",
  "WHERE c.world_id=$1 AND c.status='SIGNED' AND p.status='ACTIVE'",
  "AND c.start_week_index<=$2 AND c.expires_week_index>=$2",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests earlier",
  "WHERE earlier.world_id=c.world_id AND earlier.promotion_id=c.promotion_id",
  "AND earlier.person_id=c.person_id",
  "AND (earlier.status IN ('PENDING','PROMISED')",
  "OR earlier.created_week_index>=$2-8))",
  "ORDER BY c.promotion_id,c.person_id,c.expires_week_index,",
  "c.contract_id",
  "), candidates AS (SELECT e.*,k.kind,k.priority",
  "FROM eligible e CROSS JOIN LATERAL (VALUES",
  "('ROLE_USAGE',CASE WHEN e.role_expectation IN ('MAIN_EVENT','UPPER_CARD')",
  "AND e.observed_match_shows>=4 AND e.observed_featured_shows=0",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests prior",
  "WHERE prior.world_id=$1 AND prior.promotion_id=e.promotion_id",
  "AND prior.source_contract_id=e.contract_id AND prior.kind='ROLE_USAGE')",
  "THEN 98 ELSE 0 END),",
  "('CONTRACT',CASE WHEN e.expires_week_index<=$2+3 THEN 96 ELSE 0 END),",
  "('MEDICAL_SUPPORT',CASE WHEN e.medically_unavailable THEN 92 ELSE 0 END),",
  "('TRUST_CHECK_IN',CASE WHEN e.remembered_broken_promise THEN 88 ELSE 0 END),",
  "('TITLE_AMBITION',CASE WHEN e.relevant_title IS NOT NULL AND",
  "NOT EXISTS(SELECT 1 FROM ppw_championship_reigns reign",
  "WHERE reign.world_id=$1 AND reign.promotion_id=e.promotion_id",
  "AND reign.person_id=e.person_id AND reign.status='ACTIVE')",
  "THEN 80 ELSE 0 END),",
  "('LOSS_STREAK',CASE WHEN e.recent_losses>=3",
  "AND e.recent_wins<=1 THEN 78 ELSE 0 END),",
  "('BOOKING_OMISSION',CASE WHEN e.promotion_shows>=3",
  "AND e.observed_match_shows=0 AND e.start_week_index<=$2-8",
  "AND NOT e.medically_unavailable",
  "AND NOT EXISTS(SELECT 1 FROM ppw_completed_shows sh",
  "JOIN ppw_completed_show_segments segment",
  "ON segment.world_id=sh.world_id AND segment.show_id=sh.show_id",
  "AND segment.authored_outcome='HAPPENS'",
  "JOIN ppw_card_slots slot ON slot.world_id=segment.world_id",
  "AND slot.draft_id=segment.show_id AND slot.slot_id=segment.slot_id",
  "WHERE sh.world_id=$1 AND sh.promotion_id=e.promotion_id",
  "AND (sh.year-1)*52+sh.week-1 BETWEEN greatest(0,$2-12) AND $2-1",
  "AND slot.payload->'participants' @>",
  "jsonb_build_array(jsonb_build_object('personId',e.person_id)))",
  "THEN 75 ELSE 0 END),",
  "('MORALE',CASE WHEN e.morale<35 THEN 70 ELSE 0 END),",
  "('MOMENTUM',CASE WHEN e.momentum<25 THEN 65 ELSE 0 END),",
  "('GIMMICK_PITCH',CASE WHEN e.observed_match_shows>=4",
  "AND e.average_response<=55 AND e.start_week_index<=$2-6",
  "AND NOT EXISTS(SELECT 1 FROM ppw_persona_change_requests change",
  "WHERE change.world_id=$1 AND change.promotion_id=e.promotion_id",
  "AND change.person_id=e.person_id AND change.submitted_week_index>=$2-6)",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests prior",
  "WHERE prior.world_id=$1 AND prior.promotion_id=e.promotion_id",
  "AND prior.source_contract_id=e.contract_id AND prior.kind='GIMMICK_PITCH')",
  "THEN 60 ELSE 0 END),",
  "('CREATIVE',CASE WHEN e.recognition>=55 AND e.momentum<55",
  "THEN 56 ELSE 0 END),",
  "('PARTNERSHIP',CASE WHEN e.related_person_id IS NOT NULL",
  "THEN 54 ELSE 0 END)",
  ") AS k(kind,priority) WHERE k.priority>0",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests same_kind",
  "WHERE same_kind.world_id=$1 AND same_kind.promotion_id=e.promotion_id",
  "AND same_kind.person_id=e.person_id AND same_kind.kind=k.kind",
  "AND same_kind.created_week_index>=$2-26)",
  "), ranked AS (SELECT *,row_number() OVER(PARTITION BY promotion_id",
  "ORDER BY priority DESC,observed_match_shows DESC,",
  "coalesce(morale,50),person_id,kind) AS rank",
  "FROM candidates c WHERE",
  "(SELECT count(*) FROM ppw_backstage_requests old",
  "WHERE old.world_id=$1 AND old.promotion_id=c.promotion_id",
  "AND old.status='PENDING')<3",
  "AND NOT EXISTS(SELECT 1 FROM ppw_backstage_requests old",
  "WHERE old.world_id=$1 AND old.promotion_id=c.promotion_id",
  "AND old.created_week_index=$2)",
  ") INSERT INTO ppw_backstage_requests(",
  "world_id,request_id,promotion_id,person_id,related_person_id,kind,",
  "created_week_index,source_contract_id,promised_role,",
  "observed_match_shows,observed_featured_shows,",
  "observed_average_crowd,working_verified_shows,working_trust_delta,",
  "observed_absent_weeks,observed_losses,relevant_title)",
  "SELECT $1,CASE WHEN kind='ROLE_USAGE' THEN",
  "'backstage:role:'||contract_id WHEN kind='GIMMICK_PITCH' THEN",
  "'backstage:gimmick:'||contract_id ELSE",
  "'backstage:'||$2::text||':'||promotion_id||':'||person_id END,",
  "promotion_id,person_id,related_person_id,kind,$2,contract_id,",
  "CASE WHEN kind='ROLE_USAGE' THEN role_expectation ELSE NULL END,",
  "CASE WHEN kind IN ('ROLE_USAGE','GIMMICK_PITCH')",
  "THEN observed_match_shows ELSE NULL END,",
  "CASE WHEN kind='ROLE_USAGE' THEN observed_featured_shows ELSE NULL END,",
  "CASE WHEN kind='GIMMICK_PITCH' THEN average_response ELSE NULL END,",
  "CASE WHEN kind='PARTNERSHIP' THEN working_verified_shows ELSE NULL END,",
  "CASE WHEN kind='PARTNERSHIP' THEN working_trust_delta ELSE NULL END,",
  "CASE WHEN kind='BOOKING_OMISSION' THEN promotion_shows ELSE NULL END,",
  "CASE WHEN kind='LOSS_STREAK' THEN recent_losses ELSE NULL END,",
  "CASE WHEN kind='TITLE_AMBITION' THEN relevant_title ELSE NULL END",
  "FROM ranked WHERE rank=1",
  "ON CONFLICT DO NOTHING RETURNING request_id"
 ].join(" "),[worldId,weekIndex]);
 if(rows.length>128)throw new Error("Backstage inbox generation exceeds promotion bound");
 return {newMessages:rows.length};
}

/** Private read receipt. Idempotent display state; no World revision or game power. */
export async function markBackstageThreadRead(pool:TransactionPool,s:{
 worldId:string;promotionId:string;playerId:string;personId:string;
}){
 if(![s.worldId,s.promotionId,s.playerId,s.personId]
  .every(x=>typeof x==="string"&&!!x&&x.length<=200))
  throw new Error("Invalid Backstage read scope");
 return withSqlClient(pool,async tx=>{
  const marked=await tx.query<{request_id:string}>([
   "UPDATE ppw_backstage_requests r SET read_week_index=(w.year-1)*52+w.week-1",
   "FROM ppw_worlds w JOIN ppw_promotion_controls c",
   "ON c.world_id=w.world_id AND c.promotion_id=$2 AND c.player_id=$3",
   "AND c.active JOIN ppw_memberships m ON m.world_id=c.world_id",
   "AND m.player_id=c.player_id AND m.status='ACTIVE'",
   "JOIN ppw_promotions promo ON promo.world_id=c.world_id",
   "AND promo.promotion_id=c.promotion_id AND promo.lifecycle='ACTIVE'",
   "WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.person_id=$4",
   "AND w.world_id=r.world_id AND r.read_week_index IS NULL",
   "AND r.created_week_index>=greatest(0,(w.year-1)*52+w.week-105)",
   "AND EXISTS(SELECT 1 FROM ppw_contracts deal",
   "WHERE deal.world_id=r.world_id AND deal.promotion_id=r.promotion_id",
   "AND deal.person_id=r.person_id AND deal.status='SIGNED'",
   "AND deal.start_week_index<=(w.year-1)*52+w.week-1",
   "AND deal.expires_week_index>=(w.year-1)*52+w.week-1)",
   "RETURNING r.request_id"
  ].join(" "),[s.worldId,s.promotionId,s.playerId,s.personId]);
  return {readCount:marked.length};
 });
}
