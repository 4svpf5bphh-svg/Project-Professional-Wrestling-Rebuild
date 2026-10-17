/** Promotion-private historic results index. One paged, indexed SQL read:
 * no World snapshot, no receipt transfer and no background polling.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export interface ShowArchiveCursor{year:number;week:number;showId:string}
export interface ShowArchiveItem{
 showId:string;year:number;week:number;crowdResponse:number;
 showName?:string;bookingClass?:"REGULAR"|"PREMIUM";
 matchCount:number;angleCount:number;
}
export interface ShowArchivePage{
 items:ShowArchiveItem[];nextCursor:ShowArchiveCursor|null;
}
const valid=(v:string)=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
export async function readCompletedShowArchive(pool:TransactionPool,
 input:{worldId:string;playerId:string;promotionId:string;cursor?:ShowArchiveCursor|null},
):Promise<ShowArchivePage>{
 if(!valid(input.worldId)||!valid(input.playerId)||!valid(input.promotionId))
  throw new Error("Invalid results archive scope");
 const cursor=input.cursor??null;
 if(cursor!==null&&(!Number.isSafeInteger(cursor.year)||cursor.year<1||
  !Number.isSafeInteger(cursor.week)||cursor.week<1||cursor.week>52||
  !valid(cursor.showId)))throw new Error("Invalid results cursor");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{show_id:string;year:number;week:number;
   crowd_response:string|number;match_count:number;angle_count:number;
   show_name:string|null;booking_class:"REGULAR"|"PREMIUM"}>([
   "SELECT c.show_id,c.year,c.week,c.crowd_response,d.show_name,d.booking_class,",
   "jsonb_array_length(c.receipt_json->'matches') AS match_count,",
   "jsonb_array_length(c.receipt_json->'segments') AS angle_count",
   "FROM ppw_completed_shows c JOIN ppw_booking_drafts d",
   "ON d.world_id=c.world_id AND d.draft_id=c.show_id",
   "WHERE c.world_id=$1 AND c.promotion_id=$3",
   "AND EXISTS (SELECT 1 FROM ppw_promotion_controls p",
   "JOIN ppw_memberships m ON m.world_id=p.world_id AND m.player_id=p.player_id",
   "WHERE p.world_id=c.world_id AND p.promotion_id=c.promotion_id",
   "AND p.player_id=$2 AND p.active AND m.status='ACTIVE')",
   "AND ($4::integer IS NULL OR (c.year,c.week,c.show_id)<",
   "($4::integer,$5::integer,$6::text))",
   "ORDER BY c.year DESC,c.week DESC,c.show_id DESC LIMIT 13"
  ].join(" "),[input.worldId,input.playerId,input.promotionId,
   cursor?.year??null,cursor?.week??null,cursor?.showId??null]);
  const page=rows.slice(0,12).map(row=>({
   showId:row.show_id,year:row.year,week:row.week,
   showName:row.show_name??(row.booking_class==="PREMIUM"?
    "Premium event":"Weekly show"),bookingClass:row.booking_class,
   crowdResponse:Number(row.crowd_response),
   matchCount:row.match_count,angleCount:row.angle_count,
  }));
  const last=page[page.length-1];
  return {items:page,nextCursor:rows.length>12&&last?
   {year:last.year,week:last.week,showId:last.showId}:null};
 });
}
