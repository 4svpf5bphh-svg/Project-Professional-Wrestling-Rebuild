import assert from "node:assert/strict";
import test from "node:test";
import {balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
import {chooseAiWorldCard,type AiRosterCandidate} from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";
import {originalCompetitionFactor,originalExpectedDemand,
 originalShowSettlement,originalTicketYield,
 type LocalAudience,type Competitor,type TicketStrategy}
 from "../src/domain/legacy-show-economics.js";

/** Five-year scenario matrix using actual show pricing, demand, competition,
 * costs and live market-drift functions. Weekly wages/overheads represent
 * explicit policies, not a replay of contracts or production World results.
 * Those are separately covered by PostgreSQL multi-season/contract tests.
 * No test touches the saved World or connects to Neon.
 */
test("five-year economics: disciplined, reckless, recovery and cautious rivals",()=>{
 type Policy={id:string;cash:number;wages:number;overhead:number;
  media:number;sponsor:number;stars:number;appearance:number;venue:number;
  ticket:TicketStrategy;cadence:number;quality:number;crowd:number;
  day:number;adaptive:boolean};
 const policies:Policy[]=[
  {id:"good-booker",cash:175000,wages:18000,overhead:12000,media:9000,
   sponsor:4000,stars:60,appearance:12000,venue:3500,ticket:"STANDARD",
   cadence:1,quality:3.9,crowd:79,day:2,adaptive:true},
  {id:"reckless-spender",cash:450000,wages:140000,overhead¶»§q«^