import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setGorillaPolicy} from "../src/db/gorilla-position.js";
import {readGorillaWorkspace,saveGorillaShowInstructions}
 from "../src/db/gorilla-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Two-manager per-match Gorilla clipboard saves once, respects ownership and rejects stale cards and locked Worlds",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const nonce=randomUUID(),world="gorilla-details-"+nonce;
 const players=["manager-"+nonce,"rival-"+nonce];
 const promotions=["controlled-"+nonce,"other-"+nonce];
 const showId="event-"+nonce,matchId="bout-"+nonce;
 const db=postgresPool(url!,3);
 const get=<T extends Record<string,unknown>>(sql:string,args:unknown[]=[])=>withWorldTransaction(db.pool,
  tx=>tx.query<T>(sql,args));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Private Gorilla approvals",seed:77,rulesetVersion:"test"});
   for(const promotion of promotions)
    await addPromotion(tx,world,{id:promotion,name:promotion,tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",players);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [world,players[0],players[1]]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3),($1,$4,$5)",
    [world,players[0],promotions[0],players[1],promotions[1]]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,'a','Wrestler A'),($1,'b','Wrestler B')",[world]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status) VALUES($1,$2,$3,1,1,'DRAFT')",
    [world,showId,promotions[0]]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb)",
    [world,showId,matchId,JSON.stringify({matchType:"SINGLES",
     participants:[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}],
     scriptedWinner:"a",plannedFinish:"CLEAN_PIN",plannedLengthMinutes:15})]);
  });
  assert.equal((await setGorillaPolicy(db.pool,{worldId:world,promotionId:promotions[0]!,
   playerId:players[0]!,policy:"FOLLOW_THE_CROWD",requestId:"policy",expectedRevision:0})).status,"APPLIED");
  const prepared={worldId:world,promotionId:promotions[0]!,playerId:players[0]!,
   showId,requestId:"booked-match",expectedRevision:1,
   matches:[{matchId,protectScript:true,crowdChoice:"DELEGATE" as const,
    timingChoice:"PROTECT_SCRIPT" as const}]};
  assert.equal((await saveGorillaShowInstructions(db.pool,prepared)).status,"APPLIED");
  assert.equal((await saveGorillaShowInstructions(db.pool,prepared)).status,"REPLAYED");
  const owner=await readGorillaWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:players[0]!});
  assert.equal(owner.shows[0]!.matches[0]!.protectScript,true);
  assert.equal(owner.shows[0]!.matches[0]!.timingChoice,"PROTECT_SCRIPT");
  assert.equal(owner.shows[0]!.matches[0]!.description,"Wrestler A vs Wrestler B");
  const rival=await readGorillaWorkspace(db.pool,{worldId:world,
   promotionId:promotions[1]!,playerId:players[1]!});
  assert.deepEqual(rival.shows,[]);
  await assert.rejects(readGorillaWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:players[1]!}),/access denied/);
  await assert.rejects(saveGorillaShowInstructions(db.pool,{...prepared,playerId:players[1]!,
   requestId:"rival-writes",expectedRevision:2}),/unavailable/);
  assert.equal((await get<{count:string}>(
   "SELECT count(*)::text AS count FROM ppw_gorilla_match_instructions WHERE world_id=$1",
   [world]))[0]!.count,"1");
  // The exact match JSON changed. Old contingency is not authorised anymore.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_card_slots SET payload=jsonb_set(payload,'{plannedFinish}',to_jsonb('SUBMISSION'::text)) WHERE world_id=$1 AND draft_id=$2",
   [world,showId]));
  const changed=await readGorillaWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:players[0]!});
  assert.equal(changed.shows[0]!.matches[0]!.protectScript,false);
  const resaved=await saveGorillaShowInstructions(db.pool,{...prepared,
   requestId:"new-script",expectedRevision:2});
  assert.equal(resaved.status,"APPLIED");
  const current=await readGorillaWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:players[0]!});
  assert.equal(current.shows[0]!.matches[0]!.protectScript,true);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET phase='LOCKED' WHERE world_id=$1",[world]));
  await assert.rejects(saveGorillaShowInstructions(db.pool,{...prepared,
   requestId:"too-late",expectedRevision:3}),/OPEN|open|deadline|booking/i);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_gorilla_match_instructions","ppw_gorilla_show_logs",
    "ppw_gorilla_policies","ppw_card_slots","ppw_booking_drafts",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
