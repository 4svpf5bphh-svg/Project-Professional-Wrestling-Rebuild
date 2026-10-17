import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageRequests} from "../src/db/backstage-conversations.js";
import {settleBackstageContractDiscussions}
 from "../src/db/backstage-contract-followthrough.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Contract Backstage conversation follows an actual renewal proposal, never auto-signs or awards morale",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="talk-contract-"+id,promotionId="promo-"+id,
  playerId="controller-"+id,outsider="other-"+id,
  personId="worker-"+id,contractId="deal-"+id;
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  run(tx=>tx.query<T>(sql,params));
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Real contract discussions",seed:82,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Home wrestling",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",
    [playerId,outsider]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,playerId,outsider]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,momentum) VALUES($1,$2,'Wrestler One','MEN',70,60)",
    [worldId,personId]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,3)",
    [worldId,contractId,personId,promotionId]);
  });
  assert.equal((await run(tx=>publishBackstageRequests(tx,worldId,0))).newMessages,1);
  const scope={worldId,promotionId,personId,playerId};
  const conversation=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(conversation.kind,"CONTRACT");
  const input={worldId,promotionId,showId:"unused",
   requestId:"discuss-"+id,expectedRevision:0,
   conversationId:conversation.conversationId,decision:"EXPLORE_RENEWAL"};
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:outsider}},
   "backstageDecision",input),/unavailable/);
  const reply=await dispatchCardRpc({pool:db.pool,actor:{playerId}},"backstageDecision",input);
  assert.equal((reply as {status:string}).status,"APPLIED");
  const again=await dispatchCardRpc({pool:db.pool,actor:{playerId}},"backstageDecision",input);
  assert.equal((again as {status:string}).status,"REPLAYED");
  assert.equal((await run(tx=>settleBackstageContractDiscussions(tx,worldId,0))).opened,0,
   "Speaking about the contract is not an actual offer");
  await run(tx=>tx.query("INSERT INTO ppw_contract_renewal_proposals(world_id,proposal_id,contract_id,promotion_id,person_id,status,created_week_index,proposed_terms) VALUES($1,$2,$3,$4,$5,'PENDING',1,$6::jsonb)",
   [worldId,"renewal-"+id,contractId,promotionId,personId,
    JSON.stringify({family:"EXCLUSIVE",termWeeks:12,dateEntitlement:12,
     weeklyGuarantee:0,appearanceFee:0,creativeControl:"NONE"})]));
  assert.equal((await run(tx=>settleBackstageContractDiscussions(tx,worldId,0))).opened,0,
   "An offer from a future week is not present evidence");
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  assert.equal((await run(tx=>settleBackstageContractDiscussions(tx,worldId,1))).opened,1);
  assert.equal((await run(tx=>settleBackstageContractDiscussions(tx,worldId,1))).opened,0,
   "Negotiation history is replay-safe");
  const after=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(after.followThroughKind,"CONTRACT_NEGOTIATION_STARTED");
  assert.equal(after.followThroughWeekIndex,1);
  const wrestler=(await read<{morale:number}>(
   "SELECT morale FROM ppw_people WHERE world_id=$1 AND person_id=$2",
   [worldId,personId]))[0]!;
  assert.equal(wrestler.morale,70);
  const contract=(await read<{status:string;expires_week_index:number}>(
   "SELECT status,expires_week_index FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2",
   [worldId,contractId]))[0]!;
  assert.deepEqual(contract,{status:"SIGNED",expires_week_index:3},
   "Conversation cannot activate or renew terms without contract settlement");
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_contract_renewal_proposals",
    "ppw_contract_offers","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,outsider]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
