import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWrestlerProfile} from "../src/db/wrestler-profile.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
/** The comprehensive wrestler file must never become N+1 directory hydration.
 * Authority, private salary separation, exact one-person bounds and writes
 * are proved against the disposable PostgreSQL service, not a live Neon branch.
 */
test("one wrestler dossier uses seven bounded SQL reads, preserves rival privacy and guards edits",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="profile-"+randomUUID(),player="controller-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  await joinWorld(db.pool,{worldId:world,playerId:player,
   requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_people SET portable_gimmick_id=NULL WHERE world_id=$1 AND person_id='person-0'",
   [world]));
  const meter=new MeasuredQuerySession("single-wrestler-profile");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const scope={worldId:world,playerId:player,promotionId,personId:"person-0"};
  const owned=await readWrestlerProfile(measured,scope);
  assert.equal(meter.assertBudget({maxQueries:7,maxResultBytes:5500}).queryCount,7);
  assert.equal(owned.onYourRoster,true);
  assert.equal(owned.canEdit,true);
  assert.equal(owned.name,"Wrestler 0");
  assert.equal(owned.contracts.find(c=>c.isYours)?.weeklyGuarantee,18000);
  const outsider=await readWrestlerProfile(db.pool,{...scope,personId:"person-5"});
  assert.equal(outsider.onYourRoster,false);
  assert.equal(outsider.canEdit,false);
  assert.ok(outsider.contracts.every(c=>c.weeklyGuarantee===null&&c.appearanceFee===null),
   "Rival contract payments must never leak");
  await assert.rejects(readWrestlerProfile(db.pool,{...scope,playerId:"stranger"}),
   /access denied/i);
  const context={pool:db.pool,actor:{playerId:player}};
  await assert.rejects(dispatchCardRpc(context,"saveWrestlerRepertoire",{
   worldId:world,promotionId,personId:"person-5",
   requestId:"outside-edit",expectedRevision:2,primaryStyle:"BRAWLER",
   secondaryStyle:null,signatureMoves:["Dropkick"],finishingMoves:["Suplex"]}),
   /only your current roster|not available/i);
  const result=await dispatchCardRpc(context,"saveWrestlerRepertoire",{
   worldId:world,promotionId,personId:"person-0",
   requestId:"own-edit",expectedRevision:2,primaryStyle:"BRAWLER",
   secondaryStyle:null,signatureMoves:["Dropkick"],finishingMoves:["Suplex"]
  }) as {status:string;revision:number};
  assert.equal(result.status,"APPLIED");
  const updated=await readWrestlerProfile(db.pool,scope);
  assert.equal(updated.persona.primaryStyle,"BRAWLER");
  assert.deepEqual(updated.persona.signatureMoves.map(m=>m.name),["Dropkick"]);
  assert.deepEqual(updated.persona.finishingMoves.map(m=>m.name),["Suplex"]);
  assert.equal(updated.worldRevision,3);
  const retry=await dispatchCardRpc(context,"saveWrestlerRepertoire",{
   worldId:world,promotionId,personId:"person-0",
   requestId:"own-edit",expectedRevision:2,primaryStyle:"BRAWLER",
   secondaryStyle:null,signatureMoves:["Dropkick"],finishingMoves:["Suplex"]
  }) as {status:string};
  assert.equal(retry.status,"REPLAYED");
  assert.equal((await readWrestlerProfile(db.pool,scope)).worldRevision,3);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_portable_persona_history","ppw_portable_personas",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
