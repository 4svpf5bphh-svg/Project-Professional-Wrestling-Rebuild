import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleWeeklyPromotionHealth} from "../src/db/weekly-finance-health.js";
import {recruitStrategicAiRosters,recruitDistressedAiRosters,
 settleLivingPromotionSurvival} from "../src/db/living-world-promotions.js";
import {balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";

const url=process.env.PPW_NEON_TEST_URL;

/** Deterministic 156-week financial/roster stress scenario on DISPOSABLE
 * PostgreSQL. Financial and show-quality inputs are intentionally constructed
 * scenarios, not claims about live players or forecasts. Full show resolution,
 * playable two-human flow and organic career progression are tested elsewhere.
 * All mutations stay in the certified-week settlement functions under test.
 */
test("3 years: financially disciplined AI develops talent without poaching or taking human promotions",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="balance-3y-"+randomUUID(),db=postgresPool(url!,3);
 const humanA="manager-a-"+randomUUID(),humanB="manager-b-"+randomUUID();
 const promotions=["ai-workrate","ai-star","ai-crisis","human-a","human-b"];
 try{
  await withWorldTra¶»§q«^