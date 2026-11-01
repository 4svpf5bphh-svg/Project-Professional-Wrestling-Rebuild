/** World-authoritative, opt-in spending allocations. No finance ledger writes. */
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {assessPromotionSpendingPlan,type PromotionSpendingPlan}
 from "../domain/promotion-spending-plan.js";
export interface SpendingPlanChange extends PromotionSpendingPlan{
 worldId:string;promotionId:string;playerId:string;requestId:string;
 expectedRevision:number;
}
export async function setPromotionSpendingPlan(pool:TransactionPool,input:SpendingPlanChange){
 assessPromotionSpendingPlan(input,{cash:0,weeklyGuarantees:0});
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"SET_SPENDING_PLAN",
  requiresOpenWeek:true,
  execute:async tx=>{
   const owners=await tx.query<{promotion_id:string}>(`
    SELECT p.promotion_id FROM ppw_promotions p
    JOIN ppw_promotion_controls c ON c.world_id=p.world_id
     AND c.promotion_id=p.promotion_id AND c.player_id=$2 AND c.active
    JOIN ppw_memberships m ON m.world_id=c.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    WHERE p.world_id=$1 AND p.promotion_id=$3 AND p.lifecycle='ACTIVE'
   `,[input.worldId,input.playerId,input.promotionId]);
   if(owners.length!==1)throw new Error("Only your promotion can set its spending allocations");
   await tx.query(`
    INSERT INTO ppw_promotion_spending_plans
     (world_id,promotion_id,weekly_wage_limit,show_talent_limit,cash_reserve)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(world_id,promotion_id) DO UPDATE SET
     weekly_wage_limit=excluded.weekly_wage_limit,
     show_talent_limit=excluded.show_talent_limit,
     cash_reserve=excluded.cash_reserve
   `,[input.worldId,input.promotionId,input.weeklyWageLimit,
     input.showTalentLimit,input.cashReserve]);
   return {saved:true,plan:{weeklyWageLimit:input.weeklyWageLimit,
    showTalentLimit:input.showTalentLimit,cashReserve:input.cashReserve}};
  }
 });
}
