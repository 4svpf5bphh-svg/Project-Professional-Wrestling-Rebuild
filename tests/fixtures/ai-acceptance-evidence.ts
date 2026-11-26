import assert from "node:assert/strict";
import type { SqlRows } from "../../src/db/world-operations.js";
import { projectHotTagNewsThread } from "../../src/domain/hot-tag-news.js";

export async function readAiAcceptanceEvidence(tx: SqlRows, worldId: string, weeks: number, controlled: boolean) {
 const arcs=await tx.query<{promotion_id:string;programme_id:string;blueprint:string;format:string;status:string;
  started:number;ended:number|null;cast:string[];chapters:number[];public_weeks:number[]}>(`
  SELECT p.promotion_id,p.programme_id,p.creative_intent->>'blueprintId' AS blueprint,
   p.programme_format AS format,p.status,p.started_week_index AS started,p.ended_week_index AS ended,
   ARRAY(SELECT person_id FROM ppw_programme_participants member
    WHERE (member.world_id,member.promotion_id,member.programme_id)=(p.world_id,p.promotion_id,p.programme_id)
    ORDER BY person_id) AS cast,
   ARRAY(SELECT DISTINCT a.week_index FROM ppw_programme_resolved_activities a
    WHERE (a.world_id,a.promotion_id,a.programme_id)=(p.world_id,p.promotion_id,p.programme_id)
    ORDER BY a.week_index) AS chapters,
   ARRAY(SELECT (n.year-1)*52+n.week-1 FROM ppw_world_news_items n
    WHERE n.world_id=p.world_id AND n.story_key='programme:official:'||p.programme_id
    ORDER BY n.year,n.week) AS public_weeks
  FROM ppw_programmes p WHERE p.world_id=$1 AND p.ai_authored
  ORDER BY p.promotion_id,p.started_week_index
 `,[worldId]);
 const promotions=[...new Set(arcs.map(a=>a.promotion_id))];
 const activity=promotions.map(promotion=>{
  const own=arcs.filter(a=>a.promotion_id===promotion);
  const active=new Set<number>(),cooldown=new Set<number>(),seen=new Set<string>();
  let repeatCasts=0,repeatWithin18=0,longestInactive=0,idleStreak=0;
  for(const a of own){
   for(let week=a.started;week<=(a.ended??weeks-1);week++)active.add(week);
   if(a.ended!==null&&a.ended+1<weeks)cooldown.add(a.ended+1);
   const key=JSON.stringify(a.cast);
   if(seen.has(key))repeatCasts++;
   if(own.some(prior=>prior.ended!==null&&prior.ended<a.started&&prior.ended>=a.started-18&&
    JSON.stringify(prior.cast)===key))repeatWithin18++;
   seen.add(key);
  }
  for(let week=0;week<weeks;week++){
   idleStreak=active.has(week)?0:idleStreak+1;
   longestInactive=Math.max(longestInactive,idleStreak);
  }
  return {promotion,active:active.size,cooldown:[...cooldown].filter(week=>!active.has(week)).length,
   idle:weeks-new Set([...active,...cooldown]).size,longestInactive,repeatCasts,repeatWithin18};
 });
 const history=controlled?await tx.query<{
  programme_id:string;week_index:number;show_name:string;booking_class:string;chapter:string|null;
  main_event:string|null;ordinary_cast:string[];title:string|null;summary:string|null;desk:"OFFICIAL"|"DIRT"|null;
 }>(`
  SELECT p.programme_id,(d.year-1)*52+d.week-1 AS week_index,coalesce(d.show_name,'Weekly TV') AS show_name,
   d.booking_class,chapter.description AS chapter,main.description AS main_event,
   coalesce(regular.appearances,ARRAY[]::text[]) ordinary_cast,n.title,n.summary,n.desk
  FROM ppw_programmes p JOIN ppw_booking_drafts d USING(world_id,promotion_id)
  JOIN ppw_completed_shows broadcast ON (broadcast.world_id,broadcast.show_id)=(d.world_id,d.draft_id)
  LEFT JOIN LATERAL (
   SELECT string_agg(coalesce(slot.payload#>>'{scene,purpose}',m.actual_finish),' / ' ORDER BY slot.position) description
   FROM ppw_card_slots slot
   LEFT JOIN ppw_programme_resolved_activities a ON (a.world_id,a.promotion_id,a.programme_id,a.show_id,a.slot_id)=
    (p.world_id,p.promotion_id,p.programme_id,slot.draft_id,slot.slot_id)
   LEFT JOIN ppw_completed_show_matches m ON (m.world_id,m.show_id,m.match_id)=(slot.world_id,slot.draft_id,slot.slot_id)
   WHERE (slot.world_id,slot.draft_id)=(d.world_id,d.draft_id)
    AND (a.slot_id IS NOT NULL OR (m.match_id IS NOT NULL AND slot.payload->>'supportingProgrammeId'=p.programme_id))
  ) chapter ON true
  LEFT JOIN LATERAL (
   SELECT (SELECT string_agg(w.name,' & ' ORDER BY role.ordinality)
    FROM jsonb_array_elements(slot.payload->'participants') WITH ORDINALITY role(participant,ordinality)
    JOIN ppw_people w ON (w.world_id,w.person_id)=(slot.world_id,role.participant->>'personId')
   )||' · '||m.actual_finish AS description
   FROM ppw_completed_show_matches m JOIN ppw_card_slots slot
    ON (slot.world_id,slot.draft_id,slot.slot_id)=(m.world_id,m.show_id,m.match_id)
   WHERE (m.world_id,m.show_id)=(d.world_id,d.draft_id) ORDER BY m.position DESC LIMIT 1
  ) main ON true
  LEFT JOIN LATERAL (
   SELECT ARRAY(SELECT DISTINCT w.name FROM ppw_card_slots slot
    CROSS JOIN LATERAL jsonb_array_elements(slot.payload->'participants') AS r
    JOIN ppw_programme_participants member ON (member.world_id,member.promotion_id,member.programme_id,member.person_id)=
      (p.world_id,p.promotion_id,p.programme_id,r->>'personId')
    JOIN ppw_people w ON (w.world_id,w.person_id)=(member.world_id,member.person_id)
    WHERE (slot.world_id,slot.draft_id)=(d.world_id,d.draft_id) AND slot.kind='MATCH'
    ORDER BY w.name) AS appearances
  ) regular ON true
  LEFT JOIN ppw_world_news_items n ON (n.world_id,n.year,n.week,n.show_id)=(d.world_id,d.year,d.week,d.draft_id)
   AND n.story_key IN ('programme:official:'||p.programme_id,'programme:dirt:'||p.programme_id)
  WHERE p.world_id=$1 AND p.programme_id IN ('aew-spotlight','vacant-chase','syndicate','heatseekers')
   AND (d.year-1)*52+d.week-1 BETWEEN p.started_week_index AND coalesce(p.ended_week_index,$2)+1
  ORDER BY p.programme_id,d.year,d.week,d.show_day,d.draft_id,n.desk DESC
 `, [worldId,weeks-1]):[];
 const episodes=history.map(row=>({...row,fans:row.desk&&row.title&&row.summary?
  projectHotTagNewsThread({
   id:"programme:"+row.desk.toLowerCase()+":"+row.programme_id,year:Math.floor(row.week_index/52)+1,
   week:row.week_index%52+1,title:row.title,summary:row.summary,desk:row.desk,promotionName:"",
  }).slice(0,2).map(p=>p.text):[]}));
 const legal=controlled?(await tx.query<{
  dual_show_people:number;same_week_injured:number;matches_on_absence:number;angles_on_absence:number;
  human_ai_programmes:number;new_reign:boolean;
 }>(`
  WITH appearances AS (
   SELECT DISTINCT d.promotion_id,d.draft_id,d.booking_class,(d.year-1)*52+d.week-1 AS wk,s.kind,r->>'personId' AS person_id
   FROM ppw_booking_drafts d JOIN ppw_card_slots s ON (s.world_id,s.draft_id)=(d.world_id,d.draft_id)
   JOIN ppw_completed_shows done ON (done.world_id,done.show_id)=(d.world_id,d.draft_id)
   CROSS JOIN LATERAL jsonb_array_elements(s.payload->'participants') r WHERE d.world_id=$1
  ), dual AS (
   SELECT wk,person_id FROM appearances GROUP BY wk,person_id
    HAVING bool_or(booking_class='PREMIUM') AND bool_or(booking_class='REGULAR')
  ), incidents AS (
   SELECT DISTINCT c.wk,c.person_id,e.injury_weeks_out AS weeks_out
   FROM appearances c JOIN (
     SELECT show_id,person_id,injury_weeks_out FROM ppw_individual_field_career_effects WHERE world_id=$1 AND injury_weeks_out>0
     UNION ALL
     SELECT show_id,person_id,injury_weeks_out FROM ppw_tag_match_career_effects WHERE world_id=$1 AND injury_weeks_out>0
   ) e ON (e.show_id,e.person_id)=(c.draft_id,c.person_id)
  )
  SELECT (SELECT count(*)::int FROM dual) AS dual_show_people,
   (SELECT count(*)::int FROM dual JOIN incidents USING(wk,person_id)) AS same_week_injured,
   (SELECT count(*)::int FROM appearances c JOIN incidents i ON i.person_id=c.person_id
    AND c.wk>i.wk AND c.wk<i.wk+i.weeks_out WHERE c.kind='MATCH') AS matches_on_absence,
   (SELECT count(*)::int FROM appearances c JOIN incidents i ON i.person_id=c.person_id
    AND c.wk>i.wk AND c.wk<i.wk+i.weeks_out WHERE c.kind='SEGMENT') AS angles_on_absence,
   (SELECT count(*)::int FROM ppw_programmes WHERE world_id=$1 AND promotion_id='promotion-7' AND ai_authored) AS human_ai_programmes,
   EXISTS(SELECT 1 FROM ppw_championship_contests
    WHERE world_id=$1 AND promotion_id='promotion-2' AND show_id LIKE 'ai-week-1-2-%'
     AND championship_id='founding:singles' AND prior_reign_id IS NULL AND title_changed) AS new_reign
 `,[worldId]))[0]:undefined;
 if(controlled){
  const ending=(id:string)=>arcs.find(a=>a.programme_id===id);
  assert.ok(legal?.dual_show_people);
  assert.ok(legal.same_week_injured,"The mixed fixture exercises a real injury in a week with both TV and PPV appearances");
  assert.deepEqual([legal.matches_on_absence,legal.angles_on_absence,legal.human_ai_programmes],[0,0,0]);
  assert.ok(legal.new_reign,"The first regular card after the vacancy crowns a real successor");
  assert.equal(ending("vacant-chase")?.ended,1,"The old title pursuit ends with the contender's on-air response");
  assert.equal(ending("aew-spotlight")?.ended,8);
  assert.ok(episodes.some(e=>e.programme_id==="aew-spotlight"&&e.show_name==="Revolution"&&e.chapter==="CLEAN_PIN"));
  assert.ok(episodes.some(e=>e.programme_id==="aew-spotlight"&&e.chapter==="PROTECTED_FINISH"));
 }
 return {arcs,activity,episodes,legal};
}
