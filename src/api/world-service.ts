import type { TransactionPool } from "../db/transaction.js";
import { joinWorld } from "../db/membership-operations.js";
import { submitPromotionClaim } from "../db/promotion-commands.js";
import { readPlayerWorldOverview } from "../db/player-world-overview.js";
import { listAvailablePromotions } from "../db/available-promotions.js";
import {setStaffContinuity} from "../db/staff-continuity.js";
import {requestAdditionalDates,readPendingDateRequests,cancelDateRequest} from "../db/contract-date-requests.js";
import {withdrawRenewal} from "../db/withdraw-contract-renewal.js";
import {proposeSameTermsRenewal} from "../db/contract-renewals.js";
import {readContractDesk} from "../db/contract-desk-workspace.js";
import {markPreparedShowReady} from "../db/ready-prepared-show.js";
import {submitManualContractOffer,withdrawManualContractOffer,readPendingContractOffers} from "../db/manual-contract-offers.js";
import type {OfferTerms} from "../domain/contract-economics.js";

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
 input:WorldMutationInput & {promotionId:string;contractId:string;additionalDates:number;additionalPayment?:number},
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

/** Single authenticated Contract Desk snapshot from the canonical World clock. */
export async function contractDeskAsActor(
 context:WorldApiContext,worldId:string,promotionId:string,
){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readContractDesk(context.pool,worldId,context.actor.playerId,promotionId);
}
export async function cancelDateRequestAsActor(
 context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;dateRequestId:string},
){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.dateRequestId,"date request");
 return cancelDateRequest(context.pool,{...input,playerId:context.actor.playerId});
}

export async function proposeRenewalAsActor(
 context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;contractId:string},
){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.contractId,"contract");
 return proposeSameTermsRenewal(context.pool,{...input,playerId:context.actor.playerId});
}

export async function withdrawRenewalAsActor(
 context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;proposalId:string},
){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.proposalId,"proposal");
 return withdrawRenewal(context.pool,{...input,playerId:context.actor.playerId});
}

/** Original manual human recruitment/renegotiation with verified controller identity. */
export async function submitContractOfferAsActor(context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;personId:string;sourceContractId?:string|null;terms:OfferTerms}){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.personId,"wrestler");
 if(input.sourceContractId!=null)validate(input.sourceContractId,"source contract");
 return submitManualContractOffer(context.pool,{...input,playerId:context.actor.playerId});
}
export async function withdrawContractOfferAsActor(context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;offerId:string}){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.offerId,"offer");
 return withdrawManualContractOffer(context.pool,{...input,playerId:context.actor.playerId});
}
export async function pendingContractOffersAsActor(context:WorldApiContext,worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");validate(promotionId,"promotion");
 return readPendingContractOffers(context.pool,worldId,context.actor.playerId,promotionId);
}
