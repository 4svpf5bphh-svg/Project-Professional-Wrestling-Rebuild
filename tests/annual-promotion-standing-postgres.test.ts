import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {evaluateYearEndPromotionStandings} from "../src/db/annual-promotion-standing.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Week 52 standing uses verified year-end attendance, titles and roster without altering a scripted finish",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),world="annual-standing-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Annual company fixture",seed:1,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"home",name:"Home",tier:"GLOBAL"});
   await addPromotion(tx,world,{id:"legacy",name:"Legacy",tier:"LOCAL"});
   await tx.query(
    "UPDATE ppw_promotions SET media_reach=CASE WHEN promotion_id='home' THEN 90 ELSE 60 END,financial_distress='HEALTHY' WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_promotion_standings(world_id,promotion_id,prestige,
     fan_reputation,business_reputation,talent_reputation,last_evaluated_year)
    VALUES($1,'home',82,78,82,74,0),($1,'legacy',24,30,34,39,0)`,[world]);
   await tx.query(`
    INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
     wrestling_interest,spending_index)
    VALUES($1,'m','Market',70,80,100)`,[world]);
   await tx.query(`
    INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,
     awareness,live_strength,loyalty)
    VALUES($1,'home','m',70,70,60),
      ($1,'legacy','m',60,50,40)`,[world]);
   await tx.query(`
    INSERT INTO ppw_venues(world_id,venue_id,name,market_id,status,capacity,
     weekly_hire_cost,prestige,production_suitability)
    VALUES($1,'v','Arena','m','ACTIVE',1000,30000,70,80)`,[world]);
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name)
    VALUES($1,'a','A'),($1,'b','B'),($1,'c','C')`,[world]);
   await tx.query(`
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     family,status,start_week_index,expires_week_index,remaining_dates)
    VALUES($1,'ca','a','home','EXCLUSIVE','SIGNED',0,51,NULL),
      ($1,'cb','b','home','EXCLUSIVE','SIGNED',0,51,NULL),
      ($1,'cc','c','legacy','EXCLUSIVE','SIGNED',0,51,NULL)`,[world]);
   await tx.query(`
    INSERT INTO ppw_championships(world_id,promotion_id,championship_id,
     name,division,status,prestige)
    VALUES($1,'home','title','World title','SINGLES','ACTIVE',72)`,[world]);
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status,show_day,venue_id,market_id,event_type)
    VALUES($1,'good','home',1,52,'SUBMITTED',2,'v','m','MAJOR'),
      ($1,'unknown','legacy',1,52,'SUBMITTED',3,'v','m','REGULAR')`,[world]);
   // The new writer stores the actual booked IDs within the existing
   // show resolution INSERT, not an extra history row per wrestler.
   await tx.query(`
    INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,
     resolved_week_index,command_request_id,performers_count,dates_charged,
     appearance_person_ids)
    VALUES($1,'good','home',51,'good-resolve',2,0,'["a","b"]'::jsonb),
      ($1,'unknown','legacy',51,'legacy-resolve',1,0,NULL)`,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
     year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,'home','good',1,52,'result-good',80,'{}'::jsonb,repeat('a',64)),
      ($1,'legacy','unknown',1,52,'result-legacy',70,'{}'::jsonb,repeat('b',64))`,[world]);
   await tx.query(`
    INSERT INTO ppw_show_economics(world_id,show_id,promotion_id,year,week,
     attendance,expected_demand,gate_revenue,venue_cost,production_cost,
     travel_cost,appearance_fees,total_cost,net_result,incremental_cash,
     average_match_rating)
    VALUES($1,'good','home',1,52,900,1000,90000,30000,10000,5000,
     0,45000,45000,45000,4),
      ($1,'unknown','legacy',1,52,800,1000,80000,30000,10000,5000,
     0,45000,35000,35000,3)`,[world]);
  });
  const before=await withWorldTransaction(db.pool,tx=>tx.query(
   "SELECT * FROM ppw_promotion_standings WHERE world_id=$1 ORDER BY promotion_id",[world]));
  const zero=await evaluateYearEndPromotionStandings({
   async query(){throw new Error("Ordinary weeks must not query annual standings");}
  },world,1,51);
  assert.deepEqual(zero,{evaluated:0,unverifiable:0});
  const meter=new MeasuredQuerySession("one-year-company-evaluation");
  const result=await withWorldTransaction(db.pool,tx=>evaluateYearEndPromotionStandings({
   query:<T extends Record<string,unknown>>(sql:string,args:readonly unknown[])=>
    meter.execute(()=>tx.query<T>(sql,args))
  },world,1,52));
  assert.deepEqual(result,{evaluated:1,unverifiable:1},
   "Legacy appearances without actual identities must not be invented");
  const measured=meter.assertBudget({maxQueries:2,maxResultBytes:10000});
  assert.equal(measured.queryCount,2);
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;prestige:number;fan_reputation:number;
   business_reputation:number;talent_reputation:number;last_evaluated_year:number
  }>("SELECT promotion_id,prestige,fan_reputation,business_reputation,talent_reputation,last_evaluated_year FROM ppw_promotion_standings WHERE world_id=$1 ORDER BY promotion_id",[world]));
  assert.deepEqual(after[0],{
   promotion_id:"home",prestige:81.9,fan_reputation:78.4,
   business_reputation:85.1,talent_reputation:77.1,last_evaluated_year:1
  });
  assert.equal(after[1]!.last_evaluated_year,0);
  const receipts=await withWorldTransaction(db.pool,tx=>tx.query<{
   event_type:string;year:number;week:number;payload:{promotionId:string;prestigeDelta:number}
  }>("SELECT event_type,year,week,payload FROM ppw_ledger_events WHERE world_id=$1",[world]));
  assert.equal(receipts.length,1);
  assert.equal(receipts[0]!.event_type,"PROMOTION_STANDING_UPDATED");
  assert.equal(receipts[0]!.year,1);assert.equal(receipts[0]!.week,52);
  assert.equal(receipts[0]!.payload.promotionId,"home");
  assert.equal(receipts[0]!.payload.prestigeDelta,-0.1);
  const replay=await withWorldTransaction(db.pool,tx=>
   evaluateYearEndPromotionStandings(tx,world,1,52));
  assert.deepEqual(replay,{evaluated:0,unverifiable:1});
  assert.deepEqual(before[1]!.promotion_id,"legacy");
  const receiptsAfter=await withWorldTransaction(db.pool,tx=>tx.query<{
   n:number
  }>("SELECT count(*)::integer AS n FROM ppw_ledger_events WHERE world_id=$1",[world]));
  assert.equal(receiptsAfter[0]!.n,1,"A replay never re-evaluates the same year");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_ledger_events","ppw_show_economics",
    "ppw_completed_shows","ppw_show_resolutions","ppw_booking_drafts",
    "ppw_championships","ppw_contracts","ppw_people",
    "ppw_promotion_market_states","ppw_venues","ppw_promotion_standings",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
