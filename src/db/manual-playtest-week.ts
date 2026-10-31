import {premiumOnlyWeekSql} from "./premium-only-week.js";
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {lockWorldWeek} from "./world-lock.js";
import {driveWorldResolution} from "./world-resolution-pipeline.js";

/** Explicit, resumable single-week preview test control. Never run from
 * ordinary World reads, a timer, a cron, or an unauthenticated client.
 */
export async function advancePlaytestWeek(pool:TransactionPool,worldId:string,
 expectedYear:number,expectedWeek:number){
 if(!worldId||!Number.isSafeInteger(expectedYear)||expectedYear<1||
  !Number.isSafeInteger(expectedWeek)||expectedWeek<1||expectedWeek>52)
  throw new Error("Invalid preview week request");
 const gate=await withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{year:number;week:number;phase:string;revision:number|string}>(
   "SELECT year,week,phase,revision FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
   [worldId]);
  const w=rows[0];
  if(!w||rows.length!==1||w.year!==expectedYear||w.week!==expectedWeek||
    !["OPEN","LOCKED","RESOLVING"].includes(w.phase))
   throw new Error("The World has already progressed. Refresh Home before continuing.");
  const owners=await tx.query<{promotion_id:string;player_id:string;ready:boolean;any_current:boolean}>(`
   SELECT c.promotion_id,c.player_id,
    EXISTS(SELECT 1 FROM ppw_booking_drafts d
     WHERE d.world_id=c.world_id AND d.promotion_id=c.promotion_id
      AND d.year=$2 AND d.week=$3
      AND (d.booking_class='REGULAR' OR
       (d.booking_class='PREMIUM' AND ${premiumOnlyWeekSql("p")}))
      AND (d.status='SUBMITTED' OR d.lock_ready_fingerprint IS NOT NULL)) AS ready,
    EXISTS(SELECT 1 FROM ppw_booking_drafts d
     WHERE d.world_id=c.world_id AND d.promotion_id=c.promotion_id
      AND d.year=$2 AND d.week=$3 AND d.status IN ('DRAFT','SUBMITTED')) AS any_current
   FROM ppw_promotion_controls c
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
   WHERE c.world_id=$1 AND c.active AND p.lifecycle='ACTIVE' AND m.status='ACTIVE'
   ORDER BY c.promotion_id LIMIT 129`,[worldId,expectedYear,expectedWeek]);
  if(w.phase==="OPEN"){
   if(owners.length<1||owners.length>128)
    throw new Error("The World needs an active human controller to advance");
   for(const owner of owners){
    if(owner.ready)continue;
    if(owners.length!==1||owner.any_current)
     throw new Error("A manager has an unfinished current-week show. Review the card and venue before advancing.");
    // Private solo-playtest off-week. The single player's future shows,
    // contractual talent and the AI's normal shows remain fully intact.
    const marked=await tx.query<{promotion_id:string}>(`
     INSERT INTO ppw_playtest_dark_weeks
      (world_id,year,week,promotion_id,operator_player_id)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(world_id,year,week,promotion_id) DO NOTHING
     RETURNING promotion_id`,
     [worldId,expectedYear,expectedWeek,owner.promotion_id,owner.player_id]);
    if(marked.length)await tx.query(`
     INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
     VALUES($1,$2,$3,'SOLO_PLAYTEST_DARK_WEEK',
      jsonb_build_object('promotionId',$4::text,'noShowBooked',true))`,
     [worldId,expectedYear,expectedWeek,owner.promotion_id]);
   }
  }
  // The existing single authoritative World Lock owns the transition.
  return {phase:w.phase,revision:Number(w.revision)};
 });
 const resolutionId="manual-preview:"+worldId+":"+expectedYear+":"+expectedWeek;
 if(gate.phase==="OPEN"){
  const lock=await lockWorldWeek(pool,{worldId,
   requestId:resolutionId+":lock",expectedRevision:gate.revision,manualPreview:true});
  if(lock.status==="STALE")throw new Error("Another manager changed the World. Refresh and review.");
 }
 const result=await driveWorldResolution(pool,{worldId,resolutionId,maxStages:6,manualRecovery:true});
 return {status:result.status,steps:result.steps,blockers:result.blockers,
  year:expectedYear,week:expectedWeek};
}

/** A deliberate, operator-only rescue of an expired but still OPEN test week.
 * The extension applies equally to all promotions and never simulates a card.
 */
export async function extendPlaytestBooking(pool:TransactionPool,worldId:string,
 expectedYear:number,expectedWeek:number):Promise<{status:"OPEN";year:number;week:number}>{
 if(!worldId||!Number.isSafeInteger(expectedYear)||expectedYear<1||
  !Number.isSafeInteger(expectedWeek)||expectedWeek<1||expectedWeek>52)
  throw new Error("Invalid booking extension scope");
 return withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{year:number;week:number;phase:string;expired:boolean}>(`
   SELECT year,week,phase,next_lock_at<=clock_timestamp() AS expired
   FROM ppw_worlds WHERE world_id=$1 FOR UPDATE`,[worldId]);
  const w=rows[0];
  if(!w||w.year!==expectedYear||w.week!==expectedWeek||
   w.phase!=="OPEN")throw new Error("Booking cannot be extended");
  const saved=await tx.query<{world_id:string}>(`
   UPDATE ppw_worlds
   SET next_lock_at=GREATEST(next_lock_at,clock_timestamp()+interval '5 years'),revision=revision+1
   WHERE world_id=$1 AND year=$2 AND week=$3 AND phase='OPEN'
   RETURNING world_id`,[worldId,expectedYear,expectedWeek]);
  if(saved.length!==1)throw new Error("Booking extension failed");
  return {status:"OPEN",year:expectedYear,week:expectedWeek};
 });
}
