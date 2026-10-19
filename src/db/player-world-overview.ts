import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";

export interface PlayerWorldOverview {
 world:{id:string;name:string;year:number;week:number;day:number;
  phase:string;revision:number;nextLockEpoch:number;serverEpoch:number};
 membership:"ACTIVE"|"INACTIVE"|"NONE";
 promotion:null|{id:string;name:string;tier:string;homeMarketName:string|null;cash:number;debt:number;
  lastWeeklyNet:number|null;runwayWeeks:number|null;financialDistress:string|null;
  attention:{
   unpreparedShow:boolean;pendingBackstage:boolean;expiringTalent:boolean;
   pendingContractOffers:boolean;plannedShows:number;
   backstageRequests?:{personId:string;name:string;kind:string}[];
   offerResults?:{id:string;personId:string;name:string;status:"ACCEPTED"|"REJECTED"}[];
   backstageResults?:{id:string;personId:string;name:string;status:"FULFILLED"|"BROKEN"}[];
   businessUpdates?:{id:string;kind:"ANNUAL_REVIEW"|"FINANCIAL_HEALTH";
    year:number;week:number;prestigeDelta:number|null;
    before:string|null;after:string|null}[];};
 };
}

/** One World-keyed authenticated overview read instead of three round-trips.
 * Includes the server-authoritative next lock and measured server clock,
 * allowing a local iPhone countdown without database polling or drift.
 * There is no promotion leak for non-members or uncontrolled promotions.
 */
export async function readPlayerWorldOverview(
 pool:TransactionPool,worldId:string,playerId:string,
):Promise<PlayerWorldOverview|null>{
 if(![worldId,playerId].every(x=>typeof x==="string"&&x.trim()&&x.length<=200))
  throw new Error("Invalid World overview scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{
   world_id:string;world_name:string;year:number;week:number;day:number;
   phase:string;revision:string|number;next_lock_epoch:string;
   server_epoch:string;membership_status:"ACTIVE"|"INACTIVE"|null;
   promotion_id:string|null;promotion_name:string|null;tier:string|null;
   home_market_name:string|null;
   cash:string|number|null;debt:string|number|null;
   last_weekly_net:string|number|null;runway_weeks:number|null;
   financial_distress:string|null;
   planned_shows:number|null;unprepared_show:boolean|null;
   pending_backstage:boolean|null;expiring_talent:boolean|null;
   pending_contract_offers:boolean|null;offer_results:unknown;
   backstage_requests:unknown;backstage_results:unknown;
   business_updates:unknown;
  }>(`
   SELECT w.world_id,w.name AS world_name,w.year,w.week,w.day,
    w.phase,w.revision,
    floor(extract(epoch FROM w.next_lock_at))::text AS next_lock_epoch,
    extract(epoch FROM clock_timestamp())::text AS server_epoch,
    m.status AS membership_status,
    owned.promotion_id,owned.name AS promotion_name,owned.tier,owned.home_market_name,
    owned.cash,owned.debt,owned.last_weekly_net,
    owned.runway_weeks,owned.financial_distress,
    notices.planned_shows,notices.unprepared_show,
    notices.pending_backstage,notices.expiring_talent,notices.pending_contract_offers,
    notices.offer_results,notices.backstage_requests,notices.backstage_results,
    notices.business_updates
   FROM ppw_worlds w
   LEFT JOIN ppw_memberships m
    ON m.world_id=w.world_id AND m.player_id=$2
   LEFT JOIN LATERAL (
    SELECT p.promotion_id,p.name,p.tier,p.cash,p.debt,
     p.last_weekly_net,p.runway_weeks,p.financial_distress,
     market.name AS home_market_name
    FROM ppw_promotion_controls c JOIN ppw_promotions p
     ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    LEFT JOIN ppw_markets market ON market.world_id=p.world_id
     AND market.market_id=p.home_market_id
    WHERE c.world_id=w.world_id AND c.player_id=$2 AND c.active
     AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'
    ORDER BY p.promotion_id LIMIT 1
   ) owned ON TRUE
   LEFT JOIN LATERAL (
    SELECT
     (SELECT count(*)::integer FROM ppw_booking_drafts d
       WHERE d.world_id=w.world_id AND d.promotion_id=owned.promotion_id
        AND d.year=w.year AND d.week=w.week) AS planned_shows,
     EXISTS (SELECT 1 FROM ppw_booking_drafts d
       WHERE d.world_id=w.world_id AND d.promotion_id=owned.promotion_id
        AND d.year=w.year AND d.week=w.week AND d.status='DRAFT'
        AND d.lock_ready_fingerprint IS NULL LIMIT 1) AS unprepared_show,
     EXISTS (SELECT 1 FROM ppw_backstage_requests b
       WHERE b.world_id=w.world_id AND b.promotion_id=owned.promotion_id
        AND b.status='PENDING' LIMIT 1) AS pending_backstage,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'personId',request.person_id,'name',request.name,'kind',request.kind)
       ORDER BY request.created_week_index DESC,request.request_id DESC),'[]'::jsonb)
      FROM (SELECT b.person_id,p.name,b.kind,b.created_week_index,b.request_id
       FROM ppw_backstage_requests b JOIN ppw_people p
        ON p.world_id=b.world_id AND p.person_id=b.person_id
       WHERE b.world_id=w.world_id AND b.promotion_id=owned.promotion_id
        AND b.status='PENDING' AND p.status='ACTIVE'
       ORDER BY b.created_week_index DESC,b.request_id DESC LIMIT 3) request
     ) AS backstage_requests,
     EXISTS (SELECT 1 FROM ppw_contracts c
       WHERE c.world_id=w.world_id AND c.promotion_id=owned.promotion_id
        AND c.status='SIGNED'
        AND c.start_week_index<=(w.year-1)*52+w.week-1
        AND c.expires_week_index BETWEEN (w.year-1)*52+w.week-1
         AND (w.year-1)*52+w.week+1 LIMIT 1) AS expiring_talent,
     EXISTS (SELECT 1 FROM ppw_contract_offers o
       WHERE o.world_id=w.world_id AND o.promotion_id=owned.promotion_id
        AND o.status='PENDING' LIMIT 1) AS pending_contract_offers,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id','offer-result:'||recent.offer_id,'personId',recent.person_id,
       'name',recent.name,'status',recent.status)
       ORDER BY recent.submitted_week_index DESC,recent.offer_id DESC),'[]'::jsonb)
      FROM (SELECT o.offer_id,o.person_id,person.name,o.status,o.submitted_week_index
       FROM ppw_contract_offers o
       JOIN ppw_people person ON person.world_id=o.world_id
        AND person.person_id=o.person_id
       WHERE o.world_id=w.world_id AND o.promotion_id=owned.promotion_id
        AND o.status IN ('ACCEPTED','REJECTED')
        AND o.submitted_week_index BETWEEN
         greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1
        AND NOT EXISTS (SELECT 1 FROM ppw_player_attention_dismissals dismissal
          WHERE dismissal.world_id=o.world_id
           AND dismissal.player_id=$2 AND dismissal.promotion_id=owned.promotion_id
           AND dismissal.attention_id='offer-result:'||o.offer_id)
       ORDER BY o.submitted_week_index DESC,o.offer_id DESC LIMIT 5) recent
     ) AS offer_results,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id','backstage-result:'||recent.event_id::text,
       'personId',recent.person_id,'name',recent.name,'status',recent.status)
       ORDER BY recent.event_id DESC),'[]'::jsonb)
      FROM (
       SELECT e.event_id,e.payload->>'personId' AS person_id,
        person.name,
        CASE WHEN e.event_type='BACKSTAGE_PROMISE_FULFILLED'
         THEN 'FULFILLED' ELSE 'BROKEN' END AS status
       FROM ppw_ledger_events e
       JOIN ppw_backstage_requests request ON request.world_id=e.world_id
        AND request.request_id=e.payload->>'conversationId'
        AND request.promotion_id=owned.promotion_id
       JOIN ppw_people person ON person.world_id=e.world_id
        AND person.person_id=request.person_id
       WHERE e.world_id=w.world_id
        AND e.event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN')
        AND e.payload->>'promotionId'=owned.promotion_id
        AND e.payload->>'personId'=request.person_id
        AND request.status=CASE
         WHEN e.event_type='BACKSTAGE_PROMISE_FULFILLED'
         THEN 'FULFILLED' ELSE 'BROKEN' END
        AND (e.year-1)*52+e.week-1 BETWEEN
         greatest(0,(w.year-1)*52+w.week-1-3) AND (w.year-1)*52+w.week-1
        AND NOT EXISTS (SELECT 1 FROM ppw_player_attention_dismissals dismissal
         WHERE dismissal.world_id=e.world_id AND dismissal.player_id=$2
          AND dismissal.promotion_id=owned.promotion_id
          AND dismissal.attention_id='backstage-result:'||e.event_id::text)
       ORDER BY e.event_id DESC LIMIT 5
      ) recent
     ) AS backstage_results,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id','business-update:'||recent.event_id::text,
       'kind',CASE WHEN recent.event_type='PROMOTION_STANDING_UPDATED'
        THEN 'ANNUAL_REVIEW' ELSE 'FINANCIAL_HEALTH' END,
       'year',recent.year,'week',recent.week,
       'prestigeDelta',recent.prestige_delta,'before',recent.previous_status,
       'after',recent.next_status) ORDER BY recent.event_id DESC),'[]'::jsonb)
      FROM (
       SELECT e.event_id,e.year,e.week,e.event_type,
        CASE WHEN e.event_type='PROMOTION_STANDING_UPDATED'
         THEN (e.payload->>'prestigeDelta')::double precision
         ELSE NULL END AS prestige_delta,
        CASE WHEN e.event_type='FINANCIAL_DISTRESS_CHANGED'
         THEN e.payload->>'from' ELSE NULL END AS previous_status,
        CASE WHEN e.event_type='FINANCIAL_DISTRESS_CHANGED'
         THEN e.payload->>'to' ELSE NULL END AS next_status
       FROM ppw_ledger_events e
       WHERE e.world_id=w.world_id
        AND e.event_type IN ('PROMOTION_STANDING_UPDATED','FINANCIAL_DISTRESS_CHANGED')
        AND e.payload->>'promotionId'=owned.promotion_id
        AND e.year BETWEEN greatest(1,w.year-1) AND w.year
        AND (e.year-1)*52+e.week-1 BETWEEN
          greatest(0,(w.year-1)*52+w.week-1-11) AND (w.year-1)*52+w.week-1
        AND ((e.event_type='FINANCIAL_DISTRESS_CHANGED'
          AND e.payload->>'from' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')
          AND e.payload->>'to' IN ('HEALTHY','WATCH','DISTRESSED','CRISIS')
          AND e.payload->>'from'<>e.payload->>'to')
         OR (e.event_type='PROMOTION_STANDING_UPDATED'
          AND (e.payload->>'prestigeDelta') ~ '^-?[0-9]{1,3}(\\.[0-9])?
   WHERE w.world_id=$1`,[worldId,playerId]);
  if(!rows.length)return null;
  const x=rows[0]!;
  return {
   world:{id:x.world_id,name:x.world_name,
    year:x.year,week:x.week,day:x.day,phase:x.phase,
    revision:Number(x.revision),nextLockEpoch:Number(x.next_lock_epoch),
    serverEpoch:Number(x.server_epoch)},
   membership:x.membership_status??"NONE",
   promotion:x.promotion_id!==null?{
    id:x.promotion_id,name:x.promotion_name!,tier:x.tier!,
    homeMarketName:x.home_market_name,
    cash:Number(x.cash),debt:Number(x.debt),
    lastWeeklyNet:x.last_weekly_net===null?null:Number(x.last_weekly_net),
    runwayWeeks:x.runway_weeks,financialDistress:x.financial_distress,
    attention:{unpreparedShow:x.unprepared_show===true,
     pendingBackstage:x.pending_backstage===true,
     expiringTalent:x.expiring_talent===true,
     pendingContractOffers:x.pending_contract_offers===true,
     plannedShows:x.planned_shows??0,
     backstageRequests:Array.isArray(x.backstage_requests)?
      x.backstage_requests.filter((request):request is {
       personId:string;name:string;kind:string;
      }=>request!==null&&typeof request==="object"&&
       typeof request.personId==="string"&&typeof request.name==="string"&&
       typeof request.kind==="string"):[],
     offerResults:Array.isArray(x.offer_results)?
      x.offer_results.filter((news):news is {
       id:string;personId:string;name:string;status:"ACCEPTED"|"REJECTED"
      }=>news!==null&&typeof news==="object"&&
       typeof news.id==="string"&&typeof news.personId==="string"&&
       typeof news.name==="string"&&
       (news.status==="ACCEPTED"||news.status==="REJECTED")):[],
     backstageResults:Array.isArray(x.backstage_results)?
      x.backstage_results.filter((news):news is {
       id:string;personId:string;name:string;status:"FULFILLED"|"BROKEN"
      }=>news!==null&&typeof news==="object"&&
       typeof news.id==="string"&&typeof news.personId==="string"&&
       typeof news.name==="string"&&
       (news.status==="FULFILLED"||news.status==="BROKEN")):[],
     businessUpdates:Array.isArray(x.business_updates)?
      x.business_updates.filter((entry):entry is {
       id:string;kind:"ANNUAL_REVIEW"|"FINANCIAL_HEALTH";
       year:number;week:number;prestigeDelta:number|null;
       before:string|null;after:string|null
      }=>entry!==null&&typeof entry==="object"&&
       typeof entry.id==="string"&&/^business-update:[1-9][0-9]{0,18}$/.test(entry.id)&&
       (entry.kind==="ANNUAL_REVIEW"||entry.kind==="FINANCIAL_HEALTH")&&
       Number.isInteger(entry.year)&&Number.isInteger(entry.week)&&
       (entry.prestigeDelta===null||
        typeof entry.prestigeDelta==="number"&&Number.isFinite(entry.prestigeDelta))&&
       (entry.before===null||typeof entry.before==="string")&&
       (entry.after===null||typeof entry.after==="string")):[]}
   }:null
  };
 });
}

          AND (e.payload->>'prestige') IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM ppw_player_attention_dismissals dismissal
         WHERE dismissal.world_id=e.world_id AND dismissal.player_id=$2
          AND dismissal.promotion_id=owned.promotion_id
          AND dismissal.attention_id='business-update:'||e.event_id::text)
       ORDER BY e.year DESC,e.week DESC,e.event_id DESC LIMIT 6
      ) recent
     ) AS business_updates
   ) notices ON owned.promotion_id IS NOT NULL
   WHERE w.world_id=$1`,[worldId,playerId]);
  if(!rows.length)return null;
  const x=rows[0]!;
  return {
   world:{id:x.world_id,name:x.world_name,
    year:x.year,week:x.week,day:x.day,phase:x.phase,
    revision:Number(x.revision),nextLockEpoch:Number(x.next_lock_epoch),
    serverEpoch:Number(x.server_epoch)},
   membership:x.membership_status??"NONE",
   promotion:x.promotion_id!==null?{
    id:x.promotion_id,name:x.promotion_name!,tier:x.tier!,
    homeMarketName:x.home_market_name,
    cash:Number(x.cash),debt:Number(x.debt),
    lastWeeklyNet:x.last_weekly_net===null?null:Number(x.last_weekly_net),
    runwayWeeks:x.runway_weeks,financialDistress:x.financial_distress,
    attention:{unpreparedShow:x.unprepared_show===true,
     pendingBackstage:x.pending_backstage===true,
     expiringTalent:x.expiring_talent===true,
     pendingContractOffers:x.pending_contract_offers===true,
     plannedShows:x.planned_shows??0,
     backstageRequests:Array.isArray(x.backstage_requests)?
      x.backstage_requests.filter((request):request is {
       personId:string;name:string;kind:string;
      }=>request!==null&&typeof request==="object"&&
       typeof request.personId==="string"&&typeof request.name==="string"&&
       typeof request.kind==="string"):[],
     offerResults:Array.isArray(x.offer_results)?
      x.offer_results.filter((news):news is {
       id:string;personId:string;name:string;status:"ACCEPTED"|"REJECTED"
      }=>news!==null&&typeof news==="object"&&
       typeof news.id==="string"&&typeof news.personId==="string"&&
       typeof news.name==="string"&&
       (news.status==="ACCEPTED"||news.status==="REJECTED")):[],
     backstageResults:Array.isArray(x.backstage_results)?
      x.backstage_results.filter((news):news is {
       id:string;personId:string;name:string;status:"FULFILLED"|"BROKEN"
      }=>news!==null&&typeof news==="object"&&
       typeof news.id==="string"&&typeof news.personId==="string"&&
       typeof news.name==="string"&&
       (news.status==="FULFILLED"||news.status==="BROKEN")):[]}
   }:null
  };
 });
}
