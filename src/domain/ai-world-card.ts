/** Archived PPW booking.ts / matches.ts adapted for the current singles-
 * capable resolver. Schedules full 2-5 match shows without exceeding the
 * existing modest AI card-size target or fabricating tag/title logic.
 * This AI target is not a human show limit (100 unique appearances allowed).
 */
import {createHash} from "node:crypto";
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
import {chooseStaffFallbackSchedule,type ExistingShowBooking} from "./staff-show-schedule.js";
import type {StaffWrestlerCandidate} from "./staff-fallback-card.js";
import type {EventType} from "./legacy-show-economics.js";
import type {AiPromotionStrategy} from "./ai-promotion-strategy.js";
export interface AiRosterCandidate extends StaffWrestlerCandidate{
 momentum:number;popularity:number;recognition:number;presentation:number;matchCraft:number;
}
export interface AiCardInput{
 worldId:string;worldSeed:string;year:number;week:number;promotionId:string;showId:string;
 roster:readonly AiRosterCandidate[];bookedShows:readonly ExistingShowBooking[];
 activeVenues:readonly string[];eventType:EventType;
 excludedDays?:readonly number[];
 riskTolerance:number;matchQualityPreference:number;starPreference:number;
 strategy?:AiPromotionStrategy;
 recentPairs?:readonly string[];
 establishedPartners?:readonly {aId:string;bId:string}[];
 establishedTeams?:readonly {teamId:string;aId:string;bId:string}[];
 tagTitles?:readonly {championshipId:string;holderTeamId:str¶»§q«^