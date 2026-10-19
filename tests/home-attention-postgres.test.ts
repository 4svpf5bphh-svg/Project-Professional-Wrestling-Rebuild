import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import {dismissResolvedOfferAttention,dismissResolvedAttentionBatch} from "../src/db/player-attention-dismissals.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Private contract news is individually dismissible without hiding mandatory work or advancing the World",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="home-news-"+randomUUID(),player="booker-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,40));
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_contract_offers(world_id,offer_id,person_id,promotion_id,"+
   "submitted_week_index,status,terms) VALUES"+
   "($1,'offer-accepted','person-0','promotion-0',0,'ACCEPTED','{}'::jsonb),"+
   "($1,'offer-declined','person-8','promotion-0',0,'REJECTED','{}'::jsonb)",
   [world]));
  // A genuine awaiting response uses PENDING, never the nonexistent OPEN status.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,"+
   "person_id,kind,created_week_index,status)"+
   " VALUES($1,'backstage-ask','promotion-0','person-0','MORALE',0,'PENDING')",
   [world]));
  // Published commitments are terminal; pending replies remain mandatory tasks.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(
    "INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,"+
    "person_id,kind,created_week_index,status,decision,responded_week_index,due_week_index) VALUES"+
    "($1,'word-kept','promotion-0','person-0','CREATIVE',0,'FULFILLED','PROMISE_SEGMENT',0,0),"+
    "($1,'word-broken','promotion-0','person-8','CREATIVE',0,'BROKEN','PROMISE_SEGMENT',0,0)",
    [world]);
   await tx.query(
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload) VALUES"+
    "($1,1,1,'BACKSTAGE_PROMISE_FULFILLED',jsonb_build_object("+
    "'promotionId','promotion-0','conversationId','word-kept','personId','person-0')),"+
    "($1,1,1,'BACKSTAGE_PROMISE_BROKEN',jsonb_build_object("+
    "'promotionId','promotion-0','conversationId','word-broken','personId','person-8'))",
    [world]);
  });
  const meter=new MeasuredQuerySession("resolved-offer-home");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const first=await readPlayerWorldOverview(measured,world,player);
  assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:3600}).queryCount,1);
  assert.equal(first?.promotion?.attention.pendingBackstage,true);
  assert.deepEqual(first?.promotion?.attention.backstageRequests,[
   {personId:"person-0",name:"Wrestler 0",kind:"MORALE"}]);
  assert.equal(first?.promotion?.attention.offerResults?.length,2);
  assert.deepEqual(first?.promotion?.attention.offerResults?.map(x=>x.status).sort(),
   ["ACCEPTED","REJECTED"]);
  assert.equal(first?.promotion?.attention.plannedShows,0);
  const settled=first?.promotion?.attention.backstageResults??[];
  assert.deepEqual(settled.map(x=>x.status).sort(),["BROKEN","FULFILLED"]);
  assert.deepEqual(settled.map(x=>x.personId).sort(),["person-0","person-8"]);
  const desk=await readContractDesk(measured,world,player,promotionId);
  assert.equal(desk.summary.pendingOffers,0);
  assert.deepEqual(desk.resolvedOffers.map(x=>({name:x.name,status:x.status})),
   [{name:"Wrestler 8",status:"REJECTED"},
    {name:"Wrestler 0",status:"ACCEPTED"}]);
  const worldRevision=first?.world.revision;
  const input={worldId:world,playerId:player,promotionId,attentionId:"offer-result:offer-accepted"};
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,playerId:"intruder"}),
   /unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,attentionId:"required-show:fake"}),
   /Invalid dismissible/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,attentionId:"offer-result:missing"}),
   /unavailable|cannot be dismissed/);
  const accepted=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},"dismissAttention",{
   worldId:world,promotionId,attentionId:input.attentionId,playerId:"forged"});
  assert.deepEqual(accepted,{dismissed:true,firstDismissal:true});
  assert.deepEqual(await dismissResolvedOfferAttention(db.pool,input),
   {dismissed:true,firstDismissal:false});
  const after=await readPlayerWorldOverview(db.pool,world,player);
  assert.equal(after?.world.revision,worldRevision,"News dismissal does not advance or mutate the World");
  assert.deepEqual(after?.promotion?.attention.offerResults?.map(x=>x.id),
   ["offer-result:offer-declined"]);
  assert.equal(after?.promotion?.attention.plannedShows,0);
  const kept=settled.find(x=>x.status==="FULFILLED")!;
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,
   attentionId:kept.id,playerId:"intruder"}),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,
   attentionId:"backstage-result:9999999"}),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{...input,
   attentionId:"backstage-result:../../broken"}),/Invalid dismissible/);
  const confirmed=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},
   "dismissAttention",{worldId:world,promotionId,attentionId:kept.id});
  assert.deepEqual(confirmed,{dismissed:true,firstDismissal:true});
  assert.deepEqual(await dismissResolvedOfferAttention(db.pool,{...input,
   attentionId:kept.id}),{dismissed:true,firstDismissal:false});
  const afterBackstage=await readPlayerWorldOverview(db.pool,world,player);
  assert.equal(afterBackstage?.world.revision,worldRevision);
  assert.equal(afterBackstage?.promotion?.attention.pendingBackstage,true,
   "A new private request cannot be dismissed as completed news");
  assert.deepEqual(afterBackstage?.promotion?.attention.backstageResults?.map(x=>x.status),
   ["BROKEN"]);
  assert.deepEqual(afterBackstage?.promotion?.attention.offerResults?.map(x=>x.id),
   ["offer-result:offer-declined"],"Dismissal of one story does not clear another");
  const batchIds=["offer-result:offer-declined",
   afterBackstage!.promotion!.attention.backstageResults![0]!.id];
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:"intruder",attentionIds:batchIds
  }),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,
   attentionIds:[batchIds[1]!,"offer-result:forged"]
  }),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,
   attentionIds:[batchIds[0]!,batchIds[0]!]
  }),/Invalid settled updates/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,
   attentionIds:["required-show:fake",batchIds[1]!]
  }),/Invalid settled updates/);
  const batchMeter=new MeasuredQuerySession("one-query-resolved-news-batch");
  const batchPool:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return batchMeter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const cleaned=await dispatchCardRpc({pool:batchPool,actor:{playerId:player}},
   "dismissAttentionBatch",{worldId:world,promotionId,
    attentionIds:batchIds,playerId:"forged"});
  assert.deepEqual(cleaned,{dismissed:2,firstDismissals:2});
  assert.equal(batchMeter.assertBudget({maxQueries:1,maxResultBytes:800}).queryCount,1);
  assert.deepEqual(await dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,attentionIds:batchIds
  }),{dismissed:2,firstDismissals:0});
  const cleared=await readPlayerWorldOverview(db.pool,world,player);
  assert.equal(cleared?.world.revision,worldRevision);
  assert.deepEqual(cleared?.promotion?.attention.offerResults,[]);
  assert.deepEqual(cleared?.promotion?.attention.backstageResults,[]);
  assert.equal(cleared?.promotion?.attention.pendingBackstage,true);
  assert.equal(cleared?.promotion?.attention.plannedShows,0);
  const afterDesk=await readContractDesk(db.pool,world,player,promotionId);
  assert.equal(afterDesk.resolvedOffers.length,2,
   "Acknowledging Home news does not erase recorded contract decisions");
  const count=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_player_attention_dismissals"+
   " WHERE world_id=$1 AND player_id=$2",[world,player]));
  assert.equal(count[0]!.n,"4","Only the four deliberately acknowledged updates have receipts");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_requests","ppw_player_attention_dismissals",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("Verified singles/tag injury reports are owner-scoped, dismissible, and do not imply current clearance",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="injury-news-"+randomUUID(),player="injury-owner-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,40));
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)
    VALUES($1,'injury-singles','promotion-0',1,4,'SUBMITTED'),
     ($1,'injury-tag','promotion-1',1,5,'SUBMITTED')
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,
      resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,'promotion-0','injury-singles',1,4,'single-injury',75,'{}'::jsonb,repeat('f',64)),
     ($1,'promotion-1','injury-tag',1,5,'tag-injury',74,'{}'::jsonb,repeat('e',64))
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,
     crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'injury-singles','singles',0,75,'CLEAN_PIN','A'),
     ($1,'injury-tag','tag',0,74,'CLEAN_PIN','B')
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_individual_field_career_effects(world_id,show_id,match_id,
      person_id,actual_winner_side,performer_side,won,before_stats,after_stats,
      injury_severity,injury_weeks_out)
    VALUES($1,'injury-singles','singles','person-0','A','A',true,'{}'::jsonb,'{}'::jsonb,'MINOR',2),
     ($1,'injury-singles','singles','person-1','A','B',false,'{}'::jsonb,'{}'::jsonb,'MAJOR',7)
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_tag_match_career_effects(world_id,show_id,match_id,
      person_id,actual_winner_side,performer_side,won,before_stats,after_stats,
      injury_severity,injury_weeks_out)
    VALUES($1,'injury-tag','tag','person-8','B','B',true,'{}'::jsonb,'{}'::jsonb,'MODERATE',5)
   `,[world]);
  });
  const meter=new MeasuredQuerySession("verified-injury-news-one-query");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const view=await readPlayerWorldOverview(measured,world,player);
  assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:5100}).queryCount,1);
  const injuries=view?.promotion?.attention.injuryNews??[];
  assert.deepEqual(injuries.map(x=>({
   person:x.personId,severity:x.severity,weeks:x.originalWeeksOut,week:x.week
  })),[
   {person:"person-8",severity:"MODERATE",weeks:5,week:5},
   {person:"person-0",severity:"MINOR",weeks:2,week:4}
  ],"Only signed roster members' verified incidents; rival show injuries still count");
  assert.ok(injuries.every(x=>/^injury-report:[a-f0-9]{32}$/.test(x.id)));
  const revision=view?.world.revision;
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{worldId:world,
   promotionId,playerId:"outsider",attentionId:injuries[0]!.id}),
   /unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{worldId:world,
   promotionId,playerId:player,attentionId:"injury-report:invalid"}),
   /Invalid dismissible/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{worldId:world,
   promotionId,playerId:player,attentionIds:[injuries[0]!.id,
    "injury-report:"+"a".repeat(32)]}),/unavailable|cannot be dismissed/);
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.injuryNews?.length,2,"The forged batch must not clear genuine injuries");
  const response=await dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId,playerId:player,attentionId:injuries[0]!.id});
  assert.deepEqual(response,{dismissed:true,firstDismissal:true});
  assert.deepEqual(await dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId,playerId:player,attentionId:injuries[0]!.id}),
   {dismissed:true,firstDismissal:false});
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.injuryNews?.length,1);
  assert.deepEqual(await dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,attentionIds:[injuries[1]!.id]}),
   {dismissed:1,firstDismissals:1});
  assert.deepEqual((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.injuryNews,[]);
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))?.world.revision,revision);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=14 WHERE world_id=$1",[world]));
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId,playerId:player,attentionId:injuries[0]!.id}),
   /unavailable|cannot be dismissed/,"Expired news cannot be acknowledged again");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals",
    "ppw_individual_field_career_effects","ppw_tag_match_career_effects",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_booking_drafts",
    "ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotion_standings",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
