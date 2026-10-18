import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readTagTeamWorkspace} from "../src/db/tag-team-workspace.js";
import {readStableWorkspace} from "../src/db/stable-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Wrestler scouting cards in team and faction selectors stay within five queries at Genesis scale",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="formation-budget-"+randomUUID(),player="owner-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,643));
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  const meter=new MeasuredQuerySession("shared-roster-cards");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const scope={worldId:world,promotionId,playerId:player};
  const pairs=await readTagTeamWorkspace(measured,scope);
  assert.ok(pairs.roster.length>=30);
  assert.ok(pairs.roster.every(x=>x.ringName&&x.division&&
   x.gimmickId&&typeof x.popularity==="number"&&typeof x.inRingQuality==="number"));
  const first=meter.assertBudget({maxQueries:2,maxResultBytes:35000});
  assert.equal(first.queryCount,2);
  const factions=await readStableWorkspace(measured,scope);
  assert.equal(factions.roster.length,pairs.roster.length);
  assert.ok(factions.roster.every(x=>x.ringName&&x.gimmickId&&
   x.primaryStyle!==undefined&&typeof x.momentum==="number"));
  assert.ok(factions.roster.every(x=>x.stableId===null));
  const combined=meter.assertBudget({maxQueries:5,maxResultBytes:75000});
  assert.equal(combined.queryCount,5,"No per-wrestler or per-card SQL");
  assert.ok(combined.resultRows<150,"Do not load the entire 643-person World");
  await assert.rejects(readStableWorkspace(db.pool,{...scope,playerId:"stranger"}),
   /access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
