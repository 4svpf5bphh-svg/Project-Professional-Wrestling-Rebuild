import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {readWorldMail,markWorldMailRead} from "../src/db/backstage-world-mail.js";
import {respondToStaffMail,settleBackstageStaffPromises}
 from "../src/db/backstage-staff-replies.js";
import {prepareDelegatedSameTermsRenewals} from "../src/db/staff-auto-renewals.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Talent Manager direct Backstage authorisation prepares genuine proposals, preserves show delegation and reports after World Lock",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const id=randomUUID(),worldId="manager-reply-"+id,
  promotionId="cwa-"+id,rivalId="other-"+id,
  playerId="manager-"+id,personId="wrestler-"+id,contractId="deal-"+id;
 const db=postgresPool(url!,3),scope={worldId,promotionId,playerId};
 const staff=worldStaff("123").find(s=>s.role==="TALENT_MANAGER")!;
 const employmentId="employment-"+id;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage Talent Manager",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Expiring Wrestler')",
    [worldId,personId]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,promotion_id,person_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index,",
    "date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',3,0,12,",
    "6,4000,7000,'FEATURED','CONSULTATION')"
   ].join(" "),[worldId,contractId,promotionId,personId]);
   await tx.query([
    "INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,",
    "role,status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale)",
    "VALUES($1,$2,$3,$4,'TALENT_MANAGER','ACTIVE',500,0,51,52,74)"
   ].join(" "),[worldId,employmentId,staff.staffId,promotionId]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+id,
   expectedRevision:0})).status,"APPLIED");
  const control=await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"control-"+id,expectedRevision:1});
  assert.equal(control.status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query([
   "INSERT INTO ppw_staff_continuity_settings(world_id,promotion_id,owner_player_id,",
   "allow_unfinished_fallback,allow_logistics_fallback,permitted_days,",
   "permitted_venue_ids,auto_renew_same_terms)",
   "VALUES($1,$2,$3,true,true,ARRAY[5]::smallint[],ARRAY['arena']::text[],false)"
  ].join(" "),[worldId,promotionId,playerId]));
  const before=await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
  const alert=before.find(x=>x.kind==="STAFF"&&x.action==="CONTRACTS");
  assert.ok(alert,"A hired Talent Manager raises genuine expiring contracts");
  assert.equal(alert.sender,staff.name);
  assert.equal(alert.canStaffRespond,true);
  assert.match(alert.body,/wrestlers still decide/i);
  await assert.rejects(respondToStaffMail(db.pool,{
   ...scope,promotionId:rivalId,mailId:alert.id,decision:"COMMIT",
   requestId:"rival-"+id,expectedRevision:control.revision
  }),/no longer actionable/);
  await assert.rejects(respondToStaffMail(db.pool,{
   ...scope,mailId:"backstage-world:"+"a".repeat(32),decision:"COMMIT",
   requestId:"invented-"+id,expectedRevision:control.revision
  }),/no longer actionable/);
  const answer={...scope,mailId:alert.id,decision:"COMMIT" as const,
   requestId:"authorise-"+id,expectedRevision:control.revision};
  const delegated=await respondToStaffMail(db.pool,answer);
  assert.equal(delegated.status,"APPLIED");
  assert.equal((await respondToStaffMail(db.pool,answer)).status,"REPLAYED");
  const settings=await withWorldTransaction(db.pool,tx=>tx.query<{
   auto_renew_same_terms:boolean;allow_unfinished_fallback:boolean;
   allow_logistics_fallback:boolean;permitted_days:number[];permitted_venue_ids:string[]
  }>([
   "SELECT auto_renew_same_terms,allow_unfinished_fallback,",
   "allow_logistics_fallback,permitted_days,permitted_venue_ids",
   "FROM ppw_staff_continuity_settings WHERE world_id=$1 AND promotion_id=$2"
  ].join(" "),[worldId,promotionId]));
  assert.deepEqual(settings,[{auto_renew_same_terms:true,
   allow_unfinished_fallback:true,allow_logistics_fallback:true,
   permitted_days:[5],permitted_venue_ids:["arena"]}],
   "Backstage only grants renewal delegation, preserving all other staff authorisations");
  assert.equal((await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===alert.id)?.staffResponse?.status,"PENDING");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,10)),{settled:0},
   "Signing no contracts is not yet a failed commitment");
  const generated=await withWorldTransaction(db.pool,tx=>
   prepareDelegatedSameTermsRenewals(tx,worldId,10));
  assert.equal(generated.proposed,1,"The original World Lock delegation proposes terms");
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{status:string;
   proposed_terms:{weeklyGuarantee:number;appearanceFee:number;dateEntitlement:number}
  }>([
   "SELECT status,proposed_terms FROM ppw_contract_renewal_proposals",
   "WHERE world_id=$1 AND contract_id=$2"
  ].join(" "),[worldId,contractId])))[0]?.status,"PENDING");
  const original=await withWorldTransaction(db.pool,tx=>tx.query<{
   expires_week_index:number;weekly_guarantee:string
  }>([
   "SELECT expires_week_index,weekly_guarantee::text",
   "FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2"
  ].join(" "),[worldId,contractId]));
  assert.equal(original[0]?.expires_week_index,12,"Proposing never silently extends a real contract");
  assert.equal(original[0]?.weekly_guarantee,"4000");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,11)),{settled:1});
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleBackstageStaffPromises(tx,worldId,12)),{settled:0},
   "An earlier successful promise cannot credit morale twice");
  const morale=await withWorldTransaction(db.pool,tx=>tx.query<{morale:number}>(
   "SELECT morale FROM ppw_staff_employments WHERE world_id=$1 AND employment_id=$2",
   [worldId,employmentId]));
  assert.equal(morale[0]?.morale,76);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=12 WHERE world_id=$1",[worldId]));
  const followup=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.subject==="Renewal offers have been prepared");
  assert.ok(followup);
  assert.equal(followup?.sender,staff.name);
  assert.match(followup?.body??"",/wrestler decides whether to accept/i);
  assert.equal(followup?.action,"CONTRACTS");
  assert.equal(followup?.read,false);
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,2);
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:followup!.id}),
   {readCount:1});
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,1);

  // Regression for a genuine multi-manager control handover. A former
  // controller's TV/show fallback permission is NEVER silently inherited
  // merely because this new owner grants Talent Manager renewal delegation.
  const former="former-controller-"+id;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[former]);
   await tx.query([
    "INSERT INTO ppw_memberships(world_id,player_id,status)",
    "VALUES($1,$2,'ACTIVE')"
   ].join(" "),[worldId,former]);
   await tx.query([
    "UPDATE ppw_staff_continuity_settings SET owner_player_id=$3,",
    "auto_renew_same_terms=false,allow_unfinished_fallback=true,",
    "allow_logistics_fallback=true,permitted_days=ARRAY[5]::smallint[],",
    "permitted_venue_ids=ARRAY['old-booker-venue']::text[]",
    "WHERE world_id=$1 AND promotion_id=$2"
   ].join(" "),[worldId,promotionId,former]);
   await tx.query("UPDATE ppw_worlds SET week=13 WHERE world_id=$1",[worldId]);
  });
  const newLetter=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope)))
   .find(x=>x.kind==="STAFF"&&x.action==="CONTRACTS"&&x.canStaffRespond);
  assert.ok(newLetter,"New owner's genuine expiring deal warrants fresh consent");
  assert.notEqual(newLetter.id,alert.id);
  const transferred=await respondToStaffMail(db.pool,{...scope,
   mailId:newLetter.id,decision:"COMMIT",requestId:"new-owner-"+id,
   expectedRevision:delegated.revision});
  assert.equal(transferred.status,"APPLIED");
  const safe=await withWorldTransaction(db.pool,tx=>tx.query<{
   owner_player_id:string;auto_renew_same_terms:boolean;
   allow_unfinished_fallback:boolean;allow_logistics_fallback:boolean;
   permitted_days:number[];permitted_venue_ids:string[]
  }>([
   "SELECT owner_player_id,auto_renew_same_terms,allow_unfinished_fallback,",
   "allow_logistics_fallback,permitted_days,permitted_venue_ids",
   "FROM ppw_staff_continuity_settings WHERE world_id=$1 AND promotion_id=$2"
  ].join(" "),[worldId,promotionId]));
  assert.deepEqual(safe,[{owner_player_id:playerId,auto_renew_same_terms:true,
   allow_unfinished_fallback:false,allow_logistics_fallback:false,
   permitted_days:[],permitted_venue_ids:[]}],
   "Only renewal delegation is newly consented; old owner's creative/logistics delegation is erased");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_backstage_staff_replies","ppw_contract_renewal_proposals",
    "ppw_ledger_events","ppw_staff_continuity_settings","ppw_staff_employments",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,"former-controller-"+id]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
