/** Stage recovery for resource conflicts. Only explicitly AI-managed,
 * unclaimed promotions may have their day or venue changed automatically.
 * Deterministic proposals never change an authored slot or finish.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {readRecordedWeekArbitration} from "./recorded-week-arbitration.js";
import {previewWorldWeekRemediations} from "./week-remediation.js";
import type {RemediationChoice} from "../domain/resource-remediation.js";

export type ArbitrationRecovery=
 | {status:"NEEDS_PROPOSAL"}
 | {status:"STALE_PROPOSAL"}
 | {status:"NEEDS_HUMAN_REVIEW"}
 | {status:"AI_REMEDIATION";showId:string;
    sourceFingerprint:string;choice:RemediationChoice};

export async function inspectWorldArbitrationRecovery(
 pool:TransactionPool,worldId:string,
):Promise<ArbitrationRecovery>{
 const recorded=await readRecordedWeekArbitration(pool,worldId);
 if(recorded.status==="NONE")return {status:"NEEDS_PROPOSAL"};
 if(recorded.status!=="CURRENT")return {status:"STALE_PROPOSAL"};
 const preview=await previewWorldWeekRemediations(pool,worldId);
 if(preview.status!=="CURRENT")return {status:"STALE_PROPOSAL"};
 if(!preview.shows.length)return {status:"NEEDS_HUMAN_REVIEW"};
 // A single bounded batch authorizes every candidate under the World row
 // lock. The mutation command independently revalidates under its own lock.
 const candidates=preview.shows.filter(s=>s.choices.length>0);
 if(!candidates.length)return {status:"NEEDS_HUMAN_REVIEW"};
 const owners=await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING"||
     world[0]!.year!==preview.year||world[0]!.week!==preview.week)
    throw new Error("World changed during arbitration recovery");
  return tx.query<{promotion_id:string;management_mode:string;controlled:boolean}>(
   `SELECT p.promotion_id,p.management_mode,
       EXISTS(SELECT 1 FROM ppw_promotion_controls c
         WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
           AND c.active) AS controlled
      FROM ppw_promotions p WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
        AND p.promotion_id=ANY($2::text[])`,
   [worldId,candidates.map(c=>c.promotionId)]);
 });
 const allowed=new Set(owners.filter(x=>x.management_mode==="AI"&&!x.controlled)
  .map(x=>x.promotion_id));
 // The preview is canonically sorted by promotion/show, never request arrival.
 const next=candidates.find(c=>allowed.has(c.promotionId));
 if(!next)return {status:"NEEDS_HUMAN_REVIEW"};
 return {status:"AI_REMEDIATION",showId:next.showId,
   sourceFingerprint:preview.sourceFingerprint,choice:next.choices[0]!};
}
