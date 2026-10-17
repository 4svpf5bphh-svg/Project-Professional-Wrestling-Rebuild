import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {closeUnavailableBackstageRequests}
 from "../src/db/backstage-closure.js";
import {settleBackstagePromises} from "../src/db/backstage-conversations.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage: expired unanswered contacts close without forged player choices; excused promises keep due history",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="closure-"+id,promotionId="home-"+id;
 const expired="expired-"+id,active="active-"+id,promised="promised-"+id;
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage lifecycle",seed:117,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Controlled",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Expired Talent'),($1,$3,'Active Talent'),($1,$4,'Promised Talent')",
    [worldId,expired,active,promised]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,expires_week_index) VALUES",
    "($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,0),",
    "($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,20),",
    "($1,$7,$8,$4,'EXCLUSIVE','SIGNED',NULL,0)"
   ].join(" "),[worldId,"contract-expired-"+id,expired,promotionId,
    "contract-active-"+id,active,"contract-promised-"+id,promised]);
   await tx.query([
    "INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,",
    "person_id,kind,created_week_index,status,decision,responded_week_index,",
    "due_week_index) VALUES",
    "($1,$2,$3,$4,'MORALE',0,'PENDING',NULL,NULL,NULL),",
    "($1,$5,$3,$6,'MORALE',0,'PENDING',NULL,NULL,NULL),",
    "($1,$7,$3,$8,'MOMENTUM',0,'PROMISED','PROMISE_APPEARANCE',0,2)"
   ].join(" "),[worldId,"expired-request-"+id,promotionId,expired,
    "active-request-"+id,active,"promise-request-"+id,promised]);
  });
  assert.equal((await run(tx=>closeUnavailableBackstageRequests(tx,worldId,1))).closed,1);
  assert.equal((await run(tx=>closeUnavailableBackstageRequests(tx,worldId,1))).closed,0);
  const contacts=await run(tx=>tx.query<{person_id:string;status:string;
   decision:string|null;responded_week_index:number|null;
   due_week_index:number|null;assessment_reason:string|null}>(
   "SELECT person_id,status,decision,responded_week_index,due_week_index,assessment_reason FROM ppw_backstage_requests WHERE world_id=$1",
   [worldId]));
  const closed=contacts.find(x=>x.person_id===expired)!;
  assert.equal(closed.status,"EXCUSED");
  assert.equal(closed.decision,null,"system cannot invent a player reply");
  assert.equal(closed.responded_week_index,null);
  assert.equal(closed.due_week_index,null);
  assert.equal(closed.assessment_reason,"CONTRACT_UNAVAILABLE");
  assert.equal(contacts.find(x=>x.person_id===active)!.status,"PENDING");
  assert.equal(contacts.find(x=>x.person_id===promised)!.status,"PROMISED");
  const settlement=await run(tx=>settleBackstagePromises(tx,worldId,2));
  assert.equal(settlement.settled,1);
  assert.equal(settlement.broken,0);
  const status=await run(tx=>tx.query<{status:string;decision:string|null;
   due_week_index:number|null;assessment_reason:string|null}>(
   "SELECT status,decision,due_week_index,assessment_reason FROM ppw_backstage_requests WHERE world_id=$1 AND person_id=$2",
   [worldId,promised]));
  assert.equal(status[0]!.status,"EXCUSED");
  assert.equal(status[0]!.decision,"PROMISE_APPEARANCE");
  assert.equal(status[0]!.due_week_index,2);
  assert.equal(status[0]!.assessment_reason,"NO_COMPLETED_SHOW");
  assert.equal((await run(tx=>settleBackstagePromises(tx,worldId,3))).settled,0);
  assert.equal((await run(tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_backstage_promotion_trust WHERE world_id=$1",
   [worldId])))[0]!.n,"0","No trust penalty for an unavailable show");
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_ledger_events","ppw_contracts","ppw_people",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
