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
import {replyToBroadcaster,settleNetworkReplies} from "../src/db/backstage-network-replies.js";
import type {NetworkAudit} from "../src/db/broadcast-network-audit.js";

const url=process.env.PPW_NEON_TEST_URL;
test("owner-only certified network conversations create durable, idempotent and settled commitments",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),worldId="network-replies-"+id,
  promotionId="mine-"+id,rivalId="rival-"+id,playerId="manager-"+id,
  dealId="deal-"+id,showId="show-"+id;
 const db=postgresPool(url!,3);
 const warnings=[
  "broadcast:network:BROADCAST_GROWTH:warning:a",
  "broadcast:network:BROADCAST_GROWTH:final-warning:b",
  "broadcast:network:BROADCAST_GROWTH:warning:c"
 ];
 const scope={worldId,promotionId,playerId};
 const audit=(weekIndex:number,status:"ON_TARGET"|"BELOW_TARGET"):NetworkAudit=>({
  dealId,promotionId,promotionName:"CWA",offerCode:"BROADCAST_GROWTH",
  airingDay:5,airingHour:20,
  review:{dealId,offerCode:"BROADCAST_GROWTH",reviewWeekIndex:weekIndex,
   target:.1,rating:status==="ON_TARGET"?.12:.03,
   showId,status,missedConsecutively:status==="ON_TARGET"?0:3,
   previousMisses:2,milestone:null,bonusEligible:status==="ON_TARGET"}
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage network replies",
    seed:91,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query([
    "INSERT INTO ppw_commercial_deals",
    "(world_id,deal_id,promotion_id,kind,offer_code,status,",
    "baseline_income,agreed_income,start_week_index,end_week_index,source)",
    "VALUES($1,$2,$3,'BROADCAST','BROADCAST_GROWTH','ACTIVE',",
    "500,1000,0,7,'HUMAN')"
   ].join(" "),[worldId,dealId,promotionId]);
   await tx.query([
    "INSERT INTO ppw_completed_shows",
    "(world_id,promotion_id,show_id,year,week,resolution_id,",
    "crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,$2,$3,1,1,$4,75,'{}'::jsonb,$5)"
   ].join(" "),[worldId,promotionId,showId,"resolution-"+id,"0".repeat(64)]);
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",
    [worldId]);
   for(const key of warnings)await tx.query([
    "INSERT INTO ppw_world_news_items",
    "(world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,",
    "show_id,title,summary,source_kind)",
    "VALUES($1,1,1,$2,'OFFICIAL','CONFIRMED',$3,'CWA',$4,",
    "'Network warns CWA','Certified poor TV ratings','EVENT')"
   ].join(" "),[worldId,key,promotionId,showId]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+id,expectedRevision:0})).status,"APPLIED");
  const claim=await submitPromotionClaim(db.pool,{worldId,playerId,
   promotionId,requestId:"claim-"+id,expectedRevision:1});
  assert.equal(claim.status,"APPLIED");
  const ids=await withWorldTransaction(db.pool,tx=>tx.query<{mail_id:string}>(
   "SELECT 'backstage-world:'||md5('network:'||key) AS mail_id FROM unnest($1::text[]) AS key",
   [warnings]));
  assert.equal(ids.length,3);
  const [first,second,third]=ids.map(x=>x.mail_id) as [string,string,string];
  const before=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(before.filter(m=>m.kind==="NETWORK"&&m.canRespond).length,3);
  await assert.rejects(replyToBroadcaster(db.pool,{
   ...scope,mailId:"backstage-world:"+"a".repeat(32),decision:"COMMIT_RECOVERY",
   requestId:"forged-"+id,expectedRevision:claim.revision
  }),/no longer actionable/);
  await assert.rejects(replyToBroadcaster(db.pool,{
   worldId,promotionId:rivalId,playerId,mailId:first,
   decision:"COMMIT_RECOVERY",requestId:"rival-"+id,expectedRevision:claim.revision
  }),/no longer actionable/);
  const command={...scope,mailId:first,decision:"COMMIT_RECOVERY" as const,
   requestId:"reply-"+id,expectedRevision:claim.revision};
  const saved=await replyToBroadcaster(db.pool,command);
  assert.equal(saved.status,"APPLIED");
  assert.equal((await replyToBroadcaster(db.pool,command)).status,"REPLAYED",
   "Safe retry must not re-answer the same message");
  const reply= (await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===first);
  assert.equal(reply?.networkResponse?.status,"PENDING");
  assert.equal(reply?.canRespond,undefined);
  await assert.rejects(replyToBroadcaster(db.pool,{
   ...command,requestId:"duplicate-"+id,expectedRevision:saved.revision
  }),/already received/);
  const stand=await replyToBroadcaster(db.pool,{
   ...scope,mailId:second,decision:"STAND_FIRM",requestId:"firm-"+id,
   expectedRevision:saved.revision
  });
  assert.equal(stand.status,"APPLIED");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===second)?.networkResponse?.status,"ACKNOWLEDGED");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,0,[audit(0,"ON_TARGET")])),{settled:0},
   "A broadcast before the commitment cannot fulfil it");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,1,[audit(1,"ON_TARGET")])),{settled:1},
   "An on-target broadcast fulfils exactly one pending turnaround promise");
  // Mirror the real certified rollover: the newly published response is
  // visible as a fresh message when the next World week opens.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  const followed=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(followed.find(x=>x.id===first)?.networkResponse?.status,"KEPT");
  const outcome=followed.find(x=>x.subject==="Your television turnaround delivered");
  assert.equal(outcome?.kind,"NETWORK");
  assert.equal(outcome?.sender,"VibeFlix");
  assert.equal(outcome?.read,false);
  assert.match(outcome?.body??"",/certified television met our audience target/);
  const home=await readPlayerWorldOverview(db.pool,worldId,playerId);
  assert.equal(home?.promotion?.attention.backstageUnreadCount,
   followed.filter(x=>!x.read).length,
   "A settled commitment adds exactly one new Home notification");
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:outcome!.id}),
   {readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:outcome!.id}),
   {readCount:0},"A network follow-up can only be acknowledged once");
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,
   followed.filter(x=>!x.read).length-1);
  // A later warning can create an independent promise. No prior on-target
  // broadcast is borrowed to forgive a future three-week failure.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  const broken=await replyToBroadcaster(db.pool,{
   ...scope,mailId:third,decision:"COMMIT_RECOVERY",requestId:"try-"+id,
   expectedRevision:stand.revision
  });
  assert.equal(broken.status,"APPLIED");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,2,[audit(2,"BELOW_TARGET")])),{settled:0});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,3,[audit(3,"BELOW_TARGET")])),{settled:0});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,4,[audit(4,"BELOW_TARGET")])),{settled:1});
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]));
  const missed=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(missed.find(x=>x.id===third)?.networkResponse?.status,"BROKEN");
  assert.ok(missed.some(x=>x.subject==="The review window has ended"&&
   x.body.includes("without a certified on-target television")));
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,5,[audit(5,"ON_TARGET")])),{settled:0},
   "A settled commitment is immutable on later weeks");
  const income=await withWorldTransaction(db.pool,tx=>tx.query<{agreed_income:string}>(
   "SELECT agreed_income::text FROM ppw_commercial_deals WHERE world_id=$1 AND deal_id=$2",
   [worldId,dealId]));
  assert.equal(income[0]?.agreed_income,"1000",
   "Inbox choices do not invent new TV rights or change contractual pay");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_network_replies","ppw_command_receipts",
    "ppw_world_news_items","ppw_world_news_weeks","ppw_completed_shows",
    "ppw_commercial_deals","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
