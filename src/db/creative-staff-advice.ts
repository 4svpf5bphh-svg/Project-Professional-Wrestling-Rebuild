import {weekDateRangeSql} from "./week-date-sql.js";

/** Use the same bounded selector for message delivery, unread badges and replies. */
export function creativeAdviceSourcesSql(world:string,promotion:string,week:string){
 return `
 WITH watched AS MATERIALIZED (
  SELECT p.* FROM ppw_programmes p
  WHERE p.world_id=${world} AND p.promotion_id=${promotion} AND p.status='ACTIVE'
  ORDER BY (p.repetition>=3) DESC,(p.championship_id IS NOT NULL) DESC,
   p.heat DESC NULLS LAST,p.started_week_index DESC NULLS LAST,p.programme_id LIMIT 16
 ), schedule AS MATERIALIZED (
  SELECT d.show_name,(d.year-1)*52+d.week-1 AS week_index,d.booking_class
  FROM ppw_booking_drafts d WHERE d.world_id=${world} AND d.promotion_id=${promotion}
   AND d.status IN ('DRAFT','SUBMITTED') AND d.show_name IS NOT NULL
   AND ${weekDateRangeSql("d",week,`(${week})+6`)}
  ORDER BY (d.booking_class='PREMIUM') DESC,d.year,d.week,d.show_day NULLS LAST,d.draft_id LIMIT 1
 ), assessment AS (
  SELECT p.programme_id,p.programme_format,p.started_week_index,p.repetition,
   participants.side_a,participants.side_b,participants.unavailable,participants.held_title,
   beat.week_index,beat.show_name,beat.signature,beat.kind,beat.winner_side,beat.scene,
   result.current_reign_id,result.prior_reign_id,result.champion,result.title_name,result.reign_week,
   schedule.show_name AS upcoming,schedule.week_index AS event_week,
   CASE
    WHEN participants.unavailable IS NOT NULL THEN 'AVAILABILITY'
    WHEN result.champion IS NOT NULL AND participants.held_title
     AND result.reign_week BETWEEN greatest(0,${week}-3) AND ${week}
     AND result.prior_reign_id IS NOT NULL AND result.prior_reign_id<>result.current_reign_id THEN 'TITLE_CHANGE'
    WHEN beat.scene='TEASE_BETRAYAL' AND p.programme_format IN ('RELATIONSHIP','FACTION') THEN 'TENSION'
    WHEN p.repetition>=3 THEN 'REPEAT'
    WHEN p.heat>=75 AND beat.kind='MATCH' AND schedule.booking_class='PREMIUM' AND finale.programme_id IS NULL THEN 'PAYOFF'
    WHEN coalesce(beat.week_index,p.started_week_index,${week})<=${week}-3
     AND coalesce(beat.week_index,p.started_week_index,${week})>=${week}-12 THEN 'STALLED'
    ELSE NULL END AS issue
  FROM watched p
  LEFT JOIN ppw_programme_finales finale ON finale.world_id=p.world_id
   AND finale.promotion_id=p.promotion_id AND finale.programme_id=p.programme_id
   AND finale.resolved_week_index IS NULL
  LEFT JOIN schedule ON true
  LEFT JOIN LATERAL (
   SELECT a.week_index,a.signature,a.kind,a.winner_side,d.show_name,
    CASE WHEN a.kind='SEGMENT' THEN coalesce(slot.payload#>>'{scene,purpose}',slot.payload->>'kind') END AS scene
   FROM ppw_programme_resolved_activities a
   JOIN ppw_completed_shows done ON done.world_id=a.world_id AND done.show_id=a.show_id
    AND done.promotion_id=a.promotion_id
   LEFT JOIN ppw_booking_drafts d ON d.world_id=a.world_id AND d.draft_id=a.show_id
   LEFT JOIN ppw_card_slots slot ON slot.world_id=a.world_id AND slot.draft_id=a.show_id AND slot.slot_id=a.slot_id
   WHERE a.world_id=p.world_id AND a.promotion_id=p.promotion_id AND a.programme_id=p.programme_id
    AND a.week_index BETWEEN greatest(0,${week}-12) AND ${week}
   ORDER BY a.week_index DESC,a.show_id DESC,a.slot_id DESC LIMIT 1
  ) beat ON true
  LEFT JOIN LATERAL (
   SELECT title.name AS title_name,title.current_reign_id,reign.start_week_index AS reign_week,
    reign.person_id,reign.team_id,champion.name AS champion,last_defence.prior_reign_id
   FROM ppw_championships title JOIN ppw_championship_reigns reign
    ON reign.world_id=title.world_id AND reign.promotion_id=title.promotion_id
    AND reign.championship_id=title.championship_id AND reign.reign_id=title.current_reign_id
   LEFT JOIN ppw_people champion ON champion.world_id=reign.world_id AND champion.person_id=reign.person_id
   LEFT JOIN LATERAL (
    SELECT contest.prior_reign_id FROM ppw_championship_contests contest
    JOIN ppw_completed_shows done ON done.world_id=contest.world_id AND done.show_id=contest.show_id
     AND done.promotion_id=contest.promotion_id
    WHERE contest.world_id=reign.world_id AND contest.promotion_id=reign.promotion_id
     AND contest.championship_id=reign.championship_id AND contest.title_changed
     AND ${weekDateRangeSql("done","reign.start_week_index","reign.start_week_index")}
    ORDER BY contest.show_id,contest.slot_id LIMIT 1
   ) last_defence ON true
   WHERE title.world_id=p.world_id AND title.promotion_id=p.promotion_id
    AND title.championship_id=p.championship_id AND title.status='ACTIVE'
  ) result ON true
  LEFT JOIN LATERAL (
   SELECT string_agg(member.name,' & ' ORDER BY member.position,member.name) FILTER(WHERE member.side='A') AS side_a,
    string_agg(member.name,' & ' ORDER BY member.position,member.name) FILTER(WHERE member.side='B') AS side_b,
    string_agg(member.name,', ' ORDER BY member.side,member.position,member.name) FILTER(WHERE NOT member.available) AS unavailable,
    coalesce(bool_or(member.person_id=result.person_id),false) AS held_title
   FROM (
    SELECT person.person_id,person.name,ref.side,ref.position,
     person.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM ppw_medical_absences absence
       WHERE absence.world_id=p.world_id AND absence.person_id=person.person_id
        AND absence.injured_week_index<coalesce(schedule.week_index,${week})
        AND absence.cleared_week_index>coalesce(schedule.week_index,${week}))
     AND EXISTS(SELECT 1 FROM ppw_signed_service_windows deal
       WHERE deal.world_id=p.world_id AND deal.promotion_id=p.promotion_id AND deal.person_id=person.person_id
        AND coalesce(schedule.week_index,${week}) BETWEEN deal.start_week_index AND deal.expires_week_index
        AND (deal.family='EXCLUSIVE' OR deal.remaining_dates>0)) AS available
    FROM ppw_programme_side_refs ref
    LEFT JOIN ppw_tag_team_members team ON ref.ref_kind='TEAM' AND team.world_id=ref.world_id
     AND team.team_id=ref.ref_id AND team.active
    JOIN ppw_people person ON person.world_id=ref.world_id
     AND person.person_id=CASE WHEN ref.ref_kind='PERSON' THEN ref.ref_id ELSE team.person_id END
    WHERE ref.world_id=p.world_id AND ref.promotion_id=p.promotion_id AND ref.programme_id=p.programme_id
    ORDER BY ref.side,ref.position,person.person_id LIMIT 12
   ) member
  ) participants ON true
 )
 SELECT assessment.*,md5(jsonb_build_array(programme_id,issue,signature,winner_side,
  unavailable,current_reign_id)::text) AS fingerprint,
  coalesce(side_a,'This programme')||CASE WHEN side_b IS NULL THEN '' ELSE ' / '||side_b END AS cast_names,
  greatest(coalesce(week_index,started_week_index,0),coalesce(reign_week,0)) AS created_week
 FROM assessment WHERE issue IS NOT NULL
 ORDER BY CASE issue WHEN 'AVAILABILITY' THEN 0 WHEN 'TITLE_CHANGE' THEN 1 WHEN 'PAYOFF' THEN 2 ELSE 3 END,
  repetition DESC,created_week DESC,programme_id LIMIT 3`;
}

export const creativeAdviceEvidenceSql=(employment:string,advice:string)=>
 `'staff:creative:'||${employment}.employment_id||':'||${advice}.fingerprint`;
