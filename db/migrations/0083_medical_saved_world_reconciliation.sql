-- Additive one-time reconciliation for saved Worlds that already completed
-- matches before medical availability was rebuilt. It never rewrites cards,
-- World clocks, player ownership, player notes, or historical injury evidence.
-- Window is limited to 52 World weeks, because injuries last at most 52.
WITH recent_ongoing AS (
 SELECT DISTINCT ON (s.world_id,inj.person_id)
  s.world_id,inj.person_id,s.show_id,f.match_id,
  ((s.year-1)*52+s.week-1) AS injured_week_index,
  ((s.year-1)*52+s.week-1+inj.injury_weeks_out) AS cleared_week_index,
  inj.injury_weeks_out AS weeks_out,inj.injury_severity AS severity
 FROM ppw_worlds w
 JOIN ppw_completed_shows s ON s.world_id=w.world_id
 JOIN ppw_completed_match_report_facts f
  ON f.world_id=s.world_id AND f.show_id=s.show_id
 CROSS JOIN LATERAL jsonb_to_recordset(f.injuries_json)
  AS inj(person_id text,injury_severity text,injury_weeks_out integer)
 JOIN ppw_people person ON person.world_id=s.world_id
  AND person.person_id=inj.person_id
 WHERE inj.person_id IS NOT NULL
  AND inj.injury_severity IN ('MINOR','MODERATE','MAJOR','SEVERE')
  AND inj.injury_weeks_out BETWEEN 1 AND 52
  AND person.status IN ('ACTIVE','INJURED')
  AND ((s.year-1)*52+s.week-1)<((w.year-1)*52+w.week-1)
  AND ((s.year-1)*52+s.week-1+inj.injury_weeks_out)>
      ((w.year-1)*52+w.week-1)
  AND ((s.year-1)*52+s.week-1)>=
      GREATEST(0,((w.year-1)*52+w.week-1)-52)
 ORDER BY s.world_id,inj.person_id,
  ((s.year-1)*52+s.week-1) ASC,s.show_id,f.match_id
)
INSERT INTO ppw_medical_absences
(world_id,person_id,show_id,match_id,injured_week_index,
 cleared_week_index,weeks_out,severity,status)
SELECT world_id,person_id,show_id,match_id,injured_week_index,
 cleared_week_index,weeks_out,severity,'ACTIVE'
FROM recent_ongoing
ON CONFLICT (world_id,person_id) DO NOTHING;
