// Shared by the publication and public archive queries, before either row cap.
// The alias i refers only to the already published news projection.
export const weeklyNewsPrioritySql=`CASE
 WHEN i.desk='DIRT' THEN CASE WHEN i.story_key LIKE 'followup:%' THEN 30
  WHEN i.story_key LIKE 'wild:%' THEN 25 WHEN i.story_key LIKE 'rumour:%' THEN 20 ELSE 0 END
 WHEN i.certainty<>'CONFIRMED' THEN 0
 WHEN i.story_key LIKE 'signing:%' AND i.summary LIKE '%An established headliner joins the roster.%' THEN 96
 WHEN i.source_kind='TITLE' OR i.story_key LIKE 'title:%' THEN CASE
  WHEN i.summary LIKE '%title was vacant%' THEN 83
  WHEN split_part(i.title,' at ',1) ~* '(^| )world( |$)' THEN 100
  ELSE 95 END
 WHEN i.story_key LIKE 'tournament:%' THEN 94
 WHEN i.story_key LIKE 'match:%' AND i.title LIKE 'A foreign object decides %' THEN 89
 WHEN i.story_key LIKE 'event:%' THEN 88
 WHEN i.story_key LIKE 'programme:official:%' THEN 86
 WHEN i.story_key LIKE 'match:%' AND i.summary ~ '[[:<:]](4[.][5-9][0-9]?|5([.]0{1,2})?)[ -]star match' THEN 93
 WHEN i.story_key LIKE 'match:%' AND i.title LIKE '% in the spotlight at %' THEN 84
 WHEN i.source_kind='ANGLE' OR i.story_key LIKE 'angle:%' THEN 82
 WHEN i.source_kind='MATCH' OR i.story_key LIKE 'match:%' THEN 76
 WHEN i.story_key LIKE 'broadcast:network:%' THEN 72
 WHEN i.story_key LIKE 'press:%' THEN 68
 WHEN i.story_key LIKE 'signing:%' THEN 40
 WHEN i.story_key LIKE 'broadcast:%' THEN 10
 ELSE 20 END`;
