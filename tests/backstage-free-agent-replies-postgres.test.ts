import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWorldMail,markWorldMailRead} from "../src/db/backstage-world-mail.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {respondToFreeAgent} from "../src/db/backstage-free-agent-replies.js";
import {submitManualContractOffer,resolvePersonContractOffers}
 from "../src/db/manual-contract-offers.js";
import type {OfferTerms} from "../src/domain/contract-economics.js";
const url=process.env.PPW_NEON_TEST_URL;

test("a published-show free agent receives an owner-only answer; a separate canonical offer decides the contract",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),worldId="recruitment-"+id,promotionId="cwa-"+id,
  rivalId="rival-"+id,playerId="owner-"+id,personId="talent-"+id,
  secondPerson="second-"+id,showId="show-"+id;
 const db=postgresPool(url!,3),scope={worldId,promotionId,playerId};
 const terms:OfferTerms={family:"LIMITED_NON_EXCLUSIVE",roleExpectation:"MAIN_EVENT",
  creativeControl:"CONSULTATION",startWeekIndex:0,termWeeks:26,
  dateEntitlement:20,weeklyGuarantee:15000,appearanceFee:12000,signingBonus:0};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Free-agent conversations",seed:42,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"GLOBAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET offer_acceptance_threshold=0 WHERE world_id=$1",
    [worldId]);
   await tx.query("UPDATE ppw_promotions SET cash=5000000,media_reach=90 WHERE world_id=$1 AND promotion_id=$2",
    [worldId,promotionId]);
   await tx.query([
    "INSERT INTO ppw_people(world_id,person_id,name,status,popularity,recognition,",
    "in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)",
    "VALUES($1,$2,'Available Prospect','ACTIVE',55,62,75,75,78,78,0,'PRIME',80,$3::jsonb)"
   ].join(" "),[worldId,personId,
    JSON.stringify({money:60,role:10,prestige:10,schedule:10,loyalty:5,exposure:5})]);
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
    "resolution_id,crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,$2,$3,1,1,$4,80,'{}'::jsonb,$5)"
   ].join(" "),[worldId,promotionId,showId,"result-"+id,"a".repeat(64)]);
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",
    [worldId]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+id,expectedRevision:0})).status,"APPLIED");
  const claim=await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"claim-"+id,expectedRevision:1});
  assert.equal(claim.status,"APPLIED");
  const original=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  const approach=original.find(x=>x.kind==="FREE_AGENT")!;
  assert.ok(approach);
  assert.equal(approach.sender,"Available Prospect");
  assert.equal(approach.targetPersonId,personId);
  assert.equal(approach.canFreeAgentRespond,true);
  assert.equal(original.filter(x=>!x.read).length,1);
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);
  const forbidden={...scope,promotionId:rivalId,mailId:approach.id,
   decision:"INVITE" as const,requestId:"rival-"+id,expectedRevision:claim.revision};
  await assert.rejects(respondToFreeAgent(db.pool,forbidden),/no longer active/);
  await assert.rejects(respondToFreeAgent(db.pool,{...scope,
   mailId:"backstage-world:"+"f".repeat(32),decision:"INVITE",
   requestId:"fake-"+id,expectedRevision:claim.revision
  }),/no longer active/);
  const input={...scope,mailId:approach.id,decision:"INVITE" as const,
   requestId:"invite-"+id,expectedRevision:claim.revision};
  const yes=await respondToFreeAgent(db.pool,input);
  assert.equal(yes.status,"APPLIED");
  assert.deepEqual(yes.result,{mailId:approach.id,personId,decision:"INVITE",
   status:"INVITED"},"A positive reply is not a signed or pending contract offer");
  assert.equal((await respondToFreeAgent(db.pool,input)).status,"REPLAYED");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===approach.id)?.freeAgentResponse?.status,"INVITED");
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_contract_offers WHERE world_id=$1",
   [worldId])))[0]?.n,0,"Backstage conversation cannot generate a fake offer");
  await assert.rejects(respondToFreeAgent(db.pool,{
   ...input,decision:"PASS",requestId:"change-mind-"+id,expectedRevision:yes.revision
  }),/already answered/);
  const offer=await submitManualContractOffer(db.pool,{
   ...scope,personId,terms,requestId:"real-offer-"+id,
   expectedRevision:yes.revision
  });
  assert.equal(offer.status,"APPLIED","Real contract desk creates the only offer");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===approach.id)?.freeAgentResponse?.status,"PENDING");
  const decision=await resolvePersonContractOffers(db.pool,{
   worldId,personId,requestId:"settle-"+id,expectedRevision:offer.revision},
   {source:"WORLD_RESOLUTION",worldId});
  assert.equal(decision.status,"APPLIED");
  assert.equal(decision.result.accepted,1);
  assert.ok((await withWorldTransaction(db.pool,tx=>tx.query<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_contracts WHERE world_id=$1 AND person_id=$2 AND status='SIGNED'",
   [worldId,personId])))[0]?.n===1,"Only original offer resolution can sign terms");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  const settled=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(settled.some(x=>x.id===approach.id),false,
   "A newly contracted wrestler cannot still claim to be a free agent");
  const result=settled.find(x=>x.subject==="I accepted your offer");
  assert.equal(result?.sender,"Available Prospect");
  assert.equal(result?.targetPersonId,personId);
  assert.equal(result?.read,false);
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:result!.id}),
   {readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:result!.id}),
   {readCount:0});
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,0);
  // The approach repeats no more often than the existing eight-week World cadence.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=9 WHERE world_id=$1",[worldId]);
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
    "resolution_id,crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,$2,'week-nine',1,9,'result-nine',80,'{}'::jsonb,$3)"
   ].join(" "),[worldId,promotionId,"b".repeat(64)]);
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,9)",
    [worldId]);
   await tx.query([
    "INSERT INTO ppw_people(world_id,person_id,name,status,popularity,recognition,",
    "in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)",
    "VALUES($1,$2,'Another Prospect','ACTIVE',48,55,70,73,70,75,0,'PRIME',80,$3::jsonb)"
   ].join(" "),[worldId,secondPerson,
    JSON.stringify({money:60,role:10,prestige:10,schedule:10,loyalty:5,exposure:5})]);
  });
  const next=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.kind==="FREE_AGENT"&&x.canFreeAgentRespond);
  assert.equal(next?.targetPersonId,secondPerson);
  const pass=await respondToFreeAgent(db.pool,{
   ...scope,mailId:next!.id,decision:"PASS",requestId:"no-"+id,
   expectedRevision:decision.revision
  });
  assert.equal(pass.status,"APPLIED");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===next!.id)?.freeAgentResponse?.status,"DECLINED");
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_contract_offers WHERE world_id=$1",
   [worldId])))[0]?.n,1);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_backstage_free_agent_replies","ppw_contract_offers",
    "ppw_contract_renewal_proposals","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_world_news_items","ppw_world_news_weeks","ppw_completed_shows",
    "ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
