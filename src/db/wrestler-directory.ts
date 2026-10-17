/** Compact authenticated roster + global hiring market. No World blob, no
 * per-wrestler database round trips and no claim that interest is guaranteed.
 * Both views use indexed world/person keys, fixed-size pages and current clock.
 */
import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";
export type DirectoryView="ROSTER"|"MARKET";
export type DirectorySort="NAME"|"POPULARITY"|"MOMENTUM"|"VALUE";
export type DirectoryDivision="ALL"|"MEN"|"WOMEN";
export type MarketAvailability="ALL"|"APPROACHABLE"|"FREE_AGENT";
export interface DirectoryFilter{
 view:DirectoryView;search?:string;division?:DirectoryDivision;
 availability?:MarketAvailability;sort?:DirectorySort;minPopularity?:number;
 minRecognition?:number;minMomentum?:number;minCraft?:number;
 offset?:number;limit?:number;
}
type PersonRow={
 person_id:string;name:string;booking_division:string|null;
 popularity:number|null;recognition:number|null;momentum:number|null;
 match_craft:number|null;presentation:number|null;morale:number|null;
 career_stage:string|null;
 contract_id:string|null;family:string|null;remaining_dates:number|null;
 expires_week_index:number|null;weekly_guarantee:string|null;
 appearance_fee:string|null;
 exclusive_to:string|null;other_contracts:number;active_contracts:number;
 pending_offer:boolean;
};
export function validateDirectoryFilter(f:DirectoryFilter){
 if(!f||!["ROSTER","MARKET"].includes(f.view)||
  !["ALL","MEN","WOMEN"].includes(f.division??"ALL")||
  !["ALL","APPROACHABLE","FREE_AGENT"].includes(f.availability??"ALL")||
  !["NAME","POPULARITY","MOMENTUM","VALUE"].includes(f.sort??"NAME")||
  !Number.isSafeInteger(f.offset??0)||(f.offset??0)<0||(f.offset??0)>1000||
  !Number.isSafeInteger(f.limit??25)||(f.limit??25)<1||(f.limit??25)>40||
  typeof (f.search??"")!=="string"||(f.search??"").length>70)
   throw new Error("Invalid wrestler directory filters");
 for(const n of [f.minPopularity,f.minRecognition,f.minMomentum,f.minCraft])
  if(n!==undefined&&(!Number.isSafeInteger(n)||n<0||n>100))
   throw new Error("Invalid talent attribute threshold");
 return {...f,search:(f.search??"").trim(),division:f.division??"ALL",
  availability:f.availability??"ALL",sort:f.sort??"NAME",
  offset:f.offset??0,limit:f.limit??25};
}
const sortSql:Record<DirectorySort,string>={
 NAME:"p.name ASC,p.person_id ASC",
 POPULARITY:"p.popularity DESC NULLS LAST,p.name ASC,p.person_id ASC",
 MOMENTUM:"p.momentum DESC NULLS LAST,p.name ASC,p.person_id ASC",
 VALUE:"p.recognition DESC NULLS LAST,p.name ASC,p.person_id ASC"
};
export async function readWrestlerDirectory(
 pool:TransactionPool,who:{worldId:string;playerId:string;promotionId:string},
 filter:DirectoryFilter,
){
 const f=validateDirectoryFilter(filter);
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number;revision:string|number;
   can_edit:boolean}>(`
   SELECT w.year,w.week,w.revision,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions owner ON owner.world_id=w.world_id
    AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[who.worldId,who.playerId,who.promotionId]);
  if(auth.length!==1)throw new Error("Wrestler directory access denied");
  const now=(auth[0]!.year-1)*52+auth[0]!.week-1;
  // DISTINCT person identity: a second offer/contract must never create a
  // duplicate market tile. Correlated lookups are world+person indexed.
  const rows=await tx.query<PersonRow>(`
   SELECT p.person_id,p.name,p.booking_division,p.popularity,p.recognition,
    p.momentum,p.match_craft,p.presentation,p.morale,p.career_stage,
    mine.contract_id,mine.family,mine.remaining_dates,mine.expires_week_index,
    mine.weekly_guarantee::text,mine.appearance_fee::text,
    contracts.exclusive_to,contracts.other_contracts,contracts.active_contracts,
    EXISTS(SELECT 1 FROM ppw_contract_offers o
      WHERE o.world_id=p.world_id AND o.person_id=p.person_id
       AND o.promotion_id=$2 AND o.status='PENDING') AS pending_offer
   FROM ppw_people p
   LEFT JOIN LATERAL (
    SELECT c.contract_id,c.family,c.remaining_dates,c.expires_week_index,
     c.weekly_guarantee,c.appearance_fee
    FROM ppw_contracts c WHERE c.world_id=p.world_id
     AND c.person_id=p.person_id AND c.promotion_id=$2
     AND c.status='SIGNED'
    ORDER BY c.expires_week_index DESC,c.contract_id DESC LIMIT 1
   ) mine ON true
   CROSS JOIN LATERAL (
    SELECT (array_agg(c.promotion_id ORDER BY c.promotion_id)
      FILTER(WHERE c.family='EXCLUSIVE'))[1] AS exclusive_to,
     count(*) FILTER(WHERE c.promotion_id<>$2)::integer AS other_contracts,
     count(*)::integer AS active_contracts
    FROM ppw_contracts c WHERE c.world_id=p.world_id
     AND c.person_id=p.person_id AND c.status='SIGNED'
     AND c.expires_week_index >= $3 AND c.start_week_index <= $3
   ) contracts
   WHERE p.world_id=$1 AND p.status='ACTIVE'
    AND ($4::text='ALL' OR p.booking_division=$4)
    AND ($5::text='' OR p.name ILIKE '%' || $5 || '%')
    AND ($6::integer IS NULL OR p.popularity >= $6)
    AND ($7::integer IS NULL OR p.recognition >= $7)
    AND ($8::integer IS NULL OR p.momentum >= $8)
    AND ($9::integer IS NULL OR p.match_craft >= $9)
    AND (${f.view==="ROSTER"?
     "mine.contract_id IS NOT NULL":
     "mine.contract_id IS NULL"})
    ${f.view==="MARKET"?
     "AND ($10::text='ALL' OR ($10='APPROACHABLE' AND contracts.exclusive_to IS NULL) OR ($10='FREE_AGENT' AND contracts.active_contracts=0))":
     ""}
   ORDER BY ${sortSql[f.sort]}
   LIMIT $11 OFFSET $12`,
   [who.worldId,who.promotionId,now,f.division,f.search,
    f.minPopularity??null,f.minRecognition??null,f.minMomentum??null,
    f.minCraft??null,f.availability,f.limit+1,f.offset]);
  const hasMore=rows.length>f.limit;
  return {year:auth[0]!.year,week:auth[0]!.week,
   currentWeekIndex:now,worldRevision:Number(auth[0]!.revision),
   canEdit:auth[0]!.can_edit,view:f.view,offset:f.offset,
   hasMore,people:rows.slice(0,f.limit).map(p=>({
    personId:p.person_id,name:p.name,division:p.booking_division,
    popularity:p.popularity,recognition:p.recognition,momentum:p.momentum,
    matchCraft:p.match_craft,presentation:p.presentation,morale:p.morale,
    careerStage:p.career_stage,contractId:p.contract_id,family:p.family,
    remainingDates:p.remaining_dates,expiresWeekIndex:p.expires_week_index,
    weeksRemaining:p.expires_week_index===null?null:
     Math.max(0,p.expires_week_index-now+1),
    weeklyGuarantee:p.weekly_guarantee===null?null:Number(p.weekly_guarantee),
    appearanceFee:p.appearance_fee===null?null:Number(p.appearance_fee),
    exclusiveToPromotionId:p.exclusive_to,otherContracts:p.other_contracts,
    activeContracts:p.active_contracts,pendingOffer:p.pending_offer,
    // Availability only describes contract eligibility. It is NOT a promise
    // that a particular wrestler will accept terms at World resolution.
    availability:p.exclusive_to&&p.exclusive_to!==who.promotionId?
     "EXCLUSIVE_ELSEWHERE":p.contract_id?"YOUR_ROSTER":
     p.active_contracts===0?"FREE_AGENT":"NON_EXCLUSIVE" as const
   }))};
 });
}
