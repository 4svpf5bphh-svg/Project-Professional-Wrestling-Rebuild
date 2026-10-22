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
   injuryNews?:{id:string;personId:string;name:string;
    severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
    originalWeeksOut:number;year:number;week:number}[];
   medicalClearances?:{id:string;personId:string;name:string;
    severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";year:number;week:number}[];
   titleNews?:{id:string;championshipId:string;titleName:string;
    winnerName:string;holderType:"PERSON"|"TEAM";personId:string|null;
    year:number;week:number}[];
   contractAlerts?:{contractId:string;personId:string;name:string;
    kind:"DATES_EXHAUSTED"|"EXPIRING";weeksRemaining:number;waiting:boolean}[];
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
   backstage_requests:unknown;backstage_results:unknown;business_updates:unknown;
   contract_alerts:unknown;title_news:unknown;injury_news:unknown;
   medical_clearances:unknown;
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
    notices.business_updates,notices.contract_alerts,notices.title_news,
    notices.injury_news,notices.medical_clearances
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
        AND d.year=w.year AND d.week=w.week
        AND d.booking_class='REGULAR') AS planned_shows,
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
          AND jsonb_typeof(e.payload->'prestigeDelta')='number'
          AND jsonb_typeof(e.payload->'prestige')='number'))
        AND NOT EXISTS (SELECT 1 FROM ppw_player_attention_dismissals dismissal
         WHERE dismissal.world_id=e.world_id AND dismissal.player_id=$2
          AND dismissal.promotion_id=owned.promotion_id
          AND dismissal.attention_id='business-update:'||e.event_id::text)
       ORDER BY e.year DESC,e.week DESC,e.event_id DESC LIMIT 6
      ) recent
     ) AS business_updates,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'contractId',relevant.contract_id,'personId',relevant.person_id,
      'name',relevant.name,'kind',relevant.kind,
      'weeksRemaining',relevant.weeks_remaining,'waiting',relevant.waiting)
      ORDER BY relevant.priority,relevant.weeks_remaining,relevant.contract_id),
      '[]'::jsonb)
      FROM (
       SELECT c.contract_id,c.person_id,person.name,
        CASE WHEN c.family='LIMITED_NON_EXCLUSIVE' AND c.remaining_dates=0
         THEN 'DATES_EXHAUSTED' ELSE 'EXPIRING' END AS kind,
        c.expires_week_index-((w.year-1)*52+w.week-1) AS weeks_remaining,
        CASE WHEN EXISTS(SELECT 1 FROM ppw_contract_offers offer
          WHERE offer.world_id=c.world_id AND offer.promotion_id=c.promotion_id
           AND offer.person_id=c.person_id AND offer.status='PENDING')
         OR EXISTS(SELECT 1 FROM ppw_contract_date_requests dates
          WHERE dates.world_id=c.world_id AND dates.promotion_id=c.promotion_id
           AND dates.contract_id=c.contract_id AND dates.status='PENDING')
         OR EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals renew
          WHERE renew.world_id=c.world_id AND renew.promotion_id=c.promotion_id
           AND renew.contract_id=c.contract_id AND renew.status='PENDING')
        THEN true ELSE false END AS waiting,
        CASE WHEN c.family='LIMITED_NON_EXCLUSIVE' AND c.remaining_dates=0
         THEN 0 ELSE 1 END AS priority
       FROM ppw_contracts c JOIN ppw_people person
        ON person.world_id=c.world_id AND person.person_id=c.person_id
       WHERE c.world_id=w.world_id AND c.promotion_id=owned.promotion_id
        AND c.status='SIGNED' AND person.status='ACTIVE'
        AND c.start_week_index<=((w.year-1)*52+w.week-1)
        AND c.expires_week_index>=((w.year-1)*52+w.week-1)
        AND ((c.family='LIMITED_NON_EXCLUSIVE' AND c.remaining_dates=0)
          OR c.expires_week_index<=((w.year-1)*52+w.week+1))
       ORDER BY priority,c.expires_week_index,c.contract_id LIMIT 5
      ) relevant
     ) AS contract_alerts,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id','title-reign:'||recent.reign_id,
       'championshipId',recent.championship_id,'titleName',recent.title_name,
       'winnerName',recent.winner_name,'holderType',recent.holder_type,
       'personId',recent.person_id,'year',recent.year,'week',recent.week)
       ORDER BY recent.year DESC,recent.week DESC,recent.reign_id DESC),'[]'::jsonb)
      FROM (
       SELECT reign.reign_id,contest.championship_id,title.name AS title_name,
        coalesce(person.name,team.name) AS winner_name,
        reign.holder_type,reign.person_id,show.year,show.week
       FROM ppw_championship_contests contest
       JOIN ppw_completed_shows show ON show.world_id=contest.world_id
        AND show.show_id=contest.show_id
        AND show.promotion_id=contest.promotion_id
       JOIN ppw_championships title ON title.world_id=contest.world_id
        AND title.promotion_id=contest.promotion_id
        AND title.championship_id=contest.championship_id
       JOIN ppw_championship_reigns reign ON reign.world_id=contest.world_id
        AND reign.promotion_id=contest.promotion_id
        AND reign.championship_id=contest.championship_id
        AND reign.reign_id=contest.show_id||':'||contest.slot_id||
         CASE title.division WHEN 'TAG' THEN ':tag-reign' ELSE ':new-reign' END
       LEFT JOIN ppw_people person ON person.world_id=reign.world_id
        AND person.person_id=reign.person_id
       LEFT JOIN ppw_tag_teams team ON team.world_id=reign.world_id
        AND team.team_id=reign.team_id
       WHERE contest.world_id=w.world_id
        AND contest.promotion_id=owned.promotion_id
        AND contest.title_changed
        AND coalesce(person.name,team.name) IS NOT NULL
        AND length(reign.reign_id)<=200
        AND (show.year-1)*52+show.week-1 BETWEEN
         greatest(0,(w.year-1)*52+w.week-1-11)
         AND (w.year-1)*52+w.week-1
        AND NOT EXISTS(SELECT 1 FROM ppw_player_attention_dismissals dismissal
          WHERE dismissal.world_id=contest.world_id
           AND dismissal.player_id=$2 AND dismissal.promotion_id=owned.promotion_id
           AND dismissal.attention_id='title-reign:'||reign.reign_id)
       ORDER BY show.year DESC,show.week DESC,reign.reign_id DESC LIMIT 5
      ) recent
     ) AS title_news,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',inc.id,'personId',inc.person_id,'name',inc.name,
      'severity',inc.injury_severity,'originalWeeksOut',inc.injury_weeks_out,
      'year',inc.year,'week',inc.week)
      ORDER BY inc.year DESC,inc.week DESC,inc.id DESC),'[]'::jsonb)
      FROM (
       SELECT 'injury-report:'||
         md5(jsonb_build_array(done.show_id,e.match_id,e.person_id)::text) AS id,
        e.person_id,person.name,e.injury_severity,e.injury_weeks_out,
        done.year,done.week
       FROM ppw_completed_shows done
       JOIN LATERAL (
        SELECT s.match_id,s.person_id,s.injury_severity,s.injury_weeks_out
        FROM ppw_individual_field_career_effects s
        WHERE s.world_id=done.world_id AND s.show_id=done.show_id
         AND s.injury_severity IS NOT NULL
        UNION ALL
        SELECT t.match_id,t.person_id,t.injury_severity,t.injury_weeks_out
        FROM ppw_tag_match_career_effects t
        WHERE t.world_id=done.world_id AND t.show_id=done.show_id
         AND t.injury_severity IS NOT NULL
         UNION
         SELECT f.match_id,inj.person_id,inj.injury_severity,inj.injury_weeks_out
         FROM ppw_completed_match_report_facts f
         CROSS JOIN LATERAL jsonb_to_recordset(f.injuries_json)
          AS inj(person_id text,injury_severity text,injury_weeks_out integer)
         WHERE f.world_id=done.world_id AND f.show_id=done.show_id
          AND inj.injury_severity IS NOT NULL
       ) e ON TRUE
       JOIN ppw_people person ON person.world_id=done.world_id
        AND person.person_id=e.person_id AND person.status<>'RETIRED'
       WHERE done.world_id=w.world_id
        AND done.year BETWEEN greatest(1,w.year-1) AND w.year
        AND (done.year-1)*52+done.week-1 BETWEEN
          greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1
        AND EXISTS (SELECT 1 FROM ppw_contracts contract
         WHERE contract.world_id=done.world_id
          AND contract.person_id=e.person_id
          AND contract.promotion_id=owned.promotion_id
          AND contract.status='SIGNED'
          AND contract.start_week_index<=(w.year-1)*52+w.week-1
          AND contract.expires_week_index>=(w.year-1)*52+w.week-1)
        AND NOT EXISTS (SELECT 1 FROM ppw_player_attention_dismissals d
         WHERE d.world_id=done.world_id AND d.player_id=$2
          AND d.promotion_id=owned.promotion_id
          AND d.attention_id='injury-report:'||
            md5(jsonb_build_array(done.show_id,e.match_id,e.person_id)::text))
       ORDER BY done.year DESC,done.week DESC,done.show_id DESC,e.match_id DESC
       LIMIT 5
      ) inc
     ) AS injury_news,
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',notice.id,'personId',notice.person_id,'name',notice.name,
      'severity',notice.severity,'year',notice.year,'week',notice.week)
      ORDER BY notice.event_id DESC,notice.person_id),'[]'::jsonb)
      FROM (
       SELECT e.event_id,'medical-clearance:'||e.event_id::text||':'||
        md5(p."personId") AS id,
        p."personId" AS person_id,p.severity,person.name,e.year,e.week
       FROM ppw_ledger_events e
       CROSS JOIN LATERAL jsonb_to_recordset(e.payload->'people')
        AS p("personId" text,severity text,"weeksOut" integer)
       JOIN ppw_people person ON person.world_id=e.world_id
        AND person.person_id=p."personId" AND person.status='ACTIVE'
       WHERE e.world_id=w.world_id AND e.event_type='WRESTLER_CLEARED_TO_RETURN'
        AND p.severity IN ('MINOR','MODERATE','MAJOR','SEVERE')
        AND (e.year-1)*52+e.week-1 BETWEEN
         greatest(0,(w.year-1)*52+w.week-1-7) AND (w.year-1)*52+w.week-1
        AND EXISTS(SELECT 1 FROM ppw_contracts contract
         WHERE contract.world_id=e.world_id AND contract.person_id=p."personId"
          AND contract.promotion_id=owned.promotion_id AND contract.status='SIGNED'
          AND contract.start_week_index<=(w.year-1)*52+w.week-1
          AND contract.expires_week_index>=(w.year-1)*52+w.week-1)
        AND NOT EXISTS(SELECT 1 FROM ppw_player_attention_dismissals d
         WHERE d.world_id=e.world_id AND d.player_id=$2
          AND d.promotion_id=owned.promotion_id
          AND d.attention_id='medical-clearance:'||e.event_id::text||':'||
           md5(p."personId"))
       ORDER BY e.event_id DESC,p."personId" LIMIT 5
      ) notice
     ) AS medical_clearances
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
       (news.status==="FULFILLED"||news.status==="BROKEN")):[],
     injuryNews:Array.isArray(x.injury_news)?
      x.injury_news.filter((item):item is {
       id:string;personId:string;name:string;
       severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
       originalWeeksOut:number;year:number;week:number
      }=>item!==null&&typeof item==="object"&&
       typeof item.id==="string"&&/^injury-report:[0-9a-f]{32}$/.test(item.id)&&
       typeof item.personId==="string"&&typeof item.name==="string"&&
       (item.severity==="MINOR"||item.severity==="MODERATE"||
        item.severity==="MAJOR"||item.severity==="SEVERE")&&
       Number.isInteger(item.originalWeeksOut)&&item.originalWeeksOut>=1&&
       item.originalWeeksOut<=52&&Number.isInteger(item.year)&&
       Number.isInteger(item.week)&&item.week>=1&&item.week<=52):[],
     medicalClearances:Array.isArray(x.medical_clearances)?
      x.medical_clearances.filter((item):item is {
       id:string;personId:string;name:string;
       severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";year:number;week:number
      }=>item!==null&&typeof item==="object"&&
       typeof item.id==="string"&&
       /^medical-clearance:[1-9][0-9]{0,18}:[0-9a-f]{32}$/.test(item.id)&&
       typeof item.personId==="string"&&typeof item.name==="string"&&
       ["MINOR","MODERATE","MAJOR","SEVERE"].includes(item.severity)&&
       Number.isInteger(item.year)&&Number.isInteger(item.week)&&
       item.week>=1&&item.week<=52):[],
     titleNews:Array.isArray(x.title_news)?
      x.title_news.filter((item):item is {
       id:string;championshipId:string;titleName:string;
       winnerName:string;holderType:"PERSON"|"TEAM";personId:string|null;
       year:number;week:number
      }=>item!==null&&typeof item==="object"&&
       typeof item.id==="string"&&item.id.startsWith("title-reign:")&&
       item.id.length<=212&&
       typeof item.championshipId==="string"&&typeof item.titleName==="string"&&
       typeof item.winnerName==="string"&&
       (item.holderType==="PERSON"||item.holderType==="TEAM")&&
       (item.personId===null||typeof item.personId==="string")&&
       Number.isInteger(item.year)&&Number.isInteger(item.week)&&
       item.week>=1&&item.week<=52):[],
     contractAlerts:Array.isArray(x.contract_alerts)?
      x.contract_alerts.filter((alert):alert is {
       contractId:string;personId:string;name:string;
       kind:"DATES_EXHAUSTED"|"EXPIRING";weeksRemaining:number;waiting:boolean
      }=>alert!==null&&typeof alert==="object"&&
       typeof alert.contractId==="string"&&typeof alert.personId==="string"&&
       typeof alert.name==="string"&&
       (alert.kind==="DATES_EXHAUSTED"||alert.kind==="EXPIRING")&&
       Number.isInteger(alert.weeksRemaining)&&alert.weeksRemaining>=0&&
       typeof alert.waiting==="boolean"):[],
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
