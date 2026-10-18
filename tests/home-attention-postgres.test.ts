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
import {dismissResolvedOfferAttention} from "../src/db/player-attention-dismissals.js";
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
  const afterDesk=await readContractDesk(db.pool,world,player,promotionId);
  assert.equal(afterDesk.resolvedOffers.length,2,
   "Acknowledging Home news does not erase recorded contract decisions");
  const count=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_player_attention_dismissals"+
   " WHERE world_id=$1 AND player_id=$2",[world,player]));
  assert.equal(count[0]!.n,"2","Exactly one private receipt per chosen update");
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
