import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {planNextWorldResolutionAction,executeNextWorldResolutionStage}
 from "../src/db/world-resolution-pipeline.js";
import {advanceResolvedWorldWeek} from "../src/db/week-advancement.js";
import type {OfferTerms} from "../src/domain/contract-economics.js";

const url=process.env.PPW_NEON_TEST_URL;
test("World-resolution integration: pending offer blocks publication, is settled, and starts next paid week",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const uuid=randomUUID(),world="auto-publish-"+uuid,promo="promo-"+uuid,
  person="performer-"+uuid,offer="new-signing-"+uuid,show="show-"+uuid,
  renewPerson="renew-performer-"+uuid,renewContract="renew-contract-"+uuid,
  renewal="renew-proposal-"+uuid,
  db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"World contract integration",seed:12,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"Global studio",tier:"GLOBAL"});
   await tx.query("UPDATE ppw_promotions SET cash=100000,media_reach=95 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,recognition,popularity,
    in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)
    VALUES($1,$2,'Main Event Talent','ACTIVE',90,90,85,85,90,80,0,'PRIME',80,$3::jsonb)`,
    [world,person,JSON.stringify({money:60,role:10,prestige:10,schedule:10,loyalty:5,exposure:5})]);
   // Certified week 10 stalled on two same-terms renewals because annual trust
   // is double precision while short-term trust is integer. Exercise the real
   // resolver with both values present (a mixed-type PostgreSQL expression).
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,recognition,popularity,
    in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)
    VALUES($1,$2,'Renewing Talent','ACTIVE',80,80,80,80,80,85,0,'PRIME',85,$3::jsonb)`,
    [world,renewPerson,JSON.stringify({money:70,role:10,prestige:10,schedule:5,loyalty:3,exposure:2})]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,start_week_index,expires_week_index,remaining_dates,date_entitlement,
    weekly_guarantee,appearance_fee,role_expectation,creative_control)
    VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',0,0,NULL,1,0,0,'REGULAR','NONE')`,
    [world,renewContract,renewPerson,promo]);
   await tx.query(`INSERT INTO ppw_contract_renewal_proposals(world_id,proposal_id,
    contract_id,promotion_id,person_id,status,created_week_index,proposed_terms)
    VALUES($1,$2,$3,$4,$5,'PENDING',0,$6::jsonb)`,
    [world,renewal,renewContract,promo,renewPerson,JSON.stringify({family:"EXCLUSIVE",
     termWeeks:13,dateEntitlement:13,weeklyGuarantee:12000,appearanceFee:0,
     roleExpectation:"REGULAR",creativeControl:"NONE",signingBonus:0})]);
   await tx.query(`INSERT INTO ppw_backstage_promotion_trust(world_id,promotion_id,person_id,trust)
    VALUES($1,$2,$3,70)`,[world,promo,renewPerson]);
   await tx.query(`INSERT INTO ppw_promotion_talent_trust
    (world_id,promotion_id,person_id,trust,last_evaluated_year)
    VALUES($1,$2,$3,52.5,1)`,[world,promo,renewPerson]);
   const terms:OfferTerms={family:"EXCLUSIVE",roleExpectation:"MAIN_EVENT",
    creativeControl:"CONSULTATION",startWeekIndex:0,termWeeks:13,dateEntitlement:13,
    weeklyGuarantee:20000,appearanceFee:0,signingBonus:3000};
   await tx.query(`INSERT INTO ppw_contract_offers
    (world_id,offer_id,person_id,promotion_id,submitted_week_index,terms)
    VALUES($1,$2,$3,$4,0,$5::jsonb)`,
    [world,offer,person,promo,JSON.stringify(terms)]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'test-arena','Arena')",[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',1,'test-arena')`,[world,show,promo]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'single-slot',0,'SEGMENT',$3::jsonb)`,[world,show,JSON.stringify({participants:[]})]);
   await tx.query(`INSERT INTO ppw_week_resource_clearances
    (world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
    VALUES($1,1,1,1,1,'cleared')`,[world]);
   await tx.query(`INSERT INTO ppw_show_resolutions
    (world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged)
    VALUES($1,$2,$3,0,'date-charge',0,0)`,[world,show,promo]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,'show-result',70,'{}'::jsonb,repeat('a',64))`,
    [world,promo,show]);
   await tx.query(`INSERT INTO ppw_week_resolution_seals
    (world_id,year,week,certified_promotions) VALUES($1,1,1,1)`,[world]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',
    next_lock_at=clock_timestamp()-interval '1 minute' WHERE world_id=$1`,[world]);
  });
  const before=await planNextWorldResolutionAction(db.pool,world);
  assert.equal(before.action,"RESOLVE_CONTRACTS");
  await assert.rejects(advanceResolvedWorldWeek(db.pool,{
   worldId:world,requestId:"bypass-"+uuid,expectedRevision:0,
  }),/Contract desk negotiations must resolve/);
  const stage=await executeNextWorldResolutionStage(db.pool,{
   worldId:world,requestId:"contracts-"+uuid,expectedRevision:0,resolutionId:"week-"+uuid});
  assert.equal(stage.status,"EXECUTED");
  assert.equal(stage.action,"RESOLVE_CONTRACTS");
  const settledRenewal=await withWorldTransaction(db.pool,tx=>tx.query<{status:string}>(
   "SELECT status FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND proposal_id=$2",
   [world,renewal]));
  assert.equal(settledRenewal[0]!.status,"ACCEPTED",
   "Mixed integer/double trust must not stop an otherwise acceptable renewal");
  const after=await planNextWorldResolutionAction(db.pool,world);
  assert.equal(after.action,"PUBLISH_WEEK");
  const res=await advanceResolvedWorldWeek(db.pool,{
   // The offer and renewal each posted a durable command receipt.
   worldId:world,requestId:"rollover-"+uuid,expectedRevision:2});
  assert.equal(res.status,"APPLIED");
  const rows=await withWorldTransaction(db.pool,async tx=>{
   const c=await tx.query<{start_week_index:number;expires_week_index:number;
    remaining_dates:number|null;status:string;creative_control:string}>(`
    SELECT start_week_index,expires_week_index,remaining_dates,status,creative_control
    FROM ppw_contracts WHERE world_id=$1 AND person_id=$2`,[world,person]);
   const p=await tx.query<{cash:string}>(`SELECT cash FROM ppw_promotions WHERE world_id=$1
     AND promotion_id=$2`,[world,promo]);
   const o=await tx.query<{status:string}>(`SELECT status FROM ppw_contract_offers
    WHERE world_id=$1 AND offer_id=$2`,[world,offer]);
   return {c,p,o};
  });
  assert.equal(rows.c.length,1);
  assert.equal(rows.c[0]!.start_week_index,1);
  assert.equal(rows.c[0]!.expires_week_index,13);
  assert.equal(rows.c[0]!.remaining_dates,null);
  assert.equal(rows.c[0]!.creative_control,"CONSULTATION");
  assert.equal(rows.o[0]!.status,"ACCEPTED");
  // First weekly guarantee is due NEXT week; only signing bonus is paid now.
  assert.equal(Number(rows.p[0]!.cash),97000);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_promotion_talent_trust","ppw_backstage_promotion_trust",
    "ppw_contract_renewal_proposals","ppw_ledger_events","ppw_contract_offers",
    "ppw_week_resolution_seals","ppw_week_resource_clearances","ppw_completed_shows",
    "ppw_show_resolutions","ppw_command_receipts","ppw_booking_drafts","ppw_venues",
    "ppw_contracts","ppw_people","ppw_promotions"]){
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   }
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
