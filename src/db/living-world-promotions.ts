/** Original main lifecycle.ts/growth.ts on the transactional relational World.
 * Human promotions are NEVER deactivated or taken from controllers. The
 * rebuilt World Lock currently requires lifecycle='ACTIVE' for playable cards:
 * preserve that even when a company is financially distressed.
 */
import type {SqlRows} from "./world-operations.js";
import {originalSurvivalCounters,originalAnnualTier,
 originalPromotionScaleScore,ORIGINAL_ROSTER_TARGET,
 type PromotionTier} from "../domain/living-career.js";
type Distress="HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";
type SurvivalRow={promotion_id:string;tier:PromotionTier;lifecycle:string;
 management_mode:string;human_controlled:boolean;cash:string|number;
 weekly_fixed_overhead:string|number|null;event_cadence_weeks:number|null;
 financial_distress:Distress|null;roster_count:number;
 baseline_weekly_fixed_overhead:string|number;
 baseline_event_cadence_weeks:number;stress_weeks:number;
 crisis_weeks:number;understaffed_weeks:number;healthy_weeks:number;
 restructuring_count:number;last_restructure_week_index:number|null;
};
export async function settleLivingPromotionSurvival(
 tx:SqlRows,worldId:string,year:number,week:number){
 const idx=(year-1)*52+week-1;
 if(!worldId||!Number.isSafeInteger(idx)||idx<0||week<1||week>52)
  throw new Error("Invalid promotion survival World");
 if(idx%4!==0)return {evaluated:0,restructured:0,dormant:0,recovered:0};
 await tx.query(`
 INSERT INTO ppw_promotion_survival(world_id,promotion_id,
  baseline_weekly_fixed_overhead,baseline_event_cadence_weeks)
 SELECT p.world_id,p.promotion_id,p.weekly_fixed_overhead,p.event_cadence_weeks
 FROM ppw_promotions p
 WHERE p.world_id=$1 AND p.weekly_fixed_overhead IS NOT NULL
  AND p.event_cadence_weeks IS NOT NULL
 ON CONFLICT DO NOTHING`,[worldId]);
 const rows=await tx.query<SurvivalRow>(`
 SELECT p.promotion_id,p.tier,p.lifecycle,p.management_mode,p.cash,
  p.weekly_fixed_overhead,p.event_cadence_weeks,p.financial_distress,
  EXISTS(SELECT 1 FROM ppw_promotion_controls control
   WHERE control.world_id=p.world_id AND control.promotion_id=p.promotion_id
    AND control.active) AS human_controlled,
  (SELECT count(DISTINCT c.person_id)::integer FROM ppw_contracts c
   JOIN ppw_people person ON person.world_id=c.world_id
    AND person.person_id=c.person_id AND person.status<>'RETIRED'
   WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
    AND c.status='SIGNED' AND c.start_week_index<=$2
    AND c.expires_week_index>=$2) AS roster_count,
  s.baseline_weekly_fixed_overhead,s.baseline_event_cadence_weeks,
  s.stress_weeks,s.crisis_weeks,s.understaffed_weeks,
  s.healthy_weeks,s.restructuring_count,s.last_restructure_week_index
 FROM ppw_promotion_survival s JOIN ppw_promotions p
  ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id
 WHERE p.world_id=$1 AND p.lifecycle NOT IN ('CLOSED','DORMANT')
 ORDER BY p.promotion_id LIMIT 129`,[worldId,idx]);
 if(rows.length>128)throw new Error("Promotion survival capacity exceeded");
 const changes=rows.flatMap(p=>{
  if(!p.financial_distress||!(p.tier in ORIGINAL_ROSTER_TARGET))return [];
  const minimum=Math.max(6,Math.ceil(ORIGINAL_ROSTER_TARGET[p.tier]*.35));
  const counters=originalSurvivalCounters({...p,distress:p.financial_distress,
   minimumRoster:minimum,rosterCount:p.roster_count,interval:4});
  const stress=counters.stressWeeks>=8;
  const due=stress&&(p.last_restructure_week_index===null||
   idx-p.last_restructure_week_index>=12);
  const ai=p.management_mode==="AI"&&!p.human_controlled;
  const restructure=ai&&due;
  const recovered=counters.healthyWeeks>=8&&p.restructuring_count>0;
  // Original has threshold 24 crisis and 12 insufficient staff. Human
  // managers retain their promotions; AI dormancy only after cash exhaustion.
  const dormant=ai&&p.financial_distress==="CRISIS"&&Number(p.cash)<=0&&
   counters.crisisWeeks>=24&&counters.understaffedWeeks>=12&&p.roster_count<6;
  return [{promotion_id:p.promotion_id,...counters,priorRestructures:p.restructuring_count,
   baseline:Number(p.baseline_weekly_fixed_overhead),
   cadence:p.baseline_event_cadence_weeks,crisis:p.financial_distress==="CRISIS",
   restructure:restructure&&!dormant,rawRestructure:restructure,
   dormant,recovered,rosterCount:p.roster_count,minimum}];
 });
 if(!changes.length)return {evaluated:0,restructured:0,dormant:0,recovered:0};
 const saved=await tx.query<{promotion_id:string}>(`
 UPDATE ppw_promotion_survival s SET
  healthy_weeks=x.healthy_weeks,stress_weeks=x.stress_weeks,
  crisis_weeks=x.crisis_weeks,understaffed_weeks=x.understaffed_weeks,
  restructuring_count=s.restructuring_count+
   CASE WHEN x.restructure THEN 1 ELSE 0 END,
  last_restructure_week_index=CASE WHEN x.restructure THEN $3
   ELSE s.last_restructure_week_index END,
  dormant_since_week_index=CASE WHEN x.dormant THEN $3
   ELSE s.dormant_since_week_index END
 FROM jsonb_to_recordset($2::jsonb) x(
  promotion_id text,healthy_weeks integer,stress_weeks integer,
  crisis_weeks integer,understaffed_weeks integer,restructure boolean,dormant boolean)
 WHERE s.world_id=$1 AND s.promotion_id=x.promotion_id
 RETURNING s.promotion_id`,[worldId,JSON.stringify(changes),idx]);
 if(saved.length!==changes.length)throw new Error("Promotion survival counters incomplete");
 const restructured=changes.filter(x=>x.restructure);
 if(restructured.length){
  await tx.query(`
   UPDATE ppw_promotions p SET
    weekly_fixed_overhead=greatest(1,round(x.baseline*
     CASE WHEN x.crisis THEN .68 ELSE .84 END)::bigint),
    event_cadence_weeks=least(4,x.cadence+1)
   FROM jsonb_to_recordset($2::jsonb) x(
    promotion_id text,baseline bigint,crisis boolean,cadence integer)
   WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id
    AND p.management_mode='AI' AND p.lifecycle='ACTIVE'
    AND NOT EXISTS(SELECT 1 FROM ppw_promotion_controls control
     WHERE control.world_id=p.world_id AND control.promotion_id=p.promotion_id
      AND control.active)`,[worldId,JSON.stringify(restructured)]);
  // Original release expensive-first, never below minimum viable roster.
  // Capped at two contracts per promotion per evaluation.
  const releases=await tx.query<{promotion_id:string;person_id:string;
   contract_id:string;weekly_guarantee:string|number;crisis:boolean}>(`
   WITH candidates AS (
    SELECT c.promotion_id,c.person_id,c.contract_id,c.weekly_guarantee,
     x.crisis,row_number() OVER(PARTITION BY c.promotion_id
      ORDER BY c.weekly_guarantee DESC,c.appearance_fee DESC,c.contract_id) AS rank,
     x.roster_count,x.minimum
    FROM ppw_contracts c
    JOIN jsonb_to_recordset($2::jsonb) x(promotion_id text,
     crisis boolean,roster_count integer,minimum integer)
     ON x.promotion_id=c.promotion_id
    WHERE c.world_id=$1 AND c.status='SIGNED'
     AND c.family<>'ONE_OFF' AND c.start_week_index<=$3
     AND c.expires_week_index>=$3
   )
   SELECT promotion_id,person_id,contract_id,weekly_guarantee::text,crisis
   FROM candidates WHERE rank<=least(2,greatest(0,roster_count-minimum))
   ORDER BY promotion_id,rank`,[worldId,JSON.stringify(restructured),idx]);
  if(releases.length){
   const people=new Set<string>();
   // Multiple contracts of one wrestler to one company should not count twice.
   const ordered=releases.filter(x=>{
    const k=x.promotion_id+"|"+x.person_id;
    if(people.has(k))return false;
    people.add(k);return true;
   });
   const done=await tx.query<{contract_id:string}>(`
    UPDATE ppw_contracts c SET status='TERMINATED',revision=revision+1
    FROM jsonb_to_recordset($2::jsonb) x(contract_id text)
    WHERE c.world_id=$1 AND c.contract_id=x.contract_id
     AND c.status='SIGNED' RETURNING c.contract_id`,[
    worldId,JSON.stringify(ordered)]);
   if(done.length!==ordered.length)throw new Error("AI cutbacks conflicted with talent contracts");
   const settlements=ordered.map(x=>({
    ...x,payment:Number(x.weekly_guarantee)*(x.crisis?1:2)}));
   await tx.query(`
    UPDATE ppw_promotions p SET cash=cash-bill.amount,
     last_weekly_net=coalesce(last_weekly_net,0)-bill.amount
    FROM (SELECT promotion_id,sum(payment)::bigint AS amount
     FROM jsonb_to_recordset($2::jsonb) x(promotion_id text,payment bigint)
     GROUP BY promotion_id) bill
    WHERE p.world_id=$1 AND p.promotion_id=bill.promotion_id`,
    [worldId,JSON.stringify(settlements)]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    SELECT $1,$3,$4,'CONTRACT_TERMINATED_DURING_RESTRUCTURING',
     jsonb_build_object('promotionId',x.promotion_id,'personId',x.person_id,
      'contractId',x.contract_id,'settlement',x.payment)
    FROM jsonb_to_recordset($2::jsonb) x(
     promotion_id text,person_id text,contract_id text,payment bigint)`,
    [worldId,JSON.stringify(settlements),year,week]);
  }
  await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'PROMOTION_RESTRUCTURED',
    jsonb_build_object('promotionId',x.promotion_id,
     'overhead',greatest(1,round(x.baseline*
      CASE WHEN x.crisis THEN .68 ELSE .84 END)::bigint),
     'cadenceWeeks',least(4,x.cadence+1),
     'restructuringCount',x.prior_restructures+1,'significance',
     CASE WHEN x.crisis THEN 'MAJOR' ELSE 'NOTABLE' END)
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text,
    baseline bigint,crisis boolean,cadence integer,prior_restructures integer)`,
   [worldId,JSON.stringify(restructured),year,week]);
 }
 const recovered=changes.filter(x=>x.recovered&&!x.restructure);
 if(recovered.length){
  await tx.query(`UPDATE ppw_promotions p SET
   weekly_fixed_overhead=x.baseline,event_cadence_weeks=x.cadence
   FROM jsonb_to_recordset($2::jsonb) x(
    promotion_id text,baseline bigint,cadence integer)
   WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id
    AND p.lifecycle='ACTIVE'`,[worldId,JSON.stringify(recovered)]);
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'PROMOTION_RECOVERED_FROM_DISTRESS',
    jsonb_build_object('promotionId',x.promotion_id,'significance','NOTABLE')
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text)`,
  [worldId,JSON.stringify(recovered),year,week]);
 }
 const dormant=changes.filter(x=>x.dormant);
 if(dormant.length){
  // AI only: no active human controller may lose a company automatically.
  await tx.query(`UPDATE ppw_promotions p SET lifecycle='DORMANT',
   weekly_fixed_overhead=0
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text)
   WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id
    AND p.management_mode='AI' AND p.lifecycle='ACTIVE'
    AND NOT EXISTS(SELECT 1 FROM ppw_promotion_controls control
     WHERE control.world_id=p.world_id AND control.promotion_id=p.promotion_id
      AND control.active)`,[worldId,JSON.stringify(dormant)]);
  await tx.query(`UPDATE ppw_contracts c SET status='TERMINATED',revision=revision+1
   WHERE c.world_id=$1 AND c.status='SIGNED'
    AND c.promotion_id=ANY($2::text[])`,[worldId,dormant.map(x=>x.promotion_id)]);
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'PROMOTION_ENTERED_DORMANCY',
    jsonb_build_object('promotionId',x.promotion_id,'significance','MAJOR')
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text)`,
   [worldId,JSON.stringify(dormant),year,week]);
 }
 return {evaluated:changes.length,restructured:restructured.length,
  dormant:dormant.length,recovered:recovered.length};
}
type AnnualRow={promotion_id:string;tier:PromotionTier;financial_distress:Distress;
 media_reach:number;markets:unknown;show_performance:string|number|null;
 completed:number};
export async function settleAnnualPromotionScale(
 tx:SqlRows,worldId:string,year:number,week:number){
 if(week!==52)return {evaluated:0,changed:0};
 const first=(year-1)*52;
 const rows=await tx.query<AnnualRow>(`
 WITH locals AS (
  SELECT s.promotion_id,jsonb_agg(jsonb_build_object(
   'liveStrength',s.live_strength,'awareness',s.awareness,
   'loyalty',s.loyalty) ORDER BY s.market_id) AS markets
  FROM ppw_promotion_market_states s WHERE s.world_id=$1
  GROUP BY s.promotion_id
 ), events AS (
  SELECT completed.promotion_id,count(*)::integer AS completed,
   avg(completed.crowd_response*.55+
    least(100,greatest(0,eco.attendance::double precision/
     greatest(1,eco.expected_demand)*75))*.45) AS show_performance
  FROM ppw_completed_shows completed
  JOIN ppw_show_economics eco ON eco.world_id=completed.world_id
   AND eco.show_id=completed.show_id
  WHERE completed.world_id=$1 AND (completed.year,completed.week)
   BETWEEN ($2::integer,1) AND ($2::integer,52)
  GROUP BY completed.promotion_id
 )
 SELECT p.promotion_id,p.tier,p.financial_distress,p.media_reach,
  locals.markets,events.show_performance,coalesce(events.completed,0) AS completed
 FROM ppw_promotions p LEFT JOIN locals ON locals.promotion_id=p.promotion_id
 LEFT JOIN events ON events.promotion_id=p.promotion_id
 WHERE p.world_id=$1 AND p.lifecycle NOT IN ('DORMANT','CLOSED')
 ORDER BY p.promotion_id LIMIT 129`,[worldId,year]);
 if(rows.length>128)throw new Error("Annual promotion scale capacity exceeded");
 const eligible=rows.flatMap(x=>{
  if(!x.financial_distress||x.media_reach===null||!x.markets||
   (x.completed>0&&x.show_performance===null))return [];
  const local=x.markets as {liveStrength:number;awareness:number;loyalty:number}[];
  if(!Array.isArray(local)||local.length>128||
   !local.every(m=>[m.liveStrength,m.awareness,m.loyalty].every(Number.isFinite)))
   throw new Error("Annual company lacks verified local market evidence");
  const performance=x.completed>0?Number(x.show_performance):45;
  const score=originalPromotionScaleScore({localMarkets:local,
   showPerformance:performance,mediaReach:x.media_reach,
   financialDistress:x.financial_distress});
  const next=originalAnnualTier(x.tier,score);
  return [{promotion_id:x.promotion_id,from_tier:x.tier,to_tier:next,
   score,cadence:{GLOBAL:1,NATIONAL:1,RISING:2,INDEPENDENT:2,LOCAL:3}[next]}];
 });
 const changed=eligible.filter(x=>x.from_tier!==x.to_tier);
 if(changed.length){
  // Tier modifies all companies' scale, but never steals a human manager's
  // chosen calendar cadence or overrides authored weekly cards.
  await tx.query(`
   UPDATE ppw_promotions p SET tier=x.to_tier,
    event_cadence_weeks=CASE WHEN p.management_mode='AI' AND
     NOT EXISTS(SELECT 1 FROM ppw_promotion_controls c
      WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
       AND c.active) THEN x.cadence ELSE p.event_cadence_weeks END
   FROM jsonb_to_recordset($2::jsonb) x(
    promotion_id text,to_tier text,cadence integer)
   WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id
    AND p.tier<>x.to_tier`,[worldId,JSON.stringify(changed)]);
  await tx.query(`
   UPDATE ppw_promotion_survival s SET baseline_event_cadence_weeks=x.cadence
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text,cadence integer)
   WHERE s.world_id=$1 AND s.promotion_id=x.promotion_id`,
  [worldId,JSON.stringify(changed)]);
  await tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$3,$4,'PROMOTION_TIER_CHANGED',
    jsonb_build_object('promotionId',x.promotion_id,'fromTier',x.from_tier,
     'toTier',x.to_tier,'scaleScore',x.score,
     'normalCadenceWeeks',x.cadence,'significance','NOTABLE')
   FROM jsonb_to_recordset($2::jsonb) x(promotion_id text,from_tier text,
    to_tier text,score double precision,cadence integer)`,
   [worldId,JSON.stringify(changed),year,week]);
 }
 return {evaluated:eligible.length,changed:changed.length};
}
