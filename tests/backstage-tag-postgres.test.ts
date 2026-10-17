import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageTagPitches,settleBackstageTagFollowThrough}
 from "../src/db/backstage-tag-pitches.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("evidence-led tag pitch: dates, consent, persistence and verified follow-through",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),uid=randomUUID();
 const worldId="tagpitch-"+uid,promotionId="owner-"+uid,
  playerId="booker-"+uid,p1="a-"+uid,p2="b-"+uid,
  c1="first-"+uid,c2="second-"+uid;
 const matches=Array.from({length:3},(_,n)=>({
  showId:"tp-show-"+n+"-"+uid,matchId:"tp-match-"+n+"-"+uid,
  week:n===2?4:n+1,weekIndex:n===2?3:n}));
 const run=<T>(fn:(tx:import("../src/db/world-operations.js").SqlRows)=>Promise<T>)=>
  withWorldTransaction(db.pool,fn);
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  run(tx=>tx.query<T>(sql,params));
 const insertTagMatch=async (n:number)=>{
  const m=matches[n]!;
  await run(async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,$4)",
    [worldId,m.showId,promotionId,m.week]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'MATCH',$4::jsonb)",
    [worldId,m.showId,m.matchId,JSON.stringify({
     matchType:"TAG",family:"TEAMS",
     participants:[{personId:p1,contractId:c1},{personId:p2,contractId:c2}],
     sides:[{sideId:"A",participants:[{personId:p1,contractId:c1},{personId:p2,contractId:c2}]}]})]);
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,80,'{}'::jsonb,$6)",
    [worldId,promotionId,m.showId,m.week,"tp-result-"+n+"-"+uid,"b".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,80,'PIN','A')",
    [worldId,m.showId,m.matchId]);
   await tx.query("INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality) VALUES($1,$2,$3,$4,$5,$6,78)",
    [worldId,m.showId,m.matchId,p1,p2,m.weekIndex]);
  });
 };
 try{
  await run(async tx=>{
   await createWorld(tx,{id:worldId,name:"Team chemistry evidence",seed:54,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Tag Company",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,momentum,recognition) VALUES($1,$2,'Partner One','MEN',75,75,30),($1,$3,'Partner Two','MEN',75,75,30)",
    [worldId,p1,p2]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',3,52),($1,$5,$6,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',0,52)",
    [worldId,c1,p1,promotionId,c2,p2]);
   await tx.query("INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,professional_trust,familiarity) VALUES($1,$2,$3,72,30)",[worldId,p1,p2]);
   await tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]);
  });
  await insertTagMatch(0);
  await insertTagMatch(1);
  assert.equal((await run(tx=>publishBackstageTagPitches(tx,worldId,2))).newPitches,0,
   "No pitch when one partner has no available dates");
  await run(tx=>tx.query("UPDATE ppw_contracts SET remaining_dates=3 WHERE world_id=$1 AND contract_id=$2",
   [worldId,c2]));
  assert.equal((await run(tx=>publishBackstageTagPitches(tx,worldId,2))).newPitches,1);
  assert.equal((await run(tx=>publishBackstageTagPitches(tx,worldId,2))).newPitches,0);
  const scope={worldId,promotionId,playerId,personId:p1};
  const inbox=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(inbox.conversations.length,1);
  const item=inbox.conversations[0]!;
  assert.equal(item.kind,"TAG_TEAM_PITCH");
  assert.equal(item.verifiedTagShows,2);
  const context={pool:db.pool,actor:{playerId}};
  const answer=await dispatchCardRpc(context,"backstageDecision",{
   worldId,promotionId,showId:"unused",conversationId:item.conversationId,
   requestId:"tag-agree-"+uid,expectedRevision:0,decision:"EXPLORE_TEAM"
  }) as {status:string;result:{status:string}};
  assert.equal(answer.status,"APPLIED");
  assert.equal(answer.result.status,"ANSWERED");
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_tag_teams WHERE world_id=$1",[worldId]))[0]?.n,"0",
   "Chat response must not fabricate a team");
  assert.equal((await run(tx=>settleBackstageTagFollowThrough(tx,worldId,2))).followedThrough,0);
  await insertTagMatch(2);
  assert.equal((await run(tx=>settleBackstageTagFollowThrough(tx,worldId,2))).followedThrough,0,
   "Later evidence cannot count before it has been World resolved");
  assert.equal((await run(tx=>settleBackstageTagFollowThrough(tx,worldId,3))).followedThrough,1);
  assert.equal((await run(tx=>settleBackstageTagFollowThrough(tx,worldId,3))).followedThrough,0);
  const completed=(await readPortablePersonaWorkspace(db.pool,scope)).conversations[0]!;
  assert.equal(completed.followThroughKind,"TAG_MATCH_BOOKED");
  assert.equal(completed.followThroughWeekIndex,3);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_tag_teams WHERE world_id=$1",[worldId]))[0]?.n,"0");
  const morale=await read<{morale:number}>(
   "SELECT morale FROM ppw_people WHERE world_id=$1",[worldId]);
  assert.deepEqual(morale.map(x=>x.morale),[75,75],
   "Answering a pitch has no global morale benefit");
 }finally{
  await run(async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_show_segments","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
