import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWorldMail,markWorldMailRead} from "../src/db/backstage-world-mail.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {respondToStaffMail,settleBackstageStaffPromises}
 from "../src/db/backstage-staff-replies.js";
import {worldStaff} from "../src/domain/world-staff.js";

const url=process.env.PPW_NEON_TEST_URL;
test("medical and creative staff promises remain private, checked, and affect only actual staff morale",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const tag=randomUUID(),worldId="staff-response-"+tag,
  promotionId="mine-"+tag,rivalId="rival-"+tag,playerId="owner-"+tag,
  personId="fatigued-"+tag;
 const db=postgresPool(url!,3),scope={worldId,promotionId,playerId};
 const catalog=worldStaff("123");
 const medical=catalog.find(s=>s.role==="MEDICAL")!,
  creative=catalog.find(s=>s.role==="CREATIVE")!;
 const employments=[["MEDICAL",medical.staffId],["CREATIVE",creative.staffId]] as const;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Staff advice",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,fatigue) VALUES($1,$2,'Strained Worker',82)",
    [worldId,personId]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,promotion_id,person_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',12,0,12)"
   ].join(" "),[worldId,"deal-"+tag,promotionId,personId]);
   await tx.query([
    "INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition)",
    "VALUES($1,$2,$3,'ACTIVE',5)"
   ].join(" "),[worldId,promotionId,"story-"+tag]);
   for(const [role,staffId] of employments)await tx.query([
    "INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,",
    "promotion_id,role,status,weekly_salary,start_week_index,",
    "expires_week_index,term_weeks,morale)",
    "VALUES($1,$2,$3,$4,$5,'ACTIVE',500,0,51,52,70)"
   ].join(" "),[worldId,role+"-"+tag,staffId,promotionId,role]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+tag,expectedRevision:0})).status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId,playerId,
   promotionId,requestId:"claim-"+tag,expectedRevision:1});
  assert.equal(claimed.status,"APPLIED");
  const inbox=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  const alerts=inbox.filter(x=>x.kind==="STAFF"&&x.canStaffRespond);
  assert.equal(alerts.length,2,"Only true medical and active-story problems invite a staff decision");
  const doctor=alerts.find(x=>x.action==="STAFF")!,
   writer=alerts.find(x=>x.action==="PROGRAMMES")!;
  assert.equal(doctor.sender,medical.name);
  assert.equal(writer.sender,creative.name);
  await assert.rejects(respondToStaffMail(db.pool,{
   ...scope,promotionId:rivalId,mailId:doctor.id,decision:"COMMIT",
   requestId:"rival-"+tag,expectedRevision:claimed.revision
  }),/no longer actionable/);
  await assert.rejects(respondToStaffMail(db.pool,{
   ...scope,mailId:"backstage-world:"+"f".repeat(32),
   decision:"COMMIT",requestId:"forged-"+tag,
   expectedRevision:claimed.revision
  }),/no longer actionable/);
  const first={...scope,mailId:doctor.id,decision:"COMMIT" as const,
   requestId:"doctor-"+tag,expectedRevision:claimed.revision};
  const a=await respondToStaffMail(db.pool,first);
  assert.equal(a.status,"APPLIED");
  assert.equal((await respondToStaffMail(db.pool,first)).status,"REPLAYED");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===doctor.id)?.staffResponse?.status,"PENDING");
  await assert.rejects(respondToStaffMail(db.pool,{
   ...first,requestId:"duplicate-"+tag,expectedRevision:a.revision
  }),/already received/);
  const second={...scope,mailId:writer.id,decision:"COMMIT" as const,
   requestId:"creative-"+tag,expectedRevision:a.revision};
  const b=await respondToStaffMail(db.pool,second);
  assert.equal(b.status,"APPLIED");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,0)),{settled:0},
   "A commitment cannot be fulfilled retroactively on its own start week");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_people SET fatigue=40 WHERE world_id=$1 AND person_id=$2",
    [worldId,personId]);
   await tx.query("UPDATE ppw_programmes SET repetition=1 WHERE world_id=$1 AND promotion_id=$2",
    [worldId,promotionId]);
  });
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,1)),{settled:2});
  const morale=await withWorldTransaction(db.pool,tx=>tx.query<{
   role:string;morale:number
  }>("SELECT role,morale FROM ppw_staff_employments WHERE world_id=$1 ORDER BY role",
   [worldId]));
  assert.deepEqual(morale.map(x=>x.morale),[72,72]);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,2)),{settled:0},
   "Follow-through can never pay staff morale twice");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]));
  const after=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  const followups=after.filter(x=>x.subject==="The workload changes helped"||
   x.subject==="The storylines have moved forward");
  assert.equal(followups.length,2);
  assert.equal(followups.filter(x=>!x.read).length,2);
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,2);
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:followups[0]!.id}),
   {readCount:1});
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);

  // Another four-week staff issue is a distinct request with its own deadline.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]);
   await tx.query("UPDATE ppw_people SET fatigue=85 WHERE world_id=$1 AND person_id=$2",
    [worldId,personId]);
  });
  const renewedConcern=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.kind==="STAFF"&&x.action==="STAFF"&&x.canStaffRespond)!;
  assert.ok(renewedConcern);
  const third=await respondToStaffMail(db.pool,{...scope,mailId:renewedConcern.id,
   decision:"COMMIT",requestId:"second-promise-"+tag,expectedRevision:b.revision});
  assert.equal(third.status,"APPLIED");
  for(const week of [4,5,6])assert.deepEqual(
   await withWorldTransaction(db.pool,tx=>settleBackstageStaffPromises(tx,worldId,week)),
   {settled:0});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,7)),{settled:1});
  const doctorAfter=await withWorldTransaction(db.pool,tx=>tx.query<{morale:number}>(
   "SELECT morale FROM ppw_staff_employments WHERE world_id=$1 AND role='MEDICAL'",
   [worldId]));
  assert.equal(doctorAfter[0]?.morale,70,"A broken promise reverses the modest +2 morale");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=9 WHERE world_id=$1",[worldId]));
  assert.ok((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .some(x=>x.subject==="Fatigue is still a concern"));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_backstage_staff_replies","ppw_programmes","ppw_staff_employments",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
