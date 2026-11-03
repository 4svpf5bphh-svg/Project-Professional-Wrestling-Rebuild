import test from "node:test";
import assert from "node:assert/strict";
import {forecastContractCost} from "../src/domain/contract-cost-forecast.js";

test("planned offer exposure uses all purchased dates even though dates are charged when booked",()=>{
 const quote=forecastContractCost({weeks:10,dates:5,weeklyGuarantee:2_000,
  appearanceFee:9_000,signingBonus:3_000});
 assert.deepEqual(quote,{weeks:10,dates:5,guaranteedWages:20_000,
  plannedAppearanceFees:45_000,oneTimeBonus:3_000,
  plannedFullTermCost:68_000,averageWeeklyCost:6_800});
});
test("one-off and exclusive deals do not invent extra fees",()=>{
 assert.equal(forecastContractCost({weeks:1,dates:1,weeklyGuarantee:0,
  appearanceFee:9_000,signingBonus:0}).plannedFullTermCost,9_000);
 assert.equal(forecastContractCost({weeks:52,dates:0,weeklyGuarantee:1_000,
  appearanceFee:0,signingBonus:0}).plannedFullTermCost,52_000);
});
test("contract cost calculator rejects invalid numbers",()=>{
 assert.throws(()=>forecastContractCost({weeks:0,dates:5,weeklyGuarantee:1000,
  appearanceFee:9000,signingBonus:0}));
 assert.throws(()=>forecastContractCost({weeks:10,dates:5,weeklyGuarantee:-5,
  appearanceFee:9000,signingBonus:0}));
});
