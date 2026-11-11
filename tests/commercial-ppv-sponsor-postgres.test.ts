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
const url=process.env.PPW_NEON_TEST_URL;
test("real certified PPV buys improve the shown and signed sponsor terms; future PPVs do not",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="ppv-sponsor-"+randomUUID(),owner="owner-"+randomUUID(),
  db=postgresPool(url!,3),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  const joined=await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"ppv-sponsor-join",expectedRevision:0});
  assert.equal(joined.status,"APPLIED");
  const claim=await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"ppv-sponsor-claim",expectedRevision:1});
  assert.equal(claim.status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_worlds SET week=6,
    next_lock_at=clock_timestamp()+interval '2 days'
    WHERE world_id=$1`,[world]);
   for(let week=1;week<=3;week++){
    const id="certified-tv-"+week;
    await tx.query(`
     INSERT INTO ppw_booking_drafts
      (world_id,draft_id,promotion_id,year,week,status,show_day,
       booking_class,event_type,show_name)
     VALUES($1,$2,$3,1,$4,'SUBMITTED',4,'REGULAR','REGULAR','Weekly Show')`,
     [world,id,promotion,week]);
    await tx.query(`
     INSERT INTO ppw_completed_shows
      (world_id,promotion_id,show_id,year,week,resolution_id,
       crowd_response,receipt_json,receipt_digest)
     VALUES($1,$2,$3,1,$4,$5,77,'{}'::jsonb,$6)`,
     [world,promotion,id,week,id+":result",
      week.toString(16).repeat(64)]);
    await tx.query(`
     INSERT INTO ppw_show_economics
      (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
       gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
       total_cost,net_result,incremental_cash,audience_format,
       tv_household_rating,estimated_viewers)
     VALUES($1,$2,$3,1,$4,850,1100,180000,25000,35000,15000,25000,
      100000,80000,80000,'TV',0.9,1125000)`,[world,id,promotion,week]);
   }
   // This is an ordinary *planned* premium event: it has no certified
   // match result or PPV sale and cannot influence a financial offer.
   await tx.query(`
    INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,
      booking_class,event_type,show_name)
    VALUES($1,'upcoming-ppv',$2,1,7,'DRAFT',7,'PREMIUM','MAJOR',
     'Summer Riot')`,[world,promotion]);
   // A streaming-included PLE is a certified *premium* broadcast with TV
   // viewers, not paid PPV buys or an ordinary contracted TV episode.
   await tx.query(`
    INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,
      booking_class,event_type,show_name)
    VALUES($1,'streaming-ple',$2,1,5,'SUBMITTED',7,'PREMIUM','MAJOR',
     'Included Streaming Special')`,[world,promotion]);
   await tx.query(`
    INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,
      crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'streaming-ple',1,5,'streaming-result',77,
     '{}'::jsonb,repeat('c',64))`,[world,promotion]);
   await tx.query(`
    INSERT INTO ppw_show_economics
     (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
      gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
      total_cost,net_result,incremental_cash,audience_format,
      tv_household_rating,estimated_viewers)
    VALUES($1,'streaming-ple',$2,1,5,800,1100,175000,25000,35000,
     15000,25000,100000,75000,75000,'TV',0.9,1125000)`,
    [world,promotion]);
  });
  const baseline=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  const sponsor0=baseline.commercialOffers.find(x=>x.code==="SPONSOR_LOCAL");
  assert.ok(sponsor0,"Three certified television broadcasts earn basic sponsor");
  assert.equal(baseline.recentPremiumShows,0);
  assert.equal(baseline.averagePpvBuys,null);
  assert.equal(baseline.recentTvEpisodes,3,
   "An included streaming PLE is not a regular TV episode");
  assert.equal(baseline.competitorBroadcasts.some(x=>
   x.showName==="Included Streaming Special"),false,
   "A streaming-only PLE must not enter the certified TV battle");
  assert.doesNotMatch(sponsor0!.description,/Certified PPV buyers/);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,
      booking_class,event_type,show_name)
    VALUES($1,'certified-ppv',$2,1,4,'SUBMITTED',7,'PREMIUM','MAJOR',
     'Spring Riot')`,[world,promotion]);
   await tx.query(`
    INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,
      crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'certified-ppv',1,4,'ppv-confirmed-result',77,
     '{}'::jsonb,repeat('d',64))`,[world,promotion]);
   await tx.query(`
    INSERT INTO ppw_show_economics
     (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
      gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
      total_cost,net_result,incremental_cash,audience_format,ppv_buys)
    VALUES($1,'certified-ppv',$2,1,4,1200,1600,260000,35000,42000,
      14000,28000,119000,141000,141000,'PPV',1100000)`,
    [world,promotion]);
  });
  const withPpv=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(withPpv.recentPremiumShows,1);
  assert.equal(withPpv.averagePpvBuys,1100000);
  const sponsor=withPpv.commercialOffers.find(x=>x.code==="SPONSOR_LOCAL");
  assert.ok(sponsor);
  assert.ok(sponsor!.weeklyIncome>sponsor0!.weeklyIncome);
  assert.match(sponsor!.description,/Certified PPV buyers/);
  for(const code of ["BROADCAST_STABLE","BROADCAST_GROWTH"]){
   assert.equal(withPpv.commercialOffers.find(x=>x.code===code)?.weeklyIncome,
    baseline.commercialOffers.find(x=>x.code===code)?.weeklyIncome,
    "PPV sales are not TV viewers and cannot inflate broadcast contracts");
  }
  const cash=withPpv.cash;
  const result=await signCommercialDeal(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner,
   requestId:"sponsor-for-real-ppv",expectedRevision:claim.revision,
   offerCode:"SPONSOR_LOCAL"
  });
  assert.equal(result.status,"APPLIED");
  if(result.status!=="APPLIED")throw new Error("Missing PPV sponsor signature");
  assert.equal(result.result.weeklyIncome,sponsor!.weeklyIncome,
   "Server reprices from the same certified PPV evidence the user saw");
  const again=await signCommercialDeal(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner,
   requestId:"sponsor-for-real-ppv",expectedRevision:claim.revision,
   offerCode:"SPONSOR_LOCAL"
  });
  assert.equal(again.status,"REPLAYED");
  const after=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:owner});
  assert.equal(after.cash,cash,
   "Signing changes future recurring terms; it cannot instantly print PPV money");
  assert.equal(after.commercialAgreements.filter(d=>d.kind==="SPONSOR").length,1);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of [
    "ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_show_economics","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
