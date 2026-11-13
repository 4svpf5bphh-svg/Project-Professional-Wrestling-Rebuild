import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWorldMail,markWorldMailRead} from "../src/db/backstage-world-mail.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";

const url=process.env.PPW_NEON_TEST_URL;
test("certified broadcaster, hired staff and real free-agent scout messages have private idempotent receipts",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),worldId="backstage-mail-"+id,
  promotionId="mine-"+id,rivalId="rival-"+id,owner="owner-"+id,
  wrestler="talent-"+id,freeAgent="free-"+id,showId="broadcast-"+id;
 const db=postgresPool(url!,3);
 const scope={worldId,promotionId,playerId:owner};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage mail test",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,fatigue) VALUES($1,$2,'Tired Wrestler',76),($1,$3,'Available Prospect',5)",[worldId,wrestler,freeAgent]);
   await tx.query(`INSERT INTO ppw_contracts
    (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
    VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',4,2)`,
    [worldId,"signed-"+id,wrestler,promotionId]);
   for(const [role,staffId] of [["TALENT_MANAGER","staff-001"],
    ["MEDICAL","staff-medical-001"],["SCOUT","staff-scout-001"]] as const)
    await tx.query(`INSERT INTO ppw_staff_employments
     (world_id,employment_id,staff_id,promotion_id,role,status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
     VALUES($1,$2,$3,$4,$5,'ACTIVE',500,0,51,52,70)`,
     [worldId,role+"-"+id,staffId,promotionId,role]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,$4,75,'{}'::jsonb,$5)`,
    [worldId,promotionId,showId,"resolved-"+id,"0".repeat(64)]);
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",[worldId]);
   await tx.query(`INSERT INTO ppw_world_news_items
    (world_id,year,week,story_key,desk,certainty,promotion_id,promotion_name,show_id,title,summary,source_kind)
    VALUES($1,1,1,'broadcast:network:BROADCAST_GROWTH:warning:once',
     'OFFICIAL','CONFIRMED',$2,'CWA',$3,
     'VibeFlix demands better television from CWA',
     'After a certified audience miss VibeFlix responded: Improve next week.',
     'EVENT')`,[worldId,promotionId,showId]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId:owner,
   requestId:"join-"+id,expectedRevision:0})).status,"APPLIED");
  const claim=await submitPromotionClaim(db.pool,{worldId,playerId:owner,
   promotionId,requestId:"claim-"+id,expectedRevision:1});
  assert.equal(claim.status,"APPLIED");
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{revision:string}>(
   "SELECT revision::text FROM ppw_worlds WHERE world_id=$1",[worldId]));
  const inbox=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  assert.ok(inbox.some(m=>m.kind==="NETWORK"&&m.sender==="VibeFlix"));
  assert.ok(inbox.some(m=>m.kind==="STAFF"&&m.action==="CONTRACTS"));
  assert.ok(inbox.some(m=>m.kind==="STAFF"&&m.action==="STAFF"));
  assert.ok(inbox.some(m=>m.kind==="SCOUT"&&m.action==="MARKET"));
  assert.ok(inbox.every(m=>!m.read));
  // A previous unread response and a newer pending request from one signed
  // wrestler are only one conversation badge, exactly like the mobile inbox.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_backstage_requests(
    world_id,request_id,promotion_id,person_id,kind,created_week_index,
    status,decision,responded_week_index)
    VALUES($1,$2,$3,$4,'CONTRACT',0,'ANSWERED','TALK',0)`,
    [worldId,"a-historic-"+id,promotionId,wrestler]);
   await tx.query(`INSERT INTO ppw_backstage_requests(
    world_id,request_id,promotion_id,person_id,kind,created_week_index)
    VALUES($1,$2,$3,$4,'CONTRACT',0)`,
    [worldId,"z-current-"+id,promotionId,wrestler]);
  });
  const initialHome=await readPlayerWorldOverview(db.pool,worldId,owner);
  assert.equal(initialHome?.promotion?.attention.backstageUnreadCount,
   inbox.filter(x=>!x.read).length+1,
   "One current unread wrestler thread plus all certified World messages");
  const exposed=await readPortablePersonaWorkspace(db.pool,{...scope,inboxOnly:true});
  assert.equal(exposed.worldMessages.length,inbox.length);
  const letter=inbox.find(m=>m.kind==="NETWORK")!;
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:letter.id}),
   {readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:letter.id}),
   {readCount:0},"Opening it again is not another write");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(m=>m.id===letter.id)?.read,true);
  const afterHome=await readPlayerWorldOverview(db.pool,worldId,owner);
  assert.equal(afterHome?.promotion?.attention.backstageUnreadCount,
   inbox.filter(x=>!x.read).length,
   "Acknowledging real network mail clears exactly one badge, preserving the wrestler thread");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>tx.query<{revision:string}>(
   "SELECT revision::text FROM ppw_worlds WHERE world_id=$1",[worldId])),before,
   "Reading a message may not modify game state or World revision");
  await assert.rejects(markWorldMailRead(db.pool,{worldId,promotionId:rivalId,
   playerId:owner,mailId:letter.id}),/not available/);
  await assert.rejects(markWorldMailRead(db.pool,{...scope,
   mailId:"backstage-world:"+"f".repeat(32)}),/not available/);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{...scope,
   promotionId:rivalId,inboxOnly:true}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals","ppw_world_news_items",
    "ppw_world_news_weeks","ppw_completed_shows","ppw_staff_employments",
    "ppw_backstage_requests","ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
