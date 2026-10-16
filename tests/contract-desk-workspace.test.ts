import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {requestAdditionalDates,cancelDateRequest} from "../src/db/contract-date-requests.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("contract desk handles pending proposals, withdrawal and ownership",{
 skip:!url?"No disposable database":false,
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="desk-"+id,playerId="owner-"+id,promotionId="promotion-"+id;
 const personId="person-"+id,contractId="contract-"+id,requestId="dates-"+id;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Desk fixture",seed:12,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Desk promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Desk Wrestler')",[worldId,personId]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
    VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',0,12)`,
    [worldId,contractId,personId,promotionId]);
  });
  await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+id,expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,requestId:"claim-"+id,expectedRevision:1});
  const before=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(before.summary.noDates,1);
  assert.equal(before.summary.pendingNegotiations,0);
  await assert.rejects(readContractDesk(db.pool,worldId,"stranger",promotionId),/access denied/);
  const request=await requestAdditionalDates(db.pool,{worldId,playerId,promotionId,contractId,
   requestId,expectedRevision:2,additionalDates:3});
  assert.equal(request.status,"APPLIED");
  const pending=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(pending.summary.pendingNegotiations,1);
  assert.equal(pending.roster[0]!.pendingNegotiation,true);
  assert.equal(pending.roster[0]!.remainingDates,0);
  await assert.rejects(requestAdditionalDates(db.pool,{worldId,playerId,promotionId,contractId,
   requestId:"duplicate-"+id,expectedRevision:3,additionalDates:2}),/already pending/);
  await cancelDateRequest(db.pool,{worldId,playerId,promotionId,dateRequestId:requestId,
   requestId:"cancel-"+id,expectedRevision:3});
  const after=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(after.summary.pendingNegotiations,0);
  assert.equal(after.roster[0]!.remainingDates,0);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_contract_date_requests WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
