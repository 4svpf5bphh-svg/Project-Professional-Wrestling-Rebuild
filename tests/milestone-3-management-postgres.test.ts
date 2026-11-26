import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {decideBackstageRequest,markBackstageThreadRead,publishBackstageRequests}
 from "../src/db/backstage-conversations.js";
import {respondToPartnerMediation} from "../src/db/backstage-partner-replies.js";
import {readWorldMail} from "../src/db/backstage-world-mail.js";
import {respondToStaffDisagreement} from "../src/db/backstage-staff-disagreements.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {postgresPool} from "../src/db/postgres.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {settlePendingWorldContracts} from "../src/db/world-contract-desk-resolution.js";
import {advanceResolvedWorldWeek} from "../src/db/week-advancement.js";
import {addPromotion,createWorld} from "../src/db/world-operations.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {submitManualContractOffer} from "../src/db/manual-contract-offers.js";
import {backstageManagerReply,backstageMessage,backstageReply,type BackstageDecision}
 from "../src/domain/backstage-conversations.js";
import {recommendTalentOffer,type TalentOfferProfile} from "../src/domain/talent-offer-advice.js";
import {worldStaff} from "../src/domain/world-staff.js";

const url=process.env.PPW_NEON_TEST_URL;
test("13 certified publications follow two human desks through form, contracts, staff disagreement and booking promises",{
 skip:!url?"Disposable PostgreSQL required":false
},async t=>{
 const db=postgresPool(url!,4);
 const totalWeeks=process.env.PPW_MILESTONE3_LONG_TEST==="1"?156:13;
 const worldId="milestone-3-"+randomUUID();
 const a={worldId,promotionId:"quay",playerId:"quay-"+worldId};
 const b={worldId,promotionId:"riverside",playerId:"riverside-"+worldId};
 const sql=<R extends Record<string,unknown>>(statement:string,params:unknown[]=[worldId])=>
  withWorldTransaction(db.pool,tx=>tx.query<R>(statement,params));
 const revision=async()=>Number((await sql<{revision:string}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1"))[0]!.revision);
 const staff=worldStaff(372);
 const people=[
  {id:"rook",name:"Kit Rook",owner:"quay",stage:"PROSPECT",morale:74,momentum:72,expiry:51},
  {id:"vale",name:"Alix Vale",owner:"quay",stage:"VETERAN",morale:74,momentum:57,expiry:8},
  {id:"north",name:"Lee North",owner:"quay",stage:"PRIME",morale:23,momentum:52,expiry:51},
  {id:"cruz",name:"Casey Cruz",owner:"quay",stage:"PRIME",morale:73,momentum:58,expiry:51},
  {id:"ember",name:"Jules Ember",owner:"quay",stage:"PRIME",morale:72,momentum:58,expiry:51},
  {id:"river",name:"River Stone",owner:"riverside",stage:"PRIME",morale:70,momentum:52,expiry:51},
  {id:"banks",name:"Robin Banks",owner:"riverside",stage:"PRIME",morale:72,momentum:51,expiry:51},
 ];
 const trace:unknown[]=[];
 const checkpoints:unknown[]=[];
 const readThread=(personId:string,scope=a)=>readPortablePersonaWorkspace(db.pool,{...scope,personId});
 const getRequest=async (personId:string,kind:string,scope=a)=>
  (await readThread(personId,scope)).conversations.find(row=>row.kind===kind);
 const answer=async(personId:string,kind:string,decision:BackstageDecision)=>{
  const item=await getRequest(personId,kind);
  assert.ok(item&&item.status==="PENDING",personId+" "+kind+" must be a live request");
  const result=await decideBackstageRequest(db.pool,{...a,conversationId:item.conversationId,
   decision,requestId:"reply-"+personId+"-"+kind,expectedRevision:await revision()});
  assert.equal(result.status,"APPLIED");
  assert.ok(result.result);
  trace.push({week:item.createdWeekIndex+1,personId,incoming:backstageMessage(item.kind,{
   managementContext:item.managementContext,careerStage:people.find(p=>p.id===personId)!.stage as "PRIME"|"PROSPECT"|"VETERAN"
  },item.conversationId),reply:backstageManagerReply(decision,item.kind,result.result.dueWeekIndex)});
  return result.result;
 };
 const recordOutcome=async(personId:string,kind:string,status:string,reason:string,trust:number)=>{
  const saved=await getRequest(personId,kind);
  assert.ok(saved?.decision);
  assert.equal(saved.status,status);
  assert.equal(saved.assessmentReason,reason);
  assert.equal(saved.trustDelta,trust);
  assert.ok(saved.settledWeekIndex!==null);
  trace.push({week:saved.settledWeekIndex+1,personId,status,reason,trust,
   followUp:backstageReply(saved.decision,saved.status,saved.kind)});
 };
 const meter=new MeasuredQuerySession("World publications");
 const backstageMeter=new MeasuredQuerySession("Backstage publication and settlement");
 const isBackstageWrite=/INSERT INTO ppw_backstage_|UPDATE ppw_backstage_|DELETE FROM ppw_backstage_/;
 const measured:TransactionPool={async connect(){
  const client=await db.pool.connect();
  return {release:()=>client.release(),query:<R extends Record<string,unknown>>(
   statement:string,params:readonly unknown[])=>meter.execute(()=>
    isBackstageWrite.test(statement)?backstageMeter.execute(()=>client.query<R>(statement,params)):
     client.query<R>(statement,params))};
 }};
 let providerCalls=0;
 t.mock.method(globalThis,"fetch",async ()=>{
  providerCalls++;
  throw new Error("Local management tests must never call a provider");
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Management playtest",seed:372,rulesetVersion:"test"});
   for(const scope of [a,b]){
    await addPromotion(tx,worldId,{id:scope.promotionId,name:scope.promotionId,tier:"LOCAL"});
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[scope.playerId]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
     [worldId,scope.playerId]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
     [worldId,scope.playerId,scope.promotionId]);
   }
   await tx.query(`UPDATE ppw_promotions SET cash=750000, weekly_media_income=8000,
    weekly_sponsor_income=0,weekly_fixed_overhead=1000,event_cadence_weeks=1,media_reach=40
    WHERE world_id=$1`,[worldId]);
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name) VALUES
    ($1,'quay-arena','Quay Arena'),($1,'riverside-arena','Riverside Pavilion')`,[worldId]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,career_stage,biological_age,
    career_experience,development_aptitude,booking_division,recognition,popularity,momentum,
    morale,fatigue,wear,in_ring_quality,match_craft,presentation,stamina,safety,contract_priorities)
    SELECT $1,x.id,x.name,x.stage,CASE WHEN x.stage='VETERAN' THEN 38 ELSE 23 END,
     35,88,'MEN',55,56,x.momentum,x.morale,0,0,66,68,70,83,90,
     '{"money":50,"role":60,"prestige":50,"schedule":50,"loyalty":50,"exposure":50}'::jsonb
    FROM jsonb_to_recordset($2::jsonb) x(id text,name text,stage text,momentum integer,morale integer)`,
    [worldId,JSON.stringify(people)]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     family,status,remaining_dates,start_week_index,expires_week_index,weekly_guarantee,date_entitlement)
    SELECT $1,'deal-'||x.id,x.id,x.owner,'EXCLUSIVE','SIGNED',NULL,0,x.expiry,1000,x.expiry+1
    FROM jsonb_to_recordset($2::jsonb) x(id text,owner text,expiry integer)`,
    [worldId,JSON.stringify(people)]);
   if(totalWeeks>13)await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,remaining_dates,start_week_index,expires_week_index,weekly_guarantee,date_entitlement)
    SELECT $1,'deal-'||p.id||'-year-'||term.year,p.id,p.owner,'EXCLUSIVE','SIGNED',NULL,
     (term.year-1)*52,term.year*52-1,1000,52
    FROM jsonb_to_recordset($2::jsonb) p(id text,owner text)
    CROSS JOIN generate_series(2,3) term(year)
    WHERE p.id IN ('rook','cruz','river','banks')`,[worldId,JSON.stringify(people)]);
   await tx.query(`UPDATE ppw_contracts SET family='LIMITED_NON_EXCLUSIVE',remaining_dates=4,start_week_index=8
    WHERE world_id=$1 AND contract_id='deal-ember'`,[worldId]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,remaining_dates,start_week_index,expires_week_index,date_entitlement)
    VALUES($1,'guest-ember','ember','riverside','LIMITED_NON_EXCLUSIVE','SIGNED',2,8,20,2)`,[worldId]);
   await tx.query(`INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,
    professional_trust,familiarity) VALUES($1,'cruz','north',26,18)`,[worldId]);
   await tx.query(`INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,
    repetition,heat,started_week_index) VALUES($1,'quay','breakwater','ACTIVE',5,62,0)`,[worldId]);
   await tx.query(`INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,person_id,side)
    VALUES($1,'quay','breakwater','rook','A'),($1,'quay','breakwater','vale','B')`,[worldId]);
   await tx.query(`INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id)
    VALUES($1,'quay','breakwater','A',0,'PERSON','rook'),($1,'quay','breakwater','B',0,'PERSON','vale')`,[worldId]);
   for(const role of ["TALENT_MANAGER","ROAD_AGENT","CREATIVE","MEDICAL"] as const){
    const employee=staff.find(member=>member.role===role)!;
    await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,
     role,status,weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
     VALUES($1,$2,$3,'quay',$2,'ACTIVE',500,0,51,52,70)`,[worldId,role,employee.staffId]);
   }
   await tx.query("UPDATE ppw_people SET fatigue=82 WHERE world_id=$1 AND person_id='vale'",[worldId]);
   await publishBackstageRequests(tx,worldId,0);
  });
  assert.equal((await readStaffWorkspace(db.pool,b)).employees.length,0);
  await assert.rejects(readStaffWorkspace(db.pool,{...a,playerId:b.playerId}),/access denied/);
  const dispute=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,a))).find(m=>m.canDisagree);
  assert.ok(dispute?.staffDebate);
  trace.push({week:1,disagreement:dispute.body,positions:dispute.staffDebate});
  const policy=await respondToStaffDisagreement(db.pool,{...a,mailId:dispute.id,decision:"PRIORITISE_HEALTH",
   requestId:"give-vale-recovery",expectedRevision:await revision()});
  assert.equal(policy.status,"APPLIED");
  await answer("north","MORALE","PROMISE_APPEARANCE");
  await markBackstageThreadRead(db.pool,{...a,personId:"north"});
  const incompatible=(await readWrestlerDirectory(db.pool,b,{view:"MARKET",search:"Kit Rook"})).people[0]!;
  const offer=recommendTalentOffer({personId:incompatible.personId,name:incompatible.name,
   popularity:incompatible.popularity,recognition:incompatible.recognition,morale:incompatible.morale,
   marketWeeklyValue:incompatible.estimatedWeeklyValue!,careerStage:incompatible.careerStage,
   interest:incompatible.interest as TalentOfferProfile["interest"],
   purchasedDateLimits:incompatible.offerDateLimits,exclusiveTermLimit:incompatible.exclusiveTermLimit},
  staff.find(member=>member.role==="TALENT_MANAGER")!);
  assert.equal(offer.feasible,false);
  await assert.rejects(submitManualContractOffer(db.pool,{...b,personId:"rook",requestId:"incompatible",
   expectedRevision:await revision(),terms:{...offer.terms,startWeekIndex:0}}),/exclusive contract blocks/);
  trace.push({week:1,unavailable:offer.voice,alternative:offer.availability});

  for(let week=1;week<=totalWeeks;week++){
   const weekIndex=week-1;
   const year=Math.floor(weekIndex/52)+1;
   const calendarWeek=weekIndex%52+1;
   if(week===3){
    const opportunity=await getRequest("rook","MOMENTUM_OPPORTUNITY");
    assert.equal(opportunity?.managementContext?.programmeId,"breakwater");
    await assert.rejects(readThread("rook",{...a,playerId:b.playerId}),/access denied/);
    await assert.rejects(decideBackstageRequest(db.pool,{...a,playerId:b.playerId,
     conversationId:opportunity!.conversationId,decision:"DECLINE",requestId:"other-booker",
     expectedRevision:await revision()}),/unavailable or already answered/);
    const office=await readStaffWorkspace(db.pool,a);
    assert.equal(office.managementCase?.conversationId,opportunity?.conversationId);
    assert.match(office.meetings.find(m=>m.role==="ROAD_AGENT")!.message,/Kit Rook.*strong execution/);
    trace.push({week,case:office.managementCase,roadAgent:office.meetings.find(m=>m.role==="ROAD_AGENT"),
     creative:office.meetings.find(m=>m.role==="CREATIVE")});
    await answer("rook","MOMENTUM_OPPORTUNITY","PROMISE_APPEARANCE");
   }
   if(week===4){
    await recordOutcome("rook","MOMENTUM_OPPORTUNITY","FULFILLED","VERIFIED_BOOKING",0);
    await recordOutcome("north","MORALE","BROKEN","UNFULFILLED_COMMITMENT",-3);
    const after=(await readStaffWorkspace(db.pool,a)).employees.find(e=>e.role==="MEDICAL")!;
    assert.equal(after.morale,72);
    trace.push({week,medicalMorale:after.morale,followUp:(await withWorldTransaction(db.pool,
     tx=>readWorldMail(tx,a))).filter(m=>/workload concern|Creative after/.test(m.subject))});
    assert.ok((await readPlayerWorldOverview(db.pool,worldId,a.playerId))?.promotion?.attention.backstageUnreadCount);
   }
   if(week===6){
    const expiring=await getRequest("vale","CONTRACT");
    assert.equal(expiring?.managementContext?.contractExpires,8);
    assert.equal(expiring?.managementContext?.programmeId,"breakwater");
    const office=await readStaffWorkspace(db.pool,a);
    assert.equal(office.managementCase?.conversationId,expiring?.conversationId);
    assert.match(office.meetings.find(m=>m.role==="TALENT_MANAGER")!.message,/Alix Vale.*active Programme/);
    trace.push({week,talentManager:office.meetings.find(m=>m.role==="TALENT_MANAGER")});
    await answer("vale","CONTRACT","EXPLORE_RENEWAL");
    const sent=await submitManualContractOffer(db.pool,{...a,personId:"vale",
     sourceContractId:"deal-vale",requestId:"vale-renewal",expectedRevision:await revision(),
     terms:{startWeekIndex:9,termWeeks:12,family:"EXCLUSIVE",roleExpectation:"FEATURED",
      creativeControl:"CONSULTATION",dateEntitlement:12,weeklyGuarantee:6500,appearanceFee:0,signingBonus:0}});
    assert.equal(sent.status,"APPLIED");
    assert.equal((await readStaffWorkspace(db.pool,a)).managementCase?.renewalPending,true);
   }
   if(week===7){
    const vale=await getRequest("vale","CONTRACT");
    assert.equal(vale?.followThroughKind,"CONTRACT_NEGOTIATION_STARTED");
    trace.push({week,personId:"vale",followThrough:vale?.followThroughKind});
    await answer("cruz","PARTNERSHIP","MEDIATE");
    const partner=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,a)))
     .find(message=>message.canPartnerRespond);
    assert.ok(partner);
    const invite=await respondToPartnerMediation(db.pool,{...a,mailId:partner.id,decision:"INVITE",
     requestId:"invite-north",expectedRevision:await revision()});
    assert.equal(invite.status,"APPLIED");
    assert.equal(invite.result?.outcome,"CAUTIOUS");
    trace.push({week,partner:partner.body,outcome:invite.result?.outcome});
   }
   if(week===9){
    const settled=await getRequest("cruz","PARTNERSHIP");
    assert.equal(settled?.followThroughKind,"MEDIATION_MATCH_COMPLETED");
    const repaired=(await withWorldTransaction(db.pool,tx=>readWorldMail(tx,a)))
     .find(item=>item.subject==="Our tag work finally came together");
    assert.ok(repaired);
    trace.push({week,partner:repaired.body,followThrough:settled.followThroughKind});
    await answer("ember","MORALE","PROMISE_APPEARANCE");
   }
   if(week===12){
    await recordOutcome("ember","MORALE","EXCUSED","MEDICAL_UNAVAILABLE",0);
   }
   await withWorldTransaction(db.pool,async tx=>{
    await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',day=7,
     next_lock_at=clock_timestamp()-interval '1 minute' WHERE world_id=$1`,[worldId]);
    if(week===8)await tx.query("UPDATE ppw_people SET morale=22 WHERE world_id=$1 AND person_id='ember'",[worldId]);
    if(week===9)await tx.query(`INSERT INTO ppw_playtest_dark_weeks
     (world_id,year,week,promotion_id,operator_player_id) VALUES($1,1,9,'quay',$2)`,[worldId,a.playerId]);
    for(const scope of [a,b]){
     if(scope===a&&week===9)continue;
     const show=scope.promotionId+"-"+week;
     const tag=scope===a&&(week===6||week===8);
     const cast=tag?["cruz","north","rook","vale"]:
      scope===a?["rook",week<7?"vale":"cruz"]:["river",week===9?"ember":"banks"];
     const participants=cast.map(personId=>({personId,contractId:scope===b&&personId==="ember"?
      "guest-ember":"deal-"+personId+(year>1?"-year-"+year:"")}));
     await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
      VALUES($1,$2,$3,$6,$4,'SUBMITTED',$5,$3||'-arena')`,
      [worldId,show,scope.promotionId,calendarWeek,scope===a?1:2,year]);
     await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
      VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,[worldId,show,JSON.stringify({
       ...(tag?{matchType:"TAG",family:"TEAMS",sides:[
        {sideId:"A",participants:participants.slice(0,2)},
        {sideId:"B",participants:participants.slice(2)}],scriptedWinnerSide:"A"}:
        {matchType:"SINGLES",scriptedWinner:cast[0]}),participants,plannedFinish:"CLEAN_PIN"
      })]);
     await tx.query(`INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,
      command_request_id,performers_count,dates_charged,appearance_person_ids)
      VALUES($1,$2,$3,$4,'receipt:'||$2,$6,0,$5::jsonb)`,
      [worldId,show,scope.promotionId,weekIndex,JSON.stringify(cast),cast.length]);
     await tx.query(`INSERT INTO ppw_completed_shows(world_id,show_id,promotion_id,
      year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
      VALUES($1,$2,$3,$5,$4,'complete:'||$2,76,'{}',repeat('a',64))`,
      [worldId,show,scope.promotionId,calendarWeek,year]);
     await tx.query(`INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,
      position,crowd_response,actual_finish,actual_winner_side)
      VALUES($1,$2,'main',0,76,'CLEAN_PIN','A')`,[worldId,show]);
     await tx.query(`INSERT INTO ppw_completed_match_report_facts(world_id,show_id,match_id,
      rating_stars,execution_quality,actual_minutes,chemistry_modifier)
      VALUES($1,$2,'main',4.25,$3,16,0)`,[worldId,show,tag&&week===6?40:79]);
     if(tag){
      await tx.query(`INSERT INTO ppw_tag_working_pair_appearances
       (world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality)
       VALUES($1,$2,'main','cruz','north',$3,$4)`,[worldId,show,weekIndex,week===6?40:79]);
      if(week===6)await tx.query(`INSERT INTO ppw_wrestler_relationship_changes
       (world_id,person_a_id,person_b_id,week_index,show_id,match_id,change_type,
        trust_delta,familiarity_delta,verified_shows)
       VALUES($1,'cruz','north',$3,$2,'main','STRAIN',-0.8,0.5,3)`,[worldId,show,weekIndex]);
     }
     if(week===9&&scope===b){
      await tx.query(`INSERT INTO ppw_medical_absences(world_id,person_id,show_id,match_id,
       injured_week_index,cleared_week_index,weeks_out,severity,status)
       VALUES($1,'ember',$2,'main',8,12,4,'MODERATE','ACTIVE')`,[worldId,show]);
      await tx.query("UPDATE ppw_people SET status='INJURED' WHERE world_id=$1 AND person_id='ember'",[worldId]);
     }
    }
    await tx.query(`INSERT INTO ppw_week_resource_clearances(world_id,year,week,eligible_promotions,
     inspected_slots,command_request_id) VALUES($1,$4,$2,$3,$3,'clear:'||$5::integer)`,
     [worldId,calendarWeek,week===9?1:2,year,week]);
    await tx.query(`INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
     VALUES($1,$4,$2,$3)`,[worldId,calendarWeek,week===9?1:2,year]);
   });
   if(week===6){
    const negotiation=await settlePendingWorldContracts(measured,{worldId,year:1,week,resolutionId:"desk-"+week});
    assert.equal(negotiation.answered,1);
    trace.push({week,personId:"vale",accepted:negotiation.accepted,rejected:negotiation.rejected});
   }
   const publication=await advanceResolvedWorldWeek(measured,{worldId,requestId:"publish-"+week,
    expectedRevision:await revision()});
   assert.equal(publication.status,"APPLIED");
   if([13,52,156].includes(week)){
    const [retention]=await sql<{memories:number;requests:number;relationships:number;staff:number;stale_memories:number}>(`
     SELECT (SELECT count(*)::integer FROM ppw_backstage_memories WHERE world_id=$1) AS memories,
      (SELECT count(*)::integer FROM ppw_backstage_requests WHERE world_id=$1) AS requests,
      (SELECT count(*)::integer FROM ppw_wrestler_relationships WHERE world_id=$1) AS relationships,
      (SELECT count(*)::integer FROM ppw_staff_employments WHERE world_id=$1) AS staff,
      (SELECT count(*)::integer FROM ppw_backstage_memories WHERE world_id=$1
       AND occurred_week_index<greatest(0,$2::integer-104)) AS stale_memories`,[worldId,week]);
    assert.ok(retention&&retention.requests<=2*(week+1));
    assert.equal(retention.stale_memories,0);
    assert.equal(retention.staff,4);
    assert.equal(retention.relationships,1);
    checkpoints.push({week,...retention});
   }
  }
  const growth=(await sql<{in_ring_quality:number;career_experience:number;morale:number}>(`
   SELECT in_ring_quality,career_experience,morale FROM ppw_people WHERE world_id=$1 AND person_id='rook'`))[0]!;
  assert.ok(growth.in_ring_quality>66&&growth.career_experience>35);
  const categories=await sql<{kind:string;count:number}>(`SELECT kind,count(*)::integer AS count
   FROM ppw_backstage_requests WHERE world_id=$1 GROUP BY kind ORDER BY kind`);
  const trust=await sql<{person_id:string;trust:number}>(`SELECT person_id,trust
   FROM ppw_backstage_promotion_trust WHERE world_id=$1 ORDER BY person_id`);
  assert.deepEqual(trust,[{person_id:"north",trust:47}]);
  assert.equal((await readPortablePersonaWorkspace(db.pool,{...b,inboxOnly:true})).roster.some(p=>p.personId==="north"),false);
  const history=await sql<{memories:number;requests:number;repeats:number}>(`
   SELECT (SELECT count(*)::integer FROM ppw_backstage_memories WHERE world_id=$1) AS memories,
    (SELECT count(*)::integer FROM ppw_backstage_requests WHERE world_id=$1) AS requests,
    (SELECT count(*)::integer FROM (SELECT promotion_id,person_id,kind
     FROM ppw_backstage_requests WHERE world_id=$1 GROUP BY 1,2,3 HAVING count(*)>1) duplicate) AS repeats`);
  if(totalWeeks===13)assert.equal(history[0]?.repeats,0);
  assert.equal(providerCalls,0);
  t.diagnostic(JSON.stringify({categories,history,growth,trust,providerCalls,checkpoints,publication:meter.sample(),backstageWrites:backstageMeter.sample(),
   trace:trace.sort((left,right)=>(left as {week:number}).week-(right as {week:number}).week)}));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_world_news_items","ppw_world_news_awards","ppw_world_news_weeks","ppw_playtest_dark_weeks",
    "ppw_backstage_partner_replies","ppw_backstage_staff_disagreements","ppw_staff_employments","ppw_backstage_memories",
    "ppw_medical_absences","ppw_wrestler_relationship_changes","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationships",
    "ppw_backstage_promotion_trust","ppw_backstage_requests","ppw_ledger_events",
    "ppw_promotion_talent_trust","ppw_promotion_survival","ppw_completed_match_report_facts",
    "ppw_completed_match_evidence","ppw_completed_show_matches","ppw_completed_show_segments",
    "ppw_completed_shows","ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_show_resolutions","ppw_command_receipts","ppw_booking_drafts",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_contract_renewal_proposals","ppw_contract_offers","ppw_contracts",
    "ppw_promotion_controls","ppw_memberships","ppw_people","ppw_venues","ppw_promotions"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[a.playerId,b.playerId]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
