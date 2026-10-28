import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {chooseEmergencyStaffCard,orderStaffPromotions,type StaffWrestlerCandidate}
  from "../domain/staff-fallback-card.js";
import type {ExistingShowBooking} from "../domain/staff-show-schedule.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {defaults,seriesDue,regularRole} from "../domain/show-calendar.js";
import {readWorldAiBookingContext} from "./ai-booking-context.js";
import {chooseAiWorldCard,chooseAiTitleChallenger,type AiRosterCandidate,type AiCardMatch} from "../domain/ai-world-card.js";
import {aiPromotionStrategy} from "../domain/ai-promotion-strategy.js";

export interface GenerateStaffFallbackCardsInput{
  worldId:string;requestId:string;expectedRevision:number;
}
type Delegated={
  promotion_id:string;show_id:string|null;controller_player_id:string|null;
  owner_player_id:string|null;current_controller:string|null;
  delegated:boolean|null;status:string;management_mode:string;
  promotion_name:string;cadence:number;
};
type SignedCandidate={
  promotion_id:string;person_id:string;contract_id:string;
  booking_division:"MEN"|"WOMEN";weekly_service_capacity:number|null;
  momentum:number|null;recognition:number|null;popularity:number|null;
  presentation:number|null;match_craft:number|null;
  remaining_dates:number|null;
};
type Generated={promotionId:string;showId:string;day:number;venueId:string;
  participants:{personId:string;c¶»§q«^