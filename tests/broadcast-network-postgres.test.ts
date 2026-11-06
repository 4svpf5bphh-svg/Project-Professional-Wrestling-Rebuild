import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {settleCommercialWorldWeek} from "../src/db/weekly-commercial-settlement.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {readIndustryWorldNews} from "../src/db/industry-news.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Network warnings, missed slots, earned bonuses and recovery publish once in certified World rollover",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="network-review-"+randomUUID(),player="reviewer-"+randomUUID();
 const db=postgresPool(url!,3),promotion="promotion-0",dealId="network-"+randomUUID();
 const insertShow=async(week:number,day:number,rating:number)=>{
  await withWorldTransaction(db.pool,async tx=>{
   const showId="network-tv-"+week;
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,show_name,event_type,booking_class)
    VALUES($1,$2,$3,1,$4,'SUBMITTED',$5,'Nightly TV','REGULAR','REGULAR')`,
    [world,showId,promotion,week,day]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,$4,$5,90,'{}'::jsonb,repeat('f',64))`,
    [world,promotion,showId,week,"review-"+week]);
   await tx.query(`INSERT INTO ppw_show_economics
    (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
     gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
     total_cost,net_result,incremental_cash,
     audience_format,tv_household_rating,estimated_viewers)
    VALUES($1,$2,$3,1,$4,1000,1100,100000,20000,30000,10000,10000,
     70000,30000,40000,'TV',$5,1000000)`,[world,showId,promotion,week,rating]);
  });
 };
 const news=async()=>withWorldTransaction(db.pool,tx=>tx.query<{
  story_key:string;title:string;summary:string;source_kind:string}>(`
  SELECT story_key,title,summary,source_kind FROM ppw_world_news_items
  WHERE world_id=$1 ORDER BY year,week,story_key`,[world]));
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  const joined=await joinWorld(db.pool,{worldId:world,playerId:player,
   requestId:"join-review",expectedRevision:0});
  assert.equal(joined.status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId:world,
   playerId:player,promotionId:promotion,requestId:"claim-review",expectedRevision:1});
  assert.equal(claimed.status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_commercial_deals(world_id,deal_id,promotion_id,kind,offer_code,
    status,baseline_income,agreed_income,baseline_reach,agreed_reach,
    start_week_index,end_week_index,source,exclusive_rights,airing_day,airing_hour)
   VALUES($1,$2,$3,'BROADCAST','BROADCAST_TV','ACTIVE',
    300000,300000,80,90,0,52,'HUMAN',true,5,20)`,
   [world,dealId,promotion]));
  for(let week=1;week<=3;week++)await insertShow(week,5,.2);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,3)`,[world]));
  const cashBefore=await withWorldTransaction(db.pool,tx=>tx.query<{cash:string}>(`
   SELECT cash::text FROM ppw_promotions WHERE world_id=$1 AND promotion_id=$2`,
   [world,promotion]));
  const first=await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,3));
  assert.equal(first.bonusPromotions,0,
   "Three below-target TV ratings cannot earn network performance money");
  const stories=await news();
  assert.equal(stories.filter(s=>s.story_key.includes("broadcast:network:")).length,1);
  assert.match(stories[0]!.title,/BBS Sports/);
  assert.equal(stories[0]!.source_kind,"EVENT");
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{cash:string}>(`
   SELECT cash::text FROM ppw_promotions WHERE world_id=$1 AND promotion_id=$2`,
   [world,promotion]));
  assert.deepEqual(after,cashBefore,"A poor rating never invents penalties against guaranteed cash");
  await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,3));
  assert.deepEqual(await news(),stories,"World news is idempotent on replay");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=4 WHERE world_id=$1",[world]));
  const business=await readBusinessWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player});
  const review=business.commercialAgreements.find(x=>x.kind==="BROADCAST")?.networkReview;
  assert.equal(review?.missedConsecutively,3);
  assert.equal(review?.status,"BELOW_TARGET");
  assert.equal(review?.milestone,"WARNING");
  await insertShow(4,6,4.9);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,4)`,[world]));
  const offSlot=await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,4));
  assert.equal(offSlot.bonusPromotions,0,
   "A strong card airing outside the signed day cannot claim network incentives");
  const offSlotRating=await withWorldTransaction(db.pool,tx=>tx.query<{
   ratings_war_opponents:number|null}>(`
   SELECT ratings_war_opponents FROM ppw_show_economics
   WHERE world_id=$1 AND show_id='network-tv-4'`,[world]));
  assert.equal(offSlotRating[0]!.ratings_war_opponents,0,
   "Off-slot broadcasts are excluded from real-time ratings battles");
  await insertShow(5,5,4.9);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,5)`,[world]));
  const restored=await withWorldTransaction(db.pool,tx=>settleCommercialWorldWeek(tx,world,1,5));
  assert.equal(restored.bonusPromotions,1,
   "A recovered network programme earns the real performance bonus again");
  const latest=await news();
  assert.ok(latest.some(x=>x.story_key.includes("recovery:")));
  const published=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:promotion,playerId:player});
  assert.ok(published.stories.some(x=>x.id.includes("broadcast:network:")));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_show_economics","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_contract_offers",
    "ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_championships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
