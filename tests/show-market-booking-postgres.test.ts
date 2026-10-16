import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {chooseShowMarketAndTickets,readShowMarketOptions}
 from "../src/db/show-booking-commerce.js";
import {markPreparedShowReady} from "../src/db/ready-prepared-show.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {originalExpectedDemand,originalTicketYield}
 from "../src/domain/legacy-show-economics.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Booking market and ticket selection freezes original demand; actor isolation, edit/reset and deadline are enforced",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID(),
 worldId="commercial-booking-"+id,promotionId="home-"+id,
 player="author-"+id,outsider="outsider-"+id,show="show-"+id;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Commercial Booking World",seed:17,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET show_economics_enabled=true WHERE world_id=$1",[worldId]);
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
    wrestling_interest,spending_index)
    VALUES($1,'home','Home',80,78,100),($1,'away','Away',55,45,70)`,[worldId]);
   await addPromotion(tx,worldId,{id:promotionId,name:"The Bookers",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET media_reach=60,home_market_id='home'
    WHERE world_id=$1 AND promotion_id=$2`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_promotion_market_states
    (world_id,promotion_id,market_id,awareness,live_strength,loyalty)
    VALUES($1,$2,'home',64,70,61),($1,$2,'away',35,20,25)`,
    [worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name,market_id,
    capacity,weekly_hire_cost,status)
    VALUES($1,'arena-home','Main Arena','home',4000,15000,'ACTIVE'),
          ($1,'arena-away','Arena Away','away',1500,5000,'ACTIVE')`,[worldId]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
    year,week,show_day,status,event_type)
    VALUES($1,$2,$3,1,1,4,'DRAFT','REGULAR')`,[worldId,show,promotionId]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,recognition,popularity,presentation)
    VALUES($1,'a','Alpha',88,80,85),($1,'b','Beta',75,65,70)`,[worldId]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'match',0,'MATCH',$3::jsonb)`,[worldId,show,
      JSON.stringify({matchType:"SINGLES",participants:[
       {personId:"a",contractId:"alpha"},{personId:"b",contractId:"beta"}],
       scriptedWinner:"a",plannedFinish:"CLEAN_PIN"})]);
  });
  await assert.rejects(readShowMarketOptions(db.pool,worldId,outsider,promotionId),
   /Promotion access denied/);
  await joinWorld(db.pool,{worldId,playerId:player,requestId:"join-"+id,expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId,playerId:player,promotionId,
   requestId:"claim-"+id,expectedRevision:1});
  const choices=await readShowMarketOptions(db.pool,worldId,player,promotionId);
  assert.deepEqual(choices.map(x=>x.venue_id),["arena-away","arena-home"]);
  assert.equal(choices[1]!.live_strength,70);
  assert.deepEqual((await readShowMarketOptions(db.pool,worldId,player,promotionId,
   "arena-away",10)).map(x=>x.venue_id),["arena-home"]);
  const cmd=(idSuffix:string,revision:number,ticketStrategy:"ACCESSIBLE"|"STANDARD"|"PREMIUM")=>
   chooseShowMarketAndTickets(db.pool,{worldId,promotionId,
    showId:show,playerId:player,requestId:idSuffix,expectedRevision:revision,
    marketId:"home",venueId:"arena-home",ticketStrategy});
  await assert.rejects(chooseShowMarketAndTickets(db.pool,{worldId,
   promotionId,showId:show,playerId:outsider,
   requestId:"steal",expectedRevision:2,
   marketId:"home",venueId:"arena-home",ticketStrategy:"STANDARD"}),
   /not owned/);
  await assert.rejects(chooseShowMarketAndTickets(db.pool,{worldId,
   promotionId,showId:show,playerId:player,
   requestId:"mismatch",expectedRevision:2,
   marketId:"home",venueId:"arena-away",ticketStrategy:"STANDARD"}),
   /must match/);
  assert.equal((await cmd("choose-1",2,"STANDARD")).status,"APPLIED");
  assert.equal((await cmd("choose-1",2,"STANDARD")).status,"REPLAYED");
  const first=await markPreparedShowReady(db.pool,{worldId,promotionId,showId:show,
   playerId:player,requestId:"ready-1",expectedRevision:3,
   confirmReadyToRun:true});
  assert.equal(first.status,"APPLIED");
  if(first.status!=="APPLIED")throw new Error("Missing author-ready");
  const forecast=originalExpectedDemand({promotionId,marketId:"home",day:4,
   eventType:"REGULAR",ticketStrategy:"STANDARD",mediaReach:60,
   market:{audiencePotential:80,wrestlingInterest:78,spendingIndex:100},
   local:{awareness:64,liveStrength:70,loyalty:61},
   people:[{recognition:88,popularity:80,presentation:85},
    {recognition:75,popularity:65,presentation:70}]});
  assert.equal(first.result.expectedDemand,forecast);
  assert.equal(first.result.ticketYield,originalTicketYield("STANDARD",100));
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
    booking_expected_demand:number|null;booking_ticket_yield:string|null;
    lock_ready_fingerprint:string|null;booking_snapshot_fingerprint:string|null}>(`
   SELECT booking_expected_demand,booking_ticket_yield::text,
    lock_ready_fingerprint,booking_snapshot_fingerprint
   FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2`,[worldId,show]));
  assert.equal(rows[0]!.booking_expected_demand,forecast);
  assert.equal(Number(rows[0]!.booking_ticket_yield),originalTicketYield("STANDARD",100));
  assert.equal(rows[0]!.booking_snapshot_fingerprint,rows[0]!.lock_ready_fingerprint);
  assert.equal((await cmd("choose-2",4,"ACCESSIBLE")).status,"APPLIED");
  const cleared=await withWorldTransaction(db.pool,tx=>tx.query<{
   booking_expected_demand:number|null;lock_ready_fingerprint:string|null}>(`
    SELECT booking_expected_demand,lock_ready_fingerprint FROM ppw_booking_drafts
    WHERE world_id=$1 AND draft_id=$2`,[worldId,show]));
  assert.equal(cleared[0]!.booking_expected_demand,null);
  assert.equal(cleared[0]!.lock_ready_fingerprint,null);
  const ready=await markPreparedShowReady(db.pool,{worldId,promotionId,
   showId:show,playerId:player,requestId:"ready-2",expectedRevision:5,
   confirmReadyToRun:true});
  assert.equal(ready.status,"APPLIED");
  if(ready.status!=="APPLIED")throw new Error("Missing second ready");
  assert.ok((ready.result.expectedDemand??0)>forecast);
  assert.notEqual(ready.result.fingerprint,first.result.fingerprint);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[worldId]));
  await assert.rejects(cmd("late-change",6,"PREMIUM"),/booking deadline passed/);
  assert.equal((await cmd("choose-2",4,"ACCESSIBLE")).status,"REPLAYED");
  // An unchanged commercial snapshot survives authoritative lock/finalize;
  // it cannot be silently re-priced during asynchronous World resolution.
  assert.equal((await lockWorldWeek(db.pool,{worldId,
    requestId:"lock-"+id,expectedRevision:6})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{worldId,
    requestId:"continuity-"+id,expectedRevision:7})).status,"APPLIED");
  const finalized=await finalizePreparedWorldShows(db.pool,{worldId,
    requestId:"finalize-"+id,expectedRevision:8});
  assert.equal(finalized.status,"APPLIED");
  if(finalized.status!=="APPLIED")throw new Error("Missing World handoff");
  assert.deepEqual(finalized.result.submittedShowIds,[show]);
  assert.deepEqual(finalized.result.review,[]);
  const afterLock=await withWorldTransaction(db.pool,tx=>tx.query<{
    status:string;booking_expected_demand:number;booking_ticket_yield:string;
    booking_snapshot_fingerprint:string;lock_ready_fingerprint:string}>(`
   SELECT status,booking_expected_demand,booking_ticket_yield::text,
    booking_snapshot_fingerprint,lock_ready_fingerprint
   FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2`,[worldId,show]));
  assert.equal(afterLock[0]!.status,"SUBMITTED");
  assert.equal(afterLock[0]!.booking_expected_demand,ready.result.expectedDemand);
  assert.equal(afterLock[0]!.booking_snapshot_fingerprint,ready.result.fingerprint);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const tbl of ["ppw_command_receipts","ppw_ledger_events",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_card_slots","ppw_booking_drafts","ppw_promotion_controls","ppw_memberships",
    "ppw_people","ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query(`DELETE FROM ${tbl} WHERE world_id=$1`,[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
