import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {submitManualContractOffer,readPendingContractOffers,
 resolvePersonContractOffers} from "../src/db/manual-contract-offers.js";
import {requestAdditionalDates} from "../src/db/contract-date-requests.js";
import {resolveDateRequest} from "../src/db/contract-date-decisions.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import type {OfferTerms} from "../src/domain/contract-economics.js";

const url=process.env.PPW_NEON_TEST_URL;
test("PostgreSQL: two human promoters compete for one wrestler; addenda, renewal, secrecy and replay",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const id=randomUUID(),world="offers-"+id,pA="promo-a-"+id,pB="promo-b-"+id,
  playerA="player-a-"+id,playerB="player-b-"+id,person="worker-"+id,
  addendumPerson="worker2-"+id,source="source-"+id;
 const db=postgresPool(url!,3);
 const limited:OfferTerms={family:"LIMITED_NON_EXCLUSIVE",roleExpectation:"MAIN_EVENT",
  creativeControl:"CONSULTATION",startWeekIndex:0,termWeeks:13,dateEntitlement:5,
  weeklyGuarantee:8000,appearanceFee:5000,signingBonus:4000};
 const exclusive:OfferTerms={...limited,family:"EXCLUSIVE",creativeControl:"FULL_APPROVAL",
  weeklyGuarantee:16000,appearanceFee:0,signingBonus:5000,dateEntitlement:13};
 const system={source:"WORLD_RESOLUTION" as const,worldId:world};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Human offers",seed:7,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:pA,name:"Indie",tier:"INDEPENDENT"});
   await addPromotion(tx,world,{id:pB,name:"Global",tier:"GLOBAL"});
   await tx.query(`UPDATE ppw_promotions SET cash=200000,media_reach=
    CASE WHEN promotion_id=$2 THEN 40 ELSE 95 END WHERE world_id=$1`,[world,pA]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,recognition,popularity,
    in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)
    VALUES($1,$2,'Wrestler A','ACTIVE',85,80,85,85,90,80,0,'PRIME',80,$4::jsonb),
      ($1,$3,'Wrestler B','ACTIVE',75,72,80,80,85,80,0,'PRIME',80,$4::jsonb)`,
      [world,person,addendumPerson,JSON.stringify({money:60,role:10,prestige:10,schedule:10,loyalty:5,exposure:5})]);
  });
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:playerA,requestId:"join-a-"+id,expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:playerA,promotionId:pA,
   requestId:"claim-a-"+id,expectedRevision:1})).status,"APPLIED");
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:playerB,requestId:"join-b-"+id,expectedRevision:2})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:playerB,promotionId:pB,
   requestId:"claim-b-"+id,expectedRevision:3})).status,"APPLIED");
  await assert.rejects(submitManualContractOffer(db.pool,{worldId:world,playerId:playerB,
   promotionId:pA,personId:person,requestId:"hijack-"+id,expectedRevision:4,terms:limited}),/access denied/);
  const offerA="offer-a-"+id,offerB="offer-b-"+id;
  assert.equal((await submitManualContractOffer(db.pool,{worldId:world,playerId:playerA,
   promotionId:pA,personId:person,requestId:offerA,expectedRevision:4,terms:limited})).status,"APPLIED");
  assert.equal((await submitManualContractOffer(db.pool,{worldId:world,playerId:playerB,
   promotionId:pB,personId:person,requestId:offerB,expectedRevision:5,terms:exclusive})).status,"APPLIED");
  const privateInbox=await readPendingContractOffers(db.pool,world,playerA,pA);
  assert.equal(privateInbox.length,1);
  assert.equal(privateInbox[0]!.offer_id,offerA);
  assert.equal((await readContractDesk(db.pool,world,playerA,pA)).summary.pendingOffers,1);
  await assert.rejects(readPendingContractOffers(db.pool,world,playerB,pA),/access denied/);
  await assert.rejects(resolvePersonContractOffers(db.pool,{worldId:world,personId:person,
   requestId:"forbidden-"+id,expectedRevision:6},{source:"WORLD_RESOLUTION",worldId:"wrong"}),/authority/);
  const result=await resolvePersonContractOffers(db.pool,{worldId:world,personId:person,
   requestId:"resolve-"+id,expectedRevision:6},system);
  assert.equal(result.status,"APPLIED");
  assert.equal(result.result.accepted,1);
  assert.equal(result.result.rejected,1);
  assert.equal(result.result.decisions.find(d=>d.id===offerB)?.status,"ACCEPTED");
  assert.equal(result.result.decisions.find(d=>d.id===offerA)?.status,"REJECTED");
  assert.equal((await resolvePersonContractOffers(db.pool,{worldId:world,personId:person,
   requestId:"resolve-"+id,expectedRevision:6},system)).status,"REPLAYED");
  const exclusiveRows=await withWorldTransaction(db.pool,tx=>tx.query<{promotion_id:string;family:string;
   appearance_fee:string;creative_control:string}>(`SELECT promotion_id,family,appearance_fee,creative_control
    FROM ppw_contracts WHERE world_id=$1 AND person_id=$2`,[world,person]));
  assert.deepEqual(exclusiveRows.map(r=>r.promotion_id),[pB]);
  assert.equal(exclusiveRows[0]!.family,"EXCLUSIVE");
  assert.equal(exclusiveRows[0]!.creative_control,"FULL_APPROVAL");
  assert.equal(Number(exclusiveRows[0]!.appearance_fee),0);
  await withWorldTransaction(db.pool,tx=>tx.query(`INSERT INTO ppw_contracts(
   world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,
   start_week_index,expires_week_index,date_entitlement,weekly_guarantee,appearance_fee)
   VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',0,0,12,5,100,900)`,
   [world,source,addendumPerson,pA]));
  const add="dates-"+id;
  assert.equal((await requestAdditionalDates(db.pool,{worldId:world,playerId:playerA,
   promotionId:pA,contractId:source,requestId:add,expectedRevision:7,
   additionalDates:2,additionalPayment:1000})).status,"APPLIED");
  const answered=await resolveDateRequest(db.pool,{worldId:world,playerId:"system",
   promotionId:pA,dateRequestId:add,requestId:"dates-resolve-"+id,
   expectedRevision:8,decision:"ACCEPTED"},system);
  assert.equal(answered.status,"APPLIED");
  assert.equal(answered.result.datesGranted,2);
  assert.equal(answered.result.additionalPayment,1000);
  const row=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number;date_entitlement:number}>(`
   SELECT remaining_dates,date_entitlement FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2`,
   [world,source]));
  assert.equal(row[0]!.remaining_dates,2);
  assert.equal(row[0]!.date_entitlement,7);
  const renewalTerms:OfferTerms={...limited,startWeekIndex:13,termWeeks:13,
   weeklyGuarantee:12000,appearanceFee:5000,signingBonus:2000};
  const renew="renegotiate-"+id;
  assert.equal((await submitManualContractOffer(db.pool,{worldId:world,playerId:playerA,promotionId:pA,
   personId:addendumPerson,sourceContractId:source,requestId:renew,
   expectedRevision:9,terms:renewalTerms})).status,"APPLIED");
  const renewed=await resolvePersonContractOffers(db.pool,{worldId:world,personId:addendumPerson,
   requestId:"renegotiate-resolve-"+id,expectedRevision:10},system);
  assert.equal(renewed.status,"APPLIED");
  assert.equal(renewed.result.accepted,1);
  const reservation=await withWorldTransaction(db.pool,tx=>tx.query<{status:string;proposed_terms:{
    creativeControl:string;weeklyGuarantee:number;termWeeks:number}}>(`SELECT status,proposed_terms
    FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND contract_id=$2`,[world,source]));
  assert.equal(reservation[0]!.status,"ACCEPTED");
  assert.equal(reservation[0]!.proposed_terms.weeklyGuarantee,12000);
  assert.equal(reservation[0]!.proposed_terms.termWeeks,13);
  const final=await readContractDesk(db.pool,world,playerA,pA);
  assert.equal(final.summary.pendingOffers,0);
  assert.equal(final.roster[0]!.weeklyGuarantee,100);
  assert.equal(final.roster[0]!.remainingDates,2);
  const cash=await withWorldTransaction(db.pool,tx=>tx.query<{promotion_id:string;cash:string}>(`
    SELECT promotion_id,cash FROM ppw_promotions WHERE world_id=$1 ORDER BY promotion_id`,[world]));
  assert.equal(Number(cash.find(c=>c.promotion_id===pA)!.cash),200000-1000-2000);
  assert.equal(Number(cash.find(c=>c.promotion_id===pB)!.cash),200000-5000);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_contract_offers","ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_people","ppw_promotions"]){
     await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[playerA,playerB]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
