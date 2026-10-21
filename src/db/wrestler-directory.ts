/** Compact authenticated roster + global hiring market. No World blob, no
 * per-wrestler database round trips and no claim that interest is guaranteed.
 * Both views use indexed world/person keys, fixed-size pages and current clock.
 */
import {withSqlClient} from "./postgres.js";
import {currentWrestlerTitlesJoin,normaliseCurrentTitles} from "./current-wrestler-titles.js";
import type {TransactionPool} from "./transaction.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
import {effectiveWrestlerAlignment} from "../domain/original-alignment.js";
export type DirectoryView="ROSTER"|"MARKET";
export type DirectorySort="ROLE"|"NAME"|"POPULARITY"|"RECOGNITION"|"MOMENTUM"|"VALUE"|"PAY_LOW"|"PAY_HIGH"|"FEE_LOW"|"FEE_HIGH"|"DATES_LOW"|"DATES_HIGH"|"EXPIRY"|"INTEREST";
export type DirectoryDivision="ALL"|"MEN"|"WOMEN";
export type MarketAvailability="ALL"|"APPROACHABLE"|"FREE_AGENT"|"NON_EXCLUSIVE";
export type DirectoryRole="ALL"|"MAIN_EVENT"|"UPPER_CARD"|"FEATURED"|"REGULAR"|"DEVELOPMENTAL"|"SPECIAL_ATTRACTION";
export type DirectoryContract="ALL"|"EXCLUSIVE"|"LIMITED_NON_EXCLUSIVE";
export type DirectoryInterest="ALL"|"OPEN_PLUS"|"INTERESTED_PLUS";
export interface DirectoryFilter{
 view:DirectoryView;search?:string;division?:DirectoryDivision;
 availability?:MarketAvailability;role?:DirectoryRole;contract?:DirectoryContract;
 interest?:DirectoryInterest;sort?:DirectorySort;minPopularity?:number;
 minRecognition?:number;minMomentum?:number;minInRing?:number;minCraft?:number;minPresentation?:number;
 offset?:number;limit?:number;
}
type PersonRow={
 person_id:string;name:string;booking_division:string|null;
 in_ring_quality:number|null;portable_gimmick_id:string|null;
 default_alignment:string|null;active_alignment:string|null;
 popularity:number|null;recognition:number|null;momentum:number|null;
 match_craft:number|null;presentation:number|null;morale:number|null;
 career_stage:string|null;interest_score:number|null;
 contract_id:string|null;aff:string|null;
 family:string|null;role_expectation:string|null;remaining_dates:number|null;
 start_week_index:number|null;
 expires_week_index:number|null;weekly_guarantee:string|null;
 appearance_fee:string|null;
 exclusive_to:string|null;other_contracts:number;active_contracts:number;
 future_contracts:number;next_future_start:number|null;
 future_exclusive_to:string|null;
 pending_offer:boolean;estimated_value:number|null;
 ct:string[]|null;
};
export function validateDirectoryFilter(f:DirectoryFilter){
 if(!f||!["ROSTER","MARKET"].includes(f.view)||
  !["ALL","MEN","WOMEN"].includes(f.division??"ALL")||
  !["ALL","APPROACHABLE","FREE_AGENT","NON_EXCLUSIVE"].includes(f.availability??"ALL")||
  !["ALL","MAIN_EVENT","UPPER_CARD","FEATURED","REGULAR","DEVELOPMENTAL","SPECIAL_ATTRACTION"].includes(f.role??"ALL")||
  !["ALL","EXCLUSIVE","LIMITED_NON_EXCLUSIVE"].includes(f.contract??"ALL")||
  !["ALL","OPEN_PLUS","INTERESTED_PLUS"].includes(f.interest??"ALL")||
  !["ROLE","NAME","POPULARITY","RECOGNITION","MOMENTUM","VALUE","PAY_LOW","PAY_HIGH","FEE_LOW","FEE_HIGH","DATES_LOW","DATES_HIGH","EXPIRY","INTEREST"].includes(f.sort??"NAME")||
  !Number.isSafeInteger(f.offset??0)||(f.offset??0)<0||(f.offset??0)>1000||
  !Number.isSafeInteger(f.limit??25)||(f.limit??25)<1||(f.limit??25)>40||
  typeof (f.search??"")!=="string"||(f.search??"").length>70)
   throw new Error("Invalid wrestler directory filters");
 for(const n of [f.minPopularity,f.minRecognition,f.minMomentum,f.minInRing,f.minCraft,f.minPresentation])
  if(n!==undefined&&(!Number.isSafeInteger(n)||n<0||n>100))
   throw new Error("Invalid talent attribute threshold");
 return {...f,search:(f.search??"").trim(),division:f.division??"ALL",
  availability:f.availability??"ALL",role:f.role??"ALL",contract:f.contract??"ALL",
  interest:f.interest??"ALL",sort:f.sort??"NAME",
  offset:f.offset??0,limit:f.limit??25};
}
const sortSql:Record<DirectorySort,string>={
 ROLE:"CASE mine.role_expectation WHEN 'MAIN_EVENT' THEN 0 WHEN 'UPPER_CARD' THEN 1 WHEN 'FEATURED' THEN 2 WHEN 'REGULAR' THEN 3 WHEN 'DEVELOPMENTAL' THEN 4 ELSE 5 END,p.popularity DESC,p.name ASC",
 RECOGNITION:"p.recognition DESC NULLS LAST,p.name ASC",
 DATES_LOW:"mine.remaining_dates ASC NULLS LAST,p.name ASC",
 DATES_HIGH:"mine.remaining_dates DESC NULLS LAST,p.name ASC",
 EXPIRY:"mine.expires_week_index ASC NULLS LAST,p.name ASC",
 INTEREST:"interest.score DESC,p.popularity DESC,p.name ASC",
 NAME:"p.name ASC,p.person_id ASC",
 POPULARITY:"p.popularity DESC NULLS LAST,p.name ASC,p.person_id ASC",
 MOMENTUM:"p.momentum DESC NULLS LAST,p.name ASC,p.person_id ASC",
 VALUE:"mv.estimated_value ASC NULLS LAST,p.name ASC,p.person_id ASC",
 PAY_LOW:"mine.weekly_guarantee ASC NULLS LAST,p.name ASC,p.person_id ASC",
 PAY_HIGH:"mine.weekly_guarantee DESC NULLS LAST,p.name ASC,p.person_id ASC",
 FEE_LOW:"mine.appearance_fee ASC NULLS LAST,p.name ASC,p.person_id ASC",
 FEE_HIGH:"mine.appearance_fee DESC NULLS LAST,p.name ASC,p.person_id ASC"
};
export async function readWrestlerDirectory(
 pool:TransactionPool,who:{worldId:string;playerId:string;promotionId:string},
 filter:DirectoryFilter,
){
 const f=validateDirectoryFilter(filter);
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number;revision:string|number;
   seed:string|number;can_edit:boolean}>(`
   SELECT w.year,w.week,w.revision,w.seed,
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
    p.in_ring_quality,p.portable_gimmick_id,p.default_alignment,
    aligned.alignment AS active_alignment,
    interest.score AS interest_score,current_titles.championship_titles AS ct,
    mine.contract_id,CASE WHEN mine.promotion_id<>$2 THEN parent.name
     ELSE NULL END AS aff,mine.family,mine.role_expectation,
    mine.remaining_dates,mine.expires_week_index,
    mine.start_week_index,
    mine.weekly_guarantee::text,mine.appearance_fee::text,
    contracts.exclusive_to,contracts.other_contracts,contracts.active_contracts,
    contracts.future_contracts,contracts.next_future_start,contracts.future_exclusive_to,
    mv.estimated_value,
    EXISTS(SELECT 1 FROM ppw_contract_offers o
      WHERE o.world_id=p.world_id AND o.person_id=p.person_id
       AND o.promotion_id=$2 AND o.status='PENDING') AS pending_offer
   FROM ppw_people p
   LEFT JOIN ppw_promotion_wrestler_alignments aligned ON aligned.world_id=p.world_id
    AND aligned.person_id=p.person_id AND aligned.promotion_id=$2
   JOIN ppw_promotions owner ON owner.world_id=p.world_id AND owner.promotion_id=$2
   ${currentWrestlerTitlesJoin}
   LEFT JOIN ppw_promotions parent ON parent.world_id=owner.world_id
    AND parent.promotion_id=owner.parent_promotion_id
   LEFT JOIN LATERAL (
    SELECT c.contract_id,c.promotion_id,c.family,c.role_expectation,c.remaining_dates,c.expires_week_index,
     c.start_week_index,
     c.weekly_guarantee,c.appearance_fee
    FROM ppw_contracts c WHERE c.world_id=p.world_id
     AND c.person_id=p.person_id
     AND (c.promotion_id=$2 OR
      (c.promotion_id=owner.parent_promotion_id AND EXISTS (
       SELECT 1 FROM ppw_wrestler_promotion_affiliations a
        WHERE a.world_id=p.world_id AND a.person_id=p.person_id
         AND a.promotion_id=$2 AND a.basis='PARENT_COMPANY')))
     AND c.status='SIGNED' AND c.expires_week_index >= $3
    ORDER BY (c.start_week_index<=$3) DESC,
     c.expires_week_index DESC,c.contract_id DESC LIMIT 1
   ) mine ON true
   CROSS JOIN LATERAL (
    SELECT round((500 + p.recognition*50 + p.popularity*30 +
      (p.in_ring_quality+p.match_craft+p.presentation)*25.0/3) *
      CASE p.career_stage
       WHEN 'SPECIAL_ATTRACTION' THEN 1.35
       WHEN 'VETERAN' THEN 1.1
       WHEN 'PROSPECT' THEN 0.75
       ELSE 1 END)::integer AS estimated_value
   ) mv
   CROSS JOIN LATERAL (
    SELECT (array_agg(c.promotion_id ORDER BY c.promotion_id)
      FILTER(WHERE c.family='EXCLUSIVE' AND c.start_week_index<=$3))[1]
       AS exclusive_to,
     count(*) FILTER(WHERE c.promotion_id<>$2
      AND c.start_week_index<=$3)::integer AS other_contracts,
     count(*) FILTER(WHERE c.start_week_index<=$3)::integer AS active_contracts,
     count(*) FILTER(WHERE c.start_week_index>$3)::integer AS future_contracts,
     min(c.start_week_index) FILTER(WHERE c.start_week_index>$3)
      AS next_future_start,
     (array_agg(c.promotion_id ORDER BY c.start_week_index,c.promotion_id)
      FILTER(WHERE c.family='EXCLUSIVE' AND c.start_week_index>$3))[1]
      AS future_exclusive_to
    FROM ppw_contracts c WHERE c.world_id=p.world_id
     AND c.person_id=p.person_id AND c.status='SIGNED'
     AND c.expires_week_index >= $3
   ) contracts
   CROSS JOIN LATERAL (
    SELECT LEAST(100,GREATEST(0,round(
      58.0
      + CASE owner.tier WHEN 'GLOBAL' THEN 28 WHEN 'NATIONAL' THEN 20
        WHEN 'RISING' THEN 13 WHEN 'INDEPENDENT' THEN 7 ELSE 0 END
      - (COALESCE(p.recognition,50)*0.30 + COALESCE(p.popularity,50)*0.18)
      + (COALESCE(p.morale,50)-50)*0.20
      + (50-COALESCE((p.contract_priorities->>'prestige')::numeric,50))*0.09
    )))::integer AS score
   ) interest
   WHERE p.world_id=$1 AND p.status='ACTIVE'
    AND ($4::text='ALL' OR p.booking_division=$4)
    AND ($5::text='' OR p.name ILIKE '%' || $5 || '%')
    AND ($6::integer IS NULL OR p.popularity >= $6)
    AND ($7::integer IS NULL OR p.recognition >= $7)
    AND ($8::integer IS NULL OR p.momentum >= $8)
    AND ($9::integer IS NULL OR p.match_craft >= $9)
    AND ($10::integer IS NULL OR p.presentation >= $10)
    AND ($17::integer IS NULL OR p.in_ring_quality >= $17)
    AND ($14::text='ALL' OR mine.role_expectation=$14)
    AND ($15::text='ALL' OR mine.family=$15)
    AND ($16::text='ALL' OR ($16='OPEN_PLUS' AND
      interest.score>=40 AND contracts.exclusive_to IS NULL) OR
      ($16='INTERESTED_PLUS' AND interest.score>=63 AND contracts.exclusive_to IS NULL))
    AND (${f.view==="ROSTER"?
     "mine.contract_id IS NOT NULL AND $11::text IS NOT NULL":
     "mine.contract_id IS NULL"})
    ${f.view==="MARKET"?
     "AND ($11::text='ALL' OR ($11='APPROACHABLE' AND contracts.exclusive_to IS NULL) OR ($11='FREE_AGENT' AND contracts.active_contracts=0 AND contracts.future_contracts=0) OR ($11='NON_EXCLUSIVE' AND contracts.exclusive_to IS NULL AND contracts.active_contracts>0))":
     ""}
   ORDER BY ${sortSql[f.sort]}
   LIMIT $12 OFFSET $13`,
   [who.worldId,who.promotionId,now,f.division,f.search,
    f.minPopularity??null,f.minRecognition??null,f.minMomentum??null,
    f.minCraft??null,f.minPresentation??null,f.availability,f.limit+1,f.offset,
   f.role,f.contract,f.interest,f.minInRing??null]);
  const hasMore=rows.length>f.limit;
  return {year:auth[0]!.year,week:auth[0]!.week,
   currentWeekIndex:now,worldRevision:Number(auth[0]!.revision),
   canEdit:auth[0]!.can_edit,view:f.view,offset:f.offset,
   hasMore,people:rows.slice(0,f.limit).map(p=>{
    const fallback=originalPersonaBaseline(p.name,p.portable_gimmick_id);
    return {
    personId:p.person_id,name:p.name,division:p.booking_division,
    championships:normaliseCurrentTitles(p.ct),
    ringName:fallback.personaName,gimmickId:fallback.gimmickId,
    primaryStyle:fallback.primaryStyle,
    signatureMove:fallback.signatureMoves[0]?.name??null,
    finisherMove:fallback.finishingMoves[0]?.name??null,
    alignment:effectiveWrestlerAlignment(auth[0]!.seed,p.person_id,p.default_alignment,p.active_alignment),
    inRingQuality:p.in_ring_quality,
    popularity:p.popularity,recognition:p.recognition,momentum:p.momentum,
    matchCraft:p.match_craft,presentation:p.presentation,morale:p.morale,
    careerStage:p.career_stage,contractId:p.contract_id,family:p.family,
    ...(p.aff?{affiliatedViaParent:true,contractOwnerName:p.aff}:{}),
    roleExpectation:p.role_expectation,
    interest:p.contract_id===null&&p.exclusive_to&&p.exclusive_to!==who.promotionId?"UNAVAILABLE":
     p.interest_score===null?"UNKNOWN":p.interest_score>=78?"KEEN":
     p.interest_score>=63?"INTERESTED":p.interest_score>=40?"OPEN_TO_TALKS":
     p.interest_score>=22?"RELUCTANT":"NOT_INTERESTED",
    startWeekIndex:p.start_week_index,
    startsInWeeks:p.start_week_index===null?null:Math.max(0,p.start_week_index-now),
    remainingDates:p.remaining_dates,expiresWeekIndex:p.expires_week_index,
    weeksRemaining:p.expires_week_index===null?null:
     Math.max(0,p.expires_week_index-now+1),
    weeklyGuarantee:p.weekly_guarantee===null?null:Number(p.weekly_guarantee),
    appearanceFee:p.appearance_fee===null?null:Number(p.appearance_fee),
    exclusiveToPromotionId:p.exclusive_to,otherContracts:p.other_contracts,
    activeContracts:p.active_contracts,pendingOffer:p.pending_offer,
    futureContracts:p.future_contracts,nextFutureStart:p.next_future_start,
    futureExclusiveToPromotionId:p.future_exclusive_to,
    estimatedWeeklyValue:p.estimated_value,
    // Availability only describes contract eligibility. It is NOT a promise
    // that a particular wrestler will accept terms at World resolution.
    availability:p.contract_id?
      (p.start_week_index!==null&&p.start_week_index>now?
       "SIGNED_FUTURE_YOURS":"YOUR_ROSTER"):
      p.exclusive_to&&p.exclusive_to!==who.promotionId?
     "EXCLUSIVE_ELSEWHERE":p.future_exclusive_to&&p.future_exclusive_to!==who.promotionId?
      "FUTURE_EXCLUSIVE_ELSEWHERE":
     p.future_contracts>0?"CONTRACTED_SOON":
     p.active_contracts===0?"FREE_AGENT":"NON_EXCLUSIVE" as const
   };})};
 });
}
