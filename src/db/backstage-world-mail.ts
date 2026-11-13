/** Private PPW communications from certified World events and employed staff.
 * Only real World evidence may appear; no random text per page view, Groq call, or
 * materialised weekly message row. One bounded SQL read for the full inbox.
 */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {worldStaff} from "../domain/world-staff.js";
import {STAFF_DISAGREEMENT_LATERAL_SQL} from "./backstage-staff-disagreements.js";
import {PARTNER_MEDIATION_CANDIDATES_SQL} from "./backstage-partner-replies.js";
import {COMMERCIAL_COMPANIES} from "../domain/commercial-offers.js";
export type WorldMailKind="NETWORK"|"STAFF"|"SCOUT"|"FREE_AGENT"|"LOCKER_ROOM";
export type WorldMailAction="COMMERCIALS"|"CONTRACTS"|"PROGRAMMES"|"STAFF"|"MARKET";
export interface WorldMail{
 id:string;kind:WorldMailKind;sender:string;subject:string;body:string;
 action:WorldMailAction;createdWeekIndex:number;read:boolean;
 canRespond?:boolean;contentConcern?:boolean;
 canStaffRespond?:boolean;staffResponse?:{decision:"COMMIT"|"DEFER";
  status:"PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";dueWeekIndex:number};
 networkResponse?:{decision:"COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM";
  status:"PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";dueWeekIndex:number};
 canDisagree?:boolean;
 disagreementResponse?:{decision:"PRIORITISE_HEALTH"|"REFRESH_PROGRAMME"|"DEFER";
  status:"PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";dueWeekIndex:number};
 canPartnerRespond?:boolean;
 partnerResponse?:{decision:"INVITE"|"LEAVE";outcome:"READY"|"CAUTIOUS"|"DECLINED"};
 canFreeAgentRespond?:boolean;
 freeAgentResponse?:{decision:"INVITE"|"PASS";status:"INVITED"|"DECLINED"|"PENDING"|"ACCEPTED"|"REJECTED"|"WITHDRAWN"};
 /** Verified market contact; the dossier and actual offer rules remain authoritative. */
 targetPersonId?:string;
}
interface MailRow extends Record<string,unknown>{
 id:string;kind:WorldMailKind;sender_key:string;subject:string;
 body:string;action:WorldMailAction;created_week_index:number;
 read:boolean;seed:string;target_person_id:string|null;sender_name:string|null;
 can_reply:boolean;content_concern:boolean;can_staff_reply:boolean;
 staff_reply_decision:string|null;staff_reply_status:string|null;
 staff_reply_due_week_index:number|null;
 reply_decision:string|null;reply_status:string|null;reply_due_week_index:number|null;
 free_agent_decision:string|null;free_agent_offer_status:string|null;
 can_free_agent_reply:boolean;can_partner_reply:boolean;
 partner_reply_decision:string|null;partner_reply_outcome:string|null;
 can_disagree:boolean;disagreement_decision:string|null;
 disagreement_status:string|null;disagreement_due_week_index:number|null;
}
/** Shared source selection is also used for validating read receipts.
 * Each CTE is limited to the owner's promotion and a rolling evidence window.
 * Counts come from signed contracts, real roster fatigue and real programmes.
 * Scout leads are a genuine uncontracted person, not an invented inbound offer.
 */
export const WORLD_MAIL_SQL=String.raw`
WITH owner AS MATERIALIZED (
 SELECT w.seed::text AS seed,(w.year-1)*52+w.week-1 AS now
 FROM ppw_worlds w
 JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.promotion_id=$2 AND c.player_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=c.world_id
  AND m.player_id=c.player_id AND m.status='ACTIVE'
 JOIN ppw_promotions p ON p.world_id=c.world_id
  AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
 WHERE w.world_id=$1
), network AS (
 SELECT 'NETWORK'::text AS kind,'network:'||n.story_key AS evidence,
  split_part(n.story_key,':',3) AS sender_key,
  n.title AS subject,n.summary AS body,'COMMERCIALS'::text AS action,
  (n.year-1)*52+n.week-1 AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM ppw_world_news_items n JOIN owner o ON true
 WHERE n.world_id=$1 AND n.promotion_id=$2
  AND n.desk='OFFICIAL' AND n.certainty='CONFIRMED'
  AND n.source_kind='EVENT'
  AND n.story_key LIKE 'broadcast:network:%'
  AND (n.year-1)*52+n.week-1 BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY n.year DESC,n.week DESC,n.story_key DESC LIMIT 8
), content_notice AS (
 /* A broadcaster may object to an actually certified hardcore match on
  * its contracted TV programme. A submitted draft alone is not evidence;
  * neither an unplayed match nor a premium PPV can trigger this message. */
 SELECT 'NETWORK'::text AS kind,
  'network-content:'||d.deal_id||':'||done.show_id AS evidence,
  d.offer_code AS sender_key,
  'About the hardcore match on '||coalesce(draft.show_name,'weekly television') AS subject,
  'Your completed programme '||coalesce(draft.show_name,'weekly television')||
   ' included a hardcore-rules match. That is outside the tone we expect '||
   'from our regular television slot. Can we keep hardcore stipulations '||
   'off the next broadcasts?' AS body,
  'COMMERCIALS'::text AS action,
  (done.year-1)*52+done.week-1 AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM owner o
 JOIN ppw_commercial_deals d ON d.world_id=$1 AND d.promotion_id=$2
  AND d.kind='BROADCAST' AND d.status='ACTIVE'
  AND d.start_week_index<=o.now AND d.end_week_index>=o.now
  AND d.offer_code IN ('BROADCAST_STABLE','BROADCAST_TV',
   'BROADCAST_ARCHIVE','BROADCAST_GLOBAL')
 JOIN ppw_completed_shows done ON done.world_id=d.world_id
  AND done.promotion_id=d.promotion_id
 JOIN ppw_booking_drafts draft ON draft.world_id=done.world_id
  AND draft.draft_id=done.show_id AND draft.promotion_id=done.promotion_id
  AND draft.status='SUBMITTED' AND draft.booking_class='REGULAR'
 JOIN ppw_show_economics economics ON economics.world_id=done.world_id
  AND economics.show_id=done.show_id
  AND economics.promotion_id=done.promotion_id AND economics.audience_format='TV'
 WHERE (done.year-1)*52+done.week-1
  BETWEEN greatest(d.start_week_index,o.now-12) AND least(d.end_week_index,o.now)
  AND EXISTS(
   SELECT 1 FROM ppw_completed_show_matches finished
   JOIN ppw_card_slots slot ON slot.world_id=finished.world_id
    AND slot.draft_id=finished.show_id AND slot.slot_id=finished.match_id
    AND slot.kind='MATCH' AND slot.payload->>'stipulation'='HARDCORE'
   WHERE finished.world_id=done.world_id AND finished.show_id=done.show_id)
 ORDER BY done.year DESC,done.week DESC,done.show_id DESC LIMIT 2
), network_followup AS (
 /* A new inbound response to an actual manager promise. No per-message
  * row or model request: verified settlement plus existing signed deal.
  * Keep source history even if the broadcast agreement has since expired. */
 SELECT 'NETWORK'::text AS kind,
  'network-followup:'||r.mail_id||':'||r.status AS evidence,
  d.offer_code AS sender_key,
  CASE WHEN r.decision='COMMIT_STANDARDS' AND r.status='KEPT'
    THEN 'Our broadcast standards are back on track'
   WHEN r.decision='COMMIT_STANDARDS' AND r.status='BROKEN'
    THEN 'Our content standards review has ended'
   WHEN r.status='KEPT' THEN 'Your television turnaround delivered'
   WHEN r.status='BROKEN' THEN 'The review window has ended'
   ELSE 'Our previous agreement has ended' END AS subject,
  CASE WHEN r.decision='COMMIT_STANDARDS' AND r.status='KEPT'
    THEN 'Your next completed television programme kept hardcore stipulations off our broadcast. We appreciate you respecting the signed tone.'
   WHEN r.decision='COMMIT_STANDARDS' AND r.status='BROKEN'
    THEN 'The three-week review ended without a certified television programme meeting the agreed content standard. We still expect a more restrained weekly broadcast.'
   WHEN r.status='KEPT'
    THEN 'Your latest certified television met our audience target after your commitment. That is the response we wanted to see.'
   WHEN r.status='BROKEN'
    THEN 'The three-week review period ended without a certified on-target television broadcast. We still expect better delivery under the agreement.'
   ELSE
    'The signed network agreement ended before your commitment could be assessed. No further promise is owed under those terms.'
  END AS body,
  'COMMERCIALS'::text AS action,
  r.settled_week_index AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM ppw_backstage_network_replies r
 JOIN ppw_commercial_deals d ON d.world_id=r.world_id AND d.deal_id=r.deal_id
 JOIN owner o ON true
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.player_id=$3
  AND r.status IN ('KEPT','BROKEN','EXCUSED')
  AND r.settled_week_index BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY r.settled_week_index DESC,r.mail_id DESC LIMIT 2
), pressure AS (
 SELECT o.now,o.seed,
  (SELECT count(*)::integer FROM ppw_contracts c
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
     AND c.start_week_index<=o.now
     AND c.expires_week_index BETWEEN o.now AND o.now+4) AS due,
  (SELECT count(DISTINCT c.person_id)::integer
    FROM ppw_contracts c JOIN ppw_people p
     ON p.world_id=c.world_id AND p.person_id=c.person_id
    WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
     AND c.start_week_index<=o.now AND c.expires_week_index>=o.now
     AND p.status IN ('ACTIVE','INJURED') AND p.fatigue>=70) AS tired,
  (SELECT count(*)::integer FROM ppw_programmes p
    WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.status='ACTIVE'
     AND p.repetition>=3) AS stale
 FROM owner o
), staff AS (
 SELECT 'STAFF'::text AS kind,
  'staff:'||e.employment_id||':'||e.role||':'||floor(p.now/4)::integer AS evidence,
  e.staff_id AS sender_key,
  CASE e.role
   WHEN 'TALENT_MANAGER' THEN 'Contract renewals need a look'
   WHEN 'MEDICAL' THEN 'The roster needs a breather'
   ELSE 'Our rivalries are running in circles'
  END AS subject,
  CASE e.role
   WHEN 'TALENT_MANAGER' THEN p.due||' signed contract(s) expire in the next four weeks. With your permission I can prepare unchanged renewal offers at World Lock. The wrestlers still decide whether to agree.'
   WHEN 'MEDICAL' THEN p.tired||' contracted wrestler(s) have fatigue at 70 or above. I''d check the upcoming workload before they work another long match.'
   ELSE p.stale||' active programme(s) have repeated without moving the story forward. Let''s book a proper next chapter.'
  END AS body,
  CASE e.role WHEN 'TALENT_MANAGER' THEN 'CONTRACTS'
   WHEN 'MEDICAL' THEN 'STAFF' ELSE 'PROGRAMMES' END AS action,
  greatest(e.start_week_index,(p.now/4)*4) AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM ppw_staff_employments e JOIN pressure p ON true
 WHERE e.world_id=$1 AND e.promotion_id=$2 AND e.status='ACTIVE'
  AND ((e.role='TALENT_MANAGER' AND p.due>0)
   OR (e.role='MEDICAL' AND p.tired>0)
   OR (e.role='CREATIVE' AND p.stale>0))
 ORDER BY e.role,e.employment_id LIMIT 8
), staff_followup AS (
 /* A new inbound staff check-in after a genuine manager commitment.
  * The original staff alert can disappear after the issue is solved,
  * but this follow-up stays visible for the bounded 13-week inbox window. */
 SELECT 'STAFF'::text AS kind,
  'staff-followup:'||r.mail_id||':'||r.status AS evidence,
  r.staff_id AS sender_key,
  CASE WHEN r.role='TALENT_MANAGER' AND r.status='KEPT'
     THEN 'Renewal offers have been prepared'
   WHEN r.role='TALENT_MANAGER' AND r.status='BROKEN'
     THEN 'No renewal proposals were prepared'
   WHEN r.role='MEDICAL' AND r.status='KEPT'
     THEN 'The workload changes helped'
   WHEN r.role='MEDICAL' AND r.status='BROKEN'
     THEN 'Fatigue is still a concern'
   WHEN r.role='CREATIVE' AND r.status='KEPT'
     THEN 'The storylines have moved forward'
   WHEN r.role='CREATIVE' AND r.status='BROKEN'
     THEN 'We still need a creative change'
   ELSE 'Staffing circumstances have changed' END AS subject,
  CASE WHEN r.status='EXCUSED'
    THEN 'My appointment ended before the commitment could be assessed. No unmet promise has been recorded.'
   WHEN r.role='TALENT_MANAGER' AND r.status='KEPT'
    THEN 'We prepared at least one genuine unchanged-terms renewal proposal under your delegation. The wrestler decides whether to accept; check Contracts for the actual answer.'
   WHEN r.role='TALENT_MANAGER'
    THEN 'The three-week review ended without an eligible renewal proposal being prepared. Check your staff permissions and expiring contracts.'
   WHEN r.role='MEDICAL' AND r.status='KEPT'
    THEN 'The current contracted roster has nobody at the high-fatigue warning threshold. That is a better workload to manage.'
   WHEN r.role='MEDICAL'
    THEN 'The review period ended and some of the current contracted roster are still over the high-fatigue threshold. We should rethink their bookings.'
   WHEN r.status='KEPT'
    THEN 'The repetitive active programmes have been refreshed or concluded. Creative has something new to work with.'
   ELSE
    'The review period is up and some active rivalries are still repeating without progress. We need a new creative direction.'
  END AS body,
  CASE WHEN r.role='TALENT_MANAGER' THEN 'CONTRACTS'::text
   WHEN r.role='MEDICAL' THEN 'STAFF'::text
   ELSE 'PROGRAMMES'::text END AS action,
  r.settled_week_index AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM ppw_backstage_staff_replies r
 JOIN owner o ON true
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.player_id=$3
  AND r.status IN ('KEPT','BROKEN','EXCUSED')
  AND r.settled_week_index BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY r.settled_week_index DESC,r.mail_id DESC LIMIT 2
), staff_disagreement AS (
 SELECT 'STAFF'::text AS kind,
  'staff-dispute:'||issue.medical_id||':'||issue.creative_id||':'||
   issue.programme_id||':'||issue.person_id||':'||floor(o.now/4)::integer AS evidence,
  issue.medical_staff_id AS sender_key,
  'Medical and Creative see '||issue.name||' differently' AS subject,
  issue.name||' has fatigue at '||round(issue.fatigue)::integer||
   ' while their active programme has repeated '||issue.repetition||
   ' times. Medical wants a lighter workload. Creative needs the programme '||
   'to move forward. Which should we prioritise?' AS body,
  'STAFF'::text AS action,
  greatest(0,(o.now/4)*4)::integer AS created_week_index,
  issue.person_id AS target_person_id,NULL::text AS sender_name
 FROM owner o JOIN LATERAL (${STAFF_DISAGREEMENT_LATERAL_SQL}) issue ON true
), staff_disagreement_answered AS (
 /* A commitment must remain readable even when the qualifying condition
  * disappears. Reconstruct the original deterministic message identity
  * from its certified reply, never materialise another inbox message row. */
 SELECT 'STAFF'::text AS kind,
  'staff-dispute:'||r.medical_employment_id||':'||
   r.creative_employment_id||':'||r.programme_id||':'||r.person_id||':'||
   floor(r.responded_week_index/4)::integer AS evidence,
  medical.staff_id AS sender_key,
  'Medical and Creative see '||person.name||' differently' AS subject,
  'You answered our disagreement about '||person.name||
   '. The real roster workload and programme progress determine the outcome.' AS body,
  'STAFF'::text AS action,
  greatest(0,(r.responded_week_index/4)*4)::integer AS created_week_index,
  r.person_id AS target_person_id,NULL::text AS sender_name
 FROM ppw_backstage_staff_disagreements r JOIN owner o ON true
 JOIN ppw_staff_employments medical ON medical.world_id=r.world_id
  AND medical.employment_id=r.medical_employment_id
 JOIN ppw_people person ON person.world_id=r.world_id
  AND person.person_id=r.person_id
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.player_id=$3
  AND r.status IN ('PENDING','ACKNOWLEDGED')
  AND r.responded_week_index BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY r.responded_week_index DESC,r.mail_id DESC LIMIT 2
), staff_dispute_followup AS (
 SELECT 'STAFF'::text AS kind,
  'staff-dispute-followup:'||r.mail_id||':'||r.status AS evidence,
  CASE WHEN r.decision='PRIORITISE_HEALTH' THEN medical.staff_id
   ELSE creative.staff_id END AS sender_key,
  CASE WHEN r.status='EXCUSED' THEN 'Our staff review closed'
   WHEN r.decision='PRIORITISE_HEALTH' AND r.status='KEPT'
    THEN 'The workload concern has eased'
   WHEN r.decision='REFRESH_PROGRAMME' AND r.status='KEPT'
    THEN 'Creative found a new direction'
   ELSE 'The staff disagreement remains unresolved' END AS subject,
  CASE WHEN r.status='EXCUSED'
    THEN 'The staff appointments or the wrestler contract ended before this could be assessed.'
   WHEN r.decision='PRIORITISE_HEALTH' AND r.status='KEPT'
    THEN 'The wrestler''s actual fatigue dropped below our medical warning level. The commitment was met.'
   WHEN r.decision='REFRESH_PROGRAMME' AND r.status='KEPT'
    THEN 'The active programme was actually refreshed or concluded. The creative commitment was met.'
   WHEN r.decision='PRIORITISE_HEALTH'
    THEN 'The three-week review ended with the wrestler still at high fatigue.'
   ELSE 'The three-week review ended without a genuine programme refresh or conclusion.' END AS body,
  CASE WHEN r.decision='PRIORITISE_HEALTH' THEN 'STAFF'::text
   ELSE 'PROGRAMMES'::text END AS action,
  r.settled_week_index AS created_week_index,
  r.person_id AS target_person_id,NULL::text AS sender_name
 FROM ppw_backstage_staff_disagreements r JOIN owner o ON true
 JOIN ppw_staff_employments medical ON medical.world_id=r.world_id
  AND medical.employment_id=r.medical_employment_id
 JOIN ppw_staff_employments creative ON creative.world_id=r.world_id
  AND creative.employment_id=r.creative_employment_id
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.player_id=$3
  AND r.status IN ('KEPT','BROKEN','EXCUSED')
  AND r.settled_week_index BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY r.settled_week_index DESC,r.mail_id DESC LIMIT 2
), scouting AS (
 SELECT 'SCOUT'::text AS kind,
  'scout:'||e.employment_id||':'||talent.person_id||':'||
    floor(o.now/8)::integer AS evidence,
  e.staff_id AS sender_key,'A potential free agent is worth a look' AS subject,
  talent.name||' is currently available in the World talent market. I rate them as a prospect worth examining, but a contract is not agreed.' AS body,
  'MARKET'::text AS action,
  greatest(e.start_week_index,(o.now/8)*8) AS created_week_index,
  talent.person_id AS target_person_id,NULL::text AS sender_name
 FROM ppw_staff_employments e JOIN owner o ON true
 JOIN LATERAL (
  SELECT p.person_id,p.name FROM ppw_people p
  WHERE p.world_id=$1 AND p.status='ACTIVE'
   AND NOT EXISTS(
    SELECT 1 FROM ppw_contracts c
    WHERE c.world_id=p.world_id AND c.person_id=p.person_id
     AND c.status='SIGNED' AND c.start_week_index<=o.now
     AND c.expires_week_index>=o.now)
  ORDER BY p.popularity DESC,p.person_id LIMIT 1
 ) talent ON true
 WHERE e.world_id=$1 AND e.promotion_id=$2 AND e.status='ACTIVE'
  AND e.role='SCOUT'
 ORDER BY e.employment_id LIMIT 1
), outreach AS (
 /* A real completed and published show is the stimulus for a free agent to
  * contact the office. One live, uncontracted and non-marquee talent per
  * eight-week window. The same person and ID persist until the World changes;
  * no fictional signed offer, per-render RNG or paid model call. */
 SELECT 'FREE_AGENT'::text AS kind,
  'free-agent:'||available.person_id||':'||
   floor(o.now/8)::integer AS evidence,
  available.person_id AS sender_key,
  'Could we talk about a booking?'::text AS subject,
  'I caught one of your completed shows. I''m between contracts and wondered if there might be a spot for me. No promises - I''d like to talk terms.'::text AS body,
  'MARKET'::text AS action,
  published.first_week AS created_week_index,
  available.person_id AS target_person_id,available.name AS sender_name
 FROM owner o
 JOIN LATERAL (
  SELECT min((completed.year-1)*52+completed.week-1)::integer AS first_week
  FROM ppw_completed_shows completed JOIN ppw_world_news_weeks news
   ON news.world_id=completed.world_id AND news.year=completed.year
   AND news.week=completed.week
  WHERE completed.world_id=$1 AND completed.promotion_id=$2
   AND (completed.year-1)*52+completed.week-1
    BETWEEN (floor(o.now/8)*8)::integer AND o.now
 ) published ON published.first_week IS NOT NULL
 JOIN LATERAL (
  SELECT p.person_id,p.name FROM ppw_people p
  WHERE p.world_id=$1 AND p.status='ACTIVE'
   AND p.popularity BETWEEN 25 AND 70
   AND NOT EXISTS (
    SELECT 1 FROM ppw_contracts c
    WHERE c.world_id=p.world_id AND c.person_id=p.person_id
     AND c.status='SIGNED' AND c.start_week_index<=o.now
     AND c.expires_week_index>=o.now)
  ORDER BY p.popularity DESC,p.person_id LIMIT 1
 ) available ON true
), partner_mediation AS (
 /* The actual contracted teammate responds only after the manager answered
  * verified PARTNERSHIP strain by explicitly agreeing to MEDIATE. */
 SELECT 'LOCKER_ROOM'::text AS kind,
  'partner-mediation:'||p.request_id AS evidence,
  p.partner_id AS sender_key,
  'About working with '||p.initiating_name AS subject,
  'I heard '||p.initiating_name||
   ' asked you to help us work together. Our recent tag work damaged trust.'||
   ' If you want to give us another chance, let me know. It will have to happen in the ring.' AS body,
  'PROGRAMMES'::text AS action,
  p.responded_week_index AS created_week_index,
  p.partner_id AS target_person_id,p.partner_name AS sender_name
 FROM owner o JOIN LATERAL (${PARTNER_MEDIATION_CANDIDATES_SQL}) p ON true
), partner_mediation_followup AS (
 /* Certified good teamwork in a later match is the only reconciliation
  * evidence; the established working-relationship settlement stays authoritative. */
 SELECT 'LOCKER_ROOM'::text AS kind,
  'partner-mediation-result:'||r.request_id||':'||
    r.follow_through_week_index AS evidence,
  r.related_person_id AS sender_key,
  'Our tag work finally came together' AS subject,
  'That last completed tag match with '||initiator.name||
   ' was the kind of work we needed. We are starting to understand each other out there.' AS body,
  'PROGRAMMES'::text AS action,
  r.follow_through_week_index AS created_week_index,
  r.related_person_id AS target_person_id,partner.name AS sender_name
 FROM ppw_backstage_requests r JOIN owner o ON true
 JOIN ppw_people partner ON partner.world_id=r.world_id
  AND partner.person_id=r.related_person_id
 JOIN ppw_people initiator ON initiator.world_id=r.world_id
  AND initiator.person_id=r.person_id
 WHERE r.world_id=$1 AND r.promotion_id=$2
  AND r.kind='PARTNERSHIP' AND r.decision='MEDIATE'
  AND r.follow_through_kind='MEDIATION_MATCH_COMPLETED'
  AND r.follow_through_week_index BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY r.follow_through_week_index DESC,r.request_id DESC LIMIT 2
), recruitment_result AS (
 /* The conversation only earns a result when the canonical wrestler offer
  * actually resolves. An invitation cannot fabricate a contract. */
 SELECT 'FREE_AGENT'::text AS kind,
  'free-agent-result:'||r.mail_id||':'||bid.offer_id||':'||bid.status AS evidence,
  person.person_id AS sender_key,
  CASE bid.status WHEN 'ACCEPTED' THEN 'I accepted your offer'
   ELSE 'About your contract offer' END AS subject,
  CASE bid.status WHEN 'ACCEPTED'
   THEN 'I have accepted the terms your promotion submitted. The signed contract and dates are in the Contract Desk.'
   ELSE 'I have decided against the contract terms you offered. You can review the decision in your Contract Desk.'
  END AS body,
  'CONTRACTS'::text AS action,
  greatest(r.responded_week_index+1,bid.submitted_week_index+1)
   AS created_week_index,
  person.person_id AS target_person_id,person.name AS sender_name
 FROM ppw_backstage_free_agent_replies r
 JOIN owner o ON true
 JOIN ppw_people person ON person.world_id=r.world_id
  AND person.person_id=r.person_id
 JOIN LATERAL (
  SELECT offer_id,status,submitted_week_index FROM ppw_contract_offers bid
  WHERE bid.world_id=r.world_id AND bid.promotion_id=r.promotion_id
   AND bid.person_id=r.person_id
   AND bid.source_contract_id IS NULL
   AND bid.submitted_week_index>=r.responded_week_index
   AND bid.status IN ('ACCEPTED','REJECTED')
  ORDER BY bid.submitted_week_index DESC,bid.offer_id DESC LIMIT 1
 ) bid ON true
 WHERE r.world_id=$1 AND r.promotion_id=$2 AND r.player_id=$3
  AND r.decision='INVITE'
  AND greatest(r.responded_week_index+1,bid.submitted_week_index+1)
   BETWEEN greatest(0,o.now-12) AND o.now
 ORDER BY bid.submitted_week_index DESC,bid.offer_id DESC LIMIT 2
), message AS (
 SELECT * FROM network UNION ALL SELECT * FROM content_notice
 UNION ALL SELECT * FROM network_followup UNION ALL SELECT * FROM staff
 UNION ALL SELECT * FROM staff_followup
 UNION ALL SELECT * FROM staff_disagreement UNION ALL SELECT * FROM staff_disagreement_answered
 UNION ALL SELECT * FROM staff_dispute_followup
 UNION ALL SELECT * FROM scouting UNION ALL SELECT * FROM outreach
 UNION ALL SELECT * FROM partner_mediation UNION ALL SELECT * FROM partner_mediation_followup
 UNION ALL SELECT * FROM recruitment_result
), candidate AS (
 SELECT 'backstage-world:'||md5(message.evidence) AS id,
  message.evidence,message.kind,message.sender_key,message.subject,message.body,
  message.action,message.created_week_index,o.seed,
  message.target_person_id,message.sender_name
 FROM message JOIN owner o ON true
)
SELECT c.id,c.kind,c.sender_key,c.subject,c.body,c.action,
 c.created_week_index,c.seed,c.target_person_id,c.sender_name,
 (receipt.attention_id IS NOT NULL) AS read,
 reply.decision AS reply_decision,reply.status AS reply_status,
 reply.due_week_index AS reply_due_week_index,
 staff_reply.decision AS staff_reply_decision,
 staff_reply.status AS staff_reply_status,
 staff_reply.due_week_index AS staff_reply_due_week_index,
 partner_reply.decision AS partner_reply_decision,
 partner_reply.outcome AS partner_reply_outcome,
 (c.kind='LOCKER_ROOM' AND c.evidence LIKE 'partner-mediation:%'
  AND partner_reply.mail_id IS NULL
  AND EXISTS(SELECT 1 FROM ppw_backstage_requests request
   WHERE request.world_id=$1 AND request.promotion_id=$2
    AND 'partner-mediation:'||request.request_id=c.evidence
    AND request.follow_through_week_index IS NULL)) AS can_partner_reply,
 agent_reply.decision AS free_agent_decision,
 agent_offer.status AS free_agent_offer_status,
 (c.evidence LIKE 'staff-dispute:%' AND debate.mail_id IS NULL) AS can_disagree,
 debate.decision AS disagreement_decision,
 debate.status AS disagreement_status,
 debate.due_week_index AS disagreement_due_week_index,
 (c.kind='FREE_AGENT' AND c.evidence LIKE 'free-agent:%'
  AND agent_reply.mail_id IS NULL) AS can_free_agent_reply,
 (c.kind='STAFF' AND c.action IN ('STAFF','PROGRAMMES','CONTRACTS')
  AND c.evidence LIKE 'staff:%'
  AND staff_reply.mail_id IS NULL
  AND NOT EXISTS (
   SELECT 1 FROM ppw_backstage_staff_replies pending
   WHERE pending.world_id=$1 AND pending.promotion_id=$2
    AND pending.status='PENDING' AND pending.staff_id=c.sender_key)
  AND (c.action<>'CONTRACTS' OR EXISTS (
   SELECT 1 FROM ppw_staff_employments employee
   JOIN owner owner_now ON true
   WHERE employee.world_id=$1 AND employee.promotion_id=$2
    AND employee.status='ACTIVE' AND employee.role='TALENT_MANAGER'
    AND employee.staff_id=c.sender_key
    AND NOT EXISTS(SELECT 1 FROM ppw_staff_continuity_settings consent
      WHERE consent.world_id=$1 AND consent.promotion_id=$2
       AND consent.owner_player_id=$3 AND consent.auto_renew_same_terms=true)
    AND EXISTS(SELECT 1 FROM ppw_contracts contract
      WHERE contract.world_id=$1 AND contract.promotion_id=$2
       AND contract.status='SIGNED' AND contract.family<>'ONE_OFF'
       AND contract.start_week_index<=owner_now.now
       AND contract.expires_week_index BETWEEN owner_now.now AND owner_now.now+4)
  ))) AS can_staff_reply,
 (c.evidence LIKE 'network-content:%') AS content_concern,
 (c.kind='NETWORK' AND reply.mail_id IS NULL AND
 (c.evidence LIKE 'network-content:%' OR EXISTS(
  SELECT 1 FROM ppw_world_news_items n
  JOIN owner o ON true
  JOIN ppw_commercial_deals d ON d.world_id=n.world_id
   AND d.promotion_id=n.promotion_id AND d.kind='BROADCAST'
   AND d.offer_code=split_part(n.story_key,':',3) AND d.status='ACTIVE'
   AND d.start_week_index<=o.now AND d.end_week_index>=o.now
  WHERE n.world_id=$1 AND n.promotion_id=$2
   AND n.desk='OFFICIAL' AND n.certainty='CONFIRMED'
   AND n.source_kind='EVENT'
   AND (n.story_key LIKE 'broadcast:network:%:warning:%'
    OR n.story_key LIKE 'broadcast:network:%:final-warning:%')
   AND c.id='backstage-world:'||md5('network:'||n.story_key)
 ))) AS can_reply
FROM candidate c
LEFT JOIN ppw_backstage_network_replies reply ON reply.world_id=$1
 AND reply.promotion_id=$2 AND reply.mail_id=c.id
LEFT JOIN ppw_backstage_staff_replies staff_reply ON staff_reply.world_id=$1
 AND staff_reply.promotion_id=$2 AND staff_reply.mail_id=c.id
LEFT JOIN ppw_backstage_partner_replies partner_reply
 ON partner_reply.world_id=$1 AND partner_reply.promotion_id=$2
 AND partner_reply.mail_id=c.id
LEFT JOIN ppw_backstage_staff_disagreements debate
 ON debate.world_id=$1 AND debate.promotion_id=$2 AND debate.mail_id=c.id
LEFT JOIN ppw_backstage_free_agent_replies agent_reply
 ON agent_reply.world_id=$1 AND agent_reply.promotion_id=$2 AND agent_reply.mail_id=c.id
LEFT JOIN LATERAL (
 SELECT bid.status FROM ppw_contract_offers bid
 WHERE agent_reply.decision='INVITE'
  AND bid.world_id=$1 AND bid.promotion_id=$2
  AND bid.person_id=agent_reply.person_id
  AND bid.source_contract_id IS NULL
  AND bid.submitted_week_index>=agent_reply.responded_week_index
 ORDER BY bid.submitted_week_index DESC,bid.offer_id DESC LIMIT 1
) agent_offer ON true
LEFT JOIN ppw_player_attention_dismissals receipt ON receipt.world_id=$1
 AND receipt.promotion_id=$2 AND receipt.player_id=$3
 AND receipt.attention_id=c.id
ORDER BY c.created_week_index DESC,c.id DESC LIMIT 20
`;
function decode(rows:readonly MailRow[]):WorldMail[]{
 if(rows.length>20)throw new Error("Backstage World inbox source exceeded bound");
 const catalogue=new Map<string,string>();
 if(rows.length){
  for(const member of worldStaff(rows[0]!.seed))catalogue.set(member.staffId,member.name);
 }
 return rows.map(r=>{
  if(!/^backstage-world:[a-f0-9]{32}$/.test(r.id)||
   !["NETWORK","STAFF","SCOUT","FREE_AGENT","LOCKER_ROOM"].includes(r.kind)||
   !["COMMERCIALS","CONTRACTS","PROGRAMMES","STAFF","MARKET"].includes(r.action)||
   !Number.isSafeInteger(r.created_week_index)||r.created_week_index<0)
   throw new Error("Invalid certified Backstage World correspondence");
  if(r.partner_reply_decision!=null&&(
    r.kind!=="LOCKER_ROOM"||
    !["INVITE","LEAVE"].includes(r.partner_reply_decision)||
    !["READY","CAUTIOUS","DECLINED"].includes(r.partner_reply_outcome??"")||
    (r.partner_reply_decision==="LEAVE")!==(r.partner_reply_outcome==="DECLINED")))
    throw new Error("Invalid authentic partner decision");
  if(r.kind==="LOCKER_ROOM"&&(!r.target_person_id||!r.sender_name||
    r.sender_key!==r.target_person_id))
    throw new Error("Locker room correspondence requires an actual partner");
  if(r.free_agent_decision!=null&&(
    !["INVITE","PASS"].includes(r.free_agent_decision)||
    r.kind!=="FREE_AGENT"||
    (r.free_agent_offer_status!=null&&
     !["PENDING","ACCEPTED","REJECTED","WITHDRAWN"].includes(r.free_agent_offer_status))))
    throw new Error("Invalid free-agent reply receipt");
  if(r.disagreement_decision!=null&&(
    r.kind!=="STAFF"||
    !["PRIORITISE_HEALTH","REFRESH_PROGRAMME","DEFER"].includes(r.disagreement_decision)||
    !["PENDING","ACKNOWLEDGED","KEPT","BROKEN","EXCUSED"].includes(r.disagreement_status??"")||
    !Number.isSafeInteger(r.disagreement_due_week_index)))
    throw new Error("Invalid staff disagreement response");
  if(r.kind==="FREE_AGENT"&&(!r.target_person_id||!r.sender_name||
   r.sender_key!==r.target_person_id))
   throw new Error("Free-agent outreach requires a verifiable wrestler identity");
  const network=r.kind==="NETWORK"?COMMERCIAL_COMPANIES[r.sender_key]?.name:null;
  if(r.staff_reply_decision!=null&&(!["COMMIT","DEFER"].includes(r.staff_reply_decision)||
   !["PENDING","ACKNOWLEDGED","KEPT","BROKEN","EXCUSED"].includes(r.staff_reply_status??"")||
   !Number.isSafeInteger(r.staff_reply_due_week_index)||r.kind!=="STAFF"))
   throw new Error("Invalid staff reply receipt");
  if(r.reply_decision!=null&&(!["COMMIT_RECOVERY","COMMIT_STANDARDS","STAND_FIRM"].includes(r.reply_decision)||
   !["PENDING","ACKNOWLEDGED","KEPT","BROKEN","EXCUSED"].includes(r.reply_status??"")||
   !Number.isSafeInteger(r.reply_due_week_index)||r.kind!=="NETWORK"))
   throw new Error("Invalid broadcaster reply receipt");
  return {id:r.id,kind:r.kind,
   sender:r.kind==="FREE_AGENT"||r.kind==="LOCKER_ROOM"?r.sender_name!:
    network??catalogue.get(r.sender_key)??(r.kind==="NETWORK"?"Your broadcaster":"Staff Office"),
   subject:r.subject,body:r.body,action:r.action,
   createdWeekIndex:r.created_week_index,read:r.read===true,
   ...(r.kind==="NETWORK"&&r.can_reply===true?{canRespond:true}:{}),
   ...(r.kind==="LOCKER_ROOM"&&r.can_partner_reply===true?{canPartnerRespond:true}:{}),
   ...(r.partner_reply_decision!=null?{partnerResponse:{
    decision:r.partner_reply_decision as "INVITE"|"LEAVE",
    outcome:r.partner_reply_outcome as "READY"|"CAUTIOUS"|"DECLINED"}}:{}),
   ...(r.kind==="FREE_AGENT"&&r.can_free_agent_reply===true?{canFreeAgentRespond:true}:{}),
   ...(r.free_agent_decision!=null?{freeAgentResponse:{
    decision:r.free_agent_decision as "INVITE"|"PASS",
    status:r.free_agent_decision==="PASS"?"DECLINED":
     (r.free_agent_offer_status??"INVITED") as "INVITED"|"PENDING"|"ACCEPTED"|"REJECTED"|"WITHDRAWN"}}:{}),
   ...(r.kind==="STAFF"&&r.can_staff_reply===true?{canStaffRespond:true}:{}),
   ...(r.kind==="STAFF"&&r.can_disagree===true?{canDisagree:true}:{}),
   ...(r.disagreement_decision!=null?{disagreementResponse:{
    decision:r.disagreement_decision as "PRIORITISE_HEALTH"|"REFRESH_PROGRAMME"|"DEFER",
    status:r.disagreement_status as "PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED",
    dueWeekIndex:r.disagreement_due_week_index!}}:{}),
   ...(r.staff_reply_decision!=null?{staffResponse:{
    decision:r.staff_reply_decision as "COMMIT"|"DEFER",
    status:r.staff_reply_status as "PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED",
    dueWeekIndex:r.staff_reply_due_week_index!}}:{}),
   ...(r.content_concern===true?{contentConcern:true}:{}),
   ...(r.reply_decision!=null?{networkResponse:{
    decision:r.reply_decision as "COMMIT_RECOVERY"|"COMMIT_STANDARDS"|"STAND_FIRM",
    status:r.reply_status as "PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED",
    dueWeekIndex:r.reply_due_week_index!}}:{}),
   ...(r.target_person_id?{targetPersonId:r.target_person_id}:{})};
 });
}
export async function readWorldMail(tx:SqlRows,scope:{
 worldId:string;promotionId:string;playerId:string
}):Promise<WorldMail[]>{
 const {worldId,promotionId,playerId}=scope;
 if(![worldId,promotionId,playerId].every(x=>typeof x==="string"&&!!x&&x.length<=200))
  throw new Error("Invalid Backstage World inbox scope");
 return decode(await tx.query<MailRow>(WORLD_MAIL_SQL,[worldId,promotionId,playerId]));
}
/** Opening one actual inbox item writes one idempotent receipt. It cannot
 * mark rival mail as read, fabricate a source or consume World revision.
 */
export async function markWorldMailRead(pool:TransactionPool,scope:{
 worldId:string;promotionId:string;playerId:string;mailId:string
}){
 const {worldId,promotionId,playerId,mailId}=scope;
 if(!/^backstage-world:[a-f0-9]{32}$/.test(mailId)||
  ![worldId,promotionId,playerId].every(x=>typeof x==="string"&&!!x&&x.length<=200))
  throw new Error("Invalid Backstage mail receipt");
 return withSqlClient(pool,async tx=>{
  const messages=await readWorldMail(tx,{worldId,promotionId,playerId});
  const target=messages.find(m=>m.id===mailId);
  if(!target)throw new Error("That message is no longer available to this manager");
  if(target.read)return {readCount:0};
  const added=await tx.query<{attention_id:string}>(String.raw`
   INSERT INTO ppw_player_attention_dismissals
    (world_id,player_id,promotion_id,attention_id)
   VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING attention_id
  `,[worldId,playerId,promotionId,mailId]);
  return {readCount:added.length};
 });
}
