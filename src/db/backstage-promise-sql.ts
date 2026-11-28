import {weekDateRangeSql} from "./week-date-sql.js";

export function titlePromiseTargetSql(request:string){
 return `SELECT title.championship_id FROM ppw_championships title
  JOIN ppw_people person ON person.world_id=title.world_id AND person.person_id=${request}.person_id
  LEFT JOIN ppw_championship_reigns current ON current.world_id=title.world_id AND current.promotion_id=title.promotion_id
   AND current.championship_id=title.championship_id AND current.reign_id=title.current_reign_id
  WHERE title.world_id=${request}.world_id AND title.promotion_id=${request}.promotion_id
   AND title.status='ACTIVE' AND title.division='SINGLES' AND title.name=${request}.relevant_title
   AND (title.booking_division IS NULL OR title.booking_division=person.booking_division)
   AND current.person_id IS DISTINCT FROM person.person_id
  ORDER BY title.championship_id LIMIT 1`;
}

export function plannedPromiseBookingSql(request:string,week:string){
 return `SELECT d.show_name,d.year,d.week,d.status,s.kind
  FROM ppw_booking_drafts d JOIN ppw_card_slots s ON s.world_id=d.world_id AND s.draft_id=d.draft_id
  WHERE ${request}.status='PROMISED' AND d.world_id=${request}.world_id
   AND d.promotion_id=${request}.promotion_id AND d.status IN ('DRAFT','SUBMITTED')
   AND ${weekDateRangeSql("d",`greatest(${week},${request}.responded_week_index)`,`${request}.due_week_index`)}
   AND s.payload->'participants' @> jsonb_build_array(CASE WHEN ${request}.decision='PROMISE_FEATURED'
    THEN jsonb_build_object('personId',${request}.person_id,'contractId',${request}.source_contract_id)
    ELSE jsonb_build_object('personId',${request}.person_id) END)
   AND CASE ${request}.decision
    WHEN 'PROMISE_SEGMENT' THEN s.kind='SEGMENT' AND coalesce(s.payload->>'outcome','HAPPENS')='HAPPENS'
    WHEN 'PROMISE_TITLE_MATCH' THEN s.kind='MATCH' AND s.payload->>'championshipId'=${request}.promised_championship_id
    WHEN 'PROMISE_FEATURED' THEN s.kind='MATCH' AND (SELECT count(*) FROM ppw_card_slots later
     WHERE later.world_id=s.world_id AND later.draft_id=s.draft_id AND later.kind='MATCH' AND later.position>s.position)
     <=CASE WHEN ${request}.promised_role='MAIN_EVENT' THEN 0 ELSE 1 END
    ELSE s.kind='MATCH' END
  ORDER BY d.year,d.week,d.draft_id,s.position LIMIT 1`;
}
