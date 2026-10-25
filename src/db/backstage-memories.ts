/** Verified wrestler/promoter recollections. A memory is an indexed projection
 * of a real request, settled promise, medical incident or championship contest.
 * Called once at World rollover, never on a Backstage read; idempotent under retries.
 * No private promotion fact is inserted into a shared person-wide profile.
 */
import type {SqlRows} from "./world-operations.js";
export async function publishBackstageMemories(
 tx:SqlRows,worldId:string,nextWeekIndex:number,
){
 if(!worldId||!Number.isSafeInteger(nextWeekIndex)||nextWeekIndex<0)
  throw new Error("Invalid Backstage memory week");
 // Historical threads are a verified source. A prior READY conversation is
 // projected at most once, keyed by exact request/outcome, not reauthored.
 const fromRequests=await tx.query<{memory_id:string}>([
  "WITH facts AS (",
  "SELECT r.promotion_id,r.person_id,r.request_id,r.responded_week_index,",
  "CASE WHEN r.status='FULFILLED' THEN 'PROMISE_KEPT'",
  "WHEN r.status='BROKEN' THEN 'PROMISE_BROKEN'",
  "WHEN r.status='EXCUSED' AND r.decision IS NOT NULL THEN 'PROMISE_EXCUSED'",
  "WHEN r.status='PROMISED' THEN 'PROMISE_MADE'",
  "WHEN r.status='DECLINED' THEN 'REQUEST_DECLINED'",
  "WHEN r.status='ANSWERED' THEN 'REQUEST_HEARD'",
  "ELSE NULL END AS memory_kind",
  "FROM ppw_backstage_requests r",
  "WHERE r.world_id=$1 AND r.responded_week_index",
  "BETWEEN greatest(0,$2-104) AND $2",
  "), written AS (INSERT INTO ppw_backstage_memories(",
  "world_id,promotion_id,person_id,memory_id,kind,",
  "occurred_week_index,importance,source_id)",
  "SELECT $1,f.promotion_id,f.person_id,",
  "'request:'||f.request_id||':'||f.memory_kind,f.memory_kind,",
  "f.responded_week_index,",
  "CASE f.memory_kind WHEN 'PROMISE_BROKEN' THEN 5",
  "WHEN 'PROMISE_KEPT' THEN 4 WHEN 'PROMISE_MADE' THEN 3",
  "WHEN 'REQUEST_DECLINED' THEN 2 ELSE 1 END,",
  "f.request_id FROM facts f",
  "WHERE f.memory_kind IS NOT NULL",
  "ON CONFLICT DO NOTHING RETURNING memory_id)",
  "SELECT memory_id FROM written LIMIT 513"
 ].join(" "),[worldId,nextWeekIndex]);
 if(fromRequests.length>512)throw new Error("Backstage memory projection overflow");
 const followed=await tx.query<{memory_id:string}>([
  "WITH facts AS (",
  "SELECT r.promotion_id,r.person_id,r.request_id,r.follow_through_week_index,",
  "CASE WHEN r.follow_through_kind='CONTRACT_NEGOTIATION_STARTED'",
  "THEN 'CONTRACT_FOLLOW_THROUGH' ELSE 'CREATIVE_FOLLOW_THROUGH' END AS kind",
  "FROM ppw_backstage_requests r WHERE r.world_id=$1",
  "AND r.follow_through_week_index BETWEEN greatest(0,$2-104) AND $2",
  "), written AS (INSERT INTO ppw_backstage_memories(",
  "world_id,promotion_id,person_id,memory_id,kind,",
  "occurred_week_index,importance,source_id)",
  "SELECT $1,promotion_id,person_id,'follow:'||request_id,kind,",
  "follow_through_week_index,3,request_id FROM facts",
  "ON CONFLICT DO NOTHING RETURNING memory_id)",
  "SELECT memory_id FROM written LIMIT 513"
 ].join(" "),[worldId,nextWeekIndex]);
 if(followed.length>512)throw new Error("Backstage follow-through memory overflow");
 // New actual injuries only: one Wrestler medical record and one settled
 // company show must agree. Do not infer support or blame from an injury alone.
 const injuries=await tx.query<{memory_id:string}>([
  "WITH written AS (INSERT INTO ppw_backstage_memories(",
  "world_id,promotion_id,person_id,memory_id,kind,",
  "occurred_week_index,importance,source_id)",
  "SELECT a.world_id,sh.promotion_id,a.person_id,",
  "'medical:'||a.show_id||':'||a.match_id||':'||a.person_id,",
  "'MEDICAL_ABSENCE',a.injured_week_index,4,a.show_id",
  "FROM ppw_medical_absences a JOIN ppw_completed_shows sh",
  "ON sh.world_id=a.world_id AND sh.show_id=a.show_id",
  "JOIN ppw_promotion_controls owner ON owner.world_id=sh.world_id",
  "AND owner.promotion_id=sh.promotion_id AND owner.active",
  "WHERE a.world_id=$1 AND a.injured_week_index=$2-1",
  "ON CONFLICT DO NOTHING RETURNING memory_id)",
  "SELECT memory_id FROM written LIMIT 513"
 ].join(" "),[worldId,nextWeekIndex]);
 if(injuries.length>512)throw new Error("Backstage medical memory overflow");
 // A real title match is evidence of a chance; this neither manufactures
 // contender status nor gives anyone an unearned championship.
 const titleMatches=await tx.query<{memory_id:string}>([
  "WITH facts AS (SELECT contest.world_id,contest.promotion_id,",
  "contest.show_id,contest.slot_id,contest.championship_id,sh.year,sh.week,",
  "entrant->>'personId' AS person_id,",
  "CASE WHEN contest.winner_person_id=entrant->>'personId'",
  "THEN 'TITLE_WON' ELSE 'TITLE_CHALLENGE' END AS kind",
  "FROM ppw_championship_contests contest",
  "JOIN ppw_completed_shows sh ON sh.world_id=contest.world_id",
  "AND sh.show_id=contest.show_id AND sh.promotion_id=contest.promotion_id",
  "JOIN ppw_card_slots s ON s.world_id=contest.world_id",
  "AND s.draft_id=contest.show_id AND s.slot_id=contest.slot_id",
  "CROSS JOIN LATERAL jsonb_array_elements(",
  "CASE WHEN jsonb_typeof(s.payload->'participants')='array'",
  "THEN s.payload->'participants' ELSE '[]'::jsonb END) entrant",
  "JOIN ppw_promotion_controls owner ON owner.world_id=contest.world_id",
  "AND owner.promotion_id=contest.promotion_id AND owner.active",
  "WHERE contest.world_id=$1 AND (sh.year-1)*52+sh.week-1=$2-1",
  "AND contest.winner_person_id IS NOT NULL",
  "AND jsonb_typeof(entrant)='object' AND entrant ? 'personId'",
  "), written AS (INSERT INTO ppw_backstage_memories(",
  "world_id,promotion_id,person_id,memory_id,kind,",
  "occurred_week_index,importance,source_id)",
  "SELECT world_id,promotion_id,person_id,",
  "'title:'||show_id||':'||slot_id||':'||person_id,kind,",
  "(year-1)*52+week-1,CASE WHEN kind='TITLE_WON' THEN 5 ELSE 4 END,",
  "championship_id FROM facts ON CONFLICT DO NOTHING RETURNING memory_id)",
  "SELECT memory_id FROM written LIMIT 513"
 ].join(" "),[worldId,nextWeekIndex]);
 if(titleMatches.length>512)throw new Error("Backstage title memory overflow");
 // Wrestler-authorised character changes and actual vetoes matter to their
 // private relationship with THIS promoter; a rejected pitch is not a change.
 const personas=await tx.query<{memory_id:string}>([
  "WITH written AS (INSERT INTO ppw_backstage_memories(",
  "world_id,promotion_id,person_id,memory_id,kind,",
  "occurred_week_index,importance,source_id)",
  "SELECT r.world_id,r.promotion_id,r.person_id,",
  "'persona:'||r.request_id,CASE WHEN r.status='ACCEPTED'",
  "THEN 'CHARACTER_APPROVED' ELSE 'CHARACTER_DECLINED' END,",
  "r.submitted_week_index,CASE WHEN r.status='ACCEPTED' THEN 4 ELSE 3 END,",
  "r.request_id FROM ppw_persona_change_requests r",
  "WHERE r.world_id=$1 AND r.submitted_week_index",
  "BETWEEN greatest(0,$2-104) AND $2",
  "ON CONFLICT DO NOTHING RETURNING memory_id)",
  "SELECT memory_id FROM written LIMIT 513"
 ].join(" "),[worldId,nextWeekIndex]);
 if(personas.length>512)throw new Error("Backstage character memory overflow");
 return {remembered:fromRequests.length+followed.length+injuries.length+titleMatches.length+personas.length};
}
