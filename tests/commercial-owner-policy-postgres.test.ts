import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {markPreparedShowReadyAsActor,saveCardEditorAsActor} from "../src/api/world-service.js";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {addPromotion,createWorld} from "../src/db/world-operations.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";

const url=process.env.PPW_NEON_TEST_URL;

test("matched owners retain control and bear the cost of their actual venue and talent choices",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3);
 const worlds:string[]=[],players:string[]=[];
 const run=async(policy:"disciplined"|"reckless")=>{
  const worldId="owner-policy-"+randomUUID(),playerId="owner-"+worldId;
  worlds.push(worldId);
  players.push(playerId);
  const promotionId="company",showId="weekly-show",opening=350000;
  const expensive=policy==="reckless";
  const context={pool:db.pool,actor:{playerId}};
  const chosen=[expensive?"premium-a":"local-a",expensive?"premium-b":"local-b"];
  const participants=chosen.map(personId=>({personId,contractId:"deal-"+personId}));
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Matched commercial decisions",seed:41,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Local Pro Wrestling",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_worlds SET show_economics_enabled=true,injury_rate_multiplier=0 WHERE world_id=$1`,[worldId]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
    wrestling_interest,spending_index) VALUES($1,'home','Home',75,75,100)`,[worldId]);
   await tx.query(`UPDATE ppw_promotions SET cash=$3,home_market_id='home',media_reach=50,
    management_mode='HUMAN',financial_distress='HEALTHY',weekly_fixed_overhead=5000,weekly_media_income=20000,
    weekly_sponsor_income=5000 WHERE world_id=$1 AND promotion_id=$2`,
    [worldId,promotionId,opening]);
   await tx.query(`INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,
    awareness,live_strength,loyalty) VALUES($1,$2,'home',55,55,55)`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name,market_id,capacity,weekly_hire_cost,status)
    VALUES($1,'hall','Hall','home',1500,4000,'ACTIVE'),
          ($1,'stadium','Stadium','home',16000,350000,'ACTIVE')`,[worldId]);
   for(const [index,personId] of ["local-a","local-b","premium-a","premium-b"].entries()){
    const premium=index>=2;
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     in_ring_quality,match_craft,presentation,stamina,safety,popularity,recognition,default_alignment,fatigue,wear,momentum)
     VALUES($1,$2,$2,'MEN',73,77,73,87,95,$3,$3,$4,5,5,60)`,
     [worldId,personId,premium?75:55,index%2===0?"HEEL":"FACE"]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,
     status,remaining_dates,expires_week_index,appearance_fee)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',8,12,$5)`,
     [worldId,"deal-"+personId,personId,promotionId,premium?26000:2500]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_day,venue_id,market_id,show_name,booking_class,event_importance,event_type,ticket_strategy)
    VALUES($1,$2,$3,1,1,'DRAFT',3,$4,'home','Weekly Show','REGULAR',65,'REGULAR','STANDARD')`,
    [worldId,showId,promotionId,expensive?"stadium":"hall"]);
  });
  const revision=async()=>Number((await withWorldTransaction(db.pool,tx=>
   tx.query<{revision:string}>("SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId])))[0]!.revision);
  assert.equal((await saveCardEditorAsActor(context,{worldId,promotionId,showId,
   requestId:"book",expectedRevision:await revision(),matches:[{slotId:"main",payload:{
    matchType:"SINGLES",family:"INDIVIDUAL",participants,
    sides:[{sideId:"A",participants:[participants[0]!]},{sideId:"B",participants:[participants[1]!]}],
    scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18,
   }}],runningOrder:["main"]})).status,"APPLIED");
  assert.equal((await markPreparedShowReadyAsActor(context,{worldId,promotionId,showId,
   requestId:"ready",expectedRevision:await revision(),confirmReadyToRun:true})).status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[worldId]));
  assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"manual-lock",
   expectedRevision:await revision()})).status,"APPLIED");
  const published=await driveWorldResolution(db.pool,{worldId,resolutionId:"matched-policy",maxStages:16});
  assert.equal(published.status,"PUBLISHED",JSON.stringify(published));
  const [row]=await withWorldTransaction(db.pool,tx=>tx.query<{
   cash:string;last_weekly_net:string;attendance:number;gate_revenue:string;venue_cost:string;
   production_cost:string;travel_cost:string;appearance_fees:string;player_id:string;
  }>(`SELECT p.cash,p.last_weekly_net,e.attendance,e.gate_revenue,e.venue_cost,
   e.production_cost,e.travel_cost,e.appearance_fees,c.player_id
   FROM ppw_promotions p JOIN ppw_show_economics e USING(world_id,promotion_id)
   JOIN ppw_promotion_controls c USING(world_id,promotion_id)
   WHERE p.world_id=$1 AND p.promotion_id=$2`,[worldId,promotionId]));
  assert.ok(row);
  assert.equal(row.player_id,playerId);
  assert.equal(Number(row.cash)-opening,Number(row.last_weekly_net));
  return {cash:Number(row.cash),net:Number(row.last_weekly_net),attendance:row.attendance,
   gate:Number(row.gate_revenue),venue:Number(row.venue_cost),production:Number(row.production_cost),
   travel:Number(row.travel_cost),appearance:Number(row.appearance_fees)};
 };
 try {
  const disciplined=await run("disciplined"),reckless=await run("reckless");
  console.log("Matched owner settlement",JSON.stringify({disciplined,reckless}));
  assert.equal(disciplined.appearance,5000);
  assert.equal(reckless.appearance,52000);
  assert.ok(disciplined.net>0);
  assert.ok(reckless.net<0);
  assert.ok(reckless.gate-disciplined.gate<reckless.venue-disciplined.venue);
 } finally {
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_world_moments","ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_medical_absences","ppw_completed_match_evidence","ppw_individual_field_career_effects",
    "ppw_completed_show_matches","ppw_show_economics","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances","ppw_week_prepared_finalizations",
    "ppw_week_logistics_authorizations","ppw_week_continuity_assessments","ppw_ledger_events",
    "ppw_command_receipts","ppw_card_slots","ppw_booking_drafts","ppw_contracts","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_markets","ppw_worlds",
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=ANY($1::text[])",[worlds]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
  }).finally(()=>db.close());
 }
});
