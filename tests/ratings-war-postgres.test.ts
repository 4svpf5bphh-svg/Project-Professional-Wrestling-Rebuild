import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {settleRatingsWarWorldWeek} from "../src/db/ratings-war-week.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Ratings War settles all certified programmes atomically, keeps PPVs and retries exact",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="ratings-war-"+randomUUID(),db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  await withWorldTransaction(db.pool,async tx=>{
   const episodes=[
    {show:"war-main",promotion:"promotion-0",day:2,crowd:88,rating:3.2,viewers:5392000},
    {show:"war-rival",promotion:"promotion-1",day:2,crowd:64,rating:2.5,viewers:4213000},
    {show:"war-other-day",promotion:"promotion-2",day:3,crowd:90,rating:2.7,viewers:4550000}
   ];
   for(const x of episodes){
    await tx.query(`INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,booking_class,show_day,show_name,event_type)
     VALUES($1,$2,$3,1,1,'SUBMITTED','REGULAR',$4,'Certified TV','REGULAR')`,
     [world,x.show,x.promotion,x.day]);
    await tx.query(`INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,
      crowd_response,receipt_json,receipt_digest)
     VALUES($1,$2,$3,1,1,'war-receipt',$4,'{}'::jsonb,repeat('c',64))`,
     [world,x.promotion,x.show,x.crowd]);
    await tx.query(`INSERT INTO ppw_show_economics
     (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
      gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
      total_cost,net_result,incremental_cash,
      audience_format,tv_household_rating,estimated_viewers)
     VALUES($1,$2,$3,1,1,1000,1000,100000,10000,10000,0,10000,
      30000,70000,70000,'TV',$4,$5)`,
     [world,x.show,x.promotion,x.rating,x.viewers]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,booking_class,show_day,show_name,event_type)
    VALUES($1,'war-ppv','promotion-3',1,1,'SUBMITTED','PREMIUM',2,'Premium','MAJOR')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,
     crowd_response,receipt_json,receipt_digest)
    VALUES($1,'promotion-3','war-ppv',1,1,'war-receipt',91,'{}'::jsonb,repeat('d',64))`,[world]);
   await tx.query(`INSERT INTO ppw_show_economics
    (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
     gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
     total_cost,net_result,incremental_cash,audience_format,ppv_buys)
    VALUES($1,'war-ppv','promotion-3',1,1,1200,1500,110000,10000,10000,0,10000,
     30000,80000,80000,'PPV',420000)`,[world]);
  });
  const once=await withWorldTransaction(db.pool,tx=>settleRatingsWarWorldWeek(tx,world,1,1));
  assert.deepEqual(once,{broadcasts:3,contested:2,changed:2});
  type Row={show_id:string;audience_format:string;tv_household_rating:string|null;
   ratings_war_base_rating:string|null;ratings_war_opponents:number|null;
   estimated_viewers:string|null;ratings_war_base_viewers:string|null;
   ppv_buys:string|null};
  const inspect=()=>withWorldTransaction(db.pool,tx=>tx.query<Row>(`
   SELECT show_id,audience_format,tv_household_rating::text,
    ratings_war_base_rating::text,ratings_war_opponents,
    estimated_viewers::text,ratings_war_base_viewers::text,ppv_buys::text
   FROM ppw_show_economics WHERE world_id=$1
   ORDER BY show_id`,[world]));
  const rows=await inspect(),byId=new Map(rows.map(x=>[x.show_id,x]));
  assert.ok(Number(byId.get("war-main")!.tv_household_rating)>3.2);
  assert.ok(Number(byId.get("war-rival")!.tv_household_rating)<2.5);
  assert.equal(byId.get("war-main")!.ratings_war_opponents,1);
  assert.equal(byId.get("war-other-day")!.ratings_war_opponents,0);
  assert.equal(Number(byId.get("war-other-day")!.tv_household_rating),2.7);
  assert.equal(Number(byId.get("war-main")!.ratings_war_base_rating),3.2);
  assert.equal(Number(byId.get("war-rival")!.ratings_war_base_rating),2.5);
  assert.equal(byId.get("war-ppv")!.ratings_war_base_rating,null);
  assert.equal(Number(byId.get("war-ppv")!.ppv_buys),420000);
  assert.equal(byId.get("war-ppv")!.tv_household_rating,null);
  const twice=await withWorldTransaction(db.pool,tx=>settleRatingsWarWorldWeek(tx,world,1,1));
  assert.deepEqual(twice,once);
  assert.deepEqual(await inspect(),rows,"Reruns never re-transfer the same viewers");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_show_economics","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_contracts","ppw_championships",
    "ppw_people","ppw_venues","ppw_promotion_market_states",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
