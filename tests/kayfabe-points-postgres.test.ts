import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readKayfabeWorkspace,claimKayfabeWeek,applyKayfabeAction}
 from "../src/db/kayfabe-points.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
test("two managers earn account KP once, purchase only cosmetics and create a shared free agent",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="kp-"+randomUUID(),a="kp-a-"+randomUUID(),b="kp-b-"+randomUUID();
 const db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,72));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:a,
   requestId:"kp-a-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:a,
   promotionId:"promotion-0",requestId:"kp-a-claim",expectedRevision:1})).status,"APPLIED");
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:b,
   requestId:"kp-b-join",expectedRevision:2})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:b,
   promotionId:"promotion-1",requestId:"kp-b-claim",expectedRevision:3})).status,"APPLIED");
  const aa={worldId:world,promotionId:"promotion-0",playerId:a},
   bb={worldId:world,promotionId:"promotion-1",playerId:b};
  assert.equal((await claimKayfabeWeek(db.pool,aa)).awarded,0);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)",[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
     year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
     VALUES($1,'promotion-0','kp-result',1,1,'kp-resolution',80,
      '{}'::jsonb,repeat(md5('kp-result'),2))`,[world]);
   await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,
     promotion_id,role,status,weekly_salary,start_week_index,term_weeks,
     expires_week_index,morale)
     VALUES($1,'kp-agent','staff-road-agent-001','promotion-0','ROAD_AGENT',
     'ACTIVE',1000,0,52,51,80)`,[world]);
  });
  const first=await claimKayfabeWeek(db.pool,aa);
  assert.equal(first.awarded,100);
  assert.equal((await claimKayfabeWeek(db.pool,aa)).awarded,0);
  assert.equal((await claimKayfabeWeek(db.pool,bb)).awarded,0);
  const scope={pool:db.pool,actor:{playerId:a}};
  assert.equal((await dispatchCardRpc(scope,"kpWorkspace",{
   worldId:world,promotionId:"promotion-0"} ) as {balance:number}).balance,100);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_kp_wallets
    SET balance=5000,lifetime_earned=5000 WHERE player_id=$1`,[a]);
  });
  const brand={kind:"BUY" as const,sku:"BRAND_CHROME" as const,requestId:"buy-chrome"};
  const paid=await applyKayfabeAction(db.pool,aa,brand) as {price:number};
  assert.equal(paid.price,200);
  assert.equal((await applyKayfabeAction(db.pool,aa,brand)).replayed,true);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"BUY",sku:"BADGE_GOLD",requestId:"buy-chrome"}),/request ID/);
  const rename=await applyKayfabeAction(db.pool,aa,{
   kind:"RENAME_STAFF",staffId:"staff-road-agent-001",name:"Riley The Agent",
   requestId:"rename-agent"}) as {price:number};
  assert.equal(rename.price,350);
  const office=await readStaffWorkspace(db.pool,aa);
  assert.equal(office.employees.find(e=>e.staffId==="staff-road-agent-001")?.name,"Riley The Agent");
  assert.equal((await readStaffWorkspace(db.pool,bb)).employees.length,0);
  const added=await applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Comet",division:"WOMEN",requestId:"create-comet"}) as {market:string;price:number;personId:string};
  assert.equal(added.market,"FREE_AGENT");
  assert.equal(added.price,3000);
  assert.equal((await applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Comet",division:"WOMEN",requestId:"create-comet"})).replayed,true);
  await assert.rejects(applyKayfabeAction(db.pool,aa,{
   kind:"CREATE_WRESTLER",name:"Taylor Star",division:"MEN",requestId:"second-caw"}),/One created wrestler/);
  const rookie=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;in_ring_quality:number;popularity:number;booking_division:string}>(
   `SELECT person_id,in_ring_quality,popularity,booking_division
     FROM ppw_people WHERE world_id=$1 AND name='Taylor Comet'`,[world]));
  assert.equal(rookie.length,1);
  assert.equal(rookie[0]!.in_ring_quality,52);
  assert.equal(rookie[0]!.popularity,12);
  assert.equal(rookie[0]!.booking_division,"WOMEN");
  const market=await readWrestlerDirectory(db.pool,bb,{
   view:"MARKET",availability:"FREE_AGENT",division:"WOMEN",search:"Taylor Comet"});
  assert.ok(market.people.some(p=>p.personId===added.personId));
  const contracts=await withWorldTransaction(db.pool,tx=>tx.query<{contract_id:string}>(
   "SELECT contract_id FROM ppw_contracts WHERE world_id=$1 AND person_id=$2",
   [world,added.personId]));
  assert.equal(contracts.length,0,"Creating a wrestler never assigns them to the spender");
  const wallet=await readKayfabeWorkspace(db.pool,aa);
  assert.equal(wallet.balance,1450);
  assert.equal(wallet.activeBrand,"CHROME");
  assert.equal(wallet.createdTalent.length,1);
  await assert.rejects(readKayfabeWorkspace(db.pool,{...aa,playerId:b}),/active promotion/);
 }finally{await db.close();}
});
