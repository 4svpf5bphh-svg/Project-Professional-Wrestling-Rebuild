import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {signCommercialDeal} from "../src/db/commercial-deals.js";
import {settleCommercialWorldWeek} from "../src/db/weekly-commercial-settlement.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
test("Commercial negotiation is player-scoped, immutable per term and expires once without double-paying cash",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="commercial-"+randomUUID(),owner="owner-"+randomUUID();
 const db=postgresPool(url!,3),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"commercial-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"commercial-claim",expectedRevision:1})).status,"APPLIED");
  // Three distinct certified show weeks; no speculative drafts qualify.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_worlds SET week=4,
    next_lock_at=clock_timestamp()+interval '2 days'
    WHERE world_id=$1`,[world]);
   for(let week=1;week<=3;week++){
    const show="commercial-show-"+week;
    await tx.query(`INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,show_name,event_type)
     VALUES($1,$2,$3,1,$4,'SUBMITTED',2,'Regional event','REGULAR')`,
     [world,show,promotion,week]);
    await tx.query(`INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
     VALUES($1,$2,$3,1,$4,$5,75,'{}'::jsonb,$6)`,
     [world,promotion,show,week,"certified-"+week,"a".repeat(63)+week]);
    await tx.query(`INSERT INTO ppw_show_economics
     (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
      gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
      total_cost,net_result,incremental_cash)
     VALUES($1,$2,$3,1,$4,950,1100,160000,20000,30000,10000,20000,80000,80000,80000)`,
     [world,show,promotion,week]);
   }
  });
  const business=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(business.commercialOffers.length,3);
  assert.equal(business.worldRevision,2);
  assert.equal(business.commercialAgreements.length,0);
  const command={worldId:world,promotionId:promotion,playerId:owner,
   requestId:"commercial-stream",expectedRevision:2,offerCode:"BROADCAST_GROWTH"};
  const first=await signCommercialDeal(db.pool,command);
  assert.equal(first.status,"APPLIED");
  if(first.status!=="APPLIED")throw new Error("Expected signed deal");
  assert.equal(first.result.weeklyIncome,312000);
  assert.equal(first.result.reachIncrease,15);
  const replay=await signCommercialDeal(db.pool,command);
  assert.equal(replay.status,"REPLAYED");
  const updated=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(updated.weeklyMediaIncome,312000);
  assert.equal(updated.mediaReach,105);
  assert.equal(updated.commercialAgreements.length,1);
  assert.equal(updated.commercialOffers.some(o=>o.kind==="BROADCAST"),false);
  const savedCash=updated.cash;
  await assert.rejects(signCommercialDeal(db.pool,{...command,
   expectedRevision:first.revision,requestId:"commercial-duplicate",offerCode:"BROADCAST_STABLE"}),
   /current agreement/);
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:"intruder"}},
   "signCommercial",{worldId:world,promotionId:promotion,
    requestId:"intruder-sign",expectedRevision:first.revision,
    offerCode:"SPONSOR_LOCAL"}),/Only your promotion/);
  const sponsor=await signCommercialDeal(db.pool,{...command,
   expectedRevision:first.revision,requestId:"commercial-sponsor",offerCode:"SPONSOR_LOCAL"});
  assert.equal(sponsor.status,"APPLIED");
  const active=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(active.weeklySponsorIncome,27000);
  assert.equal(active.commercialAgreements.length,2);
  assert.equal(active.cash,savedCash,"Signing never creates an instant cash bonus");

  // Test the existing locked-World settlement against disposable World data.
  await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,16));
  const afterSponsor=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(afterSponsor.weeklySponsorIncome,25000);
  assert.equal(afterSponsor.weeklyMediaIncome,312000);
  await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,29));
  const expired=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(expired.weeklyMediaIncome,300000);
  assert.equal(expired.mediaReach,90);
  assert.equal(expired.cash,savedCash,"Commercial expiry never replays weekly payments");
  assert.equal(expired.commercialAgreements.length,0);
  await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,29));
  const secondPass=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(secondPass.weeklyMediaIncome,300000);
  assert.equal(secondPass.weeklySponsorIncome,25000);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_commercial_deals","ppw_show_economics",
    "ppw_completed_shows","ppw_booking_drafts",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
