import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {publishBackstageRequests,settleBackstagePromises}
 from "../src/db/backstage-conversations.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage: incoming privacy, reply, booker-authored promise and verified match settlement",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID();
 const worldId="backstage-"+id,promotionId="home-"+id,
  playerId="owner-"+id,outsiderId="outsider-"+id,
  one="worker1-"+id,two="worker2-"+id,contract1="c1-"+id,
  contract2="c2-"+id,showId="show-"+id;
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Backstage world",seed:42,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"My promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,popularity,recognition,morale,momentum) VALUES($1,$2,'First Worker','MEN',30,20,20,10),($1,$3,'Second Worker','MEN',30,20,20,10)",[worldId,one,two]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,52)",
    [worldId,contract1,one,promotionId,contract2,two]);
  });
  const generated=await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,0));
  assert.equal(generated.newMessages,2);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,0))).newMessages,0);
  const scope={worldId,promotionId,playerId};
  const inbox=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(inbox.roster.filter(p=>p.latestIncoming?.status==="PENDING").length,2);
  assert.equal(inbox.conversations.length,1);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{...scope,playerId:outsiderId}),/denied/);
  const context={pool:db.pool,actor:{playerId}};
  const conversationId=inbox.conversations[0]!.conversationId;
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:outsiderId}},
   "backstageDecision",{worldId,promotionId,showId,conversationId,
    requestId:"bad-"+id,expectedRevision:0,decision:"TALK"}),/unavailable/);
  await assert.rejects(dispatchCardRpc(context,"backstageDecision",
   {worldId,promotionId,showId,conversationId,
    requestId:"invalid-"+id,expectedRevision:0,decision:"MEDIATE"}),/does not offer/);
  const done=await dispatchCardRpc(context,"backstageDecision",
   {worldId,promotionId,showId,conversationId,
    requestId:"promise-"+id,expectedRevision:0,decision:"PROMISE_APPEARANCE",
    playerId:outsiderId}) as {status:string;result:{status:string}};
  assert.equal(done.status,"APPLIED");assert.equal(done.result.status,"PROMISED");
  const replay=await dispatchCardRpc(context,"backstageDecision",
   {worldId,promotionId,showId,conversationId,
    requestId:"promise-"+id,expectedRevision:0,decision:"PROMISE_APPEARANCE"});
  assert.equal((replay as {status:string}).status,"REPLAYED");
  const second=await readPortablePersonaWorkspace(db.pool,{...scope,personId:
   inbox.roster.find(x=>x.personId!==inbox.personId)!.personId});
  const answered=await dispatchCardRpc(context,"backstageDecision",
   {worldId,promotionId,showId,conversationId:second.conversations[0]!.conversationId,
    requestId:"second-"+id,expectedRevision:1,decision:"PROMISE_APPEARANCE"});
  assert.equal((answered as {status:string}).status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,1)",
    [worldId,showId,promotionId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb)",
    [worldId,showId,"slot-"+id,JSON.stringify({participants:[
     {personId:inbox.personId,contractId:inbox.personId===one?contract1:contract2}]})]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,1,$4,60,'{}'::jsonb,$5)",
    [worldId,promotionId,showId,"res-"+id,"a".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,60,'PIN','A')",
    [worldId,showId,"slot-"+id]);
  });
  const settled=await withWorldTransaction(db.pool,tx=>settleBackstagePromises(tx,worldId,2));
  assert.equal(settled.settled,2);
  const statuses=await read<{person_id:string;status:string}>(
   "SELECT person_id,status FROM ppw_backstage_requests WHERE world_id=$1",[worldId]);
  assert.equal(statuses.find(x=>x.person_id===inbox.personId)!.status,"FULFILLED");
  assert.equal(statuses.find(x=>x.person_id!==inbox.personId)!.status,"BROKEN");
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstagePromises(tx,worldId,3))).settled,0);
  const last=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(last.conversations[0]!.status,"FULFILLED");
  // A wrestler-initiated creative request is fulfilled only by an authored,
  // actually completed promo/angle. A match cannot satisfy that promise.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_people SET morale=65,momentum=42,recognition=80 WHERE world_id=$1 AND person_id=$2",
   [worldId,inbox.personId]));
  const again=await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,9));
  assert.equal(again.newMessages,2);
  const creative=(await readPortablePersonaWorkspace(db.pool,scope)).conversations.at(-1)!;
  assert.equal(creative.kind,"CREATIVE");
  const replied=await dispatchCardRpc(context,"backstageDecision",
   {worldId,promotionId,showId,conversationId:creative.conversationId,
    requestId:"creative-"+id,expectedRevision:2,decision:"PROMISE_SEGMENT"});
  assert.equal((replied as {status:string}).status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,10)",
    [worldId,"creative-show-"+id,promotionId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'SEGMENT',$4::jsonb)",
    [worldId,"creative-show-"+id,"creative-slot-"+id,
     JSON.stringify({participants:[{personId:inbox.personId,contractId:
      inbox.personId===one?contract1:contract2}]})]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,10,$4,60,'{}'::jsonb,$5)",
    [worldId,promotionId,"creative-show-"+id,"creative-resolution-"+id,"b".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_segments(world_id,show_id,slot_id,position,kind,authored_outcome,crowd_response) VALUES($1,$2,$3,1,'PROMO','HAPPENS',60)",
    [worldId,"creative-show-"+id,"creative-slot-"+id]);
  });
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstagePromises(tx,worldId,9))).settled,1);
  const final=(await readPortablePersonaWorkspace(db.pool,scope)).conversations.at(-1)!;
  assert.equal(final.status,"FULFILLED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_requests","ppw_completed_show_matches",
    "ppw_completed_show_segments","ppw_completed_shows","ppw_card_slots",
    "ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,outsiderId]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
