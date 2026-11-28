import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution,planNextWorldResolutionAction} from "../src/db/world-resolution-pipeline.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {dismissResolvedOfferAttention} from "../src/db/player-attention-dismissals.js";
import {prepareDelegatedContractRenewals} from "../src/db/delegated-contract-renewals.js";
import {settlePendingWorldContracts} from "../src/db/world-contract-desk-resolution.js";
import {readBackstagePromiseBook} from "../src/db/backstage-promise-book.js";
import {readWorldMail} from "../src/db/backstage-world-mail.js";
import {respondToStaffMail} from "../src/db/backstage-staff-replies.js";
import {decideBackstageRequest,settleBackstagePromises} from "../src/db/backstage-conversations.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {offerUtility,type OfferTerms,type PersonEconomics} from "../src/domain/contract-economics.js";

const url=process.env.PPW_NEON_TEST_URL;

function measure(pool:TransactionPool,sample:MeasuredQuerySession,includes?:string):TransactionPool{
 return {async connect(){
  const client=await pool.connect();
  return {release:()=>client.release(),
   query:<T extends Record<string,unknown>>(sql:string,params:readonly unknown[])=>
    includes&&!sql.includes(includes)?client.query<T>(sql,params):
     sample.execute(()=>client.query<T>(sql,params))};
 }};
}


test("Milestone 7 World Lock reconciles delegated renewal outcomes and existing availability",{
 skip:!url?"No disposable PostgreSQL":false
},async t=>{
 const worldId="milestone7-contracts-"+randomUUID(),promotionId="company",playerId=worldId+"-owner";
 const db=postgresPool(url!,3),scope={worldId,promotionId,playerId};
 const actor={pool:db.pool,actor:{playerId}};
 const person:PersonEconomics={recognition:80,popularity:80,inRingQuality:80,matchCraft:80,
  presentation:80,stamina:80,fatigue:0,morale:80,careerStage:"PRIME",
  priorities:{money:100,role:0,schedule:0,loyalty:0,exposure:0,prestige:0}};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Contract journey",seed:7,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Company",tier:"INDEPENDENT"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",[worldId,promotionId,playerId]);
   await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
   await tx.query("UPDATE ppw_promotions SET cash=800000,media_reach=40 WHERE world_id=$1",[worldId]);
   await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,role,status,
    weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
    VALUES($1,'talent','staff-001',$2,'TALENT_MANAGER','ACTIVE',500,0,51,52,70)`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,recognition,popularity,
    in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)
    SELECT $1,id,initcap(id),'ACTIVE',80,80,80,80,80,80,0,'PRIME',80,$2::jsonb
    FROM unnest(ARRAY['priority','balanced','cost','declined','unchanged','unable','personal']) id`,
    [worldId,JSON.stringify(person.priorities)]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,remaining_dates,start_week_index,expires_week_index,
    date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control)
    SELECT $1,person_id||'-contract',person_id,$2,'LIMITED_NON_EXCLUSIVE','SIGNED',
     CASE WHEN person_id='unchanged' THEN 0 ELSE 2 END,0,12,6,6000,4000,'FEATURED','NONE'
    FROM ppw_people WHERE world_id=$1`,[worldId,promotionId]);
  });
  let revision=0;
  for(const [name,strategy,wage,fee] of [
   ["priority","PRIORITY_RETENTION",8000,6000],["balanced","BALANCED",7000,5000],
   ["cost","REDUCE_COSTS",7000,5000],["declined","REDUCE_COSTS",500,500],["unchanged","EXISTING_TERMS",6000,4000],
   ["unable","PRIORITY_RETENTION",1000,1000]
  ] as const){
   const payload={method:"renewContract",worldId,promotionId,contractId:name+"-contract",
    requestId:"delegate-"+name,expectedRevision:revision,delegation:{strategy,maxWeeklyGuarantee:wage,maxAppearanceFee:fee}};
   const applied=await dispatchCardRpc(actor,"renewContract",payload) as {status:string;revision:number;result:{status:string}};
   assert.equal(applied.status,"APPLIED");
   assert.equal(applied.result.status,"QUEUED");
   assert.equal((await dispatchCardRpc(actor,"renewContract",payload) as {status:string}).status,"REPLAYED");
   revision=applied.revision;
  }
  await assert.rejects(dispatchCardRpc(actor,"renewContract",{worldId,promotionId,
   contractId:"priority-contract",requestId:"duplicate",expectedRevision:revision}),/awaiting a decision/);
  const pending=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(pending.delegations.filter(x=>x.status==="QUEUED").length,6);
  assert.equal(pending.offers.length,0);
  await assert.rejects(readContractDesk(db.pool,worldId,"somebody-else",promotionId),/denied/);

  revision=(await dispatchCardRpc(actor,"renewContract",{worldId,promotionId,
   contractId:"personal-contract",requestId:"personal",expectedRevision:revision}) as {revision:number}).revision;
  await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET next_lock_at=clock_timestamp() WHERE world_id=$1",[worldId]));
  const locked=await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:revision});
  const lockWork=new MeasuredQuerySession("World Lock delegation query and batch");
  const continuity=await recordWeekContinuity(measure(db.pool,lockWork,"ppw_delegated_contract_renewals"),
   {worldId,requestId:"continuity",expectedRevision:locked.revision});
  t.diagnostic(JSON.stringify(lockWork.assertBudget({maxQueries:3,maxResultBytes:16000})));
  assert.equal(continuity.status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{worldId,requestId:"continuity",expectedRevision:locked.revision})).status,"REPLAYED");
  const meter=new MeasuredQuerySession("World Lock with no outstanding delegation");
  const proposals=await withWorldTransaction(db.pool,async tx=>{
   assert.deepEqual(await prepareDelegatedContractRenewals({query:(sql,params)=>meter.execute(()=>tx.query(sql,params))},worldId,10),
    {queued:0,submitted:0});
   return tx.query<{offer_id:string;terms:OfferTerms}>("SELECT offer_id,terms FROM ppw_contract_offers WHERE world_id=$1",[worldId]);
  });
  t.diagnostic(JSON.stringify(meter.assertBudget({maxQueries:1,maxResultBytes:4})));
  assert.equal(proposals.length,5);
  const terms=(name:string)=>proposals.find(p=>p.offer_id==="delegate-"+name)!.terms;
  assert.equal(terms("unchanged").weeklyGuarantee,6000);
  assert.equal(terms("unchanged").appearanceFee,4000);
  assert.ok(terms("priority").weeklyGuarantee>terms("balanced").weeklyGuarantee);
  assert.ok(terms("priority").weeklyGuarantee<=8000);
  assert.ok(terms("priority").appearanceFee<=6000);
  assert.ok(terms("cost").weeklyGuarantee<terms("balanced").weeklyGuarantee);
  const score=(name:string)=>offerUtility(person,terms(name),{tier:"INDEPENDENT",mediaReach:40,
   hasPriorRelationship:true,trust:50,seed:"7",offerId:"delegate-"+name});
  const minOthers=Math.min(score("balanced"),score("unchanged"),score("priority"));
  assert.ok(score("cost")<minOthers);
  await withWorldTransaction(db.pool,tx=>tx.query(`UPDATE ppw_worlds
   SET phase='RESOLVING',offer_acceptance_threshold=$2 WHERE world_id=$1`,[worldId,score("cost")+.1]));
  const resolved=await settlePendingWorldContracts(db.pool,{worldId,year:1,week:11,resolutionId:"test-cycle"});
  assert.ok(resolved.accepted>=3);
  assert.ok(resolved.rejected>=2);
  assert.equal((await settlePendingWorldContracts(db.pool,{worldId,year:1,week:11,resolutionId:"test-cycle"})).answered,0);

  const overview=()=>readPlayerWorldOverview(db.pool,worldId,playerId);
  const alerts=(await overview())?.promotion?.attention;
  assert.ok(alerts?.contractAlerts?.every(a=>a.personId!=="priority"&&a.personId!=="balanced"));
  const current=alerts?.contractAlerts?.find(a=>a.personId==="unchanged");
  assert.equal(current?.kind,"DATES_EXHAUSTED");
  assert.equal(current.nextTermStart,13);
  assert.equal(current.weeksRemaining,3);
  const desk=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(desk.roster.find(x=>x.personId==="unchanged")?.weeksRemaining,current.weeksRemaining);
  assert.equal(desk.delegations.find(x=>x.request_id==="delegate-unable")?.status,"UNABLE");
  assert.equal(desk.resolvedOffers.find(x=>x.personId==="cost")?.status,"REJECTED");
  assert.ok(desk.resolvedOffers.find(x=>x.personId==="cost")?.counterTerms);
  assert.equal(desk.resolvedOffers.find(x=>x.personId==="declined")?.counterTerms,null);
  const notice=alerts?.offerResults?.find(r=>r.personId==="priority");
  assert.equal(notice?.renewal,true);
  assert.equal(notice.startWeekIndex,13);
  assert.deepEqual(await dismissResolvedOfferAttention(db.pool,{...scope,attentionId:notice.id}),
   {dismissed:true,firstDismissal:true});
  assert.ok((await overview())?.promotion?.attention.offerResults?.every(r=>r.id!==notice.id));
  assert.deepEqual(await dismissResolvedOfferAttention(db.pool,{...scope,attentionId:notice.id}),
   {dismissed:true,firstDismissal:false});
  assert.ok((await readBackstagePromiseBook(db.pool,{...scope,view:"OUTSTANDING"})).entries
   .some(x=>x.personId==="priority"&&x.status==="IN_PROGRESS"&&x.due===13));
  await assert.rejects(readBackstagePromiseBook(db.pool,{...scope,playerId:"somebody-else",view:"OUTSTANDING"}),/denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals","ppw_delegated_contract_renewals","ppw_contract_renewal_proposals",
    "ppw_contract_offers","ppw_week_logistics_authorizations","ppw_week_continuity_assessments",
    "ppw_staff_employments","ppw_command_receipts","ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_ledger_events","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
  }).finally(()=>db.close());
 }
});

test("Milestone 7 names creative issues and keeps one certified, private promise history",{
 skip:!url?"No disposable PostgreSQL":false
},async t=>{
 const worldId="milestone7-backstage-"+randomUUID(),promotionId="company",playerId=worldId+"-owner";
 const rival=worldId+"-rival",db=postgresPool(url!,3);
 const scope={worldId,promotionId,playerId};
 const readMail=()=>withWorldTransaction(db.pool,tx=>readWorldMail(tx,scope));
 const book=(view:"OUTSTANDING"|"HISTORY")=>readBackstagePromiseBook(db.pool,{...scope,view});
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage journey",seed:7,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Company",tier:"INDEPENDENT"});
   await addPromotion(tx,worldId,{id:"rival",name:"Rival",tier:"INDEPENDENT"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[worldId,playerId,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3),($1,'rival',$4)",[worldId,promotionId,playerId,rival]);
   await tx.query("UPDATE ppw_worlds SET week=7 WHERE world_id=$1",[worldId]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,booking_division,morale)
    VALUES($1,'challenger','Eli Crown','ACTIVE','MEN',60),($1,'champion','Alix Vale','ACTIVE','MEN',60),
     ($1,'hurt','Jo Reed','INJURED','MEN',60),($1,'worker','Sam Sands','ACTIVE','MEN',60),
     ($1,'decline','Casey Cruz','ACTIVE','MEN',60)`,[worldId]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,start_week_index,expires_week_index,date_entitlement,role_expectation)
    SELECT $1,person_id||'-deal',person_id,$2,'EXCLUSIVE','SIGNED',0,25,26,'FEATURED'
    FROM ppw_people WHERE world_id=$1`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,role,status,
    weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
    VALUES($1,'creative',$2,$3,'CREATIVE','ACTIVE',500,0,51,52,70)`,
    [worldId,worldStaff("7").find(x=>x.role==="CREATIVE")!.staffId,promotionId]);
   await tx.query(`INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,division,status,
    prestige,booking_division) VALUES($1,$2,'belt','Harbour Championship','SINGLES','ACTIVE',60,'MEN')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,repetition,started_week_index)
    VALUES($1,$2,'repeat','ACTIVE',20,2),($1,$2,'injury','ACTIVE',0,6)`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id)
    VALUES($1,$2,'repeat','A',0,'PERSON','champion'),($1,$2,'repeat','B',0,'PERSON','challenger'),
     ($1,$2,'injury','A',0,'PERSON','hurt'),($1,$2,'injury','B',0,'PERSON','worker')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,show_name,status)
    VALUES($1,'past',$2,1,6,'Harbour TV','SUBMITTED'),($1,'payoff',$2,1,9,'Harbour Lights','DRAFT')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'past',1,6,'earlier-result',64,'{}',repeat('a',64))`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_programme_resolved_activities(world_id,promotion_id,programme_id,show_id,slot_id,
    week_index,kind,signature,crowd_response,impact,winner_side)
    VALUES($1,$2,'repeat','past','last-match',5,'MATCH','same-singles',64,60,'A')`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,kind,
    created_week_index,source_contract_id,relevant_title)
    VALUES($1,'ask-title',$2,'challenger','TITLE_AMBITION',6,'challenger-deal','Harbour Championship'),
     ($1,'ask-booking',$2,'worker','MORALE',6,'worker-deal',NULL),
     ($1,'ask-promo',$2,'champion','CREATIVE',6,'champion-deal',NULL),
     ($1,'conversation-only',$2,'decline','MORALE',6,'decline-deal',NULL)`,[worldId,promotionId]);
  });
  const staffRead=new MeasuredQuerySession("Private Backstage mail with creative advice");
  const mail=await withWorldTransaction(db.pool,tx=>readWorldMail(
   {query:(sql,params)=>staffRead.execute(()=>tx.query(sql,params))},scope));
  t.diagnostic(JSON.stringify(staffRead.assertBudget({maxQueries:1,maxResultBytes:16000})));
  const repeat=mail.find(x=>x.adviceProgrammeId==="repeat");
  assert.match(repeat?.subject??"",/Alix Vale.*Eli Crown/);
  assert.match(repeat?.body??"",/Harbour TV.*challenge.*Harbour Lights/);
  assert.match(mail.find(x=>x.adviceProgrammeId==="injury")?.body??"",/Jo Reed.*can.t work/);
  await assert.rejects(respondToStaffMail(db.pool,{...scope,playerId:rival,mailId:repeat!.id,
   decision:"DEFER",requestId:"cross-promotion",expectedRevision:0}),/actionable/);
  const dismissed=await respondToStaffMail(db.pool,{...scope,mailId:repeat!.id,decision:"DEFER",
   requestId:"dismiss",expectedRevision:0});
  assert.equal(dismissed.status,"APPLIED");
  let revision=dismissed.revision;
  for(const [id,decision] of [["ask-title","PROMISE_TITLE_MATCH"],["ask-booking","PROMISE_APPEARANCE"],
   ["ask-promo","PROMISE_SEGMENT"],["conversation-only","TALK"]] as const){
   const response=await decideBackstageRequest(db.pool,{...scope,requestId:"reply-"+id,conversationId:id,
    decision,expectedRevision:revision});
   assert.equal(response.status,"APPLIED");revision=response.revision;
  }
  const promiseRead=new MeasuredQuerySession("Private outstanding promises page");
  const initial=await readBackstagePromiseBook(measure(db.pool,promiseRead),{...scope,view:"OUTSTANDING"});
  t.diagnostic(JSON.stringify(promiseRead.assertBudget({maxQueries:1,maxResultBytes:16000})));
  assert.equal(initial.entries.length,3);
  assert.deepEqual(initial.entries.map(x=>x.due),[8,8,10]);
  assert.ok(initial.entries.every(x=>x.status==="OUTSTANDING"));
  await assert.rejects(readBackstagePromiseBook(db.pool,{...scope,playerId:rival,view:"OUTSTANDING"}),/denied/);
  assert.deepEqual((await readBackstagePromiseBook(db.pool,{...scope,promotionId:"rival",playerId:rival,view:"HISTORY"})).entries,[]);
  const titleSlot=JSON.stringify({championshipId:"belt",participants:[
   {personId:"challenger",contractId:"challenger-deal"},{personId:"champion",contractId:"champion-deal"}]});
  await withWorldTransaction(db.pool,tx=>tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
   VALUES($1,'payoff','title',1,'MATCH',$2::jsonb)`,[worldId,titleSlot]));
  assert.equal((await book("OUTSTANDING")).entries.find(x=>x.personId==="challenger")?.status,"IN_PROGRESS");
  const meter=new MeasuredQuerySession("Certified backstage promise settlement");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_booking_drafts SET status='SUBMITTED' WHERE world_id=$1 AND draft_id='payoff'`,[worldId]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'payoff',1,9,'played-payoff',70,'{}',repeat('b',64))`,[worldId,promotionId]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'payoff','title',1,70,'PIN','A')`,[worldId]);
   await tx.query(`INSERT INTO ppw_championship_contests(world_id,promotion_id,championship_id,show_id,slot_id,
    prior_reign_id,winner_person_id,title_changed) VALUES($1,$2,'belt','payoff','title',NULL,'challenger',true)`,[worldId,promotionId]);
   const measured={query:<T extends Record<string,unknown>>(sql:string,params:readonly unknown[])=>meter.execute(()=>tx.query<T>(sql,params))};
   assert.deepEqual(await settleBackstagePromises(measured,worldId,8),{settled:3,broken:2});
   assert.deepEqual(await settleBackstagePromises(measured,worldId,8),{settled:0,broken:0});
   await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
  });
  t.diagnostic(JSON.stringify(meter.assertBudget({maxQueries:4,maxResultBytes:1000})));
  assert.ok((await readMail()).every(x=>x.adviceProgrammeId!=="repeat"));
  const history=await book("HISTORY");
  assert.deepEqual(new Map(history.entries.map(x=>[x.personId,x.status])),
   new Map([["worker","BROKEN"],["champion","BROKEN"],["challenger","FULFILLED"]]));
  assert.ok(history.entries.filter(x=>x.status==="BROKEN").every(x=>x.detail.includes("trust -3")));
  const trust=await withWorldTransaction(db.pool,tx=>tx.query<{trust:number}>(
   "SELECT trust FROM ppw_backstage_promotion_trust WHERE world_id=$1 ORDER BY person_id",[worldId]));
  assert.deepEqual(trust.map(x=>x.trust),[47,47]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals","ppw_backstage_staff_replies","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_programme_resolved_activities","ppw_programme_side_refs","ppw_programmes",
    "ppw_championship_contests","ppw_championships","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_staff_employments","ppw_command_receipts","ppw_contracts",
    "ppw_people","ppw_promotion_controls","ppw_memberships","ppw_ledger_events","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[playerId,rival]]);
  }).finally(()=>db.close());
 }
});

test("World Lock drains 210 admitted tasks across three owners and resumes settlement exactly once",{
 skip:!url?"No disposable PostgreSQL":false,
},async t=>{
 const worldId="milestone7-large-"+randomUUID(),resolutionId="large-delegation";
 const db=postgresPool(url!,4);
 const promotions=["company-a","company-b","company-c"];
 const owners=promotions.map((_,i)=>worldId+"-owner-"+i);
 const options={worldId,resolutionId};
 const read=<T extends Record<string,unknown>>(sql:string)=>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,[worldId]));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Multiple Talent Managers",seed:7,rulesetVersion:"test"});
   await tx.query(`UPDATE ppw_worlds SET week=4,injury_rate_multiplier=0,offer_acceptance_threshold=0
    WHERE world_id=$1`,[worldId]);
   for(const [i,promotion] of promotions.entries()){
    await addPromotion(tx,worldId,{id:promotion,name:promotion,tier:"INDEPENDENT"});
    await tx.query("UPDATE ppw_promotions SET cash=9000000,media_reach=70 WHERE world_id=$1 AND promotion_id=$2",[worldId,promotion]);
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[owners[i]]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,owners[i]]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",[worldId,promotion,owners[i]]);
    await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,role,status,
     weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
     VALUES($1,$2,$3,$2,'TALENT_MANAGER','ACTIVE',500,0,51,52,70)`,
     [worldId,promotion,worldStaff(7)[i]!.staffId]);
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,booking_division,
     recognition,popularity,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,
     momentum,default_alignment,morale,contract_priorities)
     SELECT $1,$2||'-'||lpad(n::text,2,'0'),$2||' talent '||n,'ACTIVE','PRIME','MEN',
      65,65,80,80,75,85,95,5,5,70,'FACE',80,
      '{"money":100,"role":0,"schedule":0,"loyalty":0,"exposure":0,"prestige":0}'
     FROM generate_series(0,69) n`,[worldId,promotion]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,
     start_week_index,expires_week_index,remaining_dates,date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control)
     SELECT $1,person_id||'-term',person_id,$2,'LIMITED_NON_EXCLUSIVE','SIGNED',0,3,3,4,6000,3000,'FEATURED','NONE'
     FROM ppw_people WHERE world_id=$1 AND starts_with(person_id,$2||'-')`,[worldId,promotion]);
    await tx.query(`INSERT INTO ppw_delegated_contract_renewals(world_id,request_id,promotion_id,owner_player_id,
     contract_id,source_start_week_index,created_week_index,strategy,max_weekly_guarantee,max_appearance_fee)
     SELECT $1,person_id||'-job',$2,$3,contract_id,0,3,'EXISTING_TERMS',6000,3000
     FROM ppw_contracts WHERE world_id=$1 AND promotion_id=$2 AND person_id<>$4`,
     [worldId,promotion,owners[i],"company-c-69"]);
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,$2)",[worldId,promotion]);
    await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
     VALUES($1,$2,$2,1,4,'SUBMITTED',$3,$2,60)`,[worldId,promotion,i+2]);
    const [a,b]=[promotion+"-00",promotion+"-01"];
    await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,'main',0,'MATCH',$3)`,[worldId,promotion,JSON.stringify({
      matchType:"SINGLES",participants:[{personId:a,contractId:a+"-term"},{personId:b,contractId:b+"-term"}],
      scriptedWinner:b,intent:"TECHNICAL",plannedLengthMinutes:15,plannedFinish:"SUBMISSION",
     })]);
   }
   // Promotion C can renew 69 contracts. Its 70th arrives on the second
   // preparation page, where the reservations from page one still apply.
   await tx.query(`INSERT INTO ppw_promotion_spending_plans VALUES($1,'company-c',414000,3000,0)`,[worldId]);
  });
  const last={worldId,promotionId:"company-c",contractId:"company-c-69-term",
   requestId:"company-c-69-job",expectedRevision:0,
   delegation:{strategy:"EXISTING_TERMS",maxWeeklyGuarantee:6000,maxAppearanceFee:3000}};
  const actor={pool:db.pool,actor:{playerId:owners[2]!}};
  await assert.rejects(readContractDesk(db.pool,worldId,owners[0]!,"company-c"),/denied/);
  const admitted=await dispatchCardRpc(actor,"renewContract",last) as {status:string;revision:number};
  assert.equal(admitted.status,"APPLIED");
  assert.equal((await dispatchCardRpc(actor,"renewContract",last) as {status:string}).status,"REPLAYED");
  await read("UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1");
  const locked=await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:admitted.revision});
  assert.equal(locked.status,"APPLIED");
  const measured=new MeasuredQuerySession("Delegation pages and scoped wage evidence");
  const continuityInput={worldId,requestId:"continuity",expectedRevision:locked.revision};
  assert.equal((await recordWeekContinuity(measure(db.pool,measured,"ppw_delegated_contract_renewals"),continuityInput)).status,"APPLIED");
  t.diagnostic(JSON.stringify(measured.assertBudget({maxQueries:5,maxResultBytes:195000})));
  assert.equal((await recordWeekContinuity(db.pool,continuityInput)).status,"REPLAYED");
  assert.deepEqual(await read(`SELECT promotion_id,status,count(*)::integer AS count
   FROM ppw_delegated_contract_renewals WHERE world_id=$1 GROUP BY promotion_id,status ORDER BY promotion_id,status`),[
   {promotion_id:"company-a",status:"SUBMITTED",count:70},{promotion_id:"company-b",status:"SUBMITTED",count:70},
   {promotion_id:"company-c",status:"SUBMITTED",count:69},{promotion_id:"company-c",status:"UNABLE",count:1},
  ]);
  const prepared=await driveWorldResolution(db.pool,{...options,maxStages:6});
  assert.equal(prepared.status,"LIMIT_REACHED");
  assert.equal((await planNextWorldResolutionAction(db.pool,worldId)).action,"RESOLVE_CONTRACTS");
  const interrupted=await driveWorldResolution(db.pool,{...options,maxStages:1});
  assert.deepEqual(interrupted.steps,[{action:"RESOLVE_CONTRACTS",status:"EXECUTED"}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS pending FROM ppw_contract_offers WHERE world_id=$1 AND status='PENDING'`),[{pending:9}]);
  const resumed=await driveWorldResolution(db.pool,{...options,maxStages:1});
  assert.deepEqual(resumed.steps,[{action:"RESOLVE_CONTRACTS",status:"EXECUTED"}]);
  const receiptScope={worldId,resolutionId,year:1,week:4};
  assert.equal((await settlePendingWorldContracts(db.pool,receiptScope)).answered,0);
  const published=await driveWorldResolution(db.pool,{...options,maxStages:1});
  assert.equal(published.status,"PUBLISHED");
  assert.deepEqual(await read("SELECT week,phase FROM ppw_worlds WHERE world_id=$1"),[{week:5,phase:"OPEN"}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count,status FROM ppw_contract_offers WHERE world_id=$1 GROUP BY status`),
   [{count:209,status:"ACCEPTED"}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count FROM ppw_contract_renewal_proposals
   WHERE world_id=$1 AND proposal_id LIKE 'accepted:%'`),[{count:209}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count FROM ppw_command_receipts
   WHERE world_id=$1 AND command_type='RESOLVE_PERSON_OFFERS'`),[{count:209}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count FROM ppw_completed_shows WHERE world_id=$1`),[{count:3}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count FROM ppw_ledger_events
   WHERE world_id=$1 AND event_type='CONTRACT_SIGNED'`),[{count:209}]);
  assert.deepEqual(await read(`SELECT count(*)::integer AS count FROM ppw_world_news_items
   WHERE world_id=$1 AND story_key LIKE 'signing:%'`),[{count:8}]);
  assert.equal((await driveWorldResolution(db.pool,{...options,maxStages:1})).status,"BLOCKED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_world_moments","ppw_world_news_items","ppw_world_news_awards","ppw_world_news_weeks",
    "ppw_wrestler_relationship_changes","ppw_tag_working_pair_appearances","ppw_wrestler_relationships",
    "ppw_completed_match_evidence","ppw_individual_field_career_effects","ppw_tag_match_career_effects",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions","ppw_week_resolution_seals",
    "ppw_week_resource_clearances","ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_week_logistics_authorizations","ppw_ledger_events","ppw_command_receipts","ppw_card_slots",
    "ppw_booking_drafts","ppw_backstage_requests","ppw_delegated_contract_renewals","ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_promotion_spending_plans","ppw_staff_employments","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_worlds",
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[owners]);
  }).finally(()=>db.close());
 }
});

test("Delegated financial authority checks simultaneous wages across the full proposed term",{
 skip:!url?"No disposable PostgreSQL":false,
},async t=>{
 const worldId="milestone7-finance-"+randomUUID();
 const db=postgresPool(url!,3);
 const cases=[
  ["staggered",200,50,0],["late-signed",200,50,0],["late-pending",200,50,0],
  ["alternatives",200,50,0],["after-term",100,50,0],["weekly-authority",200,50,0],
  ["fee-authority",200,50,0],["show-limit",200,39,0],["cash-reserve",500,100,800],
  ["staggered-queue",200,50,0],
 ] as const;
 const owner=(promotion:string)=>worldId+"-"+promotion;
 const terms=(startWeekIndex:number,weeklyGuarantee:number,termWeeks=4):OfferTerms=>({
  family:"LIMITED_NON_EXCLUSIVE",startWeekIndex,weeklyGuarantee,termWeeks,
  dateEntitlement:1,appearanceFee:40,signingBonus:0,roleExpectation:"FEATURED",creativeControl:"NONE",
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Delegated financial authority",seed:7,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
   const addPerson=(person:string)=>tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
    recognition,popularity,in_ring_quality,match_craft,presentation,stamina,fatigue,career_stage,morale,contract_priorities)
    VALUES($1,$2,$2,'ACTIVE',80,80,80,80,80,80,0,'PRIME',80,
     '{"money":100,"role":0,"schedule":0,"loyalty":0,"exposure":0,"prestige":0}')`,[worldId,person]);
   const addWage=(promotion:string,person:string,start:number,end:number,wage:number)=>tx.query(`INSERT INTO ppw_contracts(
    world_id,contract_id,person_id,promotion_id,family,status,start_week_index,expires_week_index,
    remaining_dates,date_entitlement,weekly_guarantee,appearance_fee,role_expectation,creative_control)
    VALUES($1,$2,$2,$3,'LIMITED_NON_EXCLUSIVE','SIGNED',$4,$5,1,1,$6,40,'FEATURED','NONE')`,
    [worldId,person,promotion,start,end,wage]);
   const addProposal=(promotion:string,source:string,status:string,quote:OfferTerms)=>tx.query(`
    INSERT INTO ppw_contract_renewal_proposals(world_id,proposal_id,contract_id,promotion_id,person_id,
     status,created_week_index,proposed_terms) VALUES($1,$2||'-proposal',$2,$3,$2,$4,10,$5)`,
    [worldId,source,promotion,status,JSON.stringify(quote)]);
   const addBid=(promotion:string,person:string,source:string|null,status:string,quote:OfferTerms)=>tx.query(`
    INSERT INTO ppw_contract_offers(world_id,offer_id,person_id,promotion_id,source_contract_id,submitted_week_index,status,terms)
     VALUES($1,$2||'-bid',$2,$3,$4,10,$5,$6)`,[worldId,person,promotion,source,status,JSON.stringify(quote)]);
   const queue=async(promotion:string,id:string,priority=false,start=7,end=10)=>{
    await addPerson(id);
    await addWage(promotion,id,start,end,100);
    await tx.query(`INSERT INTO ppw_delegated_contract_renewals(world_id,request_id,promotion_id,owner_player_id,
     contract_id,source_start_week_index,created_week_index,strategy,max_weekly_guarantee,max_appearance_fee)
     VALUES($1,$2,$3,$4,$2,$5,10,$6,$7,$8)`,[worldId,id,promotion,owner(promotion),start,
     priority?"PRIORITY_RETENTION":"EXISTING_TERMS",
     priority?200:promotion==="weekly-authority"?99:100,
     priority?100:promotion==="fee-authority"?39:40]);
   };
   for(const [promotion,wage,show,reserve] of cases){
    await addPromotion(tx,worldId,{id:promotion,name:promotion,tier:"INDEPENDENT"});
    await tx.query("UPDATE ppw_promotions SET cash=1000 WHERE world_id=$1 AND promotion_id=$2",[worldId,promotion]);
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[owner(promotion)]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,owner(promotion)]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",
     [worldId,promotion,owner(promotion)]);
    await tx.query(`INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,promotion_id,role,status,
     weekly_salary,start_week_index,expires_week_index,term_weeks,morale)
     VALUES($1,$2,$3,$2,'TALENT_MANAGER','ACTIVE',500,0,51,52,70)`,
     [worldId,promotion,worldStaff(7)[cases.findIndex(x=>x[0]===promotion)]!.staffId]);
    await tx.query("INSERT INTO ppw_promotion_spending_plans VALUES($1,$2,$3,$4,$5)",[worldId,promotion,wage,show,reserve]);
    await queue(promotion,promotion+"-a",promotion==="cash-reserve");
   }
   await queue("cash-reserve","cash-reserve-b",true);
   await queue("staggered-queue","staggered-queue-b",false,2,14);
   await addPerson("early");
   await addWage("staggered","early",11,12,100);
   await addProposal("staggered","early","ACTIVATED",terms(11,100,2));

   await addPerson("later-renewal");
   await addWage("staggered","later-renewal",9,12,0);
   await addProposal("staggered","later-renewal","ACCEPTED",terms(13,100));
   await addBid("staggered","later-renewal","later-renewal","ACCEPTED",terms(13,100));

   await addPerson("later-signed");
   await addWage("late-signed","later-signed",14,17,101);
   await addPerson("later-hire");
   await addBid("late-pending","later-hire",null,"PENDING",terms(13,101));

   await addPerson("choice");
   await addWage("alternatives","choice",9,12,0);
   await addProposal("alternatives","choice","PENDING",terms(13,80));
   await addBid("alternatives","choice","choice","PENDING",terms(13,100));

   await addPerson("after-end");
   await addWage("after-term","after-end",15,18,200);
  });
  const meter=new MeasuredQuerySession("Capped delegation wages across ten promotions");
  await withWorldTransaction(db.pool,async tx=>{
   assert.deepEqual(await prepareDelegatedContractRenewals({query:(sql,args)=>meter.execute(()=>tx.query(sql,args))},worldId,10),
    {queued:12,submitted:6});
   assert.deepEqual(await tx.query(`SELECT request_id,status FROM ppw_delegated_contract_renewals
    WHERE world_id=$1 AND status='SUBMITTED' ORDER BY request_id`,[worldId]),[
    {request_id:"after-term-a",status:"SUBMITTED"},{request_id:"alternatives-a",status:"SUBMITTED"},
    {request_id:"cash-reserve-a",status:"SUBMITTED"},{request_id:"staggered-a",status:"SUBMITTED"},
    {request_id:"staggered-queue-a",status:"SUBMITTED"},{request_id:"staggered-queue-b",status:"SUBMITTED"},
   ]);
   assert.deepEqual(await tx.query(`SELECT (terms->>'startWeekIndex')::integer AS first,
    (terms->>'startWeekIndex')::integer+(terms->>'termWeeks')::integer-1 AS last
    FROM ppw_contract_offers WHERE world_id=$1 AND promotion_id='staggered-queue' ORDER BY offer_id`,[worldId]),
    [{first:11,last:14},{first:15,last:27}]);
   assert.deepEqual(await prepareDelegatedContractRenewals(tx,worldId,10),{queued:0,submitted:0});
  });
  t.diagnostic(JSON.stringify(meter.assertBudget({maxQueries:3,maxResultBytes:13500})));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_delegated_contract_renewals","ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_promotion_spending_plans","ppw_staff_employments","ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[cases.map(([id])=>owner(id))]);
  }).finally(()=>db.close());
 }
});
