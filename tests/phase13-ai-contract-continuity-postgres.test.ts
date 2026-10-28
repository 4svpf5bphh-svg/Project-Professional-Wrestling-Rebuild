import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {expireAndRetainAiContracts} from "../src/db/ai-contract-continuity.js";

const url=process.env.PPW_NEON_TEST_URL;
test("AI renews a bounded mixed-division core at expiry without touching owner contracts",{
 skip:!url?"Disposable PostgreSQL required":false,
},async()=>{
 const world="ai-retain-"+randomUUID(),owner="owner-"+randomUUID();
 const db=postgresPool(url!,4);
 const query=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"AI Retention",seed:58,rulesetVersion:"test"});
   for(const p of ["autonomous","owner-controlled","human"])
    await addPromotion(tx,world,{id:p,name:p,tier:"LOCAL"});
   await tx.query("UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1 AND promotion_id IN ('autonomous','owner-controlled')",[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[owner]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,owner]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id,active) VALUES($1,'owner-controlled',$2,true)",[world,owner]);
   for(let i=0;i<34;i++){
    const promotion=i<30?"autonomous":i<32?"owner-controlled":"human";
    const id="candidate-"+i;
    const division=i<20||i>=30?"MEN":"WOMEN";
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,popularity,match_craft,presentation) VALUES($1,$2,$3,$4,$5,75,75)",[world,id,"Talent "+i,division,80-i]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,start_week_index,expires_week_index,remaining_dates,date_entitlement,weekly_guarantee) VALUES($1,$2,$2,$3,'LIMITED_NON_EXCLUSIVE','SIGNED',0,25,0,7,3000)",[world,id,promotion]);
   }
  });
  const result=await withWorldTransaction(db.pool,tx=>expireAndRetainAiContracts(tx,world,1,26));
  assert.deepEqual(result,[{promotion_id:"autonomous",retained:24}]);
  const statuses=await query<{promotion_id:string;status:string;count:number}>(
   "SELECT promotion_id,status,count(*)::integer AS count FROM ppw_contracts WHERE world_id=$1 GROUP BY promotion_id,status ORDER BY promotion_id,status",[world]);
  assert.deepEqual(statuses,[
   {promotion_id:"autonomous",status:"EXPIRED",count:6},
   {promotion_id:"autonomous",status:"SIGNED",count:24},
   {promotion_id:"human",status:"EXPIRED",count:2},
   {promotion_id:"owner-controlled",status:"EXPIRED",count:2},
  ]);
  const terms=await query<{start_week_index:number;expires_week_index:number;
   remaining_dates:number;date_entitlement:number}>(
   "SELECT start_week_index,expires_week_index,remaining_dates,date_entitlement FROM ppw_contracts WHERE world_id=$1 AND status='SIGNED' LIMIT 1",[world]);
  assert.deepEqual(terms,[{start_week_index:26,expires_week_index:51,
   remaining_dates:7,date_entitlement:7}]);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   expireAndRetainAiContracts(tx,world,1,26)),[],
   "Repeated expiry settlement must not renew the same people twice");
  const ledger=await query<{n:number;count:number}>(
   "SELECT count(*)::integer AS n,max((payload->>'count')::integer) AS count FROM ppw_ledger_events WHERE world_id=$1 AND event_type='AI_CONTRACTS_RETAINED'",[world]);
  assert.deepEqual(ledger,[{n:1,count:24}]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
  }).finally(()=>db.close());
 }
});

