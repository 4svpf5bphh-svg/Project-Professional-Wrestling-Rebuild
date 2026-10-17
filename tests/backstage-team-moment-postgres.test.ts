import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishBackstageTeamMoments} from "../src/db/backstage-team-moments.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Backstage passive positive team moment is private, verified, rare and never a required reply",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="goodnews-"+id,promotionId="human-"+id,
  playerId="owner-"+id,outsiderId="outsider-"+id,
  a="a-"+id,b="b-"+id,teamId="team-"+id;
 const record=async (week:number,crowd=80)=>{
  const showId="moment-show-"+week+"-"+id,matchId="moment-match-"+week+"-"+id;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,$4,$5,$6,'{}'::jsonb,$7)",
    [worldId,promotionId,showId,week,"resolution-"+week+"-"+id,crowd,"a".repeat(64)]);
   await tx.query("INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side) VALUES($1,$2,$3,1,$4,'PIN','A')",
    [worldId,showId,matchId,crowd]);
   await tx.query("INSERT INTO ppw_tag_working_pair_appearances(world_id,show_id,match_id,person_a_id,person_b_id,week_index,execution_quality) VALUES($1,$2,$3,$4,$5,$6,80)",
    [worldId,showId,matchId,a,b,week-1]);
  });
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Real positive tag news",seed:51,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Human promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,playerId,outsiderId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,morale,momentum,booking_division) VALUES($1,$2,'Partner One',66,65,'MEN'),($1,$3,'Partner Two',67,66,'MEN')",
    [worldId,a,b]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,52)",
    [worldId,"a-deal-"+id,a,promotionId,"b-deal-"+id,b]);
   await tx.query("INSERT INTO ppw_wrestler_relationships(world_id,person_a_id,person_b_id,professional_trust,familiarity) VALUES($1,$2,$3,75,35)",[worldId,a,b]);
   await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,$2,'Established Team','ACTIVE')",
    [worldId,teamId]);
   await tx.query("INSERT INTO ppw_tag_team_members(world_id,team_id,person_id) VALUES($1,$2,$3),($1,$2,$4)",[worldId,teamId,a,b]);
  });
  await record(1);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTeamMoments(tx,worldId,1))).newNotes,0);
  await record(2);
  await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[worldId]));
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTeamMoments(tx,worldId,2))).newNotes,1);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTeamMoments(tx,worldId,2))).newNotes,0);
  const scope={worldId,promotionId,playerId,personId:a};
  const view=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(view.conversations.length,1);
  assert.equal(view.conversations[0]!.kind,"TEAM_MOMENT");
  assert.equal(view.conversations[0]!.status,"NOTED");
  assert.equal(view.conversations[0]!.decision,null);
  assert.equal(view.conversations[0]!.verifiedTagShows,2);
  assert.equal(view.conversations[0]!.relatedPersonId,b);
  assert.equal(view.conversations[0]!.averageCrowd,80);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{...scope,playerId:outsiderId}),/denied/);
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "backstageDecision",{worldId,promotionId,showId:"unused",
    conversationId:view.conversations[0]!.conversationId,
    requestId:"reply-should-fail-"+id,expectedRevision:0,decision:"TALK"}),
   /already answered|unavailable/);
  assert.equal((await withWorldTransaction(db.pool,tx=>publishBackstageTeamMoments(tx,worldId,3))).newNotes,0,
   "At most one note per established team in the PPW year");
  const people=await withWorldTransaction(db.pool,tx=>tx.query<{morale:number}>(
   "SELECT morale FROM ppw_people WHERE world_id=$1 ORDER BY name",[worldId]));
  assert.deepEqual(people.map(x=>x.morale),[66,67],"News never awards free morale");
  const count=await withWorldTransaction(db.pool,tx=>tx.query<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_tag_teams WHERE world_id=$1",[worldId]));
  assert.equal(count[0]!.n,1,"World team formation is unchanged");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_backstage_thread_archives","ppw_backstage_promotion_trust",
    "ppw_backstage_requests","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationship_changes","ppw_wrestler_relationships",
    "ppw_completed_show_matches","ppw_completed_shows",
    "ppw_tag_team_members","ppw_tag_teams","ppw_ledger_events","ppw_command_receipts",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[playerId,outsiderId]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
