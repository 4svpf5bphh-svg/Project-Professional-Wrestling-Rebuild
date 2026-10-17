import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageRequests,settleBackstagePromises} from "../src/db/backstage-conversations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage featured-contract grievance requires four verified unfeatured matches",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="feature-"+id,promotionId="promo-"+id,playerId="player-"+id;
 const star="star-"+id,opponent="other-"+id,deal="contract-"+id;
 const matches=Array.from({length:4},(_,week)=>({
  showId:"historic-"+week+"-"+id,opening:"opening-"+week+"-"+id,
  main:"main-"+week+"-"+id,week:week+1
 }));
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Real booking evidence",seed:41,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Human company",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,momentum) VALUES($1,$2,'Featured Worker','MEN',60,60),($1,$3,'Rival Worker','MEN',60,60)",[worldId,star,opponent]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index,role_expectation) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52,'MAIN_EVENT')",[worldId,deal,star,promotionId]);
   for(const sh of matches){
    await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,$4)",[worldId,sh.showId,promotionId,sh.week]);
    await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb),($1,$2,$5,2,'MATCH',$6::jsonb)",
     [worldId,sh.showId,sh.opening,JSON.stringify({participants:[{personId:star,contractId:deal}]}),
      sh.main,JSON.stringify({participants:[{personId:opponent,contractId:"other"}]})]);
    await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,60,'{}'::jsonb,$6)",
     [worldId,promotionId,sh.showId,sh.week,"resolution-"+sh.week+"-"+id,"c".repeat(64)]);
    await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,60,'PIN','A'),($1,$2,$4,2,60,'PIN','A')",
     [worldId,sh.showId,sh.opening,sh.main]);
   }
   await tx.query("UPDATE ppw_worlds SET week=5 WHERE world_id=$1",[worldId]);
  });
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageRequests(tx,worldId,4))).newMessages,1);
  const scope={worldId,promotionId,playerId,personId:star};
  const workspace=await readPortablePersonaWorkspace(db.pool,scope);
  const conversation=workspace.conversations[0]!;
  assert.equal(conversation.kind,"ROLE_USAGE");
  assert.equal(conversation.observedMatchShows,4);
  assert.equal(conversation.observedFeaturedShows,0);
  assert.equal(conversation.promisedRole,"MAIN_EVENT");
  const reply=await dispatchCardRpc({pool:db.pool,actor:{playerId}},"backstageDecision",
   {worldId,promotionId,showId:"ignored",requestId:"role-answer-"+id,
    expectedRevision:0,conversationId:conversation.conversationId,
    decision:"PROMISE_FEATURED"});
  assert.equal((reply as {status:string}).status,"APPLIED");
  // A non-featured match in a completed show does not satisfy the request.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,6)",
    [worldId,"follow-"+id,promotionId]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb),($1,$2,$5,2,'MATCH',$6::jsonb)",
    [worldId,"follow-"+id,"follow-opener-"+id,JSON.stringify({participants:[{personId:star,contractId:deal}]}),
     "follow-main-"+id,JSON.stringify({participants:[{personId:opponent,contractId:"other"}]})]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,6,$4,60,'{}'::jsonb,$5)",
    [worldId,promotionId,"follow-"+id,"follow-resolution-"+id,"d".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,60,'PIN','A'),($1,$2,$4,2,60,'PIN','A')",
    [worldId,"follow-"+id,"follow-opener-"+id,"follow-main-"+id]);
  });
  assert.equal((await withWorldTransaction(db.pool,tx=>settleBackstagePromises(tx,worldId,5))).settled,0);
  const missed=await withWorldTransaction(db.pool,tx=>settleBackstagePromises(tx,worldId,8));
  assert.equal(missed.broken,1);
  const [record]=await read<{status:string;trust_delta:number;assessment_reason:string}>(
   "SELECT status,trust_delta,assessment_reason FROM ppw_backstage_requests WHERE world_id=$1",[worldId]);
  assert.equal(record!.status,"BROKEN");
  assert.equal(record!.trust_delta,-3);
  assert.equal(record!.assessment_reason,"UNFULFILLED_COMMITMENT");
  assert.equal((await read<{trust:number}>(
   "SELECT trust FROM ppw_backstage_promotion_trust WHERE world_id=$1",[worldId]))[0]!.trust,47);
  // An invited conversation appears in Contract Desk as a reference to the
  // durable message; talking neither renews nor alters a deal.
  const talkId="contract-conversation-"+id;
  await withWorldTransaction(db.pool,tx=>tx.query(
   "INSERT INTO ppw_backstage_requests(world_id,request_id,promotion_id,person_id,kind,created_week_index) VALUES($1,$2,$3,$4,'CONTRACT',4)",
   [worldId,talkId,promotionId,star]));
  const discussion=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "backstageDecision",{worldId,promotionId,showId:"ignored",
    requestId:"contract-talk-"+id,expectedRevision:1,
    conversationId:talkId,decision:"EXPLORE_RENEWAL"});
  assert.equal((discussion as {status:string}).status,"APPLIED");
  const contractDesk=await readContractDesk(db.pool,worldId,playerId,promotionId);
  assert.equal(contractDesk.roster[0]!.backstageContractConversationId,talkId);
  assert.equal(contractDesk.summary.backstageContractDiscussions,1);
  assert.equal(contractDesk.roster[0]!.status,"SIGNED");
  assert.equal(contractDesk.roster[0]!.expiresWeekIndex,52);
  assert.equal(contractDesk.summary.pendingRenewals,0);
  await assert.rejects(readContractDesk(db.pool,worldId,"stranger",promotionId),
   /access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust","ppw_backstage_requests",
    "ppw_completed_show_matches","ppw_completed_show_segments","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
