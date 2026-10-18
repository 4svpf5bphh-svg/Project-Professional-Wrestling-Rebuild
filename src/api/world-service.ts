import {readPromotionCalendar,upsertPromotionSeries,archivePromotionSeries,
 type SeriesMutation,type ArchiveSeries} from "../db/calendar-workspace.js";
import {readSixWeekPlanner,planShowWeek,type PlanWeekInput}
 from "../db/planner-workspace.js";
import {readTagTeamWorkspace,createTagTeam,nameTagTeam,type CreateTagTeam,type NameTagTeam}
 from "../db/tag-team-workspace.js";
import {readChampionshipDirectory,readChampionshipHistory,type ReignCursor}
 from "../db/championship-history.js";
import type { TransactionPool } from "../db/transaction.js";
import {readCompletedShowView} from "../db/show-results-view.js";
import {readCompletedShowArchive,type ShowArchiveCursor} from "../db/completed-show-archive.js";
import {readWorkingConnections} from "../db/working-connections-workspace.js";
import {readPortablePersonaWorkspace} from "../db/portable-persona-workspace.js";
import {markBackstageThreadRead} from "../db/backstage-conversations.js";
import {setBackstageThreadArchive} from "../db/backstage-thread-archive.js";
import {decideBackstageRequest,type BackstageDecisionInput} from "../db/backstage-conversations.js";
import {requestPortablePersonaChange,type PersonaChangeInput}
 from "../db/portable-persona-change.js";
import {readStableWorkspace,readActiveStableChoices,
 createStable,addStableMember,removeStableMember,disbandStable,
 type CreateStableInput,type ChangeStableInput,type DisbandStableInput}
 from "../db/stable-workspace.js";
import {readProgrammeWorkspace,startProgramme,endProgramme,
 type StartProgrammeInput,type EndProgrammeInput} from "../db/programme-workspace.js";
import { joinWorld } from "../db/membership-operations.js";
import { submitPromotionClaim } from "../db/promotion-commands.js";
import { readPlayerWorldOverview } from "../db/player-world-overview.js";
import { listAvailablePromotions } from "../db/available-promotions.js";
import {setStaffContinuity} from "../db/staff-continuity.js";
import {readStaffWorkspace} from "../db/staff-workspace.js";
import {readIndustryWorldHub} from "../db/industry-world-hub.js";
import {requestAdditionalDates,readPendingDateRequests,cancelDateRequest} from "../db/contract-date-requests.js";
import {withdrawRenewal} from "../db/withdraw-contract-renewal.js";
import {proposeSameTermsRenewal} from "../db/contract-renewals.js";
import {readContractDesk} from "../db/contract-desk-workspace.js";
import {readBusinessWorkspace} from "../db/business-workspace.js";
import {readWrestlerDirectory,type DirectoryFilter} from "../db/wrestler-directory.js";
import {readWrestlerProfile,editWrestlerRepertoire,type RepertoireEdit}
 from "../db/wrestler-profile.js";
import {markPreparedShowReady} from "../db/ready-prepared-show.js";
import {submitManualContractOffer,withdrawManualContractOffer,readPendingContractOffers} from "../db/manual-contract-offers.js";
import type {OfferTerms} from "../domain/contract-economics.js";
import {chooseShowMarketAndTickets,readShowMarketOptions}
 from "../db/show-booking-commerce.js";
import type {TicketStrategy} from "../domain/legacy-show-economics.js";
import {readShowCardEditor,readBookableCardTalent,saveShowCardMatches,
 type EditedMatchSlot,type EditedSegmentSlot} from "../db/show-card-editor.js";

/** Authenticated read-only finance and territory desk. No financial writes. */
export async function businessAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readBusinessWorkspace(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId});
}
/** A single authenticated profile: public wrestler facts; contract payments remain private. */
export async function wrestlerProfileAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,personId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");validate(personId,"wrestler");
 return readWrestlerProfile(context.pool,{worldId,promotionId,personId,
  playerId:context.actor.playerId});
}
export async function editWrestlerRepertoireAsActor(context:WorldApiContext,
 input:Omit<RepertoireEdit,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.personId,"wrestler");
 return editWrestlerRepertoire(context.pool,{...input,playerId:context.actor.playerId});
}
/** Authenticated player-facing wrestler directory, never a global
 * unguarded market read. Filtering is validated inside the query module. */
export async function wrestlerDirectoryAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,filter:DirectoryFilter){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readWrestlerDirectory(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId},filter);
}
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
  autoRenewSameTerms?:boolean;
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
export async function industryWorldAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readIndustryWorldHub(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId});
}
export async function staffWorkspaceAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readStaffWorkspace(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId});
}
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

/** Authenticated promotion show calendar. */
export async function calendarAsActor(context:WorldApiContext,worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");validate(promotionId,"promotion");
 return readPromotionCalendar(context.pool,{worldId,promotionId,playerId:context.actor.playerId});
}
export async function upsertCalendarAsActor(context:WorldApiContext,
 input:Omit<SeriesMutation,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return upsertPromotionSeries(context.pool,{...input,playerId:context.actor.playerId});
}
export async function archiveCalendarAsActor(context:WorldApiContext,
 input:Omit<ArchiveSeries,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.seriesId,"series");
 return archivePromotionSeries(context.pool,{...input,playerId:context.actor.playerId});
}

/** A six-week controlled promotion planner; authenticated player is trusted. */
export async function plannerAsActor(context:WorldApiContext,worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readSixWeekPlanner(context.pool,{worldId,promotionId,playerId:context.actor.playerId});
}
export async function planShowAsActor(context:WorldApiContext,
 input:Omit<PlanWeekInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return planShowWeek(context.pool,{...input,playerId:context.actor.playerId});
}

/** UI-facing choices: market/venue are paired, ticket price affects demand.
 * The author cannot change event type; that belongs to the World calendar.
 */
export async function showMarketsAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,afterVenueId:string|null=null,limit=25){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");
 return readShowMarketOptions(context.pool,worldId,context.actor.playerId,
  promotionId,afterVenueId,limit);
}
export async function chooseShowMarketAsActor(context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;showId:string;marketId:string;
  venueId:string;ticketStrategy:TicketStrategy}){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.showId,"show");
 return chooseShowMarketAndTickets(context.pool,{...input,
  playerId:context.actor.playerId});
}

/** Card editing RPC surface; actual HTTP session identity is injected.
 * No playerId may be supplied by a browser to these operations.
 */
export async function showCardEditorAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,showId:string){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");validate(showId,"show");
 return readShowCardEditor(context.pool,{worldId,promotionId,showId,
  playerId:context.actor.playerId});
}
export async function cardTalentAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,showId:string,search="",
 after:{name:string;personId:string;contractId:string}|null=null,limit=40){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");validate(showId,"show");
 return readBookableCardTalent(context.pool,{worldId,promotionId,showId,
  playerId:context.actor.playerId},search,after,limit);
}
export async function saveCardEditorAsActor(context:WorldApiContext,
 input:WorldMutationInput & {promotionId:string;showId:string;
  matches:readonly EditedMatchSlot[];segments?:readonly EditedSegmentSlot[];runningOrder:readonly string[]}){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.showId,"show");
 return saveShowCardMatches(context.pool,{...input,playerId:context.actor.playerId});
}

/** Authenticated, read-only final show broadcast. */
/** Title lineage is shared history, but access requires a verified manager. */
export async function championshipsAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 return readChampionshipDirectory(context.pool,worldId,context.actor.playerId,promotionId);
}
export async function championshipHistoryAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,titlePromotionId:string,
 championshipId:string,cursor:ReignCursor|null=null){
 return readChampionshipHistory(context.pool,worldId,context.actor.playerId,
  promotionId,titlePromotionId,championshipId,cursor);
}
export async function completedShowAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,showId:string){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");validate(showId,"show");
 return readCompletedShowView(context.pool,{worldId,promotionId,showId,
  playerId:context.actor.playerId});
}

/** Past shows are a bounded, indexed one-read archive for this controller. */
export async function completedShowArchiveAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,cursor:ShowArchiveCursor|null=null){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");
 return readCompletedShowArchive(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId,cursor});
}

/** Promotion-scoped programme management, with the same verified actor as booking. */
export async function programmeWorkspaceAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");
 return readProgrammeWorkspace(context.pool,{worldId,promotionId,playerId:context.actor.playerId});
}
export async function startProgrammeAsActor(context:WorldApiContext,
 input:Omit<StartProgrammeInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return startProgramme(context.pool,{...input,playerId:context.actor.playerId});
}
export async function endProgrammeAsActor(context:WorldApiContext,
 input:Omit<EndProgrammeInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return endProgramme(context.pool,{...input,playerId:context.actor.playerId});
}

/** Original stables belong to one verified promotion, never client actor JSON. */
export async function tagTeamWorkspaceAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readTagTeamWorkspace(context.pool,{worldId,promotionId,
  playerId:context.actor.playerId});
}
export async function createTagTeamAsActor(context:WorldApiContext,
 input:Omit<CreateTagTeam,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return createTagTeam(context.pool,{...input,playerId:context.actor.playerId});
}
export async function nameTagTeamAsActor(context:WorldApiContext,
 input:Omit<NameTagTeam,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return nameTagTeam(context.pool,{...input,playerId:context.actor.playerId});
}
export async function stableWorkspaceAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readStableWorkspace(context.pool,{worldId,promotionId,playerId:context.actor.playerId});
}
export async function createStableAsActor(context:WorldApiContext,
 input:Omit<CreateStableInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return createStable(context.pool,{...input,playerId:context.actor.playerId});
}
export async function addStableMemberAsActor(context:WorldApiContext,
 input:Omit<ChangeStableInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return addStableMember(context.pool,{...input,playerId:context.actor.playerId});
}
export async function removeStableMemberAsActor(context:WorldApiContext,
 input:Omit<ChangeStableInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return removeStableMember(context.pool,{...input,playerId:context.actor.playerId});
}
export async function disbandStableAsActor(context:WorldApiContext,
 input:Omit<DisbandStableInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return disbandStable(context.pool,{...input,playerId:context.actor.playerId});
}

export async function stableChoicesAsActor(context:WorldApiContext,
 worldId:string,promotionId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 return readActiveStableChoices(context.pool,{
  worldId,promotionId,playerId:context.actor.playerId});
}

/** Global wrestler relationship evidence is visible only via a verified roster controller. */
export async function workingConnectionsAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,personId?:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");
 if(personId!==undefined)validate(personId,"wrestler");
 return readWorkingConnections(context.pool,{
  worldId,promotionId,playerId:context.actor.playerId,personId});
}

/** Original PPW wrestler-owned career persona. Actor is verified by the host. */
export async function portablePersonaAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,personId?:string){
 validate(context.actor.playerId,"actor");
 validate(worldId,"World");validate(promotionId,"promotion");
 if(personId!==undefined)validate(personId,"wrestler");
 return readPortablePersonaWorkspace(context.pool,{
  worldId,promotionId,playerId:context.actor.playerId,personId});
}
export async function requestPersonaAsActor(context:WorldApiContext,
 input:Omit<PersonaChangeInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");
 return requestPortablePersonaChange(context.pool,{
  ...input,playerId:context.actor.playerId});
}

/** A private, revision-guarded Backstage reply from the authenticated booker. */
export async function backstageDecisionAsActor(context:WorldApiContext,
 input:Omit<BackstageDecisionInput,"playerId">){
 validate(context.actor.playerId,"actor");validateMutation(input);
 validate(input.promotionId,"promotion");validate(input.conversationId,"conversation");
 return decideBackstageRequest(context.pool,{...input,playerId:context.actor.playerId});
}

export async function markBackstageReadAsActor(context:WorldApiContext,
 worldId:string,promotionId:string,personId:string){
 validate(context.actor.playerId,"actor");validate(worldId,"World");
 validate(promotionId,"promotion");validate(personId,"wrestler");
 return markBackstageThreadRead(context.pool,{worldId,promotionId,personId,
  playerId:context.actor.playerId});
}

/** Archive/restore is private presentation state, never a booking decision. */
export async function backstageArchiveAsActor(context:WorldApiContext,
 input:{worldId:string;promotionId:string;personId:string;archived:boolean}){
 validate(context.actor.playerId,"actor");validate(input.worldId,"World");
 validate(input.promotionId,"promotion");validate(input.personId,"wrestler");
 return setBackstageThreadArchive(context.pool,{...input,
  playerId:context.actor.playerId});
}
