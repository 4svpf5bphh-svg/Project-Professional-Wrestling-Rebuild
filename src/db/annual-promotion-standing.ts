/** Original main's reputation.ts annual evaluation against relational,
 * bounded, verified World facts. Run only on week 52 inside the existing
 * certified single World rollover transaction, before contract expiry.
 * No player polling, per-wrestler reads or historical World snapshots.
 */
import type {SqlRows} from "./world-operations.js";
import {evaluateAnnualStanding,type StandingTier,type Distress,
 type StandingEvidence} from "../domain/annual-promotion-standing.js";

type Row={
 promotion_id:string;tier:StandingTier;lifecycle:string;
 financial_distress:Distress|null;media_reach:number|null;
 prestige:number;fan_reputation:number;business_reputation:number;
 talent_reputation:number;last_evaluated_year:number;
 completed:number;cancelled:number;mean_crowd:number|null;
 mean_demand:number|null;major_count:number;major_score:number|null;
 top_five_loyalty:number|null;championship_prestige:number|null;
 roster_count:number;roster_used:number;missing_appearances:number;
 renewal_accepted:number;renewal_rejected:number;
 restructures:number;terminations:number;
};

const round1=(n:number)=>Math.round(n*10)/10;
export async function evaluateYearEndPromotionStandings(
 tx:SqlRows,worldId:string,year:number,week:number
):Promise<{evaluated:number;unverifiable:number}>{
 if(week!==52)return {evaluated:0,unverifiable:0};
 if(!Number.isSafeInteger(year)||year<1||year>100000)
  throw new Error("Invalid annual company evaluation year");
 // All lateral reads are World/promotion scoped. They transfer one compact
 // row per company; never send the 52 weeks of cards or matches to Node.
 const evidence=await tx.query<Row>(`
  SELECT p.promotion_id,p.tier,p.lifecycle,p.financial_distress,
   p.media_reach,s.prestige,s.fan_reputation,s.business_reputation,
   s.talent_reputation,s.last_evaluated_year,
   ev.completed,ev.cancelled,ev.mean_crowd,ev.mean_demand,
   ev.major_count,ev.major_score,
   loyalty.top_five_loyalty,titles.championship_prestige,
   roster.roster_count,used.roster_used,missing.missing_appearances,
   renewals.renewal_accepted,renewals.renewal_rejected,
   penalties.restructures,penalties.terminations
  FROM ppw_promotion_standings s
  JOIN ppw_promotions p ON p.world_id=s.world_id
   AND p.promotion_id=s.promotion_id
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(WHERE cs.show_id IS NOT NULL)::integer AS completed,
    count(*) FILTER(WHERE d.status='CANCELLED')::integer AS cancelled,
    avg(cs.crowd_response)::double precision AS mean_crowd,
    avg(LEAST(105.0, 100.0*eco.attendance/
      greatest(1,least(eco.expected_demand,
       coalesce(v.capacity,eco.expected_demand)))))
       ::double precision AS mean_demand,
    count(*) FILTER (WHERE cs.show_id IS NOT NULL AND
      (d.event_type='MAJOR' OR (d.event_type IS NULL
       AND d.booking_class='PREMIUM')))::integer AS major_count,
    avg(CASE WHEN d.event_type='MAJOR' OR
      (d.event_type IS NULL AND d.booking_class='PREMIUM')
      THEN cs.crowd_response*.6+
       least(100.0,greatest(0.0,(eco.average_match_rating-1.0)/4.0*100.0))*.4
      END)::double precision AS major_score
   FROM ppw_booking_drafts d
   LEFT JOIN ppw_completed_shows cs ON cs.world_id=d.world_id
     AND cs.show_id=d.draft_id AND cs.promotion_id=d.promotion_id
     AND cs.year=d.year AND cs.week=d.week
   LEFT JOIN ppw_show_economics eco ON eco.world_id=cs.world_id
     AND eco.show_id=cs.show_id
   LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
   WHERE d.world_id=p.world_id AND d.promotion_id=p.promotion_id
    AND d.year=$2 AND (cs.show_id IS NOT NULL OR d.status='CANCELLED')
  ) ev ON true
  LEFT JOIN LATERAL (
   SELECT avg(t.loyalty)::double precision AS top_five_loyalty
   FROM (SELECT m.loyalty FROM ppw_promotion_market_states m
    WHERE m.world_id=p.world_id AND m.promotion_id=p.promotion_id
    ORDER BY m.loyalty DESC LIMIT 5) t
  ) loyalty ON true
  LEFT JOIN LATERAL (
   SELECT avg(c.prestige)::double precision AS championship_prestige
   FROM ppw_championships c
   WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
  ) titles ON true
  LEFT JOIN LATERAL (
   SELECT count(DISTINCT c.person_id)::integer AS roster_count
   FROM ppw_contracts c JOIN ppw_people person ON person.world_id=c.world_id
     AND person.person_id=c.person_id AND person.status<>'RETIRED'
   WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
    AND c.status='SIGNED' AND c.start_week_index<=($2-1)*52+51
    AND c.expires_week_index>=($2-1)*52+51
  ) roster ON true
  LEFT JOIN LATERAL (
   SELECT count(DISTINCT use.person_id)::integer AS roster_used
   FROM ppw_show_resolutions resolution
   JOIN ppw_completed_shows done ON done.world_id=resolution.world_id
    AND done.show_id=resolution.show_id AND done.promotion_id=resolution.promotion_id
   CROSS JOIN LATERAL jsonb_array_elements_text(
    coalesce(resolution.appearance_person_ids,'[]'::jsonb)) AS use(person_id)
   WHERE resolution.world_id=p.world_id
    AND resolution.promotion_id=p.promotion_id
    AND resolution.resolved_week_index BETWEEN ($2-1)*52 AND ($2-1)*52+51
    AND EXISTS(SELECT 1 FROM ppw_contracts c
     JOIN ppw_people person ON person.world_id=c.world_id
      AND person.person_id=c.person_id AND person.status<>'RETIRED'
     WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
      AND c.person_id=use.person_id AND c.status='SIGNED'
      AND c.start_week_index<=($2-1)*52+51
      AND c.expires_week_index>=($2-1)*52+51)
  ) used ON true
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER (WHERE r.performers_count>0
    AND r.appearance_person_ids IS NULL)::integer AS missing_appearances
   FROM ppw_show_resolutions r
   JOIN ppw_completed_shows done ON done.world_id=r.world_id
    AND done.show_id=r.show_id AND done.promotion_id=r.promotion_id
   WHERE r.world_id=p.world_id AND r.promotion_id=p.promotion_id
    AND r.resolved_week_index BETWEEN ($2-1)*52 AND ($2-1)*52+51
  ) missing ON true
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(WHERE status IN ('ACCEPTED','ACTIVATED'))::integer
    AS renewal_accepted,
    count(*) FILTER(WHERE status='REJECTED')::integer AS renewal_rejected
   FROM ppw_contract_renewal_proposals proposals
   WHERE proposals.world_id=p.world_id AND proposals.promotion_id=p.promotion_id
    AND proposals.created_week_index BETWEEN ($2-1)*52 AND ($2-1)*52+51
  ) renewals ON true
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(WHERE e.event_type='PROMOTION_RESTRUCTURED')::integer
     AS restructures,
    count(*) FILTER(WHERE e.event_type='CONTRACT_TERMINATED_DURING_RESTRUCTURING')::integer
     AS terminations
   FROM ppw_ledger_events e
   WHERE e.world_id=p.world_id AND e.year=$2
    AND e.event_type IN ('PROMOTION_RESTRUCTURED','CONTRACT_TERMINATED_DURING_RESTRUCTURING')
    AND e.payload->>'promotionId'=p.promotion_id
  ) penalties ON true
  WHERE s.world_id=$1 AND s.last_evaluated_year<$2
  ORDER BY p.promotion_id LIMIT 129
 `,[worldId,year]);
 if(evidence.length>128)throw new Error("Annual promotion evaluation exceeds World bounds");
 const changes:{
  promotion_id:string;prestige:number;fan:number;business:number;talent:number;
  prestige_delta:number;fan_delta:number;business_delta:number;talent_delta:number
 }[]=[];
 let unverifiable=0;
 for(const row of evidence){
  // Non-Genesis historical fixtures can lack authentic finance or bookings.
  // Leave their standing untouched rather than manufacturing evidence.
  if(row.financial_distress===null||row.media_reach===null||
   (row.completed>0&&(row.mean_crowd===null||row.mean_demand===null))||
   (row.major_count>0&&row.major_score===null)||
   row.missing_appearances>0){
   unverifiable++;continue;
  }
  const input:StandingEvidence={
   tier:row.tier,lifecycle:row.lifecycle,distress:row.financial_distress,
   mediaReach:row.media_reach,completed:row.completed,cancelled:row.cancelled,
   meanCrowd:row.mean_crowd,meanDemand:row.mean_demand,
   topFiveLoyalty:row.top_five_loyalty,
   majorCount:row.major_count,majorScore:row.major_score===null?null:
    round1(row.major_score),
   championshipPrestige:row.championship_prestige===null?null:
    round1(row.championship_prestige),
   rosterCount:row.roster_count,rosterUsed:row.roster_used,
   renewalAccepted:row.renewal_accepted,renewalRejected:row.renewal_rejected,
   restructures:row.restructures,terminations:row.terminations
  };
  const old={prestige:row.prestige,fanReputation:row.fan_reputation,
   businessReputation:row.business_reputation,talentReputation:row.talent_reputation};
  const next=evaluateAnnualStanding(old,input);
  changes.push({promotion_id:row.promotion_id,prestige:next.prestige,
   fan:next.fanReputation,business:next.businessReputation,talent:next.talentReputation,
   prestige_delta:round1(next.prestige-old.prestige),
   fan_delta:round1(next.fanReputation-old.fanReputation),
   business_delta:round1(next.businessReputation-old.businessReputation),
   talent_delta:round1(next.talentReputation-old.talentReputation)});
 }
 if(!changes.length)return {evaluated:0,unverifiable};
 const result=await tx.query<{updated:number;receipts:number}>(`
  WITH changes AS (
   SELECT * FROM jsonb_to_recordset($3::jsonb) AS x(
    promotion_id text,prestige double precision,fan double precision,
    business double precision,talent double precision,
    prestige_delta double precision,fan_delta double precision,
    business_delta double precision,talent_delta double precision)
  ), updated AS (
   UPDATE ppw_promotion_standings s SET
    prestige=c.prestige,fan_reputation=c.fan,
    business_reputation=c.business,talent_reputation=c.talent,
    last_evaluated_year=$2
   FROM changes c
   WHERE s.world_id=$1 AND s.promotion_id=c.promotion_id
    AND s.last_evaluated_year<$2
   RETURNING s.promotion_id,s.prestige,s.fan_reputation,
    s.business_reputation,s.talent_reputation
  ), logged AS (
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$2,52,'PROMOTION_STANDING_UPDATED',
    jsonb_build_object('promotionId',u.promotion_id,
     'prestige',u.prestige,'fanReputation',u.fan_reputation,
     'businessReputation',u.business_reputation,
     'talentReputation',u.talent_reputation,
     'prestigeDelta',c.prestige_delta,'fanDelta',c.fan_delta,
     'businessDelta',c.business_delta,'talentDelta',c.talent_delta,
     'significance',CASE WHEN abs(c.prestige_delta)>=5 THEN 'NOTABLE'
      ELSE 'ROUTINE' END)
   FROM updated u JOIN changes c ON c.promotion_id=u.promotion_id
   RETURNING event_id
  )
  SELECT (SELECT count(*)::integer FROM updated) AS updated,
   (SELECT count(*)::integer FROM logged) AS receipts
 `,[worldId,year,JSON.stringify(changes)]);
 if(result.length!==1||result[0]!.updated!==changes.length||
  result[0]!.receipts!==changes.length)
  throw new Error("Annual company standings not fully settled");
 return {evaluated:changes.length,unverifiable};
}
