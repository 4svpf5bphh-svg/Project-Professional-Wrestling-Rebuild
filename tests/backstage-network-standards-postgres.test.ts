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

const url=process.env.PPW_NEON_TEST_URL;
test("certified hardcore TV creates owner-only standards correspondence and real follow-through",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const tag=randomUUID(),worldId="standards-world-"+tag,
  promotionId="mine-"+tag,playerId="manager-"+tag,dealId="network-"+tag;
 const db=postgresPool(url!,3);
 const scope={worldId,promotionId,playerId};
 const insertShow=async(week:number,hardcore:boolean,klass:"REGULAR"|"PREMIUM"="REGULAR")=>{
  const showId="tv-"+week+"-"+klass;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query([
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,",
    "year,week,status,show_day,show_name,event_type,booking_class)",
    "VALUES($1,$2,$3,1,$4,'SUBMITTED',5,$5,$6,$7)"
   ].join(" "),[worldId,showId,promotionId,week,
    "CWA Week "+week,klass==="REGULAR"?"REGULAR":"MAJOR",klass]);
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,",
    "year,week,resolution_id,crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,$2,$3,1,$4,$5,75,'{}'::jsonb,$6)"
   ].join(" "),[worldId,promotionId,showId,week,"result-"+showId,
    (week.toString(16).repeat(64)).slice(0,64)]);
   await tx.query([
    "INSERT INTO ppw_show_economics",
    "(world_id,show_id,promotion_id,year,week,attendance,expected_demand,",
    "gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,",
    "total_cost,net_result,incremental_cash,audience_format,",
    "tv_household_rating,estimated_viewers,ppv_buys)",
    "VALUES($1,$2,$3,1,$4,750,900,50000,10000,12000,8000,2000,",
    "32000,18000,18000,$5,$6,$7,$8)"
   ].join(" "),[worldId,showId,promotionId,week,
    klass==="REGULAR"?"TV":"PPV",klass==="REGULAR"?.5:null,
    klass==="REGULAR"?10000:null,klass==="PREMIUM"?1500:null]);
   await tx.query([
    "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)",
    "VALUES($1,$2,'main',0,'MATCH',$3::jsonb)"
   ].join(" "),[worldId,showId,
    JSON.stringify({matchType:"SINGLES",stipulation:hardcore?"HARDCORE":"NORMAL"})]);
   await tx.query([
    "INSERT INTO ppw_completed_show_matches",
    "(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)",
    "VALUES($1,$2,'main',0,75,'PIN','A')"
   ].join(" "),[worldId,showId]);
  });
  return showId;
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Standards World",seed:19,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await tx.query([
    "INSERT INTO ppw_commercial_deals(world_id,deal_id,promotion_id,kind,offer_code,",
    "status,baseline_income,agreed_income,start_week_index,end_week_index,source)",
    "VALUES($1,$2,$3,'BROADCAST','BROADCAST_TV','ACTIVE',500,1000,0,12,'HUMAN')"
   ].join(" "),[worldId,dealId,promotionId]);
   // A future, unplayed hardcore match must not create a network objection.
   await tx.query([
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,",
    "status,show_day,show_name,event_type,booking_class)",
    "VALUES($1,'future-hardcore',$2,1,10,'DRAFT',5,'Planned Hardcore',",
    "'REGULAR','REGULAR')"
   ].join(" "),[worldId,promotionId]);
   await tx.query([
    "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)",
    "VALUES($1,'future-hardcore','planned',0,'MATCH',",
    "'{\"stipulation\":\"HARDCORE\"}'::jsonb)"
   ].join(" "),[worldId]);
  });
  await insertShow(1,true);
  await insertShow(1,true,"PREMIUM");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+tag,expectedRevision:0})).status,"APPLIED");
  const claim=await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"claim-"+tag,expectedRevision:1});
  assert.equal(claim.status,"APPLIED");
  const original=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  const complaint=original.filter(x=>x.contentConcern);
  assert.equal(complaint.length,1,"Only certified regular TV can trigger a standards message");
  assert.equal(complaint[0]?.sender,"BBS Sports");
  assert.equal(complaint[0]?.canRespond,true);
  assert.match(complaint[0]!.body,/hardcore-rules match/);
  assert.doesNotMatch(complaint[0]!.body,/blood/i,"Do not fabricate blood absent event facts");
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);
  await assert.rejects(replyToBroadcaster(db.pool,{
   ...scope,mailId:complaint[0]!.id,decision:"COMMIT_RECOVERY",
   requestId:"wrong-"+tag,expectedRevision:claim.revision
  }),/does not match/);
  const promise=await replyToBroadcaster(db.pool,{
   ...scope,mailId:complaint[0]!.id,decision:"COMMIT_STANDARDS",
   requestId:"promise-"+tag,expectedRevision:claim.revision
  });
  assert.equal(promise.status,"APPLIED");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===complaint[0]!.id)?.networkResponse?.status,"PENDING");
  await assert.rejects(replyToBroadcaster(db.pool,{
   ...scope,mailId:"backstage-world:"+"e".repeat(32),
   decision:"COMMIT_STANDARDS",requestId:"forge-"+tag,
   expectedRevision:promise.revision
  }),/no longer actionable/);
  // A standards pledge cannot be fulfilled by a past, hardcore programme.
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,0,[])),{settled:0});
  await insertShow(2,false);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,1,[])),{settled:0},
   "A show completed in the same week as a reply is not future evidence");
  await insertShow(3,false);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,2,[])),{settled:1},
   "The next certified TV broadcast honours the actual content commitment");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=4 WHERE world_id=$1",[worldId]));
  const responded=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(responded.find(x=>x.id===complaint[0]!.id)
   ?.networkResponse?.status,"KEPT");
  const follow=responded.find(x=>x.subject==="Our broadcast standards are back on track");
  assert.equal(follow?.read,false);
  assert.equal(follow?.sender,"BBS Sports");
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,2);
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:follow!.id}),
   {readCount:1});
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);

  await insertShow(4,true);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]));
  const newWarning=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .filter(x=>x.contentConcern&&x.canRespond);
  assert.equal(newWarning.length,1);
  const broken=await replyToBroadcaster(db.pool,{
   ...scope,mailId:newWarning[0]!.id,decision:"COMMIT_STANDARDS",
   requestId:"promise-broken-"+tag,expectedRevision:promise.revision
  });
  assert.equal(broken.status,"APPLIED");
  for(const index of [4,5,6])assert.deepEqual(
   await withWorldTransaction(db.pool,tx=>settleNetworkReplies(tx,worldId,index,[])),
   {settled:0});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,7,[])),{settled:1});
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=9 WHERE world_id=$1",[worldId]));
  const final=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.equal(final.find(x=>x.id===newWarning[0]!.id)
   ?.networkResponse?.status,"BROKEN");
  assert.ok(final.some(x=>x.subject==="Our content standards review has ended"));
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleNetworkReplies(tx,worldId,8,[])),{settled:0});
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{agreed_income:string}>(
   "SELECT agreed_income::text FROM ppw_commercial_deals WHERE world_id=$1 AND deal_id=$2",
   [worldId,dealId])))[0]?.agreed_income,"1000",
   "The conversation cannot silently rewrite contracted income");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_backstage_network_replies","ppw_completed_show_matches",
    "ppw_show_economics","ppw_completed_shows","ppw_card_slots",
    "ppw_booking_drafts","ppw_commercial_deals","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
