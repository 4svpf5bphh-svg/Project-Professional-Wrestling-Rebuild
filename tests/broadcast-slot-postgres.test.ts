import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readSixWeekPlanner,planShowWeek} from "../src/db/planner-workspace.js";
import {readPromotionCalendar} from "../src/db/calendar-workspace.js";
import {saveAnnualPremiumPlan} from "../src/db/annual-premium-calendar.js";
import {requestBroadcastDay} from "../src/db/broadcast-day-request.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Signed weekly TV day is enforced by Planner; a network-approved change moves drafts, never PPV dates",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="tv-weekday-"+randomUUID(),owner="manager-"+randomUUID(),
  dealId="network-"+randomUUID(),promotion="promotion-0";
 const db=postgresPool(url!,3),scope={worldId:world,promotionId:promotion,playerId:owner};
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"weekday-join",expectedRevision:0})).status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"weekday-claim",expectedRevision:1});
  assert.equal(claimed.status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_worlds SET
    next_lock_at=clock_timestamp()+interval '2 days' WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_commercial_deals
    (world_id,deal_id,promotion_id,kind,offer_code,status,
     baseline_income,agreed_income,baseline_reach,agreed_reach,
     start_week_index,end_week_index,source,exclusive_rights,airing_day,airing_hour)
    VALUES($1,$2,$3,'BROADCAST','BROADCAST_GROWTH','ACTIVE',
     25000,30000,70,76,0,25,'HUMAN',true,5,20)`,[world,dealId,promotion]);
  });
  const planner=await readSixWeekPlanner(db.pool,scope);
  assert.equal(planner.broadcastSlot?.day,5);
  assert.equal(planner.broadcastSlot?.hour,20);
  assert.equal(planner.broadcastSlot?.networkName,"VibeFlix");
  const venue=planner.venues[0]!;
  assert.ok(venue,"The seeded World should provide an available venue");
  const make=(requestId:string,revision:number,day:number,draftId?:string)=>({
   ...scope,requestId,expectedRevision:revision,
   year:planner.year,week:planner.week,eventType:"REGULAR" as const,
   day,marketId:venue.marketId,venueId:venue.venueId,
   ticketStrategy:"STANDARD" as const,...(draftId?{draftId}:{})
  });
  await assert.rejects(planShowWeek(db.pool,make("bad-weekday",claimed.revision,4)),
   /requires Friday television/);
  const planned=await planShowWeek(db.pool,make("good-weekday",claimed.revision,5));
  assert.equal(planned.status,"APPLIED");
  const draft=planned.result.draftId;
  const newDay={...scope,dealId,requestedDay:4,requestId:"network-day-request",
   expectedRevision:planned.revision};
  const response=await requestBroadcastDay(db.pool,newDay);
  assert.equal(response.status,"APPLIED");
  assert.equal(response.result.airingDay,4);
  assert.equal(response.result.movedDrafts,1);
  assert.equal((await requestBroadcastDay(db.pool,newDay)).status,"REPLAYED");
  const updated=await readSixWeekPlanner(db.pool,scope);
  assert.equal(updated.broadcastSlot?.day,4);
  assert.equal(updated.weeks[0]!.shows.find(s=>s.draftId===draft)?.day,4);
  await assert.rejects(planShowWeek(db.pool,make("old-tv-night",response.revision,5,draft)),
   /requires Thursday television/);
  const resaved=await planShowWeek(db.pool,make("new-tv-night",response.revision,4,draft));
  assert.equal(resaved.status,"APPLIED");
  await assert.rejects(requestBroadcastDay(db.pool,{...newDay,
   requestId:"network-second-day",requestedDay:3,expectedRevision:resaved.revision}),
   /already approved one day change/);
  // Genesis saves may have a long premium cadence with no upcoming PPV.
  // Set up an explicit due premium series to verify weekend flexibility.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,
    event_type,cadence_weeks,anchor_week,importance,active)
   VALUES($1,$2,'weekday-ppv','Weekend Challenge','PREMIUM',
    'MAJOR',4,3,80,true)
   ON CONFLICT DO NOTHING`,[world,promotion]));
  // This is a new World, so an extra PPV series is not automatically due.
  // A manager must confirm the annual event weeks before booking one.
  const yearly=(await readPromotionCalendar(db.pool,scope)).annual!.years[0]!;
  const proposed=yearly.suggested.map((edition,i)=>i===0?
   {seriesId:"weekday-ppv",week:4,name:"Weekend Challenge"}:edition);
  const committed=await saveAnnualPremiumPlan(db.pool,{...scope,
   requestId:"confirm-network-ppv-year",expectedRevision:resaved.revision,
   year:planner.year,events:proposed});
  assert.equal(committed.status,"APPLIED");
  const ppvSchedule=await readSixWeekPlanner(db.pool,scope);
  const premiumWeek=ppvSchedule.weeks.find(w=>w.scheduled.some(x=>x.eventType==="MAJOR"));
  assert.ok(premiumWeek,"One premium event must be available in a six-week season window");
  const premium=premiumWeek!.scheduled.find(s=>s.eventType==="MAJOR")!;
  const ppv=await planShowWeek(db.pool,{...scope,requestId:"weekend-ppv",
   expectedRevision:committed.revision,year:premiumWeek!.year,week:premiumWeek!.week,
   eventType:"MAJOR",showSeriesId:premium.seriesId,day:6,
   marketId:venue.marketId,venueId:venue.venueId,ticketStrategy:"PREMIUM"});
  assert.equal(ppv.status,"APPLIED");
  const state=await readSixWeekPlanner(db.pool,scope);
  assert.ok(state.weeks.some(w=>w.shows.some(s=>
   s.draftId===ppv.result.draftId&&s.day===6&&s.bookingClass==="PREMIUM")));
  const proof=await withWorldTransaction(db.pool,tx=>tx.query<{
   airing_day:number;event_count:number}>(`
   SELECT d.airing_day,
    (SELECT count(*)::integer FROM ppw_ledger_events j
     WHERE j.world_id=d.world_id AND j.event_type='BROADCAST_SLOT_CHANGED'
      AND j.payload->>'dealId'=d.deal_id) AS event_count
   FROM ppw_commercial_deals d WHERE d.world_id=$1 AND d.deal_id=$2`,[world,dealId]));
  assert.equal(proof[0]!.event_count,1);
  assert.equal(proof[0]!.airing_day,4);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_annual_premium_plans",
    "ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_show_economics","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_contract_offers",
    "ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_championships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_show_series",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("legacy active broadcaster gets a forward-only slot without changing completed cards",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="tv-legacy-"+randomUUID(),owner="manager-"+randomUUID(),
  dealId="old-broadcast-"+randomUUID(),promotion="promotion-0";
 const db=postgresPool(url!,3),scope={worldId:world,promotionId:promotion,playerId:owner};
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"legacy-join",expectedRevision:0})).status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"legacy-claim",expectedRevision:1});
  const planner=await readSixWeekPlanner(db.pool,scope);
  const venue=planner.venues[0]!;
  assert.ok(venue);
  const make=(week:number,day:number,revision:number)=>planShowWeek(db.pool,{
   ...scope,requestId:"legacy-plan-"+week,expectedRevision:revision,year:1,week,
   eventType:"REGULAR",day,marketId:venue.marketId,venueId:venue.venueId,
   ticketStrategy:"STANDARD"
  });
  const first=await make(1,5,claimed.revision);
  assert.equal(first.status,"APPLIED");
  const second=await make(2,4,first.revision);
  assert.equal(second.status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_commercial_deals
   (world_id,deal_id,promotion_id,kind,offer_code,status,
    baseline_income,agreed_income,baseline_reach,agreed_reach,
    start_week_index,end_week_index,source,exclusive_rights,airing_day,airing_hour)
   VALUES($1,$2,$3,'BROADCAST','BROADCAST_STABLE','ACTIVE',
    20000,25000,70,75,0,25,'HUMAN',true,NULL,NULL)`,
   [world,dealId,promotion]));
  assert.equal((await readSixWeekPlanner(db.pool,scope)).broadcastSlot,null);
  const migration=readFileSync(new URL("../db/migrations/0144_legacy_broadcast_slot_recovery.sql",import.meta.url),"utf8");
  // Test the shipped SQL but scope the rehearsal to this disposable World.
  const scoped=migration.replace(" WHERE d.kind='BROADCAST' AND d.status='ACTIVE'",
   " WHERE d.world_id=$1 AND d.kind='BROADCAST' AND d.status='ACTIVE'");
  assert.notEqual(scoped,migration);
  await withWorldTransaction(db.pool,tx=>tx.query(scoped,[world]));
  await withWorldTransaction(db.pool,tx=>tx.query(scoped,[world]));
  const current=await readSixWeekPlanner(db.pool,scope);
  assert.equal(current.broadcastSlot?.day,5,
   "Preserve the manager's already booked Friday over the network's Saturday default");
  assert.equal(current.broadcastSlot?.hour,19);
  assert.deepEqual(current.weeks.slice(0,2).map(w=>w.shows[0]?.day),[5,5],
   "Only unsubmitted future dates are moved; no show cards are destroyed");
  const calendar=await readPromotionCalendar(db.pool,scope);
  assert.equal(calendar.broadcastSlot?.day,5);
  const evidence=await withWorldTransaction(db.pool,tx=>tx.query<{
   event_type:string;effective_week_index:number}>(`
    SELECT event_type,(payload->>'effectiveWeekIndex')::integer AS effective_week_index
    FROM ppw_ledger_events WHERE world_id=$1 AND event_type='BROADCAST_SLOT_RECOVERED'`,[world]));
  assert.equal(evidence.length,1,
   "A second migration run cannot issue a duplicate recovery or shift the schedule");
  assert.equal(evidence[0]!.effective_week_index,0);
  const adjusted=await requestBroadcastDay(db.pool,{...scope,dealId,requestedDay:4,
   requestId:"first-real-renegotiation",expectedRevision:second.revision});
  assert.equal(adjusted.status,"APPLIED",
   "Restoring an omitted legacy schedule does not use the player's one negotiated change");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_annual_premium_plans","ppw_commercial_bonus_receipts",
    "ppw_commercial_deals","ppw_show_economics","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts","ppw_contract_offers",
    "ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_championships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_show_series",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
