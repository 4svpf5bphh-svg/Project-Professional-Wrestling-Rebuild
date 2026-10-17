import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setStaffContinuityAsActor} from "../src/api/world-service.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Consent-based Talent Manager proposes unchanged expiring deals once, without signing them",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="talent-manager-"+id,player="manager-"+id,
  promo="human-"+id,uncontrolled="other-"+id,db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Delegated renewal",seed:6,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"Managed",tier:"LOCAL"});
   await addPromotion(tx,world,{id:uncontrolled,name:"Unmanaged",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",[world,promo,player]);
   await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name)
    VALUES($1,'a','Signed Wrestler'),($1,'b','Unmanaged Wrestler'),($1,'c','One Off')`,[world]);
   await tx.query(`
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
      family,status,remaining_dates,start_week_index,expires_week_index,
      date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control)
    VALUES ($1,'a-contract','a',$2,'LIMITED_NON_EXCLUSIVE','SIGNED',2,0,12,6,4000,7000,'FEATURED','CONSULTATION'),
      ($1,'b-contract','b',$3,'LIMITED_NON_EXCLUSIVE','SIGNED',2,0,12,6,4000,7000,'FEATURED','CONSULTATION'),
      ($1,'c-contract','c',$2,'ONE_OFF','SIGNED',1,10,10,1,0,5000,'REGULAR','NONE')`,
    [world,promo,uncontrolled]);
  });
  const actor={pool:db.pool,actor:{playerId:player}};
  const consent=await setStaffContinuityAsActor(actor,{worldId:world,
   promotionId:promo,requestId:"manager-consent",expectedRevision:0,
   allowUnfinishedFallback:false,autoRenewSameTerms:true});
  assert.equal(consent.status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[world]));
  assert.equal((await lockWorldWeek(db.pool,{worldId:world,requestId:"lock",
   expectedRevision:1})).status,"APPLIED");
  const result=await recordWeekContinuity(db.pool,{worldId:world,
   requestId:"continuity",expectedRevision:2});
  assert.equal(result.status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{worldId:world,
   requestId:"continuity",expectedRevision:2})).status,"REPLAYED");
  const proposals=await withWorldTransaction(db.pool,tx=>tx.query<{
   proposal_id:string;contract_id:string;promotion_id:string;
   status:string;created_week_index:number;
   proposed_terms:{family:string;termWeeks:number;dateEntitlement:number;
     weeklyGuarantee:number;appearanceFee:number;creativeControl:string}
  }>(`
   SELECT proposal_id,contract_id,promotion_id,status,created_week_index,proposed_terms
   FROM ppw_contract_renewal_proposals WHERE world_id=$1`,[world]));
  assert.equal(proposals.length,1);
  const p=proposals[0]!;
  assert.equal(p.contract_id,"a-contract");
  assert.equal(p.promotion_id,promo);
  assert.equal(p.status,"PENDING");
  assert.equal(p.created_week_index,10);
  assert.equal(p.proposed_terms.family,"LIMITED_NON_EXCLUSIVE");
  assert.equal(p.proposed_terms.termWeeks,13);
  assert.equal(p.proposed_terms.dateEntitlement,6);
  assert.equal(p.proposed_terms.weeklyGuarantee,4000);
  assert.equal(p.proposed_terms.appearanceFee,7000);
  assert.equal(p.proposed_terms.creativeControl,"CONSULTATION");
  const unchanged=await withWorldTransaction(db.pool,tx=>tx.query<{
   remaining_dates:number;expires_week_index:number
  }>("SELECT remaining_dates,expires_week_index FROM ppw_contracts WHERE world_id=$1 AND contract_id='a-contract'",[world]));
  assert.deepEqual(unchanged,[{remaining_dates:2,expires_week_index:12}]);
  const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{
   payload:{proposalCount:number;scope:string}
  }>("SELECT payload FROM ppw_ledger_events WHERE world_id=$1 AND event_type='STAFF_SAME_TERMS_RENEWALS'",[world]));
  assert.deepEqual(ledger.map(x=>x.payload),
   [{proposalCount:1,scope:"CONSENTED_OWNER"}]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_contract_renewal_proposals","ppw_ledger_events",
    "ppw_week_logistics_authorizations","ppw_week_continuity_assessments",
    "ppw_staff_continuity_settings","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
