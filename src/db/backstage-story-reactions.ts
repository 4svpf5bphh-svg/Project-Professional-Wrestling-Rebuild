/** Earned character-story messages share the original bounded Backstage inbox
 * query. All actor, staff, show and finale facts come from canonical World
 * records; there is no independent message generator or simulation effect.
 */
export const STORY_REACTION_CTES=String.raw`
story_scene AS (
 SELECT p.programme_id,p.programme_format,scene.show_id,scene.slot_id,
  scene.week_index,scene.crowd_response,scene.show_name,scene.segment_kind,
  scene.sender_key,scene.sender_name,
  (finale.resolved_week_index IS NOT NULL) AS finale_delivered
 FROM owner o JOIN (
  SELECT programme_id,programme_format,started_week_index
  FROM ppw_programmes
  WHERE world_id=$1 AND promotion_id=$2
   AND programme_format IN ('SOLO','RELATIONSHIP','FACTION')
   AND (status='ACTIVE' OR (status='COMPLETED' AND ended_week_index IS NOT NULL))
  ORDER BY coalesce(started_week_index,0) DESC,programme_id DESC LIMIT 80
 ) p ON true
 JOIN LATERAL (
  SELECT a.show_id,a.slot_id,a.week_index,a.crowd_response,
   coalesce(nullif(draft.show_name,''),'the show') AS show_name,
   coalesce(slot.payload->>'kind','angle') AS segment_kind,
   narrator.person_id AS sender_key,narrator.name AS sender_name
  FROM ppw_programme_resolved_activities a
  JOIN ppw_completed_shows done ON done.world_id=a.world_id
   AND done.promotion_id=a.promotion_id AND done.show_id=a.show_id
  JOIN ppw_completed_show_segments finished ON finished.world_id=a.world_id
   AND finished.show_id=a.show_id AND finished.slot_id=a.slot_id
   AND finished.authored_outcome='HAPPENS'
  JOIN ppw_booking_drafts draft ON draft.world_id=a.world_id
   AND draft.promotion_id=a.promotion_id AND draft.draft_id=a.show_id
   AND draft.status='SUBMITTED'
  JOIN ppw_card_slots slot ON slot.world_id=a.world_id
   AND slot.draft_id=a.show_id AND slot.slot_id=a.slot_id AND slot.kind='SEGMENT'
  JOIN LATERAL (
   SELECT person.person_id,person.name
   FROM ppw_programme_participants member
   JOIN ppw_people person ON person.world_id=member.world_id
    AND person.person_id=member.person_id
   WHERE member.world_id=a.world_id
    AND member.promotion_id=a.promotion_id AND member.programme_id=a.programme_id
    AND slot.payload->'participants' @>
     jsonb_build_array(jsonb_build_object('personId',member.person_id))
    /* A mentioned name is NOT an appearance or a wrestler's own voice.
     * Only a real actor or a target explicitly on screen may speak. */
    AND ((slot.payload->'actorIds') ? member.person_id
     OR (slot.payload->>'targetPresence'='ON_SCREEN'
      AND (slot.payload->'targetIds') ? member.person_id))
   ORDER BY member.person_id LIMIT 1
  ) narrator ON true
  WHERE a.world_id=$1 AND a.promotion_id=$2
   AND a.programme_id=p.programme_id AND a.kind='SEGMENT'
   AND a.week_index BETWEEN greatest(0,o.now-12) AND o.now
  ORDER BY a.week_index DESC,a.show_id DESC,a.slot_id DESC LIMIT 1
 ) scene ON true
 LEFT JOIN ppw_programme_finales finale ON finale.world_id=$1
  AND finale.promotion_id=$2 AND finale.programme_id=p.programme_id
  AND finale.show_id=scene.show_id AND finale.slot_id=scene.slot_id
  AND finale.resolved_week_index=scene.week_index
 ORDER BY scene.week_index DESC,p.programme_id DESC LIMIT 3
), story_wrestler AS (
 SELECT 'LOCKER_ROOM'::text AS kind,
  'story-scene:'||s.programme_id||':'||s.show_id||':'||s.slot_id||':'||s.sender_key AS evidence,
  s.sender_key,'About that chapter we put on air'::text AS subject,
  (CASE WHEN s.finale_delivered THEN
    'The '||lower(replace(s.segment_kind,'_',' '))||' on '||s.show_name||
    ' was the ending you actually booked for my character story. '
   WHEN s.programme_format='SOLO' THEN
    'My '||lower(replace(s.segment_kind,'_',' '))||' on '||s.show_name||
    ' gave my character an on-screen chapter. '
   WHEN s.programme_format='RELATIONSHIP' THEN
    'I was part of the '||lower(replace(s.segment_kind,'_',' '))||
    ' on '||s.show_name||'. It advanced our relationship story on screen. '
   ELSE 'My part in the faction''s '||lower(replace(s.segment_kind,'_',' '))||
    ' on '||s.show_name||' was shown to the crowd. ' END)||
  (CASE WHEN s.crowd_response>=70 THEN 'The audience got behind that moment. '
   WHEN s.crowd_response<45 THEN 'The crowd was quieter than we hoped. '
   ELSE 'The crowd gave us a mixed reaction. ' END)||
  (CASE WHEN s.finale_delivered THEN
    'That story is finished; my next direction is still yours to decide.'
   ELSE 'I want a distinct next beat, not an automatic turn, alliance or rematch.' END)
   AS body,
  'PROGRAMMES'::text AS action,s.week_index AS created_week_index,
  s.sender_key AS target_person_id,s.sender_name
 FROM story_scene s
), story_creative AS (
 SELECT 'STAFF'::text AS kind,
  'story-staff:'||s.programme_id||':'||s.show_id||':'||s.slot_id||':'||e.staff_id AS evidence,
  e.staff_id AS sender_key,'Creative review of an on-air storyline'::text AS subject,
  (CASE s.programme_format WHEN 'SOLO' THEN 'The solo character story'
   WHEN 'RELATIONSHIP' THEN 'The relationship story'
   ELSE 'The faction story' END)||
  ' had a certified '||lower(replace(s.segment_kind,'_',' '))||
  ' on '||s.show_name||'. '||
  (CASE WHEN s.crowd_response>=70
   THEN 'The crowd responded strongly. Build on it without replaying the same angle. '
   WHEN s.crowd_response<45
   THEN 'The response was quiet. Consider clearer motivation or a different presentation before escalating. '
   ELSE 'The response was mixed. Give the next beat a clearer reason to happen. ' END)||
  (CASE WHEN s.finale_delivered THEN
   'The approved ending was certified. That story is complete; choose the next direction in Programmes.'
   ELSE 'The story remains yours to shape. No turn, friendship, stable membership or result was assumed.' END)
   AS body,
  'PROGRAMMES'::text AS action,s.week_index AS created_week_index,
  NULL::text AS target_person_id,NULL::text AS sender_name
 FROM story_scene s JOIN owner o ON true
 JOIN LATERAL (
  SELECT e.staff_id FROM ppw_staff_employments e
  WHERE e.world_id=$1 AND e.promotion_id=$2
   AND e.role='CREATIVE' AND e.status='ACTIVE'
   AND e.start_week_index<=s.week_index AND e.expires_week_index>=o.now
  ORDER BY e.employment_id LIMIT 1
 ) e ON true
)`;
