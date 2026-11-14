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
import {respondToStaffDisagreement,settleStaffDisagreements}
 from "../src/db/backstage-staff-disagreements.js";
import {worldStaff} from "../src/domain/world-staff.js";
const url=process.env.PPW_NEON_TEST_URL;
test("authentic Medical/Creative disagreement: owner choice, real World follow-through, staff morale, badges, no false recovery",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const tag=randomUUID(),worldId="staff-debate-"+tag,playerId="owner-"+tag,
  promotionId="company-"+tag,rivalId="rival-"+tag,personId="worker-"+tag,
  programmeId="story-"+tag;
 const scope={worldId,promotionId,playerId},db=postgresPool(url!,3);
 const catalogue=worldStaff("123"),medical=catalogue.find(x=>x.role==="MEDICAL")!,
  creative=catalogue.find(x=>x.role==="CREATIVE")!;
 const employmentIds={MEDICAL:"med-"+tag,CREATIVE:"creative-"+tag};
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Verified staff conflict",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:rivalId,name:"Rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Stressed Wrestler','ACTIVE',84)",
    [worldId,personId]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)"
   ].join(" "),[worldId,"deal-"+tag,personId,promotionId]);
   await tx.query([
    "INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition)",
    "VALUES($1,$2,$3,'ACTIVE',5)"
   ].join(" "),[worldId,promotionId,programmeId]);
   await tx.query([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)"
   ].join(" "),[worldId,promotionId,programmeId,personId]);
   for(const [role,staffId] of [
    ["MEDICAL",medical.staffId],["CREATIVE",creative.staffId]] as const)
    await tx.query([
     "INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,",
     "role,status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale)",
     "VALUES($1,$2,$3,$4,$5,'ACTIVE',500,0,51,52,70)"
    ].join(" "),[worldId,employmentIds[role],staffId,promotionId,role]);
  });
  assert.equal((await joinWorld(db.pool,{worldId,playerId,
   requestId:"join-"+tag,expectedRevision:0})).status,"APPLIED");
  const claimed=await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"claim-"+tag,expectedRevision:1});
  assert.equal(claimed.status,"APPLIED");
  const before=await run(tx=>readWorldMail(tx,scope));
  const dispute=before.find(x=>x.canDisagree)!;
  assert.ok(dispute,"Only the actually fatigued programme member with both employees should trigger a debate");
  assert.equal(dispute.sender,medical.name);
  assert.equal(dispute.targetPersonId,personId);
  assert.equal(dispute.staffDebate?.medical.name,medical.name);
  assert.equal(dispute.staffDebate?.creative.name,creative.name,
   "Creative is the actual second hired employee, not an invented sender");
  assert.equal(dispute.staffDebate?.medical.personality,medical.personality);
  assert.equal(dispute.staffDebate?.creative.personality,creative.personality);
  assert.notEqual(dispute.staffDebate?.medical.position,
   dispute.staffDebate?.creative.position);
  assert.match(dispute.staffDebate!.medical.position,/fatigue|schedule|workload|body|performer/i);
  assert.match(dispute.staffDebate!.creative.position,/programme|storyline|chapter|rivalry|story/i);
  assert.match(dispute.body,/Stressed Wrestler/);
  assert.match(dispute.body,/repeated 5 times/);
  const atHome=await readPlayerWorldOverview(db.pool,worldId,playerId);
  assert.equal(atHome?.promotion?.attention.backstageUnreadCount,before.filter(x=>!x.read).length,
   "Unread conflict is already in the existing one-query Home badge");
  await assert.rejects(respondToStaffDisagreement(db.pool,{...scope,
   promotionId:rivalId,mailId:dispute.id,decision:"PRIORITISE_HEALTH",
   requestId:"hijack-"+tag,expectedRevision:claimed.revision}),/no longer actionable/);
  await assert.rejects(respondToStaffDisagreement(db.pool,{...scope,
   mailId:"backstage-world:"+"f".repeat(32),decision:"PRIORITISE_HEALTH",
   requestId:"forged-"+tag,expectedRevision:claimed.revision}),/no longer actionable/);
  const input={...scope,mailId:dispute.id,decision:"PRIORITISE_HEALTH" as const,
   requestId:"choose-medical-"+tag,expectedRevision:claimed.revision};
  const choice=await respondToStaffDisagreement(db.pool,input);
  assert.equal(choice.status,"APPLIED");
  assert.equal((await respondToStaffDisagreement(db.pool,input)).status,"REPLAYED");
  assert.equal(choice.result?.status,"PENDING");
  const answered=(await run(tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===dispute.id)!;
  assert.equal(answered.disagreementResponse?.decision,"PRIORITISE_HEALTH");
  assert.equal(answered.staffDebate?.creative.name,creative.name,
   "The same two staff voices persist after the original live source disappears");
  assert.equal(answered.staffDebate?.medical.name,medical.name);
  assert.deepEqual(answered.staffDebate,dispute.staffDebate,
   "Opening the conversation or responding cannot regenerate staff personalities");
  const unchanged=await run(tx=>tx.query<{fatigue:number}>(
   "SELECT fatigue FROM ppw_people WHERE world_id=$1 AND person_id=$2",[worldId,personId]));
  assert.equal(unchanged[0]?.fatigue,84,
   "A conversation cannot heal fatigue, cancel a programme or change match outcomes");
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,0)),{settled:0});
  await run(tx=>tx.query(
   "UPDATE ppw_people SET fatigue=45 WHERE world_id=$1 AND person_id=$2",[worldId,personId]));
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,1)),{settled:1});
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,2)),{settled:0});
  const employees=await run(tx=>tx.query<{role:string;morale:number}>(
   "SELECT role,morale FROM ppw_staff_employments WHERE world_id=$1 ORDER BY role",[worldId]));
  assert.equal(employees.find(x=>x.role==="MEDICAL")?.morale,72);
  assert.equal(employees.find(x=>x.role==="CREATIVE")?.morale,70);
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  const after=await run(tx=>readWorldMail(tx,scope));
  const followup=after.find(x=>x.subject==="The workload concern has eased")!;
  assert.ok(followup);
  assert.equal(followup.sender,medical.name);
  assert.equal(followup.read,false);
  const creativeCounterpoint=after.find(x=>x.subject==="Creative after the staff review")!;
  assert.ok(creativeCounterpoint,"Both hired specialists follow up after one real settled outcome");
  assert.equal(creativeCounterpoint.sender,creative.name);
  assert.match(creativeCounterpoint.body,/actual fatigue dropped below/);
  assert.equal(creativeCounterpoint.action,"PROGRAMMES");
  assert.equal(creativeCounterpoint.read,false);
  assert.notEqual(creativeCounterpoint.id,followup.id,
   "The second real staff member has their own private stable read receipt");
  assert.equal((await readPlayerWorldOverview(db.pool,worldId,playerId))
   ?.promotion?.attention.backstageUnreadCount,after.filter(x=>!x.read).length);
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:followup.id}),
   {readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:followup.id}),
   {readCount:0});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:creativeCounterpoint.id}),
   {readCount:1});
  assert.deepEqual(await markWorldMailRead(db.pool,{...scope,mailId:creativeCounterpoint.id}),
   {readCount:0});
  assert.equal((await run(tx=>readWorldMail(tx,scope)))
   .find(x=>x.id===creativeCounterpoint.id)?.read,true);

  // A second *real* conflicted programme can be backed by Creative.
  const nextPerson="second-"+tag,nextProgramme="second-story-"+tag;
  await run(async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Other Worker','ACTIVE',91)",
    [worldId,nextPerson]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)"
   ].join(" "),[worldId,"deal2-"+tag,nextPerson,promotionId]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition) VALUES($1,$2,$3,'ACTIVE',6)",
    [worldId,promotionId,nextProgramme]);
   await tx.query([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)"
   ].join(" "),[worldId,promotionId,nextProgramme,nextPerson]);
  });
  const second=(await run(tx=>readWorldMail(tx,scope))).find(x=>x.canDisagree)!;
  assert.ok(second&&second.targetPersonId===nextPerson);
  const creativeReply=await respondToStaffDisagreement(db.pool,{...scope,
   mailId:second.id,decision:"REFRESH_PROGRAMME",requestId:"creative-"+tag,
   expectedRevision:choice.revision});
  assert.equal(creativeReply.status,"APPLIED");
  await run(tx=>tx.query("UPDATE ppw_programmes SET repetition=1 WHERE world_id=$1 AND programme_id=$2",
   [worldId,nextProgramme]));
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,5)),{settled:1});
  const updated=await run(tx=>tx.query<{role:string;morale:number}>(
   "SELECT role,morale FROM ppw_staff_employments WHERE world_id=$1 ORDER BY role",[worldId]));
  assert.equal(updated.find(x=>x.role==="CREATIVE")?.morale,72);
  assert.equal(updated.find(x=>x.role==="MEDICAL")?.morale,72);
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=7 WHERE world_id=$1",[worldId]));
  const creativeMails=await run(tx=>readWorldMail(tx,scope));
  const medicalCounterpoint=creativeMails.find(x=>x.subject==="Medical after the staff review")!;
  assert.ok(medicalCounterpoint,"Medical also speaks after the verified Creative choice");
  assert.equal(medicalCounterpoint.sender,medical.name);
  assert.match(medicalCounterpoint.body,/does not prove the wrestler has recovered/);
  assert.equal(medicalCounterpoint.action,"STAFF");
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,6)),{settled:0},
   "No second morale award is possible");

  // Third real issue tests a broken promise without fabricated programme progress.
  const lastPerson="third-"+tag,lastProgramme="third-story-"+tag;
  await run(async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=9 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Third Worker','ACTIVE',93)",
    [worldId,lastPerson]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)"
   ].join(" "),[worldId,"deal3-"+tag,lastPerson,promotionId]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition) VALUES($1,$2,$3,'ACTIVE',7)",
    [worldId,promotionId,lastProgramme]);
   await tx.query([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)"
   ].join(" "),[worldId,promotionId,lastProgramme,lastPerson]);
  });
  const third=(await run(tx=>readWorldMail(tx,scope))).find(x=>x.canDisagree)!;
  assert.ok(third&&third.targetPersonId===lastPerson);
  const thirdReply=await respondToStaffDisagreement(db.pool,{...scope,
   mailId:third.id,decision:"REFRESH_PROGRAMME",requestId:"broken-"+tag,
   expectedRevision:creativeReply.revision});
  assert.equal(thirdReply.status,"APPLIED");

  // Both staff choices can be made before the same deadline. One successful
  // and one broken Creative commitment must NET to zero, not whichever row
  // PostgreSQL happens to select in an UPDATE ... FROM with duplicate staff.
  const fourthPerson="fourth-"+tag,fourthProgramme="fourth-story-"+tag;
  await run(async tx=>{
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Fourth Worker','ACTIVE',95)",
    [worldId,fourthPerson]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)"
   ].join(" "),[worldId,"deal4-"+tag,fourthPerson,promotionId]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition) VALUES($1,$2,$3,'ACTIVE',8)",
    [worldId,promotionId,fourthProgramme]);
   await tx.query([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)"
   ].join(" "),[worldId,promotionId,fourthProgramme,fourthPerson]);
  });
  const fourth=(await run(tx=>readWorldMail(tx,scope))).find(x=>x.canDisagree)!;
  assert.ok(fourth&&fourth.targetPersonId===fourthPerson);
  const fourthReply=await respondToStaffDisagreement(db.pool,{...scope,
   mailId:fourth.id,decision:"REFRESH_PROGRAMME",requestId:"kept-together-"+tag,
   expectedRevision:thirdReply.revision});
  assert.equal(fourthReply.status,"APPLIED");
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,10)),{settled:0},
   "Before the deadline, neither unresolved programme earns a premature result");
  // Creative really refreshes the second programme just before the deadline;
  // the other remains stale. The two outcomes now settle in the SAME batch.
  await run(tx=>tx.query("UPDATE ppw_programmes SET repetition=1 WHERE world_id=$1 AND programme_id=$2",
   [worldId,fourthProgramme]));
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,11)),{settled:2},
   "Both decisions reach their exact three-week deadline together");
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,12)),{settled:0},
   "Settled commitments can never be counted again");
  const outcomes=await run(tx=>tx.query<{mail_id:string;status:string}>(
   "SELECT mail_id,status FROM ppw_backstage_staff_disagreements WHERE world_id=$1 AND mail_id=ANY($2::text[])",
   [worldId,[third.id,fourth.id]]));
  assert.equal(outcomes.find(x=>x.mail_id===third.id)?.status,"BROKEN");
  assert.equal(outcomes.find(x=>x.mail_id===fourth.id)?.status,"KEPT");
  const lastMorale=await run(tx=>tx.query<{morale:number}>(
   "SELECT morale FROM ppw_staff_employments WHERE world_id=$1 AND role='CREATIVE'",[worldId]));
  assert.equal(lastMorale[0]?.morale,72,
   "One broken and one kept verified Creative commitment must cancel precisely");

  // DEFER is not a silent twelve-week rejection. The genuine unresolved
  // concern may be raised again in a NEW four-week window, after both
  // departments had time to observe actual World changes.
  const deferredPerson="deferred-"+tag,deferredProgramme="deferred-story-"+tag;
  await run(async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=14 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,status,fatigue) VALUES($1,$2,'Deferred Worker','ACTIVE',100)",
    [worldId,deferredPerson]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,start_week_index,expires_week_index)",
    "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,0,25)"
   ].join(" "),[worldId,"deferred-contract-"+tag,deferredPerson,promotionId]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition) VALUES($1,$2,$3,'ACTIVE',9)",
    [worldId,promotionId,deferredProgramme]);
   await tx.query([
    "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,",
    "side,position,ref_kind,ref_id) VALUES($1,$2,$3,'A',0,'PERSON',$4)"
   ].join(" "),[worldId,promotionId,deferredProgramme,deferredPerson]);
  });
  const deferral=(await run(tx=>readWorldMail(tx,scope))).find(x=>
   x.canDisagree&&x.targetPersonId===deferredPerson)!;
  assert.ok(deferral,"The actual unresolved fatigue and repeated programme opens the first debate");
  const defer=await respondToStaffDisagreement(db.pool,{...scope,mailId:deferral.id,
   decision:"DEFER",requestId:"defer-"+tag,expectedRevision:fourthReply.revision});
  assert.equal(defer.status,"APPLIED");
  assert.equal(defer.result?.status,"ACKNOWLEDGED");
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,14)),{settled:0},
   "Hearing both sides creates no instant outcome or morale");
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=17 WHERE world_id=$1",[worldId]));
  const tooSoon=await run(tx=>readWorldMail(tx,scope));
  assert.equal(tooSoon.some(x=>x.canDisagree&&x.targetPersonId===deferredPerson),false,
   "A deferred concern cannot instantly recur within the original four-week window");
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=18 WHERE world_id=$1",[worldId]));
  const revisited=await run(tx=>readWorldMail(tx,scope));
  const renewed=revisited.find(x=>x.canDisagree&&x.targetPersonId===deferredPerson)!;
  assert.ok(renewed,
   "After four weeks the same issue is raised again ONLY while fatigue and repetition persist");
  assert.notEqual(renewed.id,deferral.id);
  assert.match(renewed.body,/Four weeks after you asked us to revisit this/);
  assert.equal(renewed.staffDebate?.medical.name,medical.name);
  assert.equal(renewed.staffDebate?.creative.name,creative.name);
  assert.ok(revisited.some(x=>x.id===deferral.id&&
   x.disagreementResponse?.status==="ACKNOWLEDGED"),
   "Original manager deferral remains an independent, auditable conversation");
  const renewedChoice=await respondToStaffDisagreement(db.pool,{...scope,
   mailId:renewed.id,decision:"PRIORITISE_HEALTH",
   requestId:"defer-later-medical-"+tag,expectedRevision:defer.revision});
  assert.equal(renewedChoice.status,"APPLIED");
  assert.equal(renewedChoice.result?.status,"PENDING");
  await run(tx=>tx.query("UPDATE ppw_people SET fatigue=56 WHERE world_id=$1 AND person_id=$2",
   [worldId,deferredPerson]));
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,18)),{settled:1});
  assert.deepEqual(await run(tx=>settleStaffDisagreements(tx,worldId,18)),{settled:0});
  const finalMorale=await run(tx=>tx.query<{role:string;morale:number}>(
   "SELECT role,morale FROM ppw_staff_employments WHERE world_id=$1 ORDER BY role",[worldId]));
  assert.equal(finalMorale.find(x=>x.role==="MEDICAL")?.morale,74,
   "Only the later kept Medical promise changes morale; deferral did not");
  assert.equal(finalMorale.find(x=>x.role==="CREATIVE")?.morale,72);
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_backstage_staff_disagreements","ppw_programme_side_refs",
    "ppw_staff_continuity_settings","ppw_staff_employments","ppw_programmes",
    "ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
