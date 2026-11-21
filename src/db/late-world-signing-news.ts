/** AI recruitment is resolved after the certified weekly news issue. Add
 * actual late signings to the SAME World transaction, only when recruitment
 * recorded signings. No additional public GET or scheduler.
 */
import type {SqlRows} from "./world-operations.js";
import {composeConfirmedSigningNews,type ConfirmedWorldSigning}
 from "./world-news.js";

export async function publishLateAiSigningNews(tx:SqlRows,
 worldId:string,year:number,week:number):Promise<number>{
 const events=await tx.query<{event_id:string;
  event_type:ConfirmedWorldSigning["eventType"];person_name:string;
  promotion_id:string;promotion_name:string}>(`
  SELECT e.event_id::text AS event_id,e.event_type,
   person.name AS person_name,p.promotion_id,p.name AS promotion_name
  FROM ppw_ledger_events e
  JOIN ppw_world_news_weeks issue ON issue.world_id=e.world_id
   AND issue.year=e.year AND issue.week=e.week
  JOIN ppw_people person ON person.world_id=e.world_id
   AND person.person_id=e.payload->>'personId'
  JOIN ppw_promotions p ON p.world_id=e.world_id
   AND p.promotion_id=e.payload->>'promotionId'
  WHERE e.world_id=$1 AND e.year=$2 AND e.week=$3
   AND e.event_type IN ('AI_STRATEGIC_TALENT_SIGNED','EMERGENCY_TALENT_SIGNED')
  ORDER BY person.popularity DESC NULLS LAST,e.event_id LIMIT 33`,
  [worldId,year,week]);
 if(events.length>32)throw Error("Late World signings exceed the bounded edition");
 const stories=composeConfirmedSigningNews(events.map(e=>({
  eventId:e.event_id,eventType:e.event_type,personName:e.person_name,
  promotionId:e.promotion_id,promotionName:e.promotion_name
 })));
 if(!stories.length)return 0;
 const written=await tx.query<{story_key:string}>(`
  INSERT INTO ppw_world_news_items(world_id,year,week,story_key,desk,
   certainty,promotion_id,promotion_name,show_id,title,summary,source_kind)
  SELECT $1,$2,$3,x.story_key,x.desk,x.certainty,x.promotion_id,
   x.promotion_name,NULLIF(x.show_id,''),x.title,x.summary,x.source_kind
  FROM jsonb_to_recordset($4::jsonb) AS x(story_key text,desk text,
   certainty text,promotion_id text,promotion_name text,show_id text,
   title text,summary text,source_kind text)
  ON CONFLICT (world_id,year,week,story_key) DO NOTHING RETURNING story_key`,
  [worldId,year,week,JSON.stringify(stories.map(s=>({
   story_key:s.key,desk:s.desk,certainty:s.certainty,
   promotion_id:s.promotionId,promotion_name:s.promotionName,
   show_id:s.showId,title:s.title,summary:s.summary,source_kind:s.sourceKind
  })))]);
 return written.length;
}
