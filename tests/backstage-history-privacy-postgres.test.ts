import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage: former roster history survives expiry; private gimmick pitches never leak between promotions",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="former-"+id,promotionId="home-"+id,
  rivalId="rival-"+id,playerId="booker-"+id,personId="worker-"+id;
 const scope={worldId,promotionId,playerId,personId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Historic Backstage",seed:41,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Player Federation",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival Federation",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,morale,momentum) VALUES($1,$2,'Former Headliner',65,50)",[worldId,personId]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,1),($1,$5,$3,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',4,52)",
    [worldId,"our-deal-"+id,personId,promotionId,"rival-deal-"+id,rivalId]);
   await tx.query("INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,kind,created_week_index) VALUES($1,$2,$3,$4,'CONTRACT',0)",
    [worldId,"historic-conversation-"+id,promotionId,personId]);
   await tx.query("INSERT INTO ppw_persona_change_requests(world_id,request_id,person_id,promotion_id,requested_gimmick_id,submitted_week_index,status,reason,assessed_resistance) VALUES($1,$2,$3,$4,'rival_character',0,'DECLINED','CREATIVE_APPROVAL_WITHHELD',50)",
    [worldId,"rival-private-"+id,personId,rivalId]);
  });
  const active=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(active.roster.length,1);
  assert.equal(active.roster[0]!.isCurrent,true);
  assert.equal(active.conversations.length,1);
  assert.equal(active.recentRequests.length,0,"No rival gimmick change transcript");
  assert.equal(active.roster[0]!.lastMessage,null,"No rival character request preview");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_persona_change_requests(world_id,request_id,person_id,promotion_id,requested_gimmick_id,submitted_week_index,status,reason,assessed_resistance) VALUES($1,$2,$3,$4,'our_pitch',0,'DECLINED','ICONIC_PERSONA_PROTECTED',75)",
   [worldId,"our-private-"+id,personId,promotionId]));
  const own=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(own.recentRequests.length,1);
  assert.equal(own.roster[0]!.lastMessage?.requested_gimmick_id,"our_pitch");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]));
  const former=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(former.roster.length,1);
  assert.equal(former.roster[0]!.isCurrent,false);
  assert.equal(former.personId,personId);
  assert.equal(former.canEdit,false);
  assert.equal(former.conversations.length,1,"The former promotion's messages remain accessible");
  assert.equal(former.recentRequests.length,1);
  assert.equal(former.roster[0]!.latestIncoming?.kind,"CONTRACT");
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   worldId,promotionId:rivalId,playerId,personId}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_persona_change_requests","ppw_backstage_thread_archives",
    "ppw_backstage_requests","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
