import type { TransactionPool } from "../db/transaction.js";
import { joinWorld } from "../db/membership-operations.js";
import { submitPromotionClaim } from "../db/promotion-commands.js";
import { readPlayerWorldOverview } from "../db/player-world-overview.js";
import { listAvailablePromotions } from "../db/available-promotions.js";
import {setStaffContinuity} from "../db/staff-continuity.js";
import {requestAdditionalDates,readPendingDateRequests} from "../db/contract-date-requests.js";
import {markPreparedShowReady} from "../db/ready-prepared-show.js";

/** Authenticated identity comes from trusted middleware, NEVER request JSON.
 * This module is framework-neutral; HTTP handlers should map exceptions to
 * safe generic responses and implement rate limiting + session validation.
 */
export interface VerifiedActor { playerId:string }
export interface WorldApiContext { pool:TransactionPool; actor:VerifiedActor }
export interface WorldMutationInput { worldId:string; requestId:string; expectedRevision:number }
export interface ClaimInput extends WorldMutationInput { promotionId:string }
export interface StaffContinuityInput extends ClaimInput {
  allowUnfinishedFallback:boolean;
  allowLogisticsFallback?:boolean;
  permittedDays?:number[];
  permittedVenueIds?:string[];
}
export interface ReadyShowInput extends ClaimInput { showId:string;confirmReadyToRun:true }

function validate(value:string,label:string):void {
  if (typeof value!=="string" || value.length<1 || value.length>200) throw new Error("Invalid "+label);
}
function validateRevision(revision:number):void {
  if (!Number.isSafeInteger(revision) || revision<0) throw new Error("Invalid revision");
}
function validateMutation(input:WorldMutationInput):void {
  validate(input.worldId,"World");
  validate(input.requestId,"request");
  validateRevision(input.expectedRevision);
}

export async function joinWorldAsActor(context:WorldApiContext,input:WorldMutationInput) {
  validate(context.actor.playerId,"actor");
  validateMutation(input);
  return joinWorld(context.pool,{...input,playerId:context.actor.playerId});
}
export async function claimPromotionAsActor(context:WorldApiContext,input:ClaimInput) {
  validate(context.actor.playerId,"actor");
  validateMutation(input);
  validate(input.promotionId,"promotion");
  return submitPromotionClaim(context.pool,{...input,playerId:context.actor.playerId});
}
/** The actor identity is injected from verified middleware, not client JSON. */
export async function setStaffContinuityAsActor(context:WorldApiContext,input:StaffContinuityInput){
  validate(context.actor.playerId,"actor");
  validateMutation(input);
  validate(input.promotionId,"promotion");
  if(typeof input.allowUnfinishedFallback!=="boolean")throw new Error("Invalid delegation");
  return setStaffContinuity(context.pool,{...input,playerId:context.actor.playerId});
}
export async function markPreparedShowReadyAsActor(context:WorldApiContext,input:ReadyShowInput){
  validate(context.actor.playerId,"actor");
  validateMutation(input);
  validate(input.promotionId,"promotion");
  validate(input.showId,"show");
  if(input.confirmReadyToRun!==true)throw new Error("Explicit ready-to-run confirmation required");
  return markPreparedShowReady(context.pool,{...input,playerId:context.actor.playerId});
}
export async function overviewAsActor(context:WorldApiContext,worldId:string) {
  validate(context.actor.playerId,"actor");
  validate(worldId,"World");
  return readPlayerWorldOverview(context.pool,worldId,context.actor.playerId);
}
export async function availablePromotionsAsActor(
  context:WorldApiContext,worldId:string,afterId:string|null=null,limit=25,
) {
  validate(context.actor.playerId,"actor");
  validate(worldId,"World");
  if (afterId!==null) validate(afterId,"cursor");
  return listAvailablePromotions(context.pool,worldId,afterId,limit);
}

/** Request only: no dates are added until a separate authoritative acceptance. */
export async function requestAdditionalDatesAsActor(
 context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;contractId:string;additionalDates:number},
){
 validate(context.actor.playerId,"actor");
 validateMutation(input);
 validate(input.promotionId,"promotion");
 validate(input.contractId,"contract");
 return requestAdditionalDates(context.pool,{...input,playerId:context.actor.playerId});
}

export async function pendingDateRequestsAsActor(
 context:WorldApiContext,worldId:string,promotionId:string,
){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");
 validate(promotionId,"promotion");
 return readPendingDateRequests(context.pool,worldId,context.actor.playerId,promotionId);
}
