/** Phase 6 commercial deals: one World clock, existing finance projection.
 * Offers are generated from completed show evidence, never from a client price.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import {commercialOffers,type CommercialKind,type CommercialEvidence}
 from "../domain/commercial-offers.js";

export type CommercialDeal={
 dealId:string;kind:CommercialKind;offerCode:string;
 weeklyIncome:number;baselineIncome:number;reachIncrease:number;
 startWeekIndex:number;endWeekIndex:number;source:"HUMAN"|"AI";
};
export interface CommercialSignature{
 worldId:string;promotionId:string;playerId:string;
 requestId:string;expectedRevision:number;offerCode:string;
}
export async function signCommercialDeal(pool:TransactionPool,input:CommercialSignature){
 if(![input.worldId,input.promotionId,input.playerId,input.offerCode].every(
  x=>typeof x==="string"&&x.length>0&&x.length<=200))
  throw new Error("Invalid commercial request");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"SIGN_COMMERCIAL_DEAL",requiresOpenWeek:true,
  execute:async tx=>{
   const rows=await tx.query<CommercialEvidence&{year:number;week:number;
    management_mode:string;existing_kinds:string[]}>(`
    SELECT w.year,w.week,p.management_mode,p.tier,p.media_reach AS "mediaReach",
     p.weekly_media_income::numeric::float8 AS "weeklyMediaIncome",
     p.weekly_sponsor_income::numeric::float8 AS "weeklySponsorIncome",
     coalesce(results.completed,0)::integer AS "completedShows",
     results.crowd::float8 AS "averageCrowd",
     ARRAY(SELECT d.kind FROM ppw_commercial_deals d
      WHERE d.world_id=w.world_id AND d.promotion_id=p.promotion_id
       AND d.status='ACTIVE') AS existing_kinds
    FROM ppw_worlds w JOIN ppw_promotion_controls c
     ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
    JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id
     AND m.status='ACTIVE'
    JOIN ppw_promotions p ON p.world_id=w.world_id
     AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
    LEFT JOIN LATERAL (
     SELECT count(*)::integer AS completed,avg(r.crowd_response) AS crowd
     FROM (SELECT r.year,r.week,r.crowd_response FROM ppw_completed_shows r
      JOIN ppw_show_economics econ ON econ.world_id=r.world_id
       AND econ.show_id=r.show_id AND econ.promotion_id=r.promotion_id
      JOIN ppw_booking_drafts draft ON draft.world_id=r.world_id
       AND draft.draft_id=r.show_id AND draft.status='SUBMITTED'
      WHERE r.world_id=w.world_id AND r.promotion_id=p.promotion_id
      ORDER BY r.year DESC,r.week DESC,r.show_id DESC LIMIT 12) r
     WHERE (r.year-1)*52+r.week-1>=
      greatest(0,(w.year-1)*52+w.week-26)
    ) results ON TRUE
    WHERE w.world_id=$1
   `,[input.worldId,input.playerId,input.promotionId]);
   if(rows.length!==1)throw new Error("Only your promotion can sign a commercial deal");
   const p=rows[0]!,start=(p.year-1)*52+p.week-1;
   // An active agreement prevents speculative replacement/compound upgrades.
   const valid=commercialOffers(p).find(x=>x.code===input.offerCode);
   if(!valid)throw new Error("This commercial offer is no longer available");
   if(p.existing_kinds.includes(valid.kind))
    throw new Error("A current agreement must expire before new terms are available");
   const baselineIncome=valid.kind==="BROADCAST"?
    p.weeklyMediaIncome!:p.weeklySponsorIncome!;
   const baselineReach=valid.kind==="BROADCAST"?
    Math.min(100,p.mediaReach!):null;
   const agreedReach=valid.kind==="BROADCAST"?
    Math.min(100,baselineReach!+valid.reachIncrease):null;
   const dealId="commercial-"+randomUUID();
   await tx.query(`
    INSERT INTO ppw_commercial_deals(world_id,deal_id,promotion_id,kind,
     offer_code,status,baseline_income,agreed_income,baseline_reach,
     agreed_reach,start_week_index,end_week_index,source)
    VALUES($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9,$10,$11,'HUMAN')
   `,[input.worldId,dealId,input.promotionId,valid.kind,valid.code,
    baselineIncome,valid.weeklyIncome,baselineReach,agreedReach,start,
    start+valid.termWeeks-1]);
   await tx.query(`
    UPDATE ppw_promotions SET
     weekly_media_income=CASE WHEN $3='BROADCAST' THEN $4
      ELSE weekly_media_income END,
     weekly_sponsor_income=CASE WHEN $3='SPONSOR' THEN $4
      ELSE weekly_sponsor_income END,
     media_reach=CASE WHEN $3='BROADCAST' THEN $5 ELSE media_reach END
    WHERE world_id=$1 AND promotion_id=$2
   `,[input.worldId,input.promotionId,valid.kind,valid.weeklyIncome,agreedReach]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'COMMERCIAL_DEAL_SIGNED',
     jsonb_build_object('promotionId',$4::text,'kind',$5::text,
      'dealId',$6::text,'income',$7::bigint,'termWeeks',$8::integer))
   `,[input.worldId,p.year,p.week,input.promotionId,valid.kind,dealId,
    valid.weeklyIncome,valid.termWeeks]);
   return {accepted:true,dealId,kind:valid.kind,offerCode:valid.code,
    weeklyIncome:valid.weeklyIncome,reachIncrease:valid.reachIncrease,
    endWeekIndex:start+valid.termWeeks-1};
  }});
}
