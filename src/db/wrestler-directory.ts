/** Compact authenticated roster + global hiring market. No World blob, no
 * per-wrestler database round trips and no claim that interest is guaranteed.
 * Both views use indexed world/person keys, fixed-size pages and current clock.
 */
import {withSqlClient} from "./postgres.js";
import {currentWrestlerTitlesJoin,normaliseCurrentTitles} from "./current-wrestler-titles.js";
import type {TransactionPool} from "./transaction.js";
import {originalPersonaBaseline} from "../domain/portable-persona.js";
import {effectiveWrestlerAlignment} from "../domain/original-alignment.js";
import {purchasedDateLimits,maxExclusiveTermWeeks,unpackSignedCommitments,type CompactSignedCommitment,type Stage} from "../domain/contract-economics.js";
import {worldStaff} from "../domain/world-staff.js";
import {weekDateRangeSql} from "./week-date-sql.js";
export type DirectoryView="ROSTER"|"MARKET";
export type DirectorySort="ROLE"|"NAME"|"POPULARITY"|"RECOGNITION"|"MOMENTUM"|"OVERNESS"|"VALUE"|"PAY_LOW"|"PAY_HIGH"|"FEE_LOW"|"FEE_HIGH"|"DATES_LOW"|"DATES_HIGH"|"EXPIRY"|"INTEREST";
export type DirectoryDivision="ALL"|"MEN"|"WOMEN";
export type MarketAvailability="ALL"|"APPROACHABLE"|"FREE_AGENT"|"NON_EXCLUSIVE";
export type DirectoryRole="ALL"|"MAIN_EVENT"|"UPPER_CARD"|"FEATURED"|"REGULAR"|"DEVELOPMENTAL"|"SPECIAL_ATTRACTION";
export type DirectoryContract="ALL"|"EXCLUSIVE"|"LIMITED_NON_EXCLUSIVE";
export type DirectoryInterest="ALL"|"OPEN_PLUS"|"INTERESTED_PLUS";
export interface DirectoryFilter{
 view:DirectoryView;search?:string;division?:DirectoryDivision;
 availability?:MarketAvailability;role?:DirectoryRole;contract?:DirectoryContract;
 interest?:DirectoryInterest;sort?:DirectorySort;minPopularity?:number;minOverness?:number;
 minRecognition?:number;minMomentum?:number;minInRing?:number;minCraft?:number;minPresentation?:number;
 offset?:number;limit?:number;
}
type PersonRow={
 person_id:string;name:string;booking_division:string|null;
 in_ring_quality:number|null;gid:string|null;
 default_alignment:string|null;active_alignment:string|null;
 popularity:number|null;recognition:number|null;momentum:number|null;overness:number|null;
 match_craft:number|null;presentation:number|null;morale:number|null;
 career_stage:string|null;it:number|null;
 biological_age:number|null;development_aptitude:number|null;
 contract_id:string|null;aff:string|null;
 family:string|null;role_expectation:string|null;remaining_dates:number|null;
 start_week_index:number|null;
 expires_week_index:number|null;weekly_guarantee:string|null;
 appearance_fee:string|null;
 exclusive_to:string|null;other_contracts:number;active_contracts:number;
 future_contracts:number;next_future_start:number|null;
 future_exclusive_to:string|null;
 pending_offer:boolean;estimated_value:number|null;
 ct?:string[]|null;
 med:number|null;
 stamina:number|null;fatigue:number|null;weekly_service_capacity:number|null;commitments?:CompactSignedCommitment[]|null;
};
export function validateDirectoryFilter(f:DirectoryFilter){
 if(!f||!["ROSTER","MARKET"].includes(f.view)||
  !["ALL","MEN","WOMEN"].includes(f.division??"ALL")||
  !["ALL","APPROACHABLE","FREE_AGENT","NON_EXCLUSIVE"].includes(f.availability??"ALL")||
  !["ALL","MAIN_EVENT","UPPER_CARD","FEATURED","REGULAR","DEVELOPMENTAL","SPECIAL_ATTRACTION"].includes(f.role??"ALL")||
  !["ALL","EXCLUSIVE","LIMITED_NON_EXCLUSIVE"].includes(f.contract??"ALL")||
  !["ALL","OPEN_PLUS","INTERESTED_PLUS"].includes(f.interest??"ALL")||
  !["ROLE","NAME","POPULARITY","RECOGNITION","MOMENTUM","OVERNESS","VALUE","PAY_LOW","PAY_HIGH","FEE_LOW","FEE_HIGH","DATES_LOW","DATES_HIGH","EXPIRY","INTEREST"].includes(f.sort??"NAME")||
  !Number.isSafeInteger(f.offset??0)||(f.offset??0)<0||(f.offset??0)>1000||
  !Number.isSafeInteger(f.limit??25)||(f.limit??25)<1||(f.limit??25)>40||
  typeof (f.search??"")!=="string"||(f.search??"").length>70)
   throw new Error("Invalid wrestler directory filters");
 for(const n of [f.minPopularity,f.minOverness,f.minRecognition,f.minMomentum,f.minInRing,f.minCraft,f.minPresentation])
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
 OVERNESS:"COALESCE(p.overness,COALESCE(p.popularity,50)*0.55+"+
   "COALESCE(p.momentum,50)*0.45) DESC,p.name ASC,p.person_id ASC",
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
   seed:string|number;can_edit:boolean;
    cash:string;weekly_income:string|null;
    weekly_fixed_overhead:string|null;active_guarantees:string;
    signed_roster_exposure:string;staff_payroll:string;
    plan_wage_limit:string|null;plan_cash_reserve:string|null;plan_show_limit:string|null;
    active_roster_depth:{men:number;women:number};
    next_tv:{name:string;weekIndex:number}|null;next_ppv:{name:string;weekIndex:number}|null;
    has_talent_manager:boolean;manager_id:string|null}>(`
   SELECT w.year,w.week,w.revision,w.seed,
    owner.cash::text,
    CASE WHEN owner.weekly_media_income IS NULL OR owner.weekly_sponsor_income IS NULL
     THEN NULL ELSE (owner.weekly_media_income+owner.weekly_sponsor_income)::text
     END AS weekly_income,
    owner.weekly_fixed_overhead::text,
    costs.active_guarantees,costs.signed_roster_exposure,
    costs.active_roster_depth,shows.next_tv,shows.next_ppv,
    (SELECT coalesce(sum(employee.weekly_salary),0)::text
     FROM ppw_staff_employments employee WHERE employee.world_id=w.world_id
      AND employee.promotion_id=owner.promotion_id AND employee.status='ACTIVE'
      AND employee.start_week_index<=(w.year-1)*52+w.week-1
      AND employee.expires_week_index>=(w.year-1)*52+w.week-1) AS staff_payroll,
    plan.weekly_wage_limit::text AS plan_wage_limit,
    plan.cash_reserve::text AS plan_cash_reserve,
    plan.show_talent_limit::text AS plan_show_limit,
    (SELECT adviser.staff_id FROM ppw_staff_employments adviser
     WHERE adviser.world_id=w.world_id AND adviser.promotion_id=owner.promotion_id
      AND adviser.role='TALENT_MANAGER' AND adviser.status='ACTIVE'
      AND adviser.start_week_index<=(w.year-1)*52+w.week-1
      AND adviser.expires_week_index>=(w.year-1)*52+w.week-1
     ORDER BY adviser.staff_id LIMIT 1) AS manager_id,
    EXISTS(SELECT 1 FROM ppw_staff_employments adviser
     WHERE adviser.world_id=w.world_id AND adviser.promotion_id=owner.promotion_id
     AND adviser.role='TALENT_MANAGER' AND adviser.status='ACTIVE'
     AND adviser.start_week_index<=(w.year-1)*52+w.week-1
     AND adviser.expires_week_index>=(w.year-1)*52+w.week-1)
     AS has_talent_manager,
    (w.phase IN ('OPEN','UPDATING') AND w.next_lock_at>clock_timestamp()) AS can_edit
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions owner ON owner.world_id=w.world_id
    AND owner.promotion_id=c.promotion_id AND owner.lifecycle='ACTIVE'
   LEFT JOIN ppw_promotion_spending_plans plan ON plan.world_id=owner.world_id
    AND plan.promotion_id=owner.promotion_id
   -- One existing indexed payroll scan now carries outstanding signed costs.
   -- No additional SQL round trip during market search or filtering.
   LEFT JOIN LATERAL (
    SELECT coalesce(sum(CASE
      WHEN agreement.start_week_index<=(w.year-1)*52+w.week-1
       AND agreement.expires_week_index>=(w.year-1)*52+w.week-1
      THEN agreement.weekly_guarantee ELSE 0 END),0)::text AS active_guarantees,
     coalesce(sum(
      greatest(0,agreement.expires_week_index-
       greatest(agreement.start_week_index,(w.year-1)*52+w.week-1)+1)
        *agreement.weekly_guarantee+
      CASE WHEN agreement.remaining_dates IS NULL THEN 0 ELSE
       least(greatest(0,agreement.remaining_dates),
        2*greatest(0,agreement.expires_week_index-
         greatest(agreement.start_week_index,(w.year-1)*52+w.week-1)+1))
        *agreement.appearance_fee END
     ),0)::text AS signed_roster_exposure,
     jsonb_build_object(
      'men',count(DISTINCT person.person_id) FILTER(WHERE person.booking_division='MEN'),
      'women',count(DISTINCT person.person_id) FILTER(WHERE person.booking_division='WOMEN')
     ) AS active_roster_depth
    FROM ppw_contracts agreement
    LEFT JOIN ppw_people person ON $4::boolean AND person.world_id=agreement.world_id
     AND person.person_id=agreement.person_id
     AND person.status='ACTIVE' AND agreement.start_week_index<=(w.year-1)*52+w.week-1
     AND agreement.expires_week_index>=(w.year-1)*52+w.week-1
     AND (agreement.family='EXCLUSIVE' OR agreement.remaining_dates>0)
    WHERE agreement.world_id=w.world_id AND agreement.promotion_id=owner.promotion_id
     AND agreement.status='SIGNED'
   ) costs ON TRUE
   LEFT JOIN LATERAL (
    SELECT (array_agg(event ORDER BY year,week) FILTER(WHERE booking_class='REGULAR'))[1] AS next_tv,
     (array_agg(event ORDER BY year,week) FILTER(WHERE booking_class='PREMIUM'))[1] AS next_ppv
    FROM (SELECT DISTINCT ON (d.booking_class) d.booking_class,d.year,d.week,
     jsonb_build_object('name',coalesce(d.show_name,CASE WHEN d.booking_class='PREMIUM'
      THEN 'the next PPV' ELSE 'the next television show' END),
      'weekIndex',(d.year-1)*52+d.week-1) AS event
     FROM ppw_booking_drafts d
     WHERE d.world_id=w.world_id AND d.promotion_id=$3
      AND d.status IN ('DRAFT','SUBMITTED')
      AND ${weekDateRangeSql("d","(w.year-1)*52+w.week-1","(w.year-1)*52+w.week+5")}
     ORDER BY d.booking_class,d.year,d.week,d.show_day NULLS LAST,d.draft_id
    ) scheduled
   ) shows ON $4::boolean
   WHERE w.world_id=$1`,[who.worldId,who.playerId,who.promotionId,f.view==="MARKET"]);
  if(auth.length!==1)throw new Error("Wrestler directory access denied");
  const now=(auth[0]!.year-1)*52+auth[0]!.week-1;
  const manager=auth[0]!.manager_id?
   worldStaff(auth[0]!.seed).find(m=>m.staffId===auth[0]!.manager_id):null;
  // DISTINCT person identity: a second offer/contract must never create a
  // duplicate market tile. Correlated lookups are world+person indexed.
  const rows=await tx.query<PersonRow>(`
   SELECT p.person_id,p.name,p.booking_division,p.popularity,p.recognition,
    p.momentum,COALESCE(p.overness,COALESCE(p.popularity,50)*0.55+
     COALESCE(p.momentum,50)*0.45) AS overness,
    p.match_craft,p.presentation,p.morale,p.career_stage,
    ${f.view==="MARKET"?"p.stamina,p.fatigue,p.weekly_service_capacity,contracts.commitments,p.biological_age,p.development_aptitude,":""}
    p.in_ring_quality,p.portable_gimmick_id AS gid,p.default_alignment,
    aligned.alignment AS active_alignment,
    interest.score AS it,
    ${f.view==="ROSTER"?"(SELECT a.cleared_week_index FROM ppw_medical_absences a "+
     "WHERE a.world_id=p.world_id AND a.person_id=p.person_id "+
     "AND a.status='ACTIVE' AND a.injured_week_index<$3 "+
     "AND a.cleared_week_index>$3) AS med,":""}
    ${f.view==="ROSTER"?"current_titles.championship_titles AS ct,":""}
    ${f.view==="ROSTER"?`mine.contract_id,CASE WHEN mine.promotion_id<>$2 THEN parent.name
     ELSE NULL END AS aff,mine.family,mine.role_expectation,
     mine.remaining_dates,mine.expires_week_index,mine.start_week_index,
     mine.weekly_guarantee::text,mine.appearance_fee::text,`:""}

    contracts.exclusive_to,contracts.other_contracts,contracts.active_contracts,
    contracts.future_contracts,contracts.next_future_start,contracts.future_exclusive_to,
    ${f.view==="MARKET"?"mv.estimated_value,":""}
    EXISTS(SELECT 1 FROM ppw_contract_offers o
      WHERE o.world_id=p.world_id AND o.person_id=p.person_id
       AND o.promotion_id=$2 AND o.status='PENDING') AS pending_offer
   FROM ppw_people p
   LEFT JOIN ppw_promotion_wrestler_alignments aligned ON aligned.world_id=p.world_id
    AND aligned.person_id=p.person_id AND aligned.promotion_id=$2
   JOIN ppw_promotions owner ON owner.world_id=p.world_id AND owner.promotion_id=$2
   ${f.view==="ROSTER"?currentWrestlerTitlesJoin:""}
   ${f.view==="ROSTER"?"LEFT JOIN ppw_promotions parent ON parent.world_id=owner.world_id AND parent.promotion_id=owner.parent_promotion_id":""}
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
     coalesce(bool_or(c.family='EXCLUSIVE' AND c.start_week_index<=$3+1
      AND c.expires_week_index>=$3+1),false) AS signing_week_exclusive,
     count(*) FILTER(WHERE c.promotion_id<>$2
      AND c.start_week_index<=$3)::integer AS other_contracts,
     count(*) FILTER(WHERE c.start_week_index<=$3)::integer AS active_contracts,
     count(*) FILTER(WHERE c.start_week_index>$3)::integer AS future_contracts,
     min(c.start_week_index) FILTER(WHERE c.start_week_index>$3)
      AS next_future_start,
     (array_agg(c.promotion_id ORDER BY c.start_week_index,c.promotion_id)
      FILTER(WHERE c.family='EXCLUSIVE' AND c.start_week_index>$3))[1]
      AS future_exclusive_to
     ${f.view==="MARKET"?`,jsonb_agg(jsonb_build_array(c.family='EXCLUSIVE',c.remaining_dates,c.start_week_index,c.expires_week_index)) AS commitments`:""}
    FROM ${f.view==="MARKET"?"ppw_signed_service_windows":"ppw_contracts"} c WHERE c.world_id=p.world_id
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
   WHERE p.world_id=$1 AND p.status IN ('ACTIVE','INJURED')
    AND ($4::text='ALL' OR p.booking_division=$4)
    AND ($5::text='' OR p.name ILIKE '%' || $5 || '%')
    AND ($6::integer IS NULL OR p.popularity >= $6)
    AND ($7::integer IS NULL OR p.recognition >= $7)
    AND ($8::integer IS NULL OR p.momentum >= $8)
    AND ($9::integer IS NULL OR p.match_craft >= $9)
    AND ($10::integer IS NULL OR p.presentation >= $10)
    AND ($17::integer IS NULL OR p.in_ring_quality >= $17)
    AND ($18::integer IS NULL OR COALESCE(p.overness,
     COALESCE(p.popularity,50)*0.55+COALESCE(p.momentum,50)*0.45)>=$18)
    AND ($14::text='ALL' OR mine.role_expectation=$14)
    AND ($15::text='ALL' OR mine.family=$15)
    AND ($16::text='ALL' OR ($16='OPEN_PLUS' AND
      interest.score>=40 AND (contracts.exclusive_to IS NULL OR contracts.signing_week_exclusive IS FALSE)) OR
      ($16='INTERESTED_PLUS' AND interest.score>=63 AND (contracts.exclusive_to IS NULL OR contracts.signing_week_exclusive IS FALSE)))
    AND (${f.view==="ROSTER"?
     "mine.contract_id IS NOT NULL AND $11::text IS NOT NULL":
     "mine.contract_id IS NULL"})
    ${f.view==="MARKET"?
     "AND ($11::text='ALL' OR ($11='APPROACHABLE' AND (contracts.exclusive_to IS NULL OR contracts.signing_week_exclusive IS FALSE)) OR ($11='FREE_AGENT' AND contracts.active_contracts=0 AND contracts.future_contracts=0) OR ($11='NON_EXCLUSIVE' AND (contracts.exclusive_to IS NULL OR contracts.signing_week_exclusive IS FALSE) AND contracts.active_contracts>0))":
     ""}
   ORDER BY ${sortSql[f.sort]}
   LIMIT $12 OFFSET $13`,
   [who.worldId,who.promotionId,now,f.division,f.search,
    f.minPopularity??null,f.minRecognition??null,f.minMomentum??null,
    f.minCraft??null,f.minPresentation??null,f.availability,f.limit+1,f.offset,
   f.role,f.contract,f.interest,f.minInRing??null,f.minOverness??null]);
  const hasMore=rows.length>f.limit;
  return {year:auth[0]!.year,week:auth[0]!.week,
   currentWeekIndex:now,worldRevision:Number(auth[0]!.revision),
   canEdit:auth[0]!.can_edit,view:f.view,offset:f.offset,
   offerBudget:f.view==="MARKET"?{
    hasTalentManager:auth[0]!.has_talent_manager,
    talentManager:manager??(auth[0]!.manager_id?{
     staffId:auth[0]!.manager_id,name:"Talent Manager",insight:55
    }:null),
    cash:Number(auth[0]!.cash),
    weeklyIncome:auth[0]!.weekly_income===null?null:
     Number(auth[0]!.weekly_income),
    weeklyOverhead:auth[0]!.weekly_fixed_overhead===null?null:
     Number(auth[0]!.weekly_fixed_overhead),
    weeklyGuarantees:Number(auth[0]!.active_guarantees),
    signedRosterExposure:Number(auth[0]!.signed_roster_exposure),
    weeklyStaffPayroll:Number(auth[0]!.staff_payroll),
    weeklyWageLimit:auth[0]!.plan_wage_limit===null?null:Number(auth[0]!.plan_wage_limit),
    cashReserve:auth[0]!.plan_cash_reserve===null?null:Number(auth[0]!.plan_cash_reserve),
    showTalentLimit:auth[0]!.plan_show_limit===null?null:Number(auth[0]!.plan_show_limit),
    rosterDepth:auth[0]!.active_roster_depth,nextTV:auth[0]!.next_tv,nextPPV:auth[0]!.next_ppv
   }:null,
   hasMore,people:rows.slice(0,f.limit).map(p=>{
    const fallback=originalPersonaBaseline(p.name,p.gid);
    const commitments=unpackSignedCommitments(p.commitments);
    return {
    personId:p.person_id,name:p.name,division:p.booking_division,
     medicalWeeksRemaining:p.med==null?null:
      p.med-now,
    ...(p.ct?.length?{championships:normaliseCurrentTitles(p.ct)}:{}),
    ringName:fallback.personaName,gimmickId:fallback.gimmickId,
    primaryStyle:fallback.primaryStyle,
    signatureMove:fallback.signatureMoves[0]?.name??null,
    finisherMove:fallback.finishingMoves[0]?.name??null,
    alignment:effectiveWrestlerAlignment(auth[0]!.seed,p.person_id,p.default_alignment,p.active_alignment),
    inRingQuality:p.in_ring_quality,
    popularity:p.popularity,recognition:p.recognition,momentum:p.momentum,
    overness:p.overness,
    matchCraft:p.match_craft,presentation:p.presentation,morale:p.morale,
    careerStage:p.career_stage,contractId:p.contract_id??null,family:p.family??null,
    ...(p.aff?{affiliatedViaParent:true,contractOwnerName:p.aff}:{}),
    roleExpectation:p.role_expectation??null,
    interest:p.contract_id==null&&p.exclusive_to&&p.exclusive_to!==who.promotionId&&
     (f.view!=="MARKET"||commitments.some(c=>c.family==="EXCLUSIVE"&&
      c.startWeekIndex<=now+1&&c.expiresWeekIndex>=now+1))?"UNAVAILABLE":
     p.it===null?"UNKNOWN":p.it>=78?"KEEN":
     p.it>=63?"INTERESTED":p.it>=40?"OPEN_TO_TALKS":
     p.it>=22?"RELUCTANT":"NOT_INTERESTED",
    startWeekIndex:p.start_week_index??null,
    startsInWeeks:p.start_week_index==null?null:Math.max(0,p.start_week_index-now),
    remainingDates:p.remaining_dates??null,expiresWeekIndex:p.expires_week_index??null,
    weeksRemaining:p.expires_week_index==null?null:
     Math.max(0,p.expires_week_index-now+1),
    weeklyGuarantee:p.weekly_guarantee==null?null:Number(p.weekly_guarantee),
    appearanceFee:p.appearance_fee==null?null:Number(p.appearance_fee),
    exclusiveToPromotionId:p.exclusive_to,otherContracts:p.other_contracts,
    activeContracts:p.active_contracts,pendingOffer:p.pending_offer,
    futureContracts:p.future_contracts,nextFutureStart:p.next_future_start,
    futureExclusiveToPromotionId:p.future_exclusive_to,
    // The indicative market valuation only belongs on the recruitment desk.
    // Omit its per-person SQL field on the roster, where the real signed
    // contract is authoritative. Saves ~500–600 PostgreSQL result bytes for
    // a full 25-person iPhone roster without weakening any Neon limits.
    estimatedWeeklyValue:f.view==="MARKET"?p.estimated_value:null,
    ...(f.view==="MARKET"?{age:p.biological_age,developmentAptitude:p.development_aptitude,
     exclusiveTermLimit:maxExclusiveTermWeeks(now+1,commitments),offerDateLimits:p.stamina!=null&&p.fatigue!=null&&p.career_stage?
     purchasedDateLimits({careerStage:p.career_stage as Stage,stamina:p.stamina,fatigue:p.fatigue,weeklyServiceCapacity:p.weekly_service_capacity},now+1,commitments,now):null}:{}),
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
