import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {grantPlaytestKp,readPlaytestKp} from "../src/db/admin-kp-playtest.js";
import {applyKayfabeAction} from "../src/db/kayfabe-points.js";
const url=process.env.PPW_NEON_TEST_URL;
test("operator test credit grants precisely 50k once, atomically, and does not credit another manager",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const unique=randomUUID(),worldId="kp-operator-"+unique,
  admin="operator-"+unique,guest="guest-"+unique,db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"KP test credits",seed:73,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:"crown",name:"Crown Test",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"other",name:"Other Test",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[admin,guest]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,admin,guest]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'crown'),($1,$3,'other')",
    [worldId,admin,guest]);
   await tx.query("INSERT INTO ppw_kp_wallets(player_id,balance,lifetime_earned) VALUES($1,100,100)",[admin]);
  });
  await assert.rejects(grantPlaytestKp(db.pool,worldId,"spoofed"),/active promotion/);
  assert.deepEqual(await readPlaytestKp(db.pool,worldId,admin),{balance:100,granted:false,target:50000});
  const both=await Promise.all([
   grantPlaytestKp(db.pool,worldId,admin),grantPlaytestKp(db.pool,worldId,admin)]);
  assert.deepEqual(both.map(x=>x.credited).sort((a,b)=>a-b),[0,49900]);
  assert.equal(both.filter(x=>x.alreadyGranted).length,1);
  assert.deepEqual(await readPlaytestKp(db.pool,worldId,admin),{balance:50000,granted:true,target:50000});
  assert.deepEqual(await readPlaytestKp(db.pool,worldId,guest),{balance:0,granted:false,target:50000});
  const paid=await applyKayfabeAction(db.pool,{worldId,playerId:admin,promotionId:"crown"},
   {kind:"BUY",sku:"BRAND_CHROME",requestId:"kp-operator-buy"});
  assert.equal("balance" in paid?paid.balance:null,49800);
  const retry=await grantPlaytestKp(db.pool,worldId,admin);
  assert.equal(retry.credited,0);
  assert.equal(retry.balance,49800,"second press never refills spent KP");
  const receipts=await withWorldTransaction(db.pool,tx=>tx.query<{
   previous_balance:string;amount:string}>(`
    SELECT previous_balance::text,amount::text FROM ppw_kp_playtest_grants
    WHERE world_id=$1 AND player_id=$2`,[worldId,admin]));
  assert.deepEqual(receipts,[{previous_balance:"100",amount:"49900"}]);
 }finally{await db.close();}
});
