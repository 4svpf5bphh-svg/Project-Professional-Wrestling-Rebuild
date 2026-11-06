/** Bounded certified World-wide broadcast review. Reads at most five recent
 * regular-show receipts per active network, never private drafts or imagined
 * audience. This is called once within the World rollover transaction.
 */
import type {SqlRows} from "./world-operations.js";
import {assessBroadcastNetwork,type BroadcastNetworkReview,
 type CertifiedNetworkWeek,type BroadcastNetworkTerms}
 from "../domain/broadcast-network-review.js";
interface ReviewRow extends Record<string,unknown>{
 deal_id:string;promotion_id:string;promotion_name:string;offer_code:string;
 tier:string;start_week_index:number;end_week_index:number;
 airing_day:number|null;airing_hour:number|null;last_slot_change_week:number|null;
 show_id:string|null;year:number|null;week:number|null;
 show_day:number|null;audience_format:"TV"|"PPV"|null;
 tv_rating:string|null;
}
export interface NetworkAudit{
 dealId:string;promotionId:string;promotionName:string;offerCode:string;
 airingDay:number|null;airingHour:number|null;
 review:BroadcastNetworkReview;
}
export async function reviewWorldBroadcasters(tx:SqlRows,
 worldId:string,year:number,week:number):Promise<NetworkAudit[]>{
 if(!worldId||worldId.length>200||!Number.isSafeInteger(year)||year<1||
  !Number.isSafeInteger(week)||week<1||week>52)
  throw new Error("Invalid network review scope");
 const weekIndex=(year-1)*52+week-1;
 const rows=await tx.query<ReviewRow>(`
 SELECT deal.deal_id,deal.promotion_id,p.name AS promotion_name,
  deal.offer_code,p.tier,deal.start_week_index,deal.end_week_index,
  deal.airing_day,deal.airing_hour,
  (SELECT max((e.payload->>'effectiveWeekIndex')::integer)
   FROM ppw_ledger_events e
   WHERE e.world_id=deal.world_id
    AND e.event_type='BROADCAST_SLOT_CHANGED'
    AND e.payload->>'dealId'=deal.deal_id) AS last_slot_change_week,
  evidence.show_id,evidence.year,evidence.week,
  evidence.show_day,evidence.audience_format,evidence.tv_rating
 FROM ppw_commercial_deals deal
 JOIN ppw_promotions p ON p.world_id=deal.world_id
  AND p.promotion_id=deal.promotion_id AND p.lifecycle='ACTIVE'
 LEFT JOIN LATERAL (
  SELECT economics.show_id,economics.year,economics.week,draft.show_day,
   economics.audience_format,
   economics.tv_household_rating::text AS tv_rating
  FROM ppw_show_economics economics
  JOIN ppw_completed_shows completed ON completed.world_id=economics.world_id
   AND completed.show_id=economics.show_id
   AND completed.promotion_id=economics.promotion_id
   AND completed.year=economics.year AND completed.week=economics.week
  JOIN ppw_booking_drafts draft ON draft.world_id=economics.world_id
   AND draft.draft_id=economics.show_id AND draft.promotion_id=economics.promotion_id
   AND draft.status='SUBMITTED' AND draft.booking_class='REGULAR'
  WHERE economics.world_id=deal.world_id
   AND economics.promotion_id=deal.promotion_id
   AND (economics.year-1)*52+economics.week-1
    BETWEEN greatest(deal.start_week_index,$2-4) AND $2
  ORDER BY economics.year DESC,economics.week DESC,economics.show_id DESC LIMIT 5
 ) evidence ON true
 WHERE deal.world_id=$1 AND deal.kind='BROADCAST' AND deal.status='ACTIVE'
  AND deal.start_week_index<=$2 AND deal.end_week_index>=$2
 ORDER BY deal.promotion_id,deal.deal_id,evidence.year DESC,evidence.week DESC
 LIMIT 641
 `,[worldId,weekIndex]);
 if(rows.length>640)throw new Error("Network audit exceeded bounded World deals");
 const batches=new Map<string,{first:ReviewRow;episodes:CertifiedNetworkWeek[]}>();
 for(const row of rows){
  let batch=batches.get(row.deal_id);
  if(!batch){batch={first:row,episodes:[]};batches.set(row.deal_id,batch);}
  if(row.show_id&&row.year!==null&&row.week!==null)
   batch.episodes.push({weekIndex:(row.year-1)*52+row.week-1,
    showId:row.show_id,showDay:row.show_day,
    audienceFormat:row.audience_format,
    rating:row.tv_rating===null?null:Number(row.tv_rating)});
 }
 if(batches.size>128)throw new Error("Network review exceeded active promoters");
 return [...batches.values()].map(({first,episodes})=>{
  const terms:BroadcastNetworkTerms={dealId:first.deal_id,
   offerCode:first.offer_code,tier:first.tier,
   startWeekIndex:Math.max(first.start_week_index,
    first.last_slot_change_week??first.start_week_index),
   endWeekIndex:first.end_week_index,
   airingDay:first.airing_day,airingHour:first.airing_hour};
  // A negotiated new slot starts a fresh compliance streak; previous
  // correctly aired shows must not be retrospectively labelled off-slot.
  const review=assessBroadcastNetwork(terms,episodes.filter(x=>
   x.weekIndex>=terms.startWeekIndex),weekIndex);
  if(!review)throw new Error("Active network lacks a signed review week");
  return {dealId:first.deal_id,promotionId:first.promotion_id,
   promotionName:first.promotion_name,offerCode:first.offer_code,
   airingDay:first.airing_day,airingHour:first.airing_hour,review};
 });
}
