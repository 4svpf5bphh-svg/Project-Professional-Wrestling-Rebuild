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
  const auth=await tx.query<{year:number;week:number}>(`
   SELECT w.year,w.week FROM ppw_worlds w
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
  const [awards,items]=await Promise.all([
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
    ORDER BY year DESC,week DESC,desk,story_key LIMIT 130`,params)
  ]);
  return {awards:awards.map(a=>({
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
