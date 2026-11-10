import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {startProgramme,readProgrammeWorkspace,chooseProgrammeDirection,
 chooseProgrammeFinale} from "../src/db/programme-workspace.js";
import {showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,
 markPreparedShowReadyAsActor} from "../src/api/world-service.js";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";
import {submitManualContractOffer} from "../src/db/manual-contract-offers.js";
import {forecastCardAppearanceFees} from "../src/domain/card-appearance-forecast.js";
import {bookingFinanceBrief} from "../src/domain/booking-financial-brief.js";

const url=process.env.PPW_NEON_TEST_URL;

/** Genuine two-week manager route, not disconnected mocked endpoints:
 * START FEUD -> CAST -> SAVE MATCH+ANGLE -> CONFIRM -> MANUAL WORLD LOCK
 * -> PLAYER RENEWAL OFFER -> TRUSTED WORLD ACCEPTANCE -> CERTIFIED RESULTS
 * -> ACTIVATED NEW TERMS -> NEXT-WEEK PICKER -> NEXT WEEK REMATCH
 * -> PAYOFF AND CERTIFICATION. No fixture signs a substitute agreement.
 * The fixture World is disposable; neither a live clock,
 * production database nor automatic World Lock is accessed.
 */
test("player books and certifies two weeks with a renewed show-week contract and decisive feud finale",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,4),uuid=randomUUID();
 const worldId="phase25-journey-"+uuid,promotionId="human",playerId="booker-"+uuid;
 const rivalId="other-player-"+uuid;
 const firstShow="week-one",secondShow="week-two";
 const persons=["joe","mistico"],contracts=["deal-joe","deal-mistico"];
 const members=persons.map((personId,index)=>({
  personId,contractId:contracts[index]!
 }));
 const scope={worldId,promotionId,playerId};
 const context={pool:db.pool,actor:{playerId}};
 const read=<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 const revision=async()=>Number((await read<{revision:number|string}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId]))[0]!.revision);
 const match=(winner:"A"|"B")=>({
  matchType:"SINGLES" as const,family:"INDIVIDUAL" as const,
  sides:[{sideId:"A" as const,participants:[members[0]!]},{sideId:"B" as const,
   participants:[members[1]!]}],
  participants:members,scriptedWinnerSide:winner,plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 const book=async(showId:string,winner:"A"|"B",withAngle:boolean,requestId:string,
  programmeId:string)=>{
  const scene={kind:"ATTACK",participants:members,
   actorIds:[persons[0]!],targetIds:[persons[1]!],
   outcome:"HAPPENS",durationMinutes:5,scene:{
    location:"BACKSTAGE",visual:"OFFICIALS_SEPARATE",
    purpose:"BUILD_RIVALRY",intensity:"BEATDOWN"
   },creativeBeat:{kind:"ATTACK",presentation:"PREMEDITATED_AMBUSH",
    objective:"ESCALATE_RIVALRY"}};
  return saveCardEditorAsActor(context,{worldId,promotionId,showId,
   requestId,expectedRevision:await revision(),
   matches:[{slotId:"main",payload:match(winner)}],
   ...(withAngle?{segments:[{slotId:"aftermath",payload:scene,programmeId}]}:
    {segments:[]}),
   runningOrder:withAngle?["main","aftermath"]:["main"]
  });
 };
 const ready=async(showId:string,requestId:string)=>
  markPreparedShowReadyAsActor(context,{worldId,promotionId,showId,
   requestId,expectedRevision:await revision(),confirmReadyToRun:true});
 const resolve=async(index:1|2)=>{
  // Manual test-only World Lock: the user still owns real-world advancement.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second'"+
   " WHERE world_id=$1",[worldId]));
  assert.equal((await lockWorldWeek(db.pool,{worldId,
   requestId:"lock-"+index,expectedRevision:await revision()})).status,"APPLIED");
  const publication=await driveWorldResolution(db.pool,{
   worldId,resolutionId:"manual-resolution-"+index+"-"+uuid,maxStages:16
  });
  assert.equal(publication.status,"PUBLISHED",
   "A prepared manager show should certify and advance with no human rescue: "+
   JSON.stringify(publication));
  const clock=await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]);
  assert.deepEqual(clock,[{year:1,week:index+1,phase:"OPEN"}]);
  return publication;
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Two-week Manager Journey",
    seed:2025,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Chaotic Alliance",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[
    playerId,rivalId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[worldId,playerId,rivalId]);
   await tx.query("INSERT INTO ppw_promotion_controls("+
    "world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   // Deterministic acceptance in this disposable economic fixture.
   // A real player must still submit the offer; the World alone accepts it.
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0,"+
    " offer_acceptance_threshold=0 WHERE world_id=$1",[worldId]);
   await tx.query("UPDATE ppw_promotions SET media_reach=70"+
    " WHERE world_id=$1 AND promotion_id=$2",[worldId,promotionId]);
   await tx.query("INSERT INTO ppw_markets("+
    "world_id,market_id,name,audience_potential,wrestling_interest,spending_index)"+
    " VALUES($1,'home','Heartland',65,75,100)",[worldId]);
   await tx.query("INSERT INTO ppw_venues("+
    "world_id,venue_id,name,market_id) VALUES($1,'arena','City Arena','home')",
    [worldId]);
   for(const [index,person] of persons.entries()){
    await tx.query("INSERT INTO ppw_people("+
     "world_id,person_id,name,booking_division,in_ring_quality,match_craft,"+
     "presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,"+
     "default_alignment,career_stage,morale,contract_priorities)"+
     " VALUES($1,$2,$3,'MEN',82,81,84,87,95,5,5,65,66,70,$4,'PRIME',80,$5::jsonb)",
     [worldId,person,index===0?"Samoa Joe":"Místico",
      index===0?"HEEL":"FACE",JSON.stringify({
       money:65,role:70,prestige:50,schedule:45,loyalty:40,exposure:60
      })]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,"+
     "remaining_dates,expires_week_index,appearance_fee)"+
     " VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,$5,9000)",
     [worldId,contracts[index],person,promotionId,index===0?0:52]);
   }
   // A wrestler pitched this exact rivalry, but the manager must book it.
   await tx.query("INSERT INTO ppw_backstage_requests("+
    "world_id,request_id,promotion_id,person_id,related_person_id,kind,"+
    "created_week_index,status,decision,responded_week_index,rival_verified_matches)"+
    " VALUES($1,'joe-pitched-mistico',$2,'joe','mistico',"+
    "'RIVALRY_PITCH',0,'ANSWERED','EXPLORE_RIVALRY',0,2)",
    [worldId,promotionId]);
   for(const [index,showId] of [firstShow,secondShow].entries())
    await tx.query("INSERT INTO ppw_booking_drafts("+
     "world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,"+
     "market_id,show_name,booking_class,event_importance)"+
     " VALUES($1,$2,$3,1,$4,'DRAFT',3,'arena','home',$5,'REGULAR',65)",
     [worldId,showId,promotionId,index+1,
      index===0?"Ascension: Week 1":"Ascension: Week 2"]);
  });
  const started=await startProgramme(db.pool,{...scope,requestId:"start-feud",
   expectedRevision:0,sideA:[{kind:"PERSON",refId:persons[0]!}],
   sideB:[{kind:"PERSON",refId:persons[1]!}]});
  assert.equal(started.status,"APPLIED");
  if(started.status!=="APPLIED")throw new Error("Cannot start player programme");
  const programmeId=started.result.programmeId;
  const feud=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId);
  assert.equal(feud?.status,"ACTIVE");
  assert.equal(feud?.activityCount,0);
  assert.equal(feud?.wrestlerOrigin?.initiatorId,"joe");
  assert.equal(feud?.wrestlerOrigin?.opponentId,"mistico");
  assert.equal(feud?.wrestlerOrigin?.acceptedWeekIndex,0);
  const selected=await cardTalentAsActor(context,worldId,promotionId,
   firstShow,"",null,20);
  assert.deepEqual(new Set(selected.talent.filter(p=>p.available)
   .map(p=>p.personId)),new Set(persons));
  assert.deepEqual(selected.talent.map(p=>p.contractId).sort(),[...contracts].sort());
  await assert.rejects(showCardEditorAsActor({
   pool:db.pool,actor:{playerId:rivalId}},worldId,promotionId,firstShow),
   /access|controller|editable|promotion/i);
  assert.equal((await book(firstShow,"B",true,"book-opening",programmeId)).status,
   "APPLIED");
  let card=await showCardEditorAsActor(context,worldId,promotionId,firstShow);
  assert.deepEqual(card.slots.map(s=>s.slotId),["main","aftermath"]);
  assert.deepEqual(card.programmeLinks,[{slotId:"aftermath",programmeId}]);
  const previewFees=forecastCardAppearanceFees([...persons,...persons],
   new Map(card.selectedPeople.map(x=>[x.personId,{appearanceFee:x.appearanceFee}])));
  assert.deepEqual(previewFees,{amount:18000,performers:2,unknown:0,complete:true},
   "A match and a separate angle still owe only one appearance fee per wrestler");
  assert.equal(bookingFinanceBrief(card.bookingFinancials,previewFees,0)?.fees,18000,
   "Manager booking uses real show-week contract fees");
  const beforeBell=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(beforeBell.activityCount,0,
   "A booked chapter is never certified prematurely");
  const linked=await read<{slot_id:string;kind:string}>(
   "SELECT slot_id,kind FROM ppw_programme_match_activities"+
   " WHERE world_id=$1 AND promotion_id=$2 AND programme_id=$3"+
   " ORDER BY slot_id",[worldId,promotionId,programmeId]);
  assert.deepEqual(linked.map(x=>x.slot_id),["aftermath","main"]);
  const advanceBefore=await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts"+
   " WHERE world_id=$1 ORDER BY person_id",[worldId]);
  assert.deepEqual(advanceBefore.map(x=>x.remaining_dates),[5,5],
   "Authoring and confirming must never spend appearance dates");
  assert.equal((await ready(firstShow,"confirm-opening")).status,"APPLIED");
  card=await showCardEditorAsActor(context,worldId,promotionId,firstShow);
  assert.equal(card.ready,true);
  // True manager action: the old Week-1 Joe deal expires after this show.
  // A future-dated renewal is offered via the normal authenticated command.
  const renewalOffer="week-one-joe-renewal-"+uuid;
  const offered=await submitManualContractOffer(db.pool,{
   worldId,playerId,promotionId,personId:"joe",sourceContractId:"deal-joe",
   requestId:renewalOffer,expectedRevision:await revision(),terms:{
    family:"LIMITED_NON_EXCLUSIVE",roleExpectation:"FEATURED",
    creativeControl:"CONSULTATION",startWeekIndex:1,termWeeks:12,
    dateEntitlement:5,weeklyGuarantee:100,appearanceFee:9000,signingBonus:0
   }});
  assert.equal(offered.status,"APPLIED","Only the controlling manager can send the renewal");
  await resolve(1);
  const result=await readCompletedShowView(db.pool,{...scope,showId:firstShow});
  assert.equal(result.matchCount,1);
  assert.equal(result.angleCount,1);
  assert.equal(result.entries.length,2);
  const progress=await readProgrammeWorkspace(db.pool,scope);
  let story=progress.programmes.find(p=>p.programmeId===programmeId)!;
  assert.equal(story.status,"ACTIVE");
  assert.equal(story.matchCount,1);
  assert.equal(story.segmentCount,1);
  assert.equal(story.sideBWins,1);
  assert.equal(story.wrestlerOrigin?.requestId,"joe-pitched-mistico");
  assert.deepEqual(new Set(story.recentActivity.map(x=>x.kind)),
   new Set(["MATCH","SEGMENT"]));
  // Inject one canonical injury receipt from this just-certified match to
  // exercise the real Programme's medically interrupted next chapter.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_medical_absences("+
    "world_id,person_id,show_id,match_id,injured_week_index,"+
    "cleared_week_index,weeks_out,severity,status)"+
    " VALUES($1,'joe',$2,'main',0,4,4,'MODERATE','ACTIVE')",
    [worldId,firstShow]);
   await tx.query("UPDATE ppw_people SET status='INJURED'"+
    " WHERE world_id=$1 AND person_id='joe'",[worldId]);
  });
  const disrupted=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.deepEqual(disrupted.medicalHolds,[{
   personId:"joe",name:"Samoa Joe",clearedWeekIndex:4
  }],"An authentic medical record pauses the next chapter, not its official history");
  assert.equal(disrupted.sideBWins,1);
  assert.equal(disrupted.wrestlerOrigin?.initiatorId,"joe");
  // Test-only clearance restores the ordinary future booking path.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_medical_absences"+
    " WHERE world_id=$1 AND person_id='joe'",[worldId]);
   await tx.query("UPDATE ppw_people SET status='ACTIVE'"+
    " WHERE world_id=$1 AND person_id='joe'",[worldId]);
  });
  assert.deepEqual((await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)?.medicalHolds,[]);
  const charged=await read<{performers_count:number;dates_charged:number}>(
   "SELECT performers_count,dates_charged FROM ppw_show_resolutions"+
   " WHERE world_id=$1 AND show_id=$2",[worldId,firstShow]);
  assert.deepEqual(charged,[{performers_count:2,dates_charged:2}],
   "Samoa Joe's match plus angle owes one date, not two, before renewal");
  // Show Economics is an optional, separately enabled World projection.
  // CONTRACT_APPEARANCE_FEES is the authoritative cash debit, even when that
  // optional show analytics projection is OFF (as in this disposable World).
  const expense=await read<{amount:string;receipts:number}>(
   "SELECT coalesce(sum((payload->>'amount')::bigint),0)::text AS amount,"+
   " count(*)::integer AS receipts FROM ppw_ledger_events"+
   " WHERE world_id=$1 AND year=1 AND week=1"+
   " AND event_type='CONTRACT_APPEARANCE_FEES'"+
   " AND payload->>'showId'=$2 AND payload->>'promotionId'=$3",
   [worldId,firstShow,promotionId]);
  assert.equal(Number(expense[0]?.amount),previewFees.amount,
   "Manager fee preview must match the actual World resource-clearance cash debit");
  assert.equal(expense[0]?.receipts,1,
   "Match plus angle must create one payment receipt, not one charge per segment");
  assert.deepEqual((await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY person_id",
   [worldId])).map(x=>x.remaining_dates),[5,4],
   "Joe's actually accepted end-of-week renewal resets dates to five; Mistico spent one");
  // The trusted World evaluated the pending wrestler decision, then
  // activated the accepted terms at the original agreement's paid expiry.
  // The original system extends the same contract ID, preserving continuity.
  const negotiation=await read<{status:string}>(
   "SELECT status FROM ppw_contract_offers WHERE world_id=$1 AND offer_id=$2",
   [worldId,renewalOffer]);
  assert.deepEqual(negotiation,[{status:"ACCEPTED"}]);
  const activated=await read<{status:string}>(
   "SELECT status FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND contract_id='deal-joe'",
   [worldId]);
  assert.deepEqual(activated,[{status:"ACTIVATED"}]);
  const signed=await read<{contract_id:string;start_week_index:number;expires_week_index:number;
   remaining_dates:number}>(
   "SELECT contract_id,start_week_index,expires_week_index,remaining_dates"+
   " FROM ppw_contracts WHERE world_id=$1 AND person_id='joe'",[worldId]);
  assert.deepEqual(signed,[{contract_id:"deal-joe",start_week_index:1,
   expires_week_index:12,remaining_dates:5}],
   "The old deal must not vanish, retain expired rights, or gain a duplicate signed row");
  const nextWeekRights=await cardTalentAsActor(context,worldId,promotionId,
   secondShow,"Joe",null,10);
  assert.deepEqual(nextWeekRights.talent.map(p=>[p.personId,p.contractId,p.available]),
   [["joe","deal-joe",true]],
   "The accepted and activated renewal must be usable for the next show without replacing the wrestler's identity");
  const direction=await chooseProgrammeDirection(db.pool,{...scope,
   programmeId,showId:firstShow,slotId:"main",
   choice:"PURSUE_REMATCH",requestId:"demand-rematch",
   expectedRevision:await revision()});
  assert.equal(direction.status,"APPLIED");
  story=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(story.latestFollowUp?.choice,"PURSUE_REMATCH");
  const weekTwo=await showCardEditorAsActor(context,worldId,promotionId,secondShow);
  assert.equal(weekTwo.canEdit,true);
  assert.deepEqual(weekTwo.slots,[]);
  assert.equal((await book(secondShow,"A",false,"book-rematch",programmeId)).status,
   "APPLIED");
  const pending=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.ok(pending.plannedActivity.some(x=>x.showId===secondShow&&
   x.slotId==="main"&&x.kind==="MATCH"));
  const planned=await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   showId:secondShow,slotId:"main",payoff:"DECISIVE_MATCH",
   requestId:"finale",expectedRevision:await revision()});
  assert.equal(planned.status,"APPLIED");
  story=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(story.status,"ACTIVE","A planned finale is never an automatic closure");
  assert.equal(story.finale?.resolvedWeekIndex,null);
  assert.equal((await ready(secondShow,"confirm-rematch")).status,"APPLIED");
  await resolve(2);
  const finalResult=await readCompletedShowView(db.pool,{...scope,showId:secondShow});
  assert.equal(finalResult.matchCount,1);
  const finished=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(finished.status,"COMPLETED");
  assert.equal(finished.matchCount,2);
  assert.equal(finished.segmentCount,1);
  assert.equal(finished.sideAWins,1);
  assert.equal(finished.sideBWins,1);
  assert.equal(finished.finale?.resolvedWeekIndex,1);
  assert.equal(finished.finale?.resolvedWinnerSide,"A");
  assert.equal(finished.wrestlerOrigin?.initiatorId,"joe");
  assert.equal(finished.wrestlerOrigin?.recordedWeekIndex,0,
   "Only genuine accepted-pitch follow-through is recorded");
  assert.equal((await read<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_ledger_events"+
   " WHERE world_id=$1 AND event_type='PROGRAMME_FINALE_DELIVERED'",
   [worldId]))[0]!.n,1);
  const finalContracts=await read<{contract_id:string;remaining_dates:number}>(
   "SELECT contract_id,remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",
   [worldId]);
  assert.deepEqual(Object.fromEntries(finalContracts.map(x=>[x.contract_id,x.remaining_dates])),
   {"deal-joe":4,"deal-mistico":3},
   "The real renewed Joe deal was charged once in Week 2, without a duplicate agreement or double-spending");
  assert.equal((await driveWorldResolution(db.pool,{
   worldId,resolutionId:"manual-resolution-2-"+uuid,maxStages:2})).status,"BLOCKED");
  assert.equal((await read<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_completed_shows WHERE world_id=$1",
   [worldId]))[0]!.n,2,"Retry cannot replay show results or charge wrestlers again");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_finales","ppw_programme_postshow_directions",
    "ppw_programme_resolved_activities","ppw_wrestler_relationship_changes",
    "ppw_tag_working_pair_appearances","ppw_wrestler_relationships",
    "ppw_medical_absences","ppw_completed_match_evidence",
    "ppw_completed_show_segments","ppw_individual_field_career_effects","ppw_tag_match_career_effects",
    "ppw_completed_show_matches",
    "ppw_show_economics","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_logistics_authorizations",
    "ppw_week_continuity_assessments","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_alignment_changes",
    "ppw_programme_match_activities","ppw_card_slots","ppw_booking_drafts",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_programme_creative_agreements","ppw_backstage_memories",
    "ppw_backstage_requests",
    "ppw_programme_side_refs",
    "ppw_programme_participants","ppw_programmes",
    "ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_markets",
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,rivalId]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
