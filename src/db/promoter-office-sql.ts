import type {BookingPromiseDecision,UpcomingPromiseBooking} from "../domain/backstage-booking-commitment.js";
import {plannedPromiseBookingSql} from "./backstage-promise-sql.js";

export interface OfficeProgramme {
 programmeId:string;
 cast:string;
 titleName:string|null;
 heat:number|null;
 payoffWeekIndex?:number;
}

export interface OfficePromise {
 conversationId:string;
 personId:string;
 name:string;
 decision:BookingPromiseDecision;
 dueWeekIndex:number;
 title:{id:string;name:string;holderId:string|null;holderName:string|null}|null;
 planned:UpcomingPromiseBooking|null;
}

export interface OfficeMedicalHold {
 showId:string;
 showName:string;
 name:string;
 personId:string;
 position:number;
 clearedWeekIndex:number;
}

/** At most one item per category in the authenticated overview query.
 * Programme ranking uses the promotion’s active identity range. Cast lookups
 * run only for the three ranked candidates. Promise candidates
 * use the outstanding deadline index and a six-week booking horizon.
 * Medical checks touch only this promotion's current-week bookings.
 */
const now="((w.year-1)*52+w.week-1)";
export const promoterOfficeSql=`
 SELECT
  (SELECT jsonb_build_object('programmeId',p.programme_id,'cast',performers.names,
    'titleName',p.title_name,'heat',p.heat) ||
    CASE WHEN p.payoff_week IS NULL THEN '{}'::jsonb
     ELSE jsonb_build_object('payoffWeekIndex',p.payoff_week) END
   FROM (
    SELECT p.programme_id,p.heat,p.programme_key,title.name AS title_name,
     finale.planned_week_index AS payoff_week
    FROM ppw_programmes p
    LEFT JOIN ppw_championships title ON title.world_id=p.world_id
     AND title.promotion_id=p.promotion_id AND title.championship_id=p.championship_id
     AND title.status='ACTIVE'
    LEFT JOIN ppw_programme_finales finale ON finale.world_id=p.world_id
     AND finale.promotion_id=p.promotion_id AND finale.programme_id=p.programme_id
     AND finale.resolved_week_index IS NULL
     AND finale.planned_week_index BETWEEN ${now} AND ${now}+2
     AND EXISTS (
      SELECT 1 FROM ppw_programme_match_activities activity
      JOIN ppw_booking_drafts booked ON booked.world_id=activity.world_id
       AND booked.promotion_id=activity.promotion_id AND booked.draft_id=activity.draft_id
      WHERE activity.world_id=finale.world_id AND activity.promotion_id=finale.promotion_id
       AND activity.programme_id=finale.programme_id AND activity.draft_id=finale.show_id
       AND activity.slot_id=finale.slot_id AND activity.kind=finale.kind
       AND booked.status IN ('DRAFT','SUBMITTED')
       AND (booked.year-1)*52+booked.week-1=finale.planned_week_index
     )
    WHERE p.world_id=w.world_id AND p.promotion_id=owned.promotion_id
     AND p.status='ACTIVE' AND p.programme_key IS NOT NULL
    ORDER BY (title.name IS NULL),finale.planned_week_index NULLS LAST,
     p.heat DESC NULLS LAST,p.programme_key LIMIT 3
   ) p
   JOIN LATERAL (
    SELECT string_agg(coalesce(person.name,team.name),', ' ORDER BY side.side,side.position) AS names
    FROM ppw_programme_side_refs side
    LEFT JOIN ppw_people person ON person.world_id=side.world_id
     AND person.person_id=side.ref_id AND side.ref_kind='PERSON'
    LEFT JOIN ppw_tag_teams team ON team.world_id=side.world_id
     AND team.team_id=side.ref_id AND side.ref_kind='TEAM'
    WHERE side.world_id=w.world_id AND side.promotion_id=owned.promotion_id
     AND side.programme_id=p.programme_id
   ) performers ON performers.names IS NOT NULL
   ORDER BY (p.title_name IS NULL),p.payoff_week NULLS LAST,
    p.heat DESC NULLS LAST,p.programme_key LIMIT 1
  ) AS programme,
  (SELECT jsonb_build_object('conversationId',r.request_id,'personId',r.person_id,
    'name',person.name,'decision',r.decision,'dueWeekIndex',r.due_week_index,
    'title',CASE WHEN title.championship_id IS NOT NULL THEN jsonb_build_object(
     'id',title.championship_id,'name',title.name,
     'holderId',champion.person_id,'holderName',champion.name) END,
    'planned',CASE WHEN booking.year IS NOT NULL THEN jsonb_build_object(
     'showName',coalesce(booking.show_name,'Unnamed show'),'year',booking.year,'week',booking.week,
     'status',booking.status,'kind',booking.kind) END)
   FROM (
    SELECT r.world_id,r.promotion_id,r.request_id,r.person_id,r.decision,r.status,
     r.responded_week_index,r.due_week_index,r.promised_championship_id,r.source_contract_id,r.promised_role
    FROM ppw_backstage_requests r
    WHERE r.world_id=w.world_id AND r.promotion_id=owned.promotion_id AND r.status='PROMISED'
     AND r.due_week_index BETWEEN ${now} AND ${now}+5
     AND r.decision IN ('PROMISE_APPEARANCE','PROMISE_SEGMENT','PROMISE_FEATURED','PROMISE_TITLE_MATCH')
    ORDER BY r.due_week_index,r.request_id LIMIT 1
   ) r
   JOIN ppw_people person ON person.world_id=r.world_id AND person.person_id=r.person_id
   LEFT JOIN ppw_championships title ON title.world_id=r.world_id AND title.promotion_id=r.promotion_id
    AND title.championship_id=r.promised_championship_id AND title.status='ACTIVE'
   LEFT JOIN ppw_championship_reigns reign ON reign.world_id=title.world_id
    AND reign.promotion_id=title.promotion_id AND reign.championship_id=title.championship_id
    AND reign.reign_id=title.current_reign_id
   LEFT JOIN ppw_people champion ON champion.world_id=reign.world_id AND champion.person_id=reign.person_id
    AND champion.person_id<>r.person_id
   LEFT JOIN LATERAL (${plannedPromiseBookingSql("r",now)}) booking ON true
  ) AS promise,
  (SELECT jsonb_build_object('showId',d.draft_id,'showName',coalesce(d.show_name,
     CASE WHEN d.booking_class='PREMIUM' THEN 'Premium event' ELSE 'Weekly show' END),
    'personId',absence.person_id,'name',person.name,'position',s.position+1,
    'clearedWeekIndex',absence.cleared_week_index)
   FROM ppw_booking_drafts d
   JOIN ppw_card_slots s ON s.world_id=d.world_id AND s.draft_id=d.draft_id AND s.kind='MATCH'
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.payload->'participants')='array'
    THEN s.payload->'participants' ELSE '[]'::jsonb END) member
   JOIN ppw_medical_absences absence ON absence.world_id=d.world_id AND absence.person_id=member->>'personId'
    AND absence.status='ACTIVE' AND absence.injured_week_index<${now} AND absence.cleared_week_index>${now}
   JOIN ppw_people person ON person.world_id=absence.world_id AND person.person_id=absence.person_id
   WHERE d.world_id=w.world_id AND d.promotion_id=owned.promotion_id AND d.year=w.year AND d.week=w.week
    AND d.status='DRAFT'
   ORDER BY d.show_day NULLS LAST,d.draft_id,s.position,absence.person_id LIMIT 1
  ) AS medical
`;
