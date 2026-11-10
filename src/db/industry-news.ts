/** One on-demand public news read: cached snapshots, never draft cards or private
 * backstage/contract data. Access is tied to an authenticated active manager.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export async function readIndustryWorldNews(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=input;
 if(![worldId,promotionId,playerId].every(s=>typeof s==="string"&&s.length>0&&s.length<=200))
  throw new Error("Invalid World News viewer");
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number;
   published_year:number|null;published_week:number|null}>(`
   SELECT w.year,w.week,latest.year AS published_year,
    latest.week AS published_week
   FROM ppw_worlds w
   LEFT JOIN LATERAL (
    SELECT year,week FROM ppw_world_news_weeks y
    WHERE y.world_id=w.world_id
    ORDER BY year DESC,week DESC LIMIT 1
   ) latest ON true
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
    AND c.promotion_id=$3 AND c.player_id=$2 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id
    AND p.promotion_id=$3 AND p.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(auth.length!==1)throw new Error("World News access denied");
  const index=(auth[0]!.year-1)*52+auth[0]!.week-1;
  const cutoff=Math.max(0,index-12);
  const params=[worldId,Math.floor(cutoff/52)+1,cutoff%52+1,
   auth[0]!.year,auth[0]!.week];
  const [awards,items,annual,voices]=await Promise.all([
   tx.query<{year:number;week:number;kind:"MATCH"|"ANGLE";
    promotion_id:string;promotion_name:string;show_id:string;
    show_name:string;slot_id:string;title:string;
    people_names:string[];person_ids:string[];rating:string|number;
    rating_unit:"STARS"|"CROWD"}>(`
    SELECT year,week,kind,promotion_id,promotion_name,show_id,show_name,
     slot_id,title,people_names,person_ids,rating,rating_unit
    FROM ppw_world_news_awards
    WHERE world_id=$1 AND (year,week)>=($2::integer,$3::integer)
     AND (year,week)<=($4::integer,$5::integer)
    ORDER BY year DESC,week DESC,kind DESC LIMIT 26`,params),
   tx.query<{year:number;week:number;story_key:string;desk:"OFFICIAL"|"DIRT";
    certainty:"CONFIRMED"|"SPECULATION";promotion_id:string;
    promotion_name:string;show_id:string;title:string;summary:string;
    source_kind:string}>(`
    SELECT year,week,story_key,desk,certainty,promotion_id,promotion_name,
     show_id,title,summary,source_kind
    FROM ppw_world_news_items
    WHERE world_id=$1 AND (year,week)>=($2::integer,$3::integer)
     AND (year,week)<=($4::integer,$5::integer)
    ORDER BY year DESC,week DESC,desk,story_key LIMIT 130`,params),
   // Annual best-of can be certified only after every one of the 52 World
   // weeks has a durable publication checkpoint. Existing midyear saves
   // must not award a title using incomplete history.
   tx.query<{year:number;week:number;kind:"MATCH"|"ANGLE";
    promotion_id:string;promotion_name:string;show_id:string;
    show_name:string;slot_id:string;title:string;rating:string|number;
    rating_unit:"STARS"|"CROWD"}>(`
    WITH finished_years AS (
     SELECT y.year FROM ppw_world_news_weeks y
     WHERE y.world_id=$1 AND y.year<$2 AND y.year>=greatest(1,$2-4)
     GROUP BY y.year HAVING count(*)=52
    ), candidates AS (
     SELECT a.year,a.week,a.kind,a.promotion_id,a.promotion_name,
      a.show_id,a.show_name,a.slot_id,a.title,a.rating,a.rating_unit,
      row_number() OVER(PARTITION BY a.year,a.kind
       ORDER BY a.rating DESC,a.week ASC,a.promotion_id ASC,
        a.show_id ASC,a.slot_id ASC) AS place
     FROM finished_years y
     JOIN ppw_world_news_awards a ON a.world_id=$1 AND a.year=y.year
    )
    SELECT year,week,kind,promotion_id,promotion_name,show_id,show_name,
     slot_id,title,rating,rating_unit FROM candidates WHERE place=1
    ORDER BY year DESC,kind DESC LIMIT 8`,[worldId,auth[0]!.year]),
   // Owner-only accepted shortform news: no provider call, draft-card access
   // or per-story follow-up. One bounded indexed read for the News menu.
   tx.query<{year:number;week:number;show_id:string;show_name:string;
    headline:string;summary:string;promotion_name:string}>(`
    SELECT c.year,c.week,c.show_id,d.show_name,
     v.copy_json#>>'{news,headline}' AS headline,
     v.copy_json#>>'{news,summary}' AS summary,
     p.name AS promotion_name
    FROM ppw_postshow_voice_batches v
    JOIN ppw_completed_shows c ON c.world_id=v.world_id
     AND c.promotion_id=v.promotion_id AND c.show_id=v.show_id
     AND c.receipt_digest=v.receipt_digest
    JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
    JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    WHERE v.world_id=$1 AND v.player_id=$6 AND v.promotion_id=$7
     AND v.state='READY' AND v.copy_json->'news' IS NOT NULL
     AND v.copy_json->'news'<>'null'::jsonb
     AND (c.year,c.week)>=($2::integer,$3::integer)
     AND (c.year,c.week)<=($4::integer,$5::integer)
    ORDER BY c.year DESC,c.week DESC,c.show_id LIMIT 26`,
    [...params,playerId,promotionId])
  ]);
  return {latestEdition:auth[0]!.published_year!==null&&
    auth[0]!.published_week!==null?{
      year:auth[0]!.published_year!,week:auth[0]!.published_week!
    }:null,
   voices:voices.filter(v=>typeof v.headline==="string"&&
   v.headline.length<=145&&typeof v.summary==="string"&&v.summary.length<=480)
   .map(v=>({year:v.year,week:v.week,showId:v.show_id,
    showName:v.show_name,promotionName:v.promotion_name,
    headline:v.headline,summary:v.summary})),
   annualAwards:annual.map(a=>({
   year:a.year,week:a.week,kind:a.kind,promotionId:a.promotion_id,
   promotionName:a.promotion_name,showId:a.show_id,showName:a.show_name,
   slotId:a.slot_id,title:a.title,rating:Number(a.rating),ratingUnit:a.rating_unit
  })),awards:awards.map(a=>({
   year:a.year,week:a.week,kind:a.kind,promotionId:a.promotion_id,
   promotionName:a.promotion_name,showId:a.show_id,showName:a.show_name,
   slotId:a.slot_id,title:a.title,peopleNames:a.people_names,
   personIds:a.person_ids,rating:Number(a.rating),ratingUnit:a.rating_unit
  })),stories:items.map(s=>({
   year:s.year,week:s.week,id:s.story_key,desk:s.desk,certainty:s.certainty,
   promotionId:s.promotion_id,promotionName:s.promotion_name,
   showId:s.show_id,title:s.title,summary:s.summary,sourceKind:s.source_kind
  }))};
 });
}
