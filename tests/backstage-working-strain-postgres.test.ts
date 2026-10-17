import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageRequests} from "../src/db/backstage-conversations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("real wrestler-led working grievance needs audited strain and same-promotion completed tag evidence",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),uid=randomUUID();
 const worldId="working-concern-"+uid,promotionId="own-"+uid,
  playerId="booker-"+uid,a="a-"+uid,b="b-"+uid;
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 const query=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  run(tx=>tx.query<T>(sql,params));
 async function completedTag(week:number){
  const showId="show-"+week+"-"+uid,matchId="tag-"+week+"-"+uid;
  await run(async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,$4)",
    [worldId,showId,promotionId,week]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb)",
    [worldId,showId,matchId,JSON.stringify({participants:[
     {personId:a,contractId:"deal-a-"+uid},{personId:b,contractId:"deal-b-"+uid}]})]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,32,'{}'::jsonb,$6)",
    [worldId,promotionId,showId,week,"result-"+week+"-"+uid,"a".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,32,'PIN','A')",
    [worldId,showId,matchId]);
   await tx.query("INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality) VALUES($1,$2,$3,$4,$5,$6,32)",
    [worldId,showId,matchId,a,b,week-1]);
  });
  return {showId,matchId};
 }
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Strained partnerships",seed:66,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Own promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,momentum,recognition) VALUES($1,$2,'Tag partner A','MEN',80,75,20),($1,$3,'Tag partner B','MEN',80,75,20)",
    [worldId,a,b]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,52)",
    [worldId,"deal-a-"+uid,a,promotionId,"deal-b-"+uid,b]);
   await tx.query("INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,professional_trust,familiarity) VALUES($1,$2,$3,18,50)",
    [worldId,a,b]);
  });
  await completedTag(1);
  await completedTag(2);
  const last=await completedTag(3);
  await run(tx=>tx.query("UPDATE ppw_worlds SET week=4 WHERE world_id=$1",[worldId]));
  assert.equal((await run(tx=>publishBackstageRequests(tx,worldId,3))).newMessages,0,
   "A weak relationship by itself does not create a backstage accusation");
  await run(tx=>tx.query("INSERT INTO ppw_wrestler_relationship_changes(world_id,person_a_id,person_b_id,week_index,show_id,match_id,change_type,trust_delta,familiarity_delta,verified_shows) VALUES($1,$2,$3,2,$4,$5,'STRAIN',-0.7,0,3)",
   [worldId,a,b,last.showId,last.matchId]));
  assert.equal((await run(tx=>publishBackstageRequests(tx,worldId,3))).newMessages,1);
  assert.equal((await run(tx=>publishBackstageRequests(tx,worldId,3))).newMessages,0);
  const scope={worldId,promotionId,playerId,personId:a};
  const inbox=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(inbox.conversations.length,1);
  const concern=inbox.conversations[0]!;
  assert.equal(concern.kind,"PARTNERSHIP");
  assert.equal(concern.relatedPersonId,b);
  assert.equal(concern.workingVerifiedShows,3);
  assert.equal(concern.workingTrustDelta,-0.7);
  const response=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "backstageDecision",{worldId,promotionId,showId:"irrelevant",
    requestId:"mediate-"+uid,expectedRevision:0,
    conversationId:concern.conversationId,decision:"MEDIATE"});
  assert.equal((response as {status:string}).status,"APPLIED");
  assert.equal((await query<{professional_trust:number}>(
   "SELECT professional_trust FROM ppw_wrestler_relationships WHERE world_id=$1",[worldId]))[0]!.professional_trust,18,
   "Listening or mediation does not silently grant working chemistry");
  assert.deepEqual((await query<{morale:number}>(
   "SELECT morale FROM ppw_people WHERE world_id=$1 ORDER BY person_id",[worldId])).map(x=>x.morale),[80,80]);
  assert.equal((await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!.status,"ANSWERED");
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_card_slots",
    "ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
