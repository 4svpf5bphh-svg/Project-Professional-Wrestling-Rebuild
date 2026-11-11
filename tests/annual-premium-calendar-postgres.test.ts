import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {saveAnnualPremiumPlan} from "../src/db/annual-premium-calendar.js";
import {readPromotionCalendar,archivePromotionSeries}
 from "../src/db/calendar-workspace.js";
import {readSixWeekPlanner,planShowWeek} from "../src/db/planner-workspace.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("one 52-week PPV confirmation creates playable booked events, protects them, rolls years and isolates human managers",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const db=postgresPool(url!,3),u=randomUUID();
 const worldId="annual-"+u,promotionId="indie",playerId="owner-"+u,
  other="rival-"+u;
 const scope={worldId,promotionId,playerId};
 const measure=(name:string)=>{
  const meter=new MeasuredQuerySession(name);
  const pool:TransactionPool={async connect(){
   const connection=await db.pool.connect();
   return {query:<T extends Record<string,unknown>>(sql:string,args:readonly unknown[])=>
    meter.execute(()=>connection.query<T>(sql,args)),
    release:()=>connection.release()};
  }};
  return {meter,pool};
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"PPW Year Planner",seed:29,rulesetVersion:"test"});
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,
     audience_potential,wrestling_interest,spending_index)
     VALUES($1,'home','Home',80,70,90)`,[worldId]);
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"rival",name:"WWE",tier:"GLOBAL"});
   await tx.query(`UPDATE ppw_promotions SET home_market_id='home'
     WHERE world_id=$1`,[worldId]);
   await tx.query(`INSERT INTO ppw_promotion_market_states(
    world_id,promotion_id,market_id,awareness,live_strength,loyalty)
    VALUES($1,'indie','home',55,52,41),($1,'rival','home',75,78,68)`,[worldId]);
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name,market_id,
    capacity,weekly_hire_cost,status)
    VALUES($1,'cwa-arena','CWA Arena','home',2000,9000,'ACTIVE')`,[worldId]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,other]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[worldId,playerId,other]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'indie'),($1,$3,'rival')`,[worldId,playerId,other]);
  });
  const firstMeasure=measure("year-owner-calendar");
  const before=await readPromotionCalendar(firstMeasure.pool,scope);
  assert.equal(firstMeasure.meter.assertBudget({maxQueries:3,maxResultBytes:18000}).queryCount,3);
  assert.equal(before.annual?.tier,"LOCAL");
  assert.equal(before.annual?.policyStartYear,1);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET premium_plan_start_year=2 WHERE world_id=$1",[worldId]));
  await assert.rejects(saveAnnualPremiumPlan(db.pool,{...scope,
   requestId:"do-not-touch-live-year",expectedRevision:0,year:1,
   events:before.annual!.years[0]!.suggested}),
   /grandfathered and cannot be rewritten/);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET premium_plan_start_year=1 WHERE world_id=$1",[worldId]));
  assert.equal(before.annual?.years[0]?.confirmed,false);
  assert.deepEqual(before.annual?.years[0]?.events,[]);
  assert.equal(before.annual?.years[0]?.suggested.length,3);
  assert.equal(before.weeks[3]?.shows.filter(x=>x.eventType==="MAJOR").length,0,
   "New Worlds must not automatically book 13 local-company PPVs");
  assert.ok(before.worldWeeks.some(w=>w.events.some(e=>
   e.promotionId==="rival"&&e.name==="Royal Rumble")),
   "AI rivals use recognizable real-life premium dates even before the owner visits");
  const suggested=before.annual!.years[0]!.suggested.map((event,i)=>i===0?
   {...event,name:"CWA Spring Riot"}:event);
  const accepted=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "saveAnnualPremium",{worldId,promotionId,
    requestId:"confirm-year-1",expectedRevision:0,year:1,events:suggested});
  assert.equal((accepted as {status:string}).status,"APPLIED");
  const replay=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "saveAnnualPremium",{worldId,promotionId,
    requestId:"confirm-year-1",expectedRevision:0,year:1,events:suggested});
  assert.equal((replay as {status:string}).status,"REPLAYED");
  const saved=await readPromotionCalendar(db.pool,scope);
  assert.equal(saved.annual?.years[0]?.confirmed,true);
  assert.deepEqual(saved.annual?.years[0]?.events,suggested);
  assert.equal(saved.worldRevision,1);
  assert.ok(saved.weeks[11]!.shows.some(s=>s.name==="CWA Spring Riot"));
  assert.equal(saved.weeks[7]!.shows.filter(x=>x.eventType==="MAJOR").length,0);
  const badEvents=Array.from({length:5},(_,i)=>({
   seriesId:suggested[0]!.seriesId,week:3+i*10}));
  await assert.rejects(saveAnnualPremiumPlan(db.pool,{...scope,
   requestId:"over-cap",expectedRevision:1,year:1,events:badEvents}),
   /cannot schedule more/);
  await assert.rejects(saveAnnualPremiumPlan(db.pool,{...scope,
   playerId:other,requestId:"not-owner",expectedRevision:1,year:1,
   events:suggested}),/owner|permission|denied|controlled/i);
  const plannerMeasure=measure("year-owner-planner");
  const planner=await readSixWeekPlanner(plannerMeasure.pool,scope);
  assert.equal(plannerMeasure.meter.assertBudget({maxQueries:4,maxResultBytes:26000}).queryCount,4);
  assert.equal(planner.weeks[0]?.scheduled.some(s=>s.eventType==="MAJOR"),false);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=12 WHERE world_id=$1",[worldId]));
  const atEvent=await readSixWeekPlanner(db.pool,scope);
  assert.ok(atEvent.weeks[0]!.scheduled.some(s=>s.name==="CWA Spring Riot"));
  await assert.rejects(planShowWeek(db.pool,{...scope,
   requestId:"off-date",expectedRevision:1,year:1,week:13,
   day:6,venueId:"cwa-arena",marketId:"home",
   eventType:"MAJOR",ticketStrategy:"STANDARD",
   showSeriesId:suggested[0]!.seriesId}),/confirmed annual calendar/);
  const booked=await planShowWeek(db.pool,{...scope,requestId:"book-ppv",
   expectedRevision:1,year:1,week:12,day:6,
   venueId:"cwa-arena",marketId:"home",ticketStrategy:"STANDARD",
   eventType:"MAJOR",showSeriesId:suggested[0]!.seriesId});
  assert.equal(booked.status,"APPLIED");
  const event=await readSixWeekPlanner(db.pool,scope);
  assert.equal(event.weeks[0]?.shows[0]?.bookingClass,"PREMIUM");
  assert.equal(event.weeks[0]?.shows[0]?.showName,"CWA Spring Riot");
  assert.equal(event.weeks[0]?.shows[0]?.day,6);
  await assert.rejects(saveAnnualPremiumPlan(db.pool,{...scope,
   requestId:"move-booked",expectedRevision:2,year:1,
   events:suggested.filter(x=>x.week!==12)}),/cannot be cancelled|weeks between/);
  await assert.rejects(archivePromotionSeries(db.pool,{...scope,
   requestId:"archive-booked",expectedRevision:2,
   seriesId:suggested[0]!.seriesId}),/confirmed annual PPV plan/);
  const future=await saveAnnualPremiumPlan(db.pool,{...scope,
   requestId:"year-two",expectedRevision:2,year:2,
   events:before.annual!.years[1]!.suggested});
  assert.equal(future.status,"APPLIED");
  const count=await withWorldTransaction(db.pool,tx=>tx.query<{year:number;size:number}>(`
   SELECT year,jsonb_array_length(events) AS size FROM ppw_annual_premium_plans
   WHERE world_id=$1 AND promotion_id=$2 ORDER BY year`,[worldId,promotionId]));
  assert.deepEqual(count,[{year:1,size:3},{year:2,size:3}],
   "Only two compact year rows, never 104 generated show rows");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_annual_premium_plans","ppw_booking_drafts",
    "ppw_command_receipts","ppw_show_series","ppw_promotion_controls",
    "ppw_memberships","ppw_venues","ppw_promotion_market_states",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[playerId,other]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
